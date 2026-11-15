<script setup lang="ts">
/**
 * FoodRecognitionView AI 食物图像识别（本项目核心亮点页）
 * ------------------------------------------------------------------
 * 功能定位：完成「上传食物照片 → AI 识别 → 营养分析 → 加入饮食记录」的完整闭环。
 *
 * 识别链路（已接入真实云端视觉大模型，请如实向评委说明）：
 *   本页调用 utils/aiRecognition.js 的 recognizeWithAI()，其内部为「云端优先 + 本地兜底」：
 *     ① 前端参数标准化（visionAdapter）：图片 dataURL + 文件名 + 用户线索 → { image, hint, clues }
 *     ② 云端调用（aiClient → Node 代理 → 智谱 GLM-4V OpenAI 兼容端点）
 *        · 密钥只存在于 server/ 进程，绝不下发浏览器（详见 docs/AI接入说明.md）
 *        · 超时 20s、429/5xx 指数退避重试、4xx 不重试、错误码映射为中文提示
 *     ③ 结果解析与条目绑定：模型输出归一化为结构化字段，食物名模糊检索绑定 FOOD_DB 条目取营养值
 *     ④ 降级兜底：云端失败时静默回退 utils/recognition.js 的可解释规则引擎
 *        （该引擎提供判定依据 + 候选排名，是本项目「可解释 AI」的体现）
 *
 * 历史缺陷（用户实测：榴莲照片被识别成牛肉 / 红薯）已修复：
 *   早期版本在文件名无关键词时会从候选池**随机抽取**，结果不可复现且可跨类别乱跳；
 *   现在无论走云端还是本地兜底，输出都是确定性的，且会标注识别来源与降级原因。
 *
 * 页面结构：
 *   ① 页面标题栏（带「核心亮点」标记）
 *   ② 左栏：AI 服务状态条 + 上传区（点击 / 拖拽）+ 线索补充 + 示例按钮 + 识别过程动效
 *   ③ 右栏：识别结果（来源徽标 + 判定依据 + 候选排名 + 分量联动 + 营养 + 评价 + 加入记录）
 *   ④ 底部：本次会话识别历史 + AI 识别原理说明
 *
 * 注意：所有 setTimeout 均在 onBeforeUnmount 中清理，避免组件卸载后触发更新。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDietStore } from '@/store/diet'
import { usePilotStore } from '@/store/pilot'
import PageHeader from '@/components/common/PageHeader.vue'
import { evaluateFood, NUTRIENT_META } from '@/utils/nutrition'
import { scaleNutrition, FOOD_STATS } from '@/data/foods'
import { RECOGNIZE_SAMPLES, hueName } from '@/utils/recognition'
import { recognizeWithAI, probeAIService, SOURCE_LABELS } from '@/utils/aiRecognition'
import { themeByIndex } from '@/utils/theme'
import { celebrateStars } from '@/utils/celebrate'
import { nowTimeStr, guessMealByNow } from '@/utils/date'
import { saveRecognitionConsultContext } from '@/utils/multimodalContext'
import type { AISource, FoodItem, MealType, NutrientKey, Nutrition, RecognitionCandidate } from '@/types'

interface VisualFeatures {
  ok?: boolean
  hue?: number
  sat?: number
  light?: number
  edge?: number
  [key: string]: unknown
}

interface RecognitionEngineResult {
  found: FoodItem
  confidence: number
  matchMode: string
  reasons: string[]
  candidates: RecognitionCandidate[]
  features: VisualFeatures | null
  matchedSignature: string
  isEstimating: boolean
  source: AISource
  notice?: string
  unmatchedName?: string
}

interface DisplayResult {
  food: FoodItem
  confidence: number
  matchMode: string
  reasons: string[]
  candidates: RecognitionCandidate[]
  features: VisualFeatures | null
  matchedSignature: string
  isEstimating: boolean
  source: AISource
  notice: string
  unmatchedName: string
}

interface AIServiceState {
  ok: boolean
  mode?: string
  model?: string
  notice?: string
  error?: string
}

interface RecognitionHistoryItem {
  id: number
  emoji: string
  name: string
  confidence: number
  grams: number
  calories: number
  time: string
}

interface RecognitionSample {
  emoji: string
  clue: string
  [key: string]: unknown
}

interface FoodEvaluation {
  level: string
  comment: string
  tags: Array<{ emoji: string; label: string }>
  [key: string]: unknown
}

const EMPTY_NUTRITION: Nutrition = { calories: 0, protein: 0, fat: 0, carb: 0, fiber: 0, sugar: 0, sodium: 0 }

const dietStore = useDietStore()
const pilotStore = usePilotStore()
const router = useRouter()
const mealTypes = dietStore.MEAL_TYPES as MealType[]
const mealEmoji = dietStore.MEAL_EMOJI as Record<MealType, string>
const sourceLabels = SOURCE_LABELS as Record<AISource, { emoji: string; text: string; tone: string }>

/* ============================ 上传状态 ============================ */
const fileInput = ref<HTMLInputElement | null>(null) // 隐藏的文件选择框
const previewUrl = ref('') // 预览图（FileReader 生成的 dataURL）
const selectedEmoji = ref('') // 示例图片的 Emoji 占位（无真实图片时使用）
const fileName = ref('') // 文件名 / 示例关键字
const fileSize = ref(0) // 文件大小（字节）
const dragging = ref(false) // 是否正在拖拽悬停
const errorMsg = ref('') // 上传校验错误提示
const hint = ref('') // 用户补充的线索（截图文件名无意义时手动补充）

/* ============================ 识别状态 ============================ */
const detecting = ref(false) // 是否识别中
const progress = ref(0) // 识别进度（0–100）
const stepIndex = ref(0) // 当前识别步骤索引
const result = ref<DisplayResult | null>(null) // 识别结果（含食物、置信度、判定依据、候选排名）
const grams = ref(100) // 当前分量（克 / 毫升）

/* ============================ AI 服务状态 ============================ */
/**
 * AI 服务探测结果：
 *   null      尚未探测
 *   { ok, mode, model, notice } / { ok:false, error }
 * 页面初始化时主动探测一次，用于提示用户「代理服务是否已启动」以及当前是
 * 云端模型 / Mock 模式，避免答辩时因忘记启动代理而误以为功能失效。
 */
const aiService = ref<AIServiceState | null>(null)
const aiProbing = ref(false)

/** 当前识别来源徽标（云端大模型 / Mock / 本地引擎） */
const sourceBadge = computed(() => (result.value ? sourceLabels[result.value.source] || null : null))

/** 是否因「模型识别结果不在本地食物库」而无法记录 */
const cannotRecord = computed(() => Boolean(result.value?.unmatchedName))

/** AI 服务状态条配置 */
const serviceStatus = computed(() => {
  if (aiProbing.value) return { tone: 'sub', emoji: '⏳', text: '正在探测 AI 服务状态…' }
  if (!aiService.value) return null
  if (!aiService.value.ok) return { tone: 'warn', emoji: '⚠️', text: aiService.value.error }
  // Mock 模式不再显示顶部横幅（用户要求移除该提示）；
  // 单条识别结果的来源徽标（☁️/🧪/🔬）仍会如实标注
  if (aiService.value.mode === 'mock') return null
  return {
    tone: 'ok',
    emoji: '☁️',
    text: `云端模型已就绪：${aiService.value.model}${aiService.value.notice ? ' · ' + aiService.value.notice : ''}`
  }
})

/** 识别步骤文案（依次推进，与云端识别链路对应） */
const STEPS = ['图像预处理与压缩', '请求云端视觉模型', '结果解析与条目绑定', '生成健康评价']

/** 定时器集中管理（组件卸载时统一清理） */
let timers: Array<ReturnType<typeof setTimeout>> = []
let toastTimer: ReturnType<typeof setTimeout> | null = null
let pendingRecognition: Promise<RecognitionEngineResult> | null = null // 进行中的识别 Promise

/* ============================ 计算属性 ============================ */

/** 当前是否已有「已选图片」（真实预览图或示例 Emoji） */
const hasImage = computed(() => !!previewUrl.value || !!selectedEmoji.value)

/** 文件大小友好展示 */
const sizeText = computed(() =>
  fileSize.value > 1024 * 1024
    ? `${(fileSize.value / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(fileSize.value / 1024)} KB`
)

/** 识别结果在该分量下的实际营养值 */
const resultNutrition = computed<Nutrition>(() =>
  result.value ? (scaleNutrition(result.value.food, grams.value) as Nutrition) : EMPTY_NUTRITION
)

/** 健康评价（标签 + 结论 + 等级） */
const evaluation = computed<FoodEvaluation>(() =>
  result.value
    ? (evaluateFood(result.value.food, grams.value) as FoodEvaluation)
    : { level: 'ok', comment: '', tags: [] }
)

/** 匹配方式的中文标签（云端大模型 / Mock / 文本线索 / 视觉特征） */
const matchModeText = computed(() => {
  if (!result.value) return ''
  const map: Record<string, string> = {
    cloud: '云端大模型识别',
    mock: 'Mock 演示响应',
    text: '文本线索匹配',
    visual: '视觉特征匹配'
  }
  return map[result.value.matchMode] || '视觉特征匹配'
})

/** 视觉特征的可读摘要（色相 → 汉语色彩名） */
const featureText = computed(() => {
  const f = result.value?.features
  if (!f || !f.ok) return ''
  return `主色 ${f.hue}°（${hueName(Number(f.hue || 0))}）· 饱和度 ${f.sat} · 明度 ${f.light} · 边缘密度 ${f.edge}`
})

/** 综合评价等级横幅配置 */
const levelBanner = computed(() => {
  const level = evaluation.value?.level || 'ok'
  if (level === 'bad') return { emoji: '🔴', text: '需要控制', bg: '#fcede9', color: '#cf3f43' }
  if (level === 'warn') return { emoji: '⚠️', text: '适量即可', bg: '#f9f6ec', color: '#a07b1f' }
  return { emoji: '✅', text: '推荐食用', bg: '#eef7f4', color: '#217a5c' }
})

/** 营养数据网格（7 项：该分量实际值 + 每 100g 基准值） */
const NUTRIENT_ORDER: Array<Exclude<NutrientKey, 'water'>> = [
  'calories',
  'protein',
  'fat',
  'carb',
  'fiber',
  'sugar',
  'sodium'
]
const nutritionTiles = computed(() => {
  if (!result.value) return []
  const n = resultNutrition.value as Nutrition
  const food = result.value.food
  return NUTRIENT_ORDER.map((key, i) => {
    const meta = NUTRIENT_META[key]
    return {
      key,
      theme: themeByIndex(i),
      emoji: meta.emoji,
      label: meta.label,
      unit: meta.unit,
      value: key === 'calories' ? Math.round(n[key]) : n[key],
      base: food[key] // 每 100g 基准值
    }
  })
})

/** 示例图片快捷按钮（覆盖热带水果等易混淆场景） */
const SAMPLES = RECOGNIZE_SAMPLES

/* ============================ 识别历史 ============================ */
const history = ref<RecognitionHistoryItem[]>([])
function clearHistory() {
  history.value = []
}

/** 成功提示条 */
const toast = ref('')

/* ============================ 上传相关方法 ============================ */

/** 点击区域时触发隐藏的文件选择框 */
function onPickFile() {
  fileInput.value && fileInput.value.click()
}

/** 文件选择变化 */
function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files && target.files[0]
  if (file) readFile(file)
  target.value = '' // 允许重复选择同一文件
}

/** 上传图片最长边上限（像素）：超过则等比缩小，降低识别请求体与云端耗时 */
const MAX_IMAGE_EDGE = 1280
/** 压缩后的 JPEG 质量（0–1） */
const JPEG_QUALITY = 0.82

/**
 * 客户端压缩图片：
 * 用 canvas 把图片等比缩放到最长边 1280px 以内，并转成 JPEG（质量 0.82）。
 * 透明 PNG 先铺白底，避免转 JPEG 后出现黑底。
 * 任何环节失败都返回空串，由调用方回退到原图，保证上传流程不中断。
 * @param file 原始图片文件
 * @returns 压缩后的 dataURL；失败时返回空串
 */
function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const longest = Math.max(img.naturalWidth, img.naturalHeight)
      const scale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1
      const width = Math.max(1, Math.round(img.naturalWidth * scale))
      const height = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve('')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      try {
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      } catch {
        resolve('')
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve('')
    }
    img.src = url
  })
}

/**
 * 读取并校验文件：
 * 非图片提示错误；超过 8MB 提示过大；通过后先做客户端压缩（最长边 1280 / JPEG 0.82），
 * 压缩结果同时用于预览与识别请求，减小请求体；压缩失败则回退原始文件。
 */
async function readFile(file: File) {
  errorMsg.value = ''
  if (!file.type.startsWith('image/')) {
    errorMsg.value = '仅支持图片文件，请上传 JPG / PNG 格式 🖼️'
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    errorMsg.value = '图片过大（超过 8MB），请压缩后重新上传 📦'
    return
  }

  const applyImage = (dataUrl: string, bytes: number) => {
    previewUrl.value = dataUrl
    selectedEmoji.value = ''
    fileName.value = file.name
    fileSize.value = bytes
    resetResult()
  }

  // 优先使用压缩结果：dataURL 长度 ≈ base64 字符数，按 3/4 还原为字节数
  const compressed = await compressImage(file)
  if (compressed) {
    applyImage(compressed, Math.round((compressed.length * 3) / 4))
    return
  }

  // 兜底：canvas 压缩不可用时使用原始文件
  const reader = new FileReader()
  reader.onload = () => {
    applyImage(typeof reader.result === 'string' ? reader.result : '', file.size)
  }
  reader.readAsDataURL(file)
}

/** 拖拽悬停高亮 */
function onDragOver() {
  dragging.value = true
}
/** 拖拽离开取消高亮 */
function onDragLeave() {
  dragging.value = false
}
/** 拖拽释放：读取第一个文件 */
function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
  if (file) readFile(file)
}

/** 清空上传（重新上传 / 移除） */
function resetUpload() {
  clearTimers()
  previewUrl.value = ''
  selectedEmoji.value = ''
  fileName.value = ''
  hint.value = ''
  fileSize.value = 0
  errorMsg.value = ''
  resetResult()
}

/** 重置识别结果与动效状态 */
function resetResult() {
  detecting.value = false
  progress.value = 0
  stepIndex.value = 0
  result.value = null
}

/* ============================ 识别引擎调用 ============================ */

/**
 * 开始识别：
 * 分 4 步依次推进文案，同时进度条平滑增长，最后输出引擎结果
 * 说明：识别计算在点击瞬间即已启动（图片解码 + 特征提取），
 *       与动画并行执行，动画结束时再揭示结果，避免用户长时间等待。
 */
function startRecognize() {
  if (!hasImage.value) {
    errorMsg.value = '请先上传食物照片，或点击下方示例图片试试 📷'
    return
  }
  if (detecting.value) return

  clearTimers()
  errorMsg.value = ''
  resetResult()
  detecting.value = true
  grams.value = 100 // 每次识别分量重置为 100g

  // ① 立即启动识别（异步，不阻塞动画）
  //    recognizeWithAI 内部流程：前端入参标准化 → 调用 Node 代理 → 智谱 GLM-4V →
  //    响应解析 → 绑定本地营养条目；任一环节失败都会自动回退本地可解释引擎。
  pendingRecognition = recognizeWithAI(
    previewUrl.value || '',
    fileName.value,
    hint.value
  ) as Promise<RecognitionEngineResult>

  // ② 4 个步骤的持续时长（毫秒），合计 2200ms
  const durations = [500, 600, 500, 600]
  const total = durations.reduce((a, b) => a + b, 0)

  let acc = 0
  durations.forEach((d, i) => {
    timers.push(setTimeout(() => (stepIndex.value = i), acc))
    acc += d
  })

  // ③ 进度条平滑增长（每 40ms 更新一次）
  //    上限设为 92%：真实的 100% 由 finishRecognize 在收到模型响应后写入，
  //    避免「进度条已满但云端还在返回」的观感割裂。
  for (let t = 0; t <= total; t += 40) {
    timers.push(setTimeout(() => (progress.value = Math.min(92, Math.round((t / total) * 100))), t))
  }

  // ④ 动画结束 → 揭示结果
  timers.push(setTimeout(finishRecognize, total + 200))
}

/**
 * 识别收尾：等待 AI 结果并写入页面状态 + 历史
 * 说明：云端模型响应时间不可控（实测 1–10s），因此这里必须 try/catch 兜底，
 *       确保任何异常都不会让页面卡在「识别中」状态。
 */
async function finishRecognize() {
  let res: RecognitionEngineResult | null = null
  try {
    res = await (pendingRecognition ||
      (recognizeWithAI('', fileName.value, hint.value) as Promise<RecognitionEngineResult>))
  } catch (err: unknown) {
    errorMsg.value = `识别过程出现异常：${err instanceof Error ? err.message : String(err)}，请重试 🙏`
  }
  detecting.value = false
  progress.value = 100
  if (!res || !res.found) return

  result.value = {
    food: res.found,
    confidence: Math.round(res.confidence * 1000) / 10, // 0-100 保留 1 位小数
    matchMode: res.matchMode,
    reasons: res.reasons,
    candidates: res.candidates,
    features: res.features,
    matchedSignature: res.matchedSignature,
    isEstimating: res.isEstimating,
    // 以下三项为「真实模型接入」新增：来源标识、降级提示、未匹配条目名
    source: res.source || 'local',
    notice: res.notice || '',
    unmatchedName: res.unmatchedName || ''
  }
  pilotStore.track('food_recognized', {
    source: result.value.source,
    foodId: result.value.food.id,
    confidence: result.value.confidence
  })
  pushHistory()
}

/** 点击示例：以 Emoji 占位作为「已选图片」，示例词作为文件名线索并立即识别 */
function pickSample(sample: RecognitionSample) {
  previewUrl.value = ''
  selectedEmoji.value = sample.emoji
  fileName.value = sample.clue // 模拟「文件名包含该关键词」的照片
  hint.value = ''
  fileSize.value = 0
  errorMsg.value = ''
  startRecognize()
}

/* ============================ 识别历史与记录 ============================ */

/** 写入本次会话识别历史（最多保留 8 条） */
function pushHistory() {
  if (!result.value) return
  const n = scaleNutrition(result.value.food, grams.value)
  history.value.unshift({
    id: Date.now(),
    emoji: result.value.food.emoji || '🍽️',
    name: result.value.food.name,
    confidence: result.value.confidence,
    grams: grams.value,
    calories: Math.round(n.calories),
    time: nowTimeStr()
  })
  if (history.value.length > 8) history.value = history.value.slice(0, 8)
}

/** 餐段选择（默认按当前时间推断） */
const mealType = ref<MealType>(guessMealByNow() as MealType)

/** 加入今日饮食记录 */
function addToDiet() {
  if (!result.value) return
  // 模型识别出的食物不在本地食物库时，没有可信营养参数，禁止写入记录
  if (cannotRecord.value) {
    showToast(`「${result.value.unmatchedName}」暂无营养数据，请先在饮食记录页手动搜索添加 ⚠️`)
    return
  }
  const record = dietStore.addRecord({ mealType: mealType.value, food: result.value.food, grams: grams.value }) as {
    name: string
  } | null
  if (record) {
    showToast(`已把「${record.name}」加入「${mealType.value}」记录 ✅`)
    celebrateStars()
  } else showToast('添加失败，请稍后重试 😢')
}

/** 将识别结果作为一次性结构化上下文带入 AI 对话页。 */
function consultAI() {
  if (!result.value || cannotRecord.value) return
  const food = result.value.food
  saveRecognitionConsultContext({
    foodId: food.id,
    foodName: food.name,
    emoji: food.emoji || '🍽️',
    grams: grams.value,
    confidence: result.value.confidence,
    nutrition: { ...resultNutrition.value },
    source: result.value.source,
    createdAt: Date.now()
  })
  router.push('/chat')
}

/** 显示 toast（2 秒后自动消失，注意清理定时器） */
function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2000)
}

/** 快捷分量按钮 */
const QUICK_GRAMS = [50, 100, 150, 200, 300]
function setGrams(v: number) {
  grams.value = v
}

/** 切换餐段 */
function selectMeal(m: MealType) {
  mealType.value = m
}

/* ============================ 会话状态持久化 ============================ */
/**
 * 路由切换会卸载本页组件，识别结果与识别历史因此丢失。
 * 这里把本次会话的识别状态写入 sessionStorage（同一标签页内有效，关闭后自动清除），
 * 回到本页时自动恢复：识别结果、识别历史、分量、餐段、图片预览都会保留。
 */
const SESSION_KEY = 'shanzhi_recognize_session_v1'
/** dataURL 超过该长度不持久化，避免触发 sessionStorage 配额上限 */
const IMAGE_LIMIT = 1.2 * 1024 * 1024

/** 保存当前识别会话 */
function saveSession() {
  const payload = {
    history: history.value,
    result: result.value,
    grams: grams.value,
    mealType: mealType.value,
    hint: hint.value,
    selectedEmoji: selectedEmoji.value,
    fileName: fileName.value,
    fileSize: fileSize.value,
    previewUrl: (previewUrl.value || '').length <= IMAGE_LIMIT ? previewUrl.value : ''
  }
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  } catch {
    // 配额不足时退化为不保存预览图，优先保住识别结果与历史
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...payload, previewUrl: '' }))
    } catch {
      // 仍失败则放弃本次持久化，不影响页面功能
    }
  }
}

/** 恢复上次的识别会话 */
function restoreSession() {
  let raw = ''
  try {
    raw = sessionStorage.getItem(SESSION_KEY) || ''
  } catch {
    return
  }
  if (!raw) return
  try {
    const data = JSON.parse(raw) as {
      history?: RecognitionHistoryItem[]
      result?: DisplayResult
      grams?: number
      mealType?: MealType
      hint?: string
      selectedEmoji?: string
      fileName?: string
      fileSize?: number
      previewUrl?: string
    }
    if (Array.isArray(data.history)) history.value = data.history
    if (data.result) result.value = data.result
    if (Number(data.grams) > 0) grams.value = Number(data.grams)
    if (data.mealType) mealType.value = data.mealType
    if (typeof data.hint === 'string') hint.value = data.hint
    if (typeof data.selectedEmoji === 'string') selectedEmoji.value = data.selectedEmoji
    if (typeof data.fileName === 'string') fileName.value = data.fileName
    if (Number(data.fileSize) > 0) fileSize.value = Number(data.fileSize)
    if (typeof data.previewUrl === 'string' && data.previewUrl) previewUrl.value = data.previewUrl
  } catch {
    // 数据损坏时忽略，使用全新会话
  }
}

restoreSession()
watch([history, result, grams, mealType, hint, selectedEmoji, fileName, fileSize, previewUrl], saveSession, {
  deep: true
})

/* ============================ 生命周期清理 ============================ */

/** 清理所有识别相关定时器 */
function clearTimers() {
  timers.forEach(t => clearTimeout(t))
  timers = []
}

onBeforeUnmount(() => {
  clearTimers()
  if (toastTimer) clearTimeout(toastTimer)
})

/** 页面挂载后探测一次 AI 服务状态，提示用户当前是云端模型还是 Mock 模式 */
onMounted(async () => {
  aiProbing.value = true
  try {
    aiService.value = await probeAIService()
  } catch (err: unknown) {
    aiService.value = { ok: false, error: `AI 服务探测失败：${err instanceof Error ? err.message : String(err)}` }
  } finally {
    aiProbing.value = false
  }
})
</script>

<template>
  <div class="recognition-flow stagger">
    <PageHeader>
      <template #extra>
        <details class="flow-help">
          <summary>识别说明</summary>
          <div class="flow-help-panel">
            <p class="font-bold tx-main">AI 如何完成识别</p>
            <ol>
              <li>标准化图片、文件名与补充线索。</li>
              <li>优先请求云端视觉大模型。</li>
              <li>将结果绑定到本地食物营养库。</li>
              <li>网络异常时自动切换本地规则引擎。</li>
            </ol>
            <p>本地库包含 {{ FOOD_STATS.total }} 条食物、{{ FOOD_STATS.categories }} 个分类。识别结果建议人工确认。</p>
          </div>
        </details>
      </template>
    </PageHeader>

    <main class="flow-shell">
      <header class="flow-intro">
        <span class="flow-eyebrow">AI 食物识别</span>
        <h2>拍下这一餐，接下来交给 AI</h2>
        <p>上传照片后，识别结果、营养分析和健康建议会按顺序自动展开。</p>
      </header>

      <div class="flow-rail">
        <section class="flow-step is-active" :class="{ 'is-complete': hasImage }">
          <div class="flow-marker">{{ hasImage ? '✓' : '1' }}</div>
          <div class="flow-content">
            <div class="flow-step-heading">
              <div>
                <h3>添加食物照片</h3>
                <p>支持 JPG / PNG，单张不超过 8MB</p>
              </div>
              <button v-if="hasImage" class="btn btn-ghost btn-xs" type="button" @click="onPickFile">更换照片</button>
            </div>

            <div v-if="serviceStatus" class="flow-service" :class="`is-${serviceStatus.tone}`">
              <span aria-hidden="true">{{ serviceStatus.emoji }}</span
              >{{ serviceStatus.text }}
            </div>

            <div
              v-if="!hasImage"
              class="flow-dropzone"
              :class="{ 'is-dragging': dragging }"
              role="button"
              @click="onPickFile"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
              @drop.prevent="onDrop"
            >
              <span class="flow-upload-icon" aria-hidden="true">＋</span>
              <strong>拖入照片，或从相册选择</strong>
              <span>清晰、完整的餐盘照片识别效果更好</span>
              <button class="btn btn-primary" type="button" @click.stop="onPickFile">选择食物照片</button>
            </div>

            <div v-else class="flow-photo-row">
              <div class="scan-wrap flow-photo">
                <img v-if="previewUrl" :src="previewUrl" alt="食物照片预览" />
                <div v-else class="flow-sample-emoji" aria-hidden="true">{{ selectedEmoji }}</div>
                <div v-if="detecting" class="scan-line"></div>
              </div>
              <div class="flow-photo-meta">
                <strong>{{ fileName || '示例图片' }}</strong>
                <span v-if="fileSize" class="num">{{ sizeText }}</span>
                <span v-else>已准备识别</span>
                <button class="flow-text-action" type="button" @click="resetUpload">移除</button>
              </div>
            </div>

            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileChange" />
            <p v-if="errorMsg" class="flow-error" role="alert">{{ errorMsg }}</p>

            <div v-if="!hasImage" class="flow-examples">
              <span>没有照片？试试示例</span>
              <button v-for="s in SAMPLES" :key="s.id" class="flow-example" type="button" @click="pickSample(s)">
                <span aria-hidden="true">{{ s.emoji }}</span
                >{{ s.label }}
              </button>
            </div>

            <details v-if="hasImage" class="flow-clue">
              <summary>补充食物线索 <span>可选</span></summary>
              <div>
                <input v-model="hint" class="field" type="text" maxlength="20" placeholder="如：榴莲、蛋炒饭、三文鱼" />
                <p>当截图文件名不含食物信息时，补充线索可提高识别准确率。</p>
              </div>
            </details>

            <button
              v-if="hasImage && !detecting && !result"
              class="btn btn-primary flow-primary-action"
              type="button"
              @click="startRecognize"
            >
              开始 AI 识别
            </button>
          </div>
        </section>

        <Transition name="flow-reveal">
          <section v-if="detecting" class="flow-step is-active">
            <div class="flow-marker">2</div>
            <div class="flow-content">
              <div class="flow-step-heading">
                <div>
                  <h3>正在分析图片</h3>
                  <p>{{ STEPS[stepIndex] }}</p>
                </div>
                <strong class="flow-progress-value num">{{ progress }}%</strong>
              </div>
              <div class="progress-track">
                <div class="progress-fill progress-ok" :style="{ width: progress + '%' }"></div>
              </div>
              <div class="flow-detect-steps">
                <span
                  v-for="(step, i) in STEPS"
                  :key="step"
                  :class="{ 'is-done': i < stepIndex, 'is-current': i === stepIndex }"
                >
                  {{ i < stepIndex ? '✓' : i + 1 }} {{ step }}
                </span>
              </div>
            </div>
          </section>
        </Transition>

        <Transition name="flow-reveal">
          <section v-if="result" class="flow-step is-active is-complete">
            <div class="flow-marker">✓</div>
            <div class="flow-content">
              <div class="flow-step-heading">
                <div>
                  <h3>确认识别结果</h3>
                  <p>核对食物名称，并调整实际食用分量</p>
                </div>
                <span class="flow-confidence num">{{ result.confidence }}% 置信度</span>
              </div>

              <div class="flow-result-hero">
                <div class="flow-result-food">
                  <span class="flow-food-emoji" aria-hidden="true">{{ result.food.emoji }}</span>
                  <div>
                    <h2>{{ result.food.name }}</h2>
                    <div class="flow-result-tags">
                      <span>{{ result.food.category }}</span>
                      <span v-if="sourceBadge">{{ sourceBadge.emoji }} {{ sourceBadge.text }}</span>
                      <span>{{ matchModeText }}</span>
                    </div>
                  </div>
                </div>
                <div class="flow-result-actions">
                  <button
                    class="btn btn-primary btn-xs"
                    type="button"
                    :disabled="cannotRecord"
                    title="带着本次识别结果咨询 AI 营养助手"
                    @click="consultAI"
                  >
                    💬 咨询 AI
                  </button>
                  <button class="btn btn-ghost btn-xs" type="button" @click="resetUpload">重新识别</button>
                </div>
              </div>

              <p v-if="result.notice" class="flow-notice">⚠️ {{ result.notice }}</p>
              <div v-if="result.unmatchedName" class="flow-error">
                <strong>模型识别为“{{ result.unmatchedName }}”，但本地食物库暂无该条目。</strong>
                当前展示最接近的“{{ result.food.name }}”数据，仅供参考，暂不能写入记录。
              </div>

              <div class="flow-portion">
                <div class="flow-control-label">
                  <strong>实际食用分量</strong><span class="num">{{ grams }} g</span>
                </div>
                <input v-model.number="grams" aria-label="食用分量" type="range" min="20" max="500" step="10" />
                <div class="flow-quick-grams">
                  <button
                    v-for="g in QUICK_GRAMS"
                    :key="g"
                    type="button"
                    :class="{ 'is-selected': grams === g }"
                    @click="setGrams(g)"
                  >
                    {{ g }}g
                  </button>
                </div>
              </div>

              <details class="flow-details">
                <summary>查看识别依据与候选结果</summary>
                <div class="flow-details-body">
                  <p v-if="featureText">图像特征：{{ featureText }}</p>
                  <ul>
                    <li v-for="(reason, i) in result.reasons" :key="i">{{ reason }}</li>
                  </ul>
                  <div class="flow-candidates">
                    <div v-for="(candidate, i) in result.candidates" :key="candidate.food.id">
                      <span>{{ i + 1 }}. {{ candidate.food.emoji }} {{ candidate.food.name }}</span>
                      <strong class="num">{{ Math.round(candidate.score) }}</strong>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </section>
        </Transition>

        <Transition name="flow-reveal">
          <section v-if="result" class="flow-step is-active is-complete">
            <div class="flow-marker">✓</div>
            <div class="flow-content">
              <div class="flow-step-heading">
                <div>
                  <h3>营养分析</h3>
                  <p>数据会随食用分量实时更新</p>
                </div>
              </div>
              <div class="flow-calorie-line">
                <div>
                  <strong class="num">{{ Math.round(resultNutrition.calories) }}</strong
                  ><span>千卡</span>
                </div>
                <p>约占一顿正餐建议热量的 {{ Math.min(100, Math.round(resultNutrition.calories / 7)) }}%</p>
              </div>
              <div class="flow-nutrients">
                <div v-for="tile in nutritionTiles" :key="tile.key">
                  <span>{{ tile.label }}</span>
                  <strong class="num"
                    >{{ tile.value }}<small>{{ tile.unit }}</small></strong
                  >
                  <small>每100g {{ tile.base }}{{ tile.unit }}</small>
                </div>
              </div>
            </div>
          </section>
        </Transition>

        <Transition name="flow-reveal">
          <section v-if="result" class="flow-step is-active is-complete">
            <div class="flow-marker">✓</div>
            <div class="flow-content">
              <div class="flow-step-heading">
                <div>
                  <h3>健康建议</h3>
                  <p>结合营养规则给出本餐建议</p>
                </div>
              </div>
              <div class="flow-advice" :style="{ '--advice-color': levelBanner.color, '--advice-bg': levelBanner.bg }">
                <span class="flow-advice-icon" aria-hidden="true">{{ levelBanner.emoji }}</span>
                <div>
                  <strong>{{ levelBanner.text }}</strong>
                  <p>{{ evaluation.comment }}</p>
                  <div class="flow-advice-tags">
                    <span v-for="(tag, i) in evaluation.tags" :key="i">{{ tag.emoji }} {{ tag.label }}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </Transition>

        <Transition name="flow-reveal">
          <section v-if="result" class="flow-step is-active flow-final-step">
            <div class="flow-marker">5</div>
            <div class="flow-content">
              <div class="flow-step-heading">
                <div>
                  <h3>保存到今日饮食</h3>
                  <p>选择餐段，完成本次记录</p>
                </div>
              </div>
              <div class="flow-save-row">
                <div class="seg">
                  <button
                    v-for="meal in mealTypes"
                    :key="meal"
                    class="seg-item"
                    :class="{ 'is-active': mealType === meal }"
                    type="button"
                    @click="selectMeal(meal)"
                  >
                    {{ mealEmoji[meal] }} {{ meal }}
                  </button>
                </div>
                <button class="btn btn-primary" type="button" :disabled="cannotRecord" @click="addToDiet">
                  确认并记录
                </button>
              </div>
              <p v-if="toast" class="flow-toast" aria-live="polite">{{ toast }}</p>
            </div>
          </section>
        </Transition>
      </div>

      <details class="flow-history">
        <summary>
          <span
            ><strong>本次会话识别历史</strong
            ><small>{{ history.length ? `最近 ${history.length} 条` : '暂无记录' }}</small></span
          >
          <span>展开查看</span>
        </summary>
        <div v-if="history.length" class="flow-history-body">
          <div v-for="row in history" :key="row.id" class="flow-history-row">
            <span class="flow-history-food"
              ><b aria-hidden="true">{{ row.emoji }}</b
              >{{ row.name }}</span
            >
            <span class="num">{{ row.grams }}g</span><span class="num">{{ row.calories }} kcal</span
            ><span>{{ row.time }}</span>
          </div>
          <button class="flow-text-action" type="button" @click="clearHistory">清空历史</button>
        </div>
        <p v-else class="flow-history-empty">每完成一次识别，记录会自动保存在这里。</p>
      </details>
    </main>
  </div>
</template>

<style scoped>
.recognition-flow {
  --flow-accent: var(--brand);
}
.flow-shell {
  width: min(820px, 100%);
  margin: 0 auto;
  padding: 18px 0 56px;
}
.flow-intro {
  margin-bottom: 34px;
}
.flow-eyebrow {
  display: inline-block;
  margin-bottom: 8px;
  color: var(--flow-accent);
  font-size: 12px;
  font-weight: 800;
}
.flow-intro h2 {
  color: var(--ink);
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 800;
  letter-spacing: 0;
}
.flow-intro p {
  margin-top: 8px;
  color: var(--tx-sub);
  font-size: 14px;
}
.flow-help {
  position: relative;
}
.flow-help summary {
  color: var(--tx-sub);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
.flow-help summary::-webkit-details-marker {
  display: none;
}
.flow-help-panel {
  position: absolute;
  z-index: 20;
  top: 30px;
  right: 0;
  width: min(360px, 80vw);
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  box-shadow: var(--shadow-cardHover);
  font-size: 12px;
  color: var(--tx-sub);
}
.flow-help-panel ol {
  margin: 10px 0;
  padding-left: 18px;
  line-height: 1.9;
}
.flow-rail {
  position: relative;
}
.flow-step {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 16px;
  padding-bottom: 30px;
}
.flow-step::before {
  content: '';
  position: absolute;
  left: 20px;
  top: 42px;
  bottom: 0;
  width: 1px;
  background: var(--line-strong);
}
.flow-final-step::before {
  display: none;
}
.flow-marker {
  position: relative;
  z-index: 1;
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: #fff;
  color: var(--tx-muted);
  font-size: 13px;
  font-weight: 800;
}
.flow-step.is-active .flow-marker {
  border-color: var(--flow-accent);
  color: var(--flow-accent);
}
.flow-step.is-complete .flow-marker {
  background: var(--flow-accent);
  color: #fff;
}
.flow-content {
  min-width: 0;
  padding-top: 3px;
}
.flow-step-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.flow-step-heading h3 {
  color: var(--ink);
  font-size: 16px;
  font-weight: 800;
}
.flow-step-heading p {
  margin-top: 3px;
  color: var(--tx-muted);
  font-size: 12px;
}
.flow-service {
  display: flex;
  gap: 7px;
  margin-bottom: 12px;
  padding: 9px 11px;
  border-radius: 7px;
  background: #f4f6fa;
  color: var(--tx-sub);
  font-size: 11px;
  font-weight: 700;
}
.flow-service.is-ok {
  background: #eef7f4;
  color: #217a5c;
}
.flow-service.is-warn {
  background: #f9f6ec;
  color: #8a6c20;
}
.flow-dropzone {
  min-height: 250px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 9px;
  padding: 26px;
  border: 1.5px dashed var(--line-strong);
  border-radius: 8px;
  background: #fff;
  text-align: center;
  cursor: pointer;
  transition: 0.2s ease;
}
.flow-dropzone:hover,
.flow-dropzone.is-dragging {
  border-color: var(--flow-accent);
  background: var(--brand-soft);
}
.flow-dropzone > span {
  color: var(--tx-muted);
  font-size: 12px;
}
.flow-upload-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--flow-accent) !important;
  font-size: 26px !important;
  font-weight: 300;
}
.flow-dropzone .btn {
  margin-top: 9px;
}
.flow-photo-row {
  display: grid;
  grid-template-columns: minmax(180px, 300px) 1fr;
  gap: 18px;
  align-items: center;
}
.flow-photo {
  height: 190px;
  border-radius: 8px;
  background: #f5f6f8;
}
.flow-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.flow-sample-emoji {
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 72px;
}
.flow-photo-meta {
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: 6px;
  color: var(--tx-muted);
  font-size: 12px;
}
.flow-photo-meta strong {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ink);
  white-space: nowrap;
}
.flow-text-action {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--flow-accent);
  font-size: 12px;
  font-weight: 700;
}
.flow-error,
.flow-notice {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 7px;
  font-size: 12px;
  line-height: 1.6;
}
.flow-error {
  background: #fcede9;
  color: #b63e42;
}
.flow-notice {
  background: #f9f6ec;
  color: #8a6c20;
}
.flow-examples {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  color: var(--tx-muted);
  font-size: 11px;
}
.flow-example {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--tx-sub);
  font-size: 12px;
}
.flow-clue {
  margin-top: 14px;
  border-top: 1px solid var(--line);
}
.flow-clue summary,
.flow-details summary {
  padding: 12px 0;
  color: var(--tx-sub);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.flow-clue summary span {
  margin-left: 4px;
  color: var(--tx-muted);
  font-weight: 400;
}
.flow-clue > div {
  display: grid;
  gap: 6px;
  padding-bottom: 4px;
}
.flow-clue p {
  color: var(--tx-muted);
  font-size: 11px;
}
.flow-primary-action {
  width: 100%;
  margin-top: 18px;
  min-height: 46px;
}
.flow-progress-value {
  color: var(--flow-accent);
  font-size: 15px;
}
.flow-detect-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 12px;
  color: var(--tx-muted);
  font-size: 11px;
}
.flow-detect-steps .is-current {
  color: var(--flow-accent);
  font-weight: 700;
}
.flow-detect-steps .is-done {
  color: var(--st-ok);
}
.flow-confidence {
  flex: 0 0 auto;
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--flow-accent);
  font-size: 11px;
  font-weight: 800;
}
.flow-result-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 0;
  border-block: 1px solid var(--line);
}
.flow-result-food {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
}
.flow-food-emoji {
  width: 54px;
  height: 54px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: #f5f6f8;
  font-size: 28px;
}
.flow-result-food h2 {
  color: var(--ink);
  font-size: 20px;
  font-weight: 800;
}
.flow-result-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.flow-result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.flow-result-tags span,
.flow-advice-tags span {
  padding: 4px 7px;
  border-radius: 4px;
  background: #f2f4f7;
  color: var(--tx-sub);
  font-size: 10px;
  font-weight: 700;
}
.flow-portion {
  margin-top: 18px;
}
.flow-control-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--tx-sub);
  font-size: 12px;
}
.flow-control-label span {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}
.flow-portion input[type='range'] {
  width: 100%;
  accent-color: var(--flow-accent);
}
.flow-quick-grams {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 8px;
}
.flow-quick-grams button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: #fff;
  color: var(--tx-sub);
  font-size: 11px;
}
.flow-quick-grams button.is-selected {
  border-color: var(--flow-accent);
  background: var(--brand-soft);
  color: var(--flow-accent);
  font-weight: 800;
}
.flow-details {
  margin-top: 14px;
  border-top: 1px solid var(--line);
}
.flow-details-body {
  padding: 4px 0 10px;
  color: var(--tx-sub);
  font-size: 11px;
  line-height: 1.7;
}
.flow-details-body ul {
  margin: 8px 0;
  padding-left: 18px;
}
.flow-candidates {
  display: grid;
  gap: 5px;
}
.flow-candidates > div {
  display: flex;
  justify-content: space-between;
  padding: 5px 8px;
  background: #f7f8fa;
}
.flow-calorie-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 0;
  border-block: 1px solid var(--line);
}
.flow-calorie-line strong {
  color: var(--ink);
  font-size: 36px;
}
.flow-calorie-line span {
  margin-left: 6px;
  color: var(--tx-sub);
  font-size: 12px;
}
.flow-calorie-line p {
  color: var(--tx-muted);
  font-size: 11px;
}
.flow-nutrients {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  margin-top: 16px;
  background: var(--line);
}
.flow-nutrients > div {
  min-width: 0;
  display: grid;
  gap: 4px;
  padding: 13px;
  background: #fff;
}
.flow-nutrients span,
.flow-nutrients > div > small {
  color: var(--tx-muted);
  font-size: 10px;
}
.flow-nutrients strong {
  color: var(--ink);
  font-size: 17px;
}
.flow-nutrients strong small {
  margin-left: 2px;
  color: var(--tx-sub);
  font-size: 10px;
}
.flow-advice {
  display: flex;
  gap: 14px;
  padding: 18px;
  border-left: 3px solid var(--advice-color);
  background: var(--advice-bg);
}
.flow-advice-icon {
  font-size: 24px;
}
.flow-advice strong {
  color: var(--advice-color);
  font-size: 15px;
}
.flow-advice p {
  margin-top: 6px;
  color: var(--tx-sub);
  font-size: 12px;
  line-height: 1.7;
}
.flow-advice-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.flow-save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.flow-toast {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: #eef7f4;
  color: #217a5c;
  font-size: 12px;
  font-weight: 700;
}
.flow-history {
  margin-left: 58px;
  border-top: 1px solid var(--line);
}
.flow-history > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 0;
  color: var(--tx-sub);
  font-size: 12px;
  cursor: pointer;
}
.flow-history > summary span:first-child {
  display: grid;
  gap: 3px;
}
.flow-history > summary strong {
  color: var(--ink);
  font-size: 13px;
}
.flow-history > summary small {
  color: var(--tx-muted);
}
.flow-history-body {
  padding-bottom: 18px;
}
.flow-history-row {
  display: grid;
  grid-template-columns: 1fr 70px 90px 60px;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
  color: var(--tx-sub);
  font-size: 11px;
}
.flow-history-food {
  color: var(--ink);
  font-weight: 700;
}
.flow-history-food b {
  margin-right: 7px;
}
.flow-history-empty {
  padding-bottom: 18px;
  color: var(--tx-muted);
  font-size: 12px;
}
.flow-reveal-enter-active {
  transition:
    opacity 0.38s ease,
    transform 0.38s ease;
}
.flow-reveal-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
@media (max-width: 640px) {
  .flow-shell {
    padding-top: 8px;
  }
  .flow-intro {
    margin-bottom: 26px;
  }
  .flow-step {
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 11px;
  }
  .flow-step::before {
    left: 16px;
    top: 34px;
  }
  .flow-marker {
    width: 34px;
    height: 34px;
  }
  .flow-photo-row {
    grid-template-columns: 1fr;
  }
  .flow-photo {
    height: 210px;
  }
  .flow-result-hero,
  .flow-calorie-line,
  .flow-save-row {
    align-items: stretch;
    flex-direction: column;
  }
  .flow-result-actions .btn {
    flex: 1;
  }
  .flow-nutrients {
    grid-template-columns: repeat(2, 1fr);
  }
  .flow-save-row .btn {
    width: 100%;
  }
  .flow-history {
    margin-left: 45px;
  }
  .flow-history-row {
    grid-template-columns: 1fr auto;
  }
  .flow-history-row span:nth-child(2),
  .flow-history-row span:nth-child(4) {
    display: none;
  }
}
</style>

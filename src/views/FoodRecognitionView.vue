<script setup>
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDietStore } from '@/store/diet'
import PageHeader from '@/components/common/PageHeader.vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import StatTile from '@/components/common/StatTile.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { evaluateFood, NUTRIENT_META } from '@/utils/nutrition'
import { scaleNutrition, FOOD_STATS } from '@/data/foods'
import { RECOGNIZE_SAMPLES, hueName } from '@/utils/recognition'
import { recognizeWithAI, probeAIService, SOURCE_LABELS } from '@/utils/aiRecognition'
import { themeByIndex } from '@/utils/theme'
import { nowTimeStr, guessMealByNow } from '@/utils/date'

const dietStore = useDietStore()

/* ============================ 上传状态 ============================ */
const fileInput = ref(null) // 隐藏的文件选择框
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
const result = ref(null) // 识别结果（含食物、置信度、判定依据、候选排名）
const grams = ref(100) // 当前分量（克 / 毫升）

/* ============================ AI 服务状态 ============================ */
/**
 * AI 服务探测结果：
 *   null      尚未探测
 *   { ok, mode, model, notice } / { ok:false, error }
 * 页面初始化时主动探测一次，用于提示用户「代理服务是否已启动」以及当前是
 * 云端模型 / Mock 模式，避免答辩时因忘记启动代理而误以为功能失效。
 */
const aiService = ref(null)
const aiProbing = ref(false)

/** 当前识别来源徽标（云端大模型 / Mock / 本地引擎） */
const sourceBadge = computed(() => SOURCE_LABELS[result.value?.source] || null)

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
  return { tone: 'ok', emoji: '☁️', text: `云端模型已就绪：${aiService.value.model}${aiService.value.notice ? ' · ' + aiService.value.notice : ''}` }
})

/** 识别步骤文案（依次推进，与云端识别链路对应） */
const STEPS = ['图像预处理与压缩', '请求云端视觉模型', '结果解析与条目绑定', '生成健康评价']

/** 定时器集中管理（组件卸载时统一清理） */
let timers = []
let toastTimer = null
let pendingRecognition = null // 进行中的识别 Promise

/* ============================ 计算属性 ============================ */

/** 当前是否已有「已选图片」（真实预览图或示例 Emoji） */
const hasImage = computed(() => !!previewUrl.value || !!selectedEmoji.value)

/** 文件大小友好展示 */
const sizeText = computed(() =>
  fileSize.value > 1024 * 1024 ? `${(fileSize.value / 1024 / 1024).toFixed(1)} MB` : `${Math.round(fileSize.value / 1024)} KB`
)

/** 识别结果在该分量下的实际营养值 */
const resultNutrition = computed(() => (result.value ? scaleNutrition(result.value.food, grams.value) : null))

/** 健康评价（标签 + 结论 + 等级） */
const evaluation = computed(() => (result.value ? evaluateFood(result.value.food, grams.value) : null))

/** 匹配方式的中文标签（云端大模型 / Mock / 文本线索 / 视觉特征） */
const matchModeText = computed(() => {
  if (!result.value) return ''
  const map = {
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
  return `主色 ${f.hue}°（${hueName(f.hue)}）· 饱和度 ${f.sat} · 明度 ${f.light} · 边缘密度 ${f.edge}`
})

/** 综合评价等级横幅配置 */
const levelBanner = computed(() => {
  const level = evaluation.value?.level || 'ok'
  if (level === 'bad') return { emoji: '🔴', text: '需要控制', bg: 'rgba(239, 68, 68, 0.12)', color: '#dc5252' }
  if (level === 'warn') return { emoji: '⚠️', text: '适量即可', bg: '#fff9e6', color: '#b8801a' }
  return { emoji: '✅', text: '推荐食用', bg: '#e6f7ef', color: '#2f9e6b' }
})

/** 营养数据网格（7 项：该分量实际值 + 每 100g 基准值） */
const NUTRIENT_ORDER = ['calories', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium']
const nutritionTiles = computed(() => {
  if (!result.value) return []
  const n = resultNutrition.value
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
const history = ref([])
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
function handleFileChange(e) {
  const file = e.target.files && e.target.files[0]
  if (file) readFile(file)
  e.target.value = '' // 允许重复选择同一文件
}

/**
 * 读取并校验文件：
 * 非图片提示错误；超过 8MB 提示过大；通过则用 FileReader 生成预览
 */
function readFile(file) {
  errorMsg.value = ''
  if (!file.type.startsWith('image/')) {
    errorMsg.value = '仅支持图片文件，请上传 JPG / PNG 格式 🖼️'
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    errorMsg.value = '图片过大（超过 8MB），请压缩后重新上传 📦'
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    previewUrl.value = reader.result
    selectedEmoji.value = ''
    fileName.value = file.name
    fileSize.value = file.size
    resetResult()
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
function onDrop(e) {
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
  pendingRecognition = recognizeWithAI(previewUrl.value || '', fileName.value, hint.value)

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
  let res = null
  try {
    res = await (pendingRecognition || recognizeWithAI('', fileName.value, hint.value))
  } catch (err) {
    errorMsg.value = `识别过程出现异常：${err?.message || err}，请重试 🙏`
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
  pushHistory()
}

/** 点击示例：以 Emoji 占位作为「已选图片」，示例词作为文件名线索并立即识别 */
function pickSample(sample) {
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
    emoji: result.value.food.emoji,
    name: result.value.food.name,
    confidence: result.value.confidence,
    grams: grams.value,
    calories: Math.round(n.calories),
    time: nowTimeStr()
  })
  if (history.value.length > 8) history.value = history.value.slice(0, 8)
}

/** 餐段选择（默认按当前时间推断） */
const mealType = ref(guessMealByNow())

/** 加入今日饮食记录 */
function addToDiet() {
  if (!result.value) return
  // 模型识别出的食物不在本地食物库时，没有可信营养参数，禁止写入记录
  if (cannotRecord.value) {
    showToast(`「${result.value.unmatchedName}」暂无营养数据，请先在饮食记录页手动搜索添加 ⚠️`)
    return
  }
  const record = dietStore.addRecord({ mealType: mealType.value, food: result.value.food, grams: grams.value })
  if (record) showToast(`已把「${record.name}」加入「${mealType.value}」记录 ✅`)
  else showToast('添加失败，请稍后重试 😢')
}

/** 显示 toast（2 秒后自动消失，注意清理定时器） */
function showToast(msg) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2000)
}

/** 快捷分量按钮 */
const QUICK_GRAMS = [50, 100, 150, 200, 300]
function setGrams(v) {
  grams.value = v
}

/** 切换餐段 */
function selectMeal(m) {
  mealType.value = m
}

/* ============================ 生命周期清理 ============================ */

/** 清理所有识别相关定时器 */
function clearTimers() {
  timers.forEach((t) => clearTimeout(t))
  timers = []
}

onBeforeUnmount(() => {
  clearTimers()
  clearTimeout(toastTimer)
})

/** 页面挂载后探测一次 AI 服务状态，提示用户当前是云端模型还是 Mock 模式 */
onMounted(async () => {
  aiProbing.value = true
  try {
    aiService.value = await probeAIService()
  } catch (err) {
    aiService.value = { ok: false, error: `AI 服务探测失败：${err?.message || err}` }
  } finally {
    aiProbing.value = false
  }
})
</script>

<template>
  <div class="stagger">
    <!-- ① 页面标题栏（右侧「核心亮点」标记） -->
    <PageHeader>
      <template #extra>
        <span class="tag tag-purple">⭐ 核心亮点</span>
      </template>
    </PageHeader>

    <!-- ② + ③ 主体两栏：左上传 / 右结果 -->
    <div class="mb-5 grid gap-5 lg:grid-cols-[1fr_1.05fr]">
      <!-- ================= 左栏：上传与识别过程 ================= -->
      <MacaronCard theme="purple" title="上传食物照片" emoji="📷" sub="点击或拖拽上传，AI 自动识别营养">
        <!-- 隐藏的文件选择框 -->
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="handleFileChange" />

        <!-- AI 服务状态条：告知当前走云端模型 / Mock 模式 / 代理未启动 -->
        <div
          v-if="serviceStatus"
          class="mb-3 rounded-[12px] px-3 py-2 text-[11.5px] font-semibold"
          :style="
            serviceStatus.tone === 'ok'
              ? { background: '#e6f7ef', color: '#2f9e6b' }
              : serviceStatus.tone === 'warn'
                ? { background: '#fff9e6', color: '#b8801a' }
                : { background: '#f4f6fa', color: '#7b8798' }
          "
        >
          <span aria-hidden="true">{{ serviceStatus.emoji }}</span> {{ serviceStatus.text }}
        </div>

        <!-- 未选择图片：虚线拖拽区 -->
        <div
          v-if="!hasImage"
          class="cursor-pointer rounded-[18px] border-2 border-dashed p-8 text-center transition-all duration-200"
          :style="dragging ? { borderColor: '#9b83e8', background: '#faf7ff' } : { borderColor: '#e7ecf3' }"
          @click="onPickFile"
          @dragover.prevent="onDragOver"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop"
        >
          <span class="anim-float text-[44px] leading-none" aria-hidden="true">📷</span>
          <p class="mt-2 text-[13px] font-bold tx-main">点击或拖拽上传食物照片</p>
          <p class="mt-1 text-[12px] tx-muted">支持 JPG / PNG 格式，大小不超过 8MB</p>
        </div>

        <!-- 已选择图片：预览 + 文件信息 + 操作按钮（识别中叠加扫描线） -->
        <div v-else>
          <div class="scan-wrap rounded-[18px]" style="border: 1px solid #efe9ff">
            <img v-if="previewUrl" :src="previewUrl" alt="食物照片预览" class="h-[240px] w-full object-cover" />
            <div v-else class="grid h-[240px] place-items-center text-[80px] leading-none" aria-hidden="true">
              {{ selectedEmoji }}
            </div>
            <!-- 识别中：扫描线动效 -->
            <div v-if="detecting" class="scan-line"></div>
          </div>

          <div class="mt-3 flex items-center gap-2">
            <span class="text-[16px]" aria-hidden="true">🖼️</span>
            <span class="ellipsis flex-1 text-[12px] tx-main">{{ fileName || '示例图片' }}</span>
            <span v-if="fileSize" class="num text-[11px] tx-muted">{{ sizeText }}</span>
            <button class="btn btn-ghost btn-xs" @click="onPickFile">重新上传</button>
            <button class="btn btn-danger-soft btn-xs" @click="resetUpload">移除</button>
          </div>
        </div>

        <!-- 上传校验错误提示 -->
        <p v-if="errorMsg" class="mt-3 rounded-[12px] px-3 py-2 text-[12px]" style="background: rgba(239, 68, 68, 0.1); color: #dc5252">
          {{ errorMsg }}
        </p>

        <!-- 示例图片快捷按钮 -->
        <p class="mt-4 flex items-center gap-1.5 text-[12px] font-semibold tx-sub">
          <span aria-hidden="true">✨</span> 试试这些示例（含热带水果等易混淆场景）
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button v-for="s in SAMPLES" :key="s.id" class="chip" @click="pickSample(s)">
            <span aria-hidden="true">{{ s.emoji }}</span>{{ s.label }}
          </button>
        </div>

        <!-- 线索补充：截图文件名常无意义（如 Snipaste_xxx.png），此处可手动补充 -->
        <p class="mt-4 flex items-center gap-1.5 text-[12px] font-semibold tx-sub">
          <span aria-hidden="true">🔖</span> 补充线索（可选，推荐填写）
        </p>
        <input
          v-model="hint"
          class="field mt-2"
          type="text"
          maxlength="20"
          placeholder="如：榴莲 / 蛋炒饭 / 三文鱼（截图文件名无效时请填写）"
        />
        <p class="mt-1 text-[11px] tx-muted">
          提示：截图工具生成的文件名（如 Snipaste_2026-08-03_09-53-44.png）不含食物信息，
          填写线索可显著提升识别准确率；不填则完全依赖图像视觉特征比对。
        </p>

        <div class="divider"></div>

        <!-- 识别过程：4 步文案 + 进度条 -->
        <div v-if="detecting" class="soft-panel">
          <div class="space-y-2.5">
            <div v-for="(step, i) in STEPS" :key="step" class="flex items-center gap-2.5">
              <span
                class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                :class="i <= stepIndex ? 'anim-pulse-soft' : ''"
                :style="
                  i < stepIndex
                    ? { background: '#e6f7ef', color: '#2f9e6b' }
                    : i === stepIndex
                      ? { background: '#f3efff', color: '#7a5fd0' }
                      : { background: '#f3f5f9', color: '#98a5b5' }
                "
              >
                {{ i < stepIndex ? '✓' : i + 1 }}
              </span>
              <span class="text-[12px]" :class="i <= stepIndex ? 'font-semibold tx-main' : 'tx-muted'">{{ step }}</span>
            </div>
          </div>
          <div class="progress-track mt-3" style="height: 8px">
            <div class="progress-fill progress-ok" :style="{ width: progress + '%' }"></div>
          </div>
          <p class="mt-1.5 text-right text-[11px] tx-muted">AI 正在分析中… <span class="num">{{ progress }}%</span></p>
        </div>

        <!-- 开始识别按钮 -->
        <button
          v-else
          class="btn btn-purple mt-4 w-full"
          :disabled="detecting"
          @click="startRecognize"
        >
          🚀 开始 AI 识别
        </button>
      </MacaronCard>

      <!-- ================= 右栏：识别结果 ================= -->
      <MacaronCard theme="cyan" title="AI 识别结果" emoji="🔍" sub="营养数据随分量实时联动">
        <!-- 识别中：占位骨架 -->
        <div v-if="detecting" class="flex flex-col items-center justify-center gap-3" style="min-height: 360px">
          <span class="anim-spin-slow text-[44px] leading-none" aria-hidden="true">🧠</span>
          <p class="text-[13px] font-semibold tx-sub">AI 正在解析图片，请稍候…</p>
        </div>

        <!-- 未识别：空状态 -->
        <EmptyState
          v-else-if="!result"
          emoji="🍱"
          text="还没有识别结果"
          sub="上传或选择一张食物照片，点击「开始 AI 识别」"
          height="360px"
        />

        <!-- 识别完成：完整结果 -->
        <div v-else class="anim-pop">
          <!-- 食物卡片头：Emoji + 名称 + 分类 + 置信度 + 分量 -->
          <div class="flex items-center gap-3.5">
            <span class="emoji-badge-lg" aria-hidden="true">{{ result.food.emoji }}</span>
            <div class="min-w-0 flex-1">
              <p class="text-[16px] font-extrabold tx-main">{{ result.food.name }}</p>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <span class="tag tag-cyan">{{ result.food.category }}</span>
                <!-- 识别来源徽标：云端大模型 / Mock 演示 / 本地引擎 -->
                <span
                  v-if="sourceBadge"
                  class="tag"
                  :class="sourceBadge.tone === 'ok' ? 'tag-green' : sourceBadge.tone === 'warn' ? 'tag-yellow' : ''"
                >
                  <span aria-hidden="true">{{ sourceBadge.emoji }}</span> {{ sourceBadge.text }}
                </span>
                <span class="chip chip-strong">
                  <span aria-hidden="true">🎯</span> AI 置信度 <b class="num">{{ result.confidence }}%</b>
                </span>
                <span class="chip">⚖️ 当前分量 <b class="num chip-strong">{{ grams }} g</b></span>
              </div>
            </div>
          </div>
          <p class="mt-2 text-[11px] tx-muted">
            匹配方式：{{ matchModeText }} · 每 100g 基准营养来自本地食物数据库（共 {{ FOOD_STATS.total }} 条）
          </p>

          <!-- 降级提示：云端调用失败已回退本地引擎时如实告知（不隐瞒） -->
          <p
            v-if="result.notice"
            class="mt-2 rounded-[12px] px-3 py-2 text-[11.5px] font-semibold"
            style="background: #fff9e6; color: #b8801a"
          >
            ⚠️ {{ result.notice }}
          </p>

          <!-- 未匹配提示：模型识别结果不在本地食物库，无营养数据可记录 -->
          <div
            v-if="result.unmatchedName"
            class="mt-2 rounded-[12px] px-3 py-2.5 text-[11.5px]"
            style="background: rgba(239, 68, 68, 0.08); color: #dc5252"
          >
            <p class="font-bold">⚠️ 模型识别为「{{ result.unmatchedName }}」，但本地食物库暂无该条目</p>
            <p class="mt-1 opacity-90">
              下方展示的是最接近的「{{ result.food.name }}」营养参数，仅作参考；如需记录，请到饮食记录页手动搜索添加。
            </p>
          </div>

          <!-- 判定依据：把「为什么是它」摊开给用户看（可解释 AI） -->
          <div class="soft-panel mt-3">
            <p class="text-[12px] font-bold tx-main">🔬 识别判定依据</p>
            <p v-if="featureText" class="mt-1 text-[11px] tx-sub">图像特征：{{ featureText }}</p>
            <ul class="mt-2 space-y-1.5">
              <li v-for="(r, i) in result.reasons" :key="i" class="flex gap-1.5 text-[11px] tx-sub">
                <span aria-hidden="true">·</span><span>{{ r }}</span>
              </li>
            </ul>
          </div>

          <!-- 候选排名：模型候选（☁️）与本地视觉候选（🔬）交叉展示，体现「打分排序」而非「随机抽取」 -->
          <div class="mt-3">
            <p class="text-[12px] font-bold tx-main">📋 候选排名（Top 5）</p>
            <div class="mt-2 space-y-1.5">
              <div v-for="(c, i) in result.candidates" :key="c.food.id" class="flex items-center gap-2">
                <span class="num w-4 shrink-0 text-[11px] tx-muted">{{ i + 1 }}</span>
                <span class="shrink-0" aria-hidden="true">{{ c.food.emoji }}</span>
                <span class="ellipsis w-[86px] shrink-0 text-[11px]" :class="i === 0 ? 'font-bold tx-main' : 'tx-sub'">
                  {{ c.food.name }}
                </span>
                <span class="shrink-0 text-[10px]" :title="c.fromModel ? '来自云端模型候选' : '来自本地视觉特征候选'">
                  {{ c.fromModel ? '☁️' : '🔬' }}
                </span>
                <div class="progress-track flex-1" style="height: 7px">
                  <div
                    class="progress-fill"
                    :class="i === 0 ? 'progress-ok' : ''"
                    :style="{ width: Math.max(4, Math.round(c.score)) + '%', background: i === 0 ? '' : '#c7d2e0' }"
                  ></div>
                </div>
                <span class="num w-8 shrink-0 text-right text-[11px] tx-muted">{{ Math.round(c.score) }}</span>
              </div>
            </div>
          </div>

          <div class="divider"></div>

          <!-- 分量调节：滑杆 + 数字输入 + 快捷按钮 -->
          <p class="field-label">🍽️ 分量调节（20–500g）</p>
          <div class="flex items-center gap-3">
            <input v-model.number="grams" type="range" min="20" max="500" step="10" class="flex-1 accent-purple-400" />
            <input v-model.number="grams" type="number" min="20" max="500" step="10" class="field w-[92px] text-center" />
            <span class="text-[12px] tx-muted">g</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-2">
            <button v-for="g in QUICK_GRAMS" :key="g" class="btn btn-ghost btn-xs" @click="setGrams(g)">{{ g }}g</button>
          </div>

          <!-- 营养数据网格 -->
          <p class="field-label mt-4">📊 该分量下的营养数据</p>
          <div class="grid grid-cols-4 gap-3">
            <StatTile
              v-for="tile in nutritionTiles"
              :key="tile.key"
              :theme="tile.theme"
              :label="tile.label"
              :emoji="tile.emoji"
              :value="tile.value"
              :unit="tile.unit"
            >
              每100g：<span class="num">{{ tile.base }}{{ tile.unit }}</span>
            </StatTile>
          </div>

          <div class="divider"></div>

          <!-- 健康评价：标签 + 结论 -->
          <p class="field-label">🤖 AI 健康评价</p>
          <div class="soft-panel">
            <!-- 标签：危险红色 / 优质绿色 / 中性灰色 -->
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(tag, i) in evaluation.tags"
                :key="i"
                :class="tag.type === 'danger' ? 'badge badge-over' : tag.type === 'good' ? 'badge badge-ok' : 'tag'"
              >
                <span aria-hidden="true">{{ tag.emoji }}</span>{{ tag.label }}
              </span>
            </div>
            <p class="mt-3 text-[12px] leading-relaxed tx-sub">{{ evaluation.comment }}</p>
          </div>

          <!-- 综合评价等级横幅 -->
          <div
            class="mt-3 flex items-center gap-2.5 rounded-[16px] px-4 py-3"
            :style="{ background: levelBanner.bg, color: levelBanner.color }"
          >
            <span class="text-[20px]" aria-hidden="true">{{ levelBanner.emoji }}</span>
            <div>
              <p class="text-[13px] font-bold">综合结论：{{ levelBanner.text }}</p>
              <p class="text-[11px] opacity-80">基于高脂 / 高糖 / 高热量 / 高钠等风险规则自动判定</p>
            </div>
          </div>

          <div class="divider"></div>

          <!-- 加入今日饮食记录：餐段选择 + 按钮 + 成功提示 -->
          <p class="field-label">➕ 加入今日饮食记录</p>
          <div class="flex flex-wrap items-center gap-3">
            <div class="seg">
              <button
                v-for="meal in dietStore.MEAL_TYPES"
                :key="meal"
                class="seg-item"
                :class="{ 'is-active': mealType === meal }"
                @click="selectMeal(meal)"
              >
                {{ dietStore.MEAL_EMOJI[meal] }} {{ meal }}
              </button>
            </div>
            <button class="btn btn-green ml-auto" :disabled="cannotRecord" @click="addToDiet">➕ 加入记录</button>
          </div>

          <!-- toast 成功提示条 -->
          <p
            v-if="toast"
            class="anim-fade-up mt-3 rounded-[12px] px-3.5 py-2.5 text-[12px] font-semibold"
            style="background: #e6f7ef; color: #2f9e6b"
          >
            {{ toast }}
          </p>
        </div>
      </MacaronCard>
    </div>

    <!-- ④ 底部：识别历史 + AI 识别原理说明 -->
    <div class="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <!-- 本次会话识别历史（mc-yellow） -->
      <MacaronCard theme="yellow" title="本次会话识别历史" emoji="🕘" sub="最近 8 次识别记录">
        <template #extra>
          <button class="btn btn-ghost btn-xs" :disabled="!history.length" @click="clearHistory">🗑️ 清空历史</button>
        </template>

        <div v-if="history.length" class="scroll-area no-scrollbar" style="max-height: 320px">
          <table class="table-macaron">
            <thead>
              <tr>
                <th>食物</th>
                <th>置信度</th>
                <th>分量</th>
                <th>热量</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in history" :key="row.id">
                <td>
                  <span class="mr-1.5" aria-hidden="true">{{ row.emoji }}</span>{{ row.name }}
                </td>
                <td class="num">{{ row.confidence }}%</td>
                <td class="num">{{ row.grams }} g</td>
                <td class="num">{{ row.calories }} kcal</td>
                <td class="tx-muted">{{ row.time }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <EmptyState v-else emoji="📭" text="暂无识别记录" sub="每完成一次识别，这里会自动记录" height="160px" />
      </MacaronCard>

      <!-- AI 识别原理说明（mc-blue） -->
      <MacaronCard theme="blue" title="AI 识别原理说明" emoji="🧠" sub="答辩讲解要点">
        <ul class="space-y-3">
          <li class="list-item">
            <span class="emoji-badge mc-blue" aria-hidden="true">1️⃣</span>
            <div>
              <p class="text-[12px] font-bold tx-main">前端参数标准化</p>
              <p class="text-[12px] tx-sub">图片转为 dataURL，文件名与用户输入归一化为线索词，组装成统一入参 { image, hint, clues }。</p>
            </div>
          </li>
          <li class="list-item">
            <span class="emoji-badge mc-green" aria-hidden="true">2️⃣</span>
            <div>
              <p class="text-[12px] font-bold tx-main">云端视觉大模型（智谱 GLM-4V）</p>
              <p class="text-[12px] tx-sub">请求经本地 Node 代理转发到 OpenAI 兼容端点，<b>API Key 只保存在服务端</b>，绝不打包进前端产物。</p>
            </div>
          </li>
          <li class="list-item">
            <span class="emoji-badge mc-purple" aria-hidden="true">3️⃣</span>
            <div>
              <p class="text-[12px] font-bold tx-main">结果解析与条目绑定</p>
              <p class="text-[12px] tx-sub">把模型返回解析为结构化字段，再用模糊检索把食物名绑定到本地食物库条目，从而取到可信的每 100g 营养参数。</p>
            </div>
          </li>
          <li class="list-item">
            <span class="emoji-badge mc-yellow" aria-hidden="true">4️⃣</span>
            <div>
              <p class="text-[12px] font-bold tx-main">降级兜底与可解释层</p>
              <p class="text-[12px] tx-sub">超时 / 限流 / 断网时自动回退本地可解释规则引擎，输出判定依据与候选排名，保证演示永不中断。</p>
            </div>
          </li>
        </ul>

        <!-- 数据规模说明 -->
        <div class="soft-panel mt-3">
          <p class="text-[12px] font-bold tx-main">📚 本地食物数据库规模</p>
          <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] tx-sub">
            <p>条目总数：<b class="num tx-main">{{ FOOD_STATS.total }}</b> 条</p>
            <p>分类数：<b class="num tx-main">{{ FOOD_STATS.categories }}</b> 个</p>
            <p>标签数：<b class="num tx-main">{{ FOOD_STATS.tags }}</b> 个</p>
            <p>组合推算：<b class="num tx-main">{{ FOOD_STATS.generated }}</b> 条</p>
          </div>
        </div>

        <p class="mt-3 text-[11px] tx-muted">
          💡 诚实说明：本项目已接入**真实云端视觉大模型**（智谱 GLM-4V，OpenAI 兼容端点），
          密钥由 Node 代理服务持有、不下发到浏览器；本地可解释规则引擎作为兜底层保留。
          本项目**不包含模型训练流程**，因此不宣称「训练准确率」——页面上的置信度来自模型自评
          与本地引擎的交叉验证，识别结果仍建议人工确认。
        </p>
      </MacaronCard>
    </div>
  </div>
</template>

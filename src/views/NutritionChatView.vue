<script setup lang="ts">
/**
 * NutritionChatView AI 营养对话助手（AI 核心功能页 · 第 10 个页面）
 * ==================================================================
 * 功能定位：把「只会回答通用营养常识」升级为「结合你的身体数据与今日饮食作答」，
 *           并让 AI 能力从单一图像识别扩展到**多轮对话 + 个性化 + 知识库增强**，
 *           对应比赛要求「AI 功能应是应用的核心而非附属功能」。
 *
 * 与「AI食物识别」页共用的技术底座：
 *   · 同一个 Node 代理（server/）—— 密钥只在服务端，绝不下发浏览器
 *   · 同一套稳定性机制 —— 超时 / 重试 / 错误码映射 / SSE 流式
 *   · 同一种降级叙事 —— ☁️ 云端大模型 → 🔬 本地知识库，永不掉线
 *
 * 本页相比通用问答的**三个差异化设计**（答辩可重点讲）：
 *   ① 个性化上下文注入：把 userStore 的 BMI/BMR/TDEE/推荐热量 与 dietStore 的
 *      今日营养合计/健康评分/已记录食物 拼进 system prompt，模型据此作答；
 *   ② RAG 检索增强：提问时先从本地知识库（科普文章 / 食物相克 / 健康习惯 / 916 条
 *      食物营养数据）经 BM25 + 语义向量混合召回 Top-4，作为「参考资料」注入并展示，
 *      既减少模型胡编，也延续了识别页「可解释 AI」的思路；
 *   ③ 流式输出（SSE）：边生成边渲染打字机效果，并支持「停止生成」；
 *   ④ AI Agent 工具调用：模型可自主决定调用工具（读取今日/历史饮食、健康档案、
 *      915 条食物营养库、膳食推荐），拿到真实数据后再作答，调用轨迹实时可见。
 *
 * 如实说明（见页面底部卡片）：模型能力来自调用云端大模型，本项目不含模型训练流程，
 * 因此不宣称任何训练准确率；本地知识库仅作事实依据与兜底，不做医学诊断。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useDietStore } from '@/store/diet'
import { usePilotStore } from '@/store/pilot'
import MacaronCard from '@/components/common/MacaronCard.vue'
import { askNutritionAI, buildContextText, CHAT_SOURCE_LABELS, SUGGESTED_QUESTIONS } from '@/utils/aiChat'
import type { AgentExecutionPlan, AgentPlanEvent, AgentPlanStepStatus } from '@/utils/agentPlanner'
import { probeAIService } from '@/utils/aiRecognition'
import { confirmAddDietRecord } from '@/utils/aiTools'
import { applyInterventionPlan } from '@/utils/interventionSimulator'
import type { InterventionPlan, InterventionSimulation } from '@/utils/interventionSimulator'
import { createMicroIntervention } from '@/utils/microIntervention'
import { readJSON, writeJSON, removeKey, STORAGE_KEYS } from '@/utils/storage'
import { consumeRecognitionConsultContext } from '@/utils/multimodalContext'
import {
  createSpeechRecognizer,
  getSpeechSupport,
  pauseSpeech,
  resumeSpeech,
  speakText,
  stopSpeech,
  type SpeechRecognizer
} from '@/utils/speech'
import type { AIError, AISource, KnowledgeReference, MealType, RecognitionConsultContext } from '@/types'

interface ContextFacts {
  bmi?: number
  bmiLabel?: string
  bmr?: number
  tdee?: number
  todayTarget?: number
  todayCalories?: number
  goal?: string
  score?: number
  water?: number
}

interface AIServiceState {
  ok: boolean
  mode?: string
  model?: string
  chatModel?: string
  notice?: string
  error?: string
}

interface PendingDietRecord {
  foodId: string
  name: string
  emoji: string
  grams: number
  unit: string
  mealType: MealType
}

interface ToolTrace {
  callId: string
  name: string
  emoji: string
  label: string
  running?: boolean
  ok?: boolean | null
  summary: string
  pending?: PendingDietRecord | null
  interventions?: InterventionSimulation
}

interface ToolStep extends Partial<ToolTrace> {
  phase: 'start' | 'confirm' | 'done'
  callId: string
  name: string
  emoji: string
  label: string
}

interface ChatViewMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  source?: AISource | ''
  refs?: KnowledgeReference[]
  tools?: ToolTrace[]
  plan?: AgentExecutionPlan
  streaming?: boolean
  notice?: string
  truncated?: boolean
  error?: AIError | { message: string } | null
}

interface FactTile {
  key: string
  emoji: string
  label: string
  value: string | number
  unit: string
  note: string
}

const userStore = useUserStore()
const dietStore = useDietStore()
const pilotStore = usePilotStore()
const router = useRouter()

/* ============================ 个性化上下文 ============================ */
/**
 * 组装注入给模型的上下文（身体指标 + 今日饮食）
 * 注意：这里只读取，不修改，任何档案或记录变化都会实时反映到下一轮对话。
 */
const context = computed(() => ({
  profile: userStore.profile,
  metrics: userStore.metrics,
  summary: dietStore.summary,
  targets: dietStore.targets,
  report: dietStore.report,
  water: dietStore.water,
  records: dietStore.records
}))

/** 上下文中的结构化事实（用于右侧面板直观展示「模型看到了什么」） */
const ctxFacts = computed<ContextFacts>(() => buildContextText(context.value).facts as ContextFacts)

/** 今日剩余可摄入热量（可为负，表示已超） */
const remainingCalories = computed(() =>
  Math.round((ctxFacts.value.todayTarget || 0) - (ctxFacts.value.todayCalories || 0))
)

/** 右侧个性化面板的指标格子 */
const factTiles = computed(() => {
  const f = ctxFacts.value
  const list: FactTile[] = []
  if (f.bmi !== undefined)
    list.push({ key: 'bmi', emoji: '⚖️', label: 'BMI', value: f.bmi, unit: '', note: f.bmiLabel || '' })
  if (f.bmr) list.push({ key: 'bmr', emoji: '🔥', label: '基础代谢', value: f.bmr, unit: 'kcal', note: 'BMR' })
  if (f.tdee) list.push({ key: 'tdee', emoji: '🏃', label: '每日消耗', value: f.tdee, unit: 'kcal', note: 'TDEE' })
  if (f.todayTarget)
    list.push({ key: 'target', emoji: '🎯', label: '推荐摄入', value: f.todayTarget, unit: 'kcal', note: f.goal || '' })
  list.push({ key: 'intake', emoji: '🍽️', label: '今日已摄入', value: f.todayCalories || 0, unit: 'kcal', note: '' })
  list.push({
    key: 'remaining',
    emoji: remainingCalories.value >= 0 ? '✅' : '⚠️',
    label: remainingCalories.value >= 0 ? '今日还可摄入' : '今日已超出',
    value: Math.abs(remainingCalories.value),
    unit: 'kcal',
    note: ''
  })
  if (f.score !== undefined)
    list.push({ key: 'score', emoji: '📋', label: '饮食评分', value: f.score, unit: '分', note: '' })
  if (f.water)
    list.push({ key: 'water', emoji: '💧', label: '今日饮水', value: Math.round(f.water), unit: 'ml', note: '' })
  return list
})

/* ============================ AI 服务状态 ============================ */
const aiService = ref<AIServiceState | null>(null)
const aiProbing = ref(false)

const serviceStatus = computed(() => {
  if (aiProbing.value) return { tone: 'sub', emoji: '⏳', text: '正在探测 AI 服务状态…' }
  if (!aiService.value) return null
  if (!aiService.value.ok) return { tone: 'warn', emoji: '⚠️', text: aiService.value.error }
  // Mock 模式不再显示顶部横幅（用户要求移除该提示）；
  // 每条回答下方的来源徽标（☁️/🧪/🔬）仍会如实标注
  if (aiService.value.mode === 'mock') return null
  return {
    tone: 'ok',
    emoji: '☁️',
    text: `云端对话模型已就绪：${aiService.value.chatModel || aiService.value.model}${aiService.value.notice ? ' · ' + aiService.value.notice : ''}`
  }
})

/* ============================ 对话状态 ============================ */
/**
 * 消息列表
 * 每条结构：{ id, role:'user'|'assistant', content, source, refs, streaming, notice, truncated, error }
 * 说明：assistant 消息用 reactive 创建，保证流式追加 content 时能触发视图更新
 */
const messages = ref<ChatViewMessage[]>([])
const input = ref('')
const streaming = ref(false)
const listRef = ref<HTMLElement | null>(null)
const recognitionContext = ref<RecognitionConsultContext | null>(null)
const speechSupport = getSpeechSupport()
const listening = ref(false)
const voiceStatus = ref(speechSupport.recognition ? '' : '当前浏览器不支持语音输入，可继续使用文字输入')
const speakingMessageId = ref<number | null>(null)
const speechPaused = ref(false)

/** 进行中的请求控制器（用于「停止生成」与组件卸载时中断） */
let controller: AbortController | null = null
let speechRecognizer: SpeechRecognizer | null = null
let voiceBaseInput = ''
let voiceCommitted = ''
let voiceHadError = false
let recognitionContextInjected = false
let msgSeed = 0

/** 对话是否为空（用于展示欢迎页与推荐问题） */
const isEmpty = computed(() => messages.value.length === 0)

const CHAT_MODES = [
  { key: 'ask', label: '自由提问', placeholder: '问我任何营养问题，例如：减脂期晚餐怎么吃？' },
  { key: 'review', label: '今日复盘', placeholder: '让 AI 结合今天的饮食记录进行分析' },
  { key: 'plan', label: '膳食安排', placeholder: '描述你的目标，让 AI 帮你安排接下来怎么吃' }
]
const activeMode = ref('ask')

const latestQuestion = computed(() => {
  const latest = [...messages.value].reverse().find(message => message.role === 'user')
  return String(input.value || latest?.content || '')
})

const conversationFocus = computed(() => {
  const query = latestQuestion.value
  if (/增肌|肌肉|训练/.test(query))
    return { key: 'muscle', label: '增肌与训练', keys: ['tdee', 'target', 'intake', 'remaining', 'bmi'] }
  if (/减脂|减肥|体重|BMI/i.test(query))
    return { key: 'weight', label: '体重管理', keys: ['bmi', 'target', 'intake', 'remaining', 'tdee'] }
  if (/水|饮水/.test(query)) return { key: 'water', label: '饮水状态', keys: ['water', 'intake', 'score', 'bmi'] }
  if (/今天|昨天|饮食|吃了|热量|还能吃/.test(query))
    return { key: 'diet', label: '今日饮食', keys: ['intake', 'remaining', 'target', 'score', 'water'] }
  return { key: 'profile', label: '个人健康基线', keys: ['bmi', 'target', 'intake', 'remaining', 'score'] }
})

const activeFactTiles = computed(() => {
  const order = conversationFocus.value.keys
  return [...factTiles.value]
    .sort((a, b) => {
      const ai = order.indexOf(a.key)
      const bi = order.indexOf(b.key)
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    })
    .slice(0, 5)
})

const dynamicQuestions = computed(() => {
  const focus = conversationFocus.value.key
  const matched = SUGGESTED_QUESTIONS.filter(question => {
    if (focus === 'muscle') return /增肌|蛋白质|三餐/.test(question.text)
    if (focus === 'weight') return /BMI|减脂|还能吃/.test(question.text)
    if (focus === 'water') return /水|饮食/.test(question.text)
    if (focus === 'diet') return /今天|昨天|外卖|还能吃/.test(question.text)
    return true
  })
  return [...matched, ...SUGGESTED_QUESTIONS.filter(question => !matched.includes(question))].slice(0, 5)
})

const inputPlaceholder = computed(
  () => CHAT_MODES.find(mode => mode.key === activeMode.value)?.placeholder || CHAT_MODES[0].placeholder
)

/* ============================ 对话持久化 ============================ */
/** 最多持久化的消息条数（超出只留最近，避免 localStorage 无限增长） */
const CHAT_PERSIST_MAX = 50

/**
 * 从消息对象中提取「可持久化的纯数据」
 * 去掉 streaming / error 等瞬时状态，refs 与 tools 保留（刷新后仍可核对依据）
 */
function serializeMessages(list: ChatViewMessage[]) {
  return list
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-CHAT_PERSIST_MAX)
    .map(m => ({
      role: m.role,
      content: m.content,
      source: m.source || '',
      refs: Array.isArray(m.refs) ? m.refs : [],
      // 只保留白名单字段：丢弃 pending，避免刷新后出现无法操作的确认卡片（确认动作依赖运行时 store）
      tools: Array.isArray(m.tools)
        ? m.tools.map((t: ToolTrace) => ({
            callId: t.callId,
            name: t.name,
            emoji: t.emoji,
            label: t.label,
            ok: t.pending ? false : t.ok,
            summary: t.pending ? '未确认（刷新后已失效）' : t.summary
          }))
        : [],
      plan: m.plan || undefined,
      notice: m.notice || '',
      truncated: Boolean(m.truncated)
    }))
}

/** 写入 localStorage（流式输出期间也会保存增量，保证刷新不丢） */
function persistChat() {
  writeJSON(STORAGE_KEYS.chat, { savedAt: Date.now(), messages: serializeMessages(messages.value) })
}

/** 从 localStorage 恢复历史对话；返回恢复的消息条数 */
function restoreChat() {
  const stored = readJSON(STORAGE_KEYS.chat, null) as { messages?: Array<Partial<ChatViewMessage>> } | null
  const list = Array.isArray(stored?.messages) ? stored.messages : []
  list.forEach((m: Partial<ChatViewMessage>) => {
    messages.value.push(
      reactive({
        id: ++msgSeed,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content || ''),
        source: m.source || '',
        refs: Array.isArray(m.refs) ? m.refs : [],
        tools: Array.isArray(m.tools) ? m.tools : [],
        plan: m.plan,
        streaming: false,
        notice: m.notice || '',
        truncated: Boolean(m.truncated),
        error: null
      })
    )
  })
  return messages.value.length
}

// 消息变化时自动持久化（deep 监听，覆盖流式增量与工具轨迹更新）
watch(messages, persistChat, { deep: true })

/** 滚动到消息区底部 */
function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

/**
 * 发送一条提问
 * @param {string} [text] 指定文本（点击推荐问题时传入）；不传则取输入框内容
 */
async function send(text?: string) {
  const q = String(text ?? input.value).trim()
  if (!q || streaming.value) return
  pilotStore.track('ai_chat_sent', { hasRecognitionContext: Boolean(recognitionContext.value) })

  let modelQuestion = q
  if (recognitionContext.value && !recognitionContextInjected) {
    const item = recognitionContext.value
    const n = item.nutrition
    modelQuestion =
      `${q}\n\n` +
      `【本次图像识别的结构化上下文】食物：${item.foodName}；分量：${item.grams}g；` +
      `识别置信度：${item.confidence}%；热量：${Math.round(n.calories)}kcal；` +
      `蛋白质：${n.protein}g；脂肪：${n.fat}g；碳水：${n.carb}g；` +
      `膳食纤维：${n.fiber}g；糖：${n.sugar}g；钠：${n.sodium}mg。` +
      '请将该识别结果与用户健康档案、今日饮食记录一起分析；置信度不足时明确说明不确定性。'
    recognitionContextInjected = true
  }

  input.value = ''
  // 历史对话（不含本次提问），传给编排层拼进 messages
  const history = messages.value.map(m => ({ role: m.role, content: m.content }))

  messages.value.push(reactive({ id: ++msgSeed, role: 'user', content: q }))

  const ai = reactive<ChatViewMessage>({
    id: ++msgSeed,
    role: 'assistant',
    content: '',
    source: '',
    refs: [],
    // AI Agent：本次回答调用过的工具（实时显示调用轨迹）
    tools: [],
    plan: undefined,
    streaming: true,
    notice: '',
    truncated: false,
    error: null
  })
  messages.value.push(ai)
  streaming.value = true
  controller = new AbortController()
  scrollToBottom()

  try {
    const res = await askNutritionAI({
      question: modelQuestion,
      history,
      context: context.value,
      // Agent 工具的数据源：饮食记录与健康档案都在前端 store 中
      stores: { dietStore, userStore },
      signal: controller.signal,
      // 每个增量都追加到消息上，形成打字机效果
      onDelta: (delta: string) => {
        ai.content += delta
        scrollToBottom()
      },
      // 工具调用轨迹：开始 → 🛠️ 正在…，结束 → ✅ 结果摘要；写入型工具 → 待确认卡片
      onTool: (rawStep: object) => {
        const step = rawStep as ToolStep
        if (step.phase === 'start') {
          ai.tools?.push({
            callId: step.callId,
            name: step.name,
            emoji: step.emoji,
            label: step.label,
            running: true,
            ok: null,
            summary: '',
            pending: null
          })
        } else if (step.phase === 'confirm') {
          // 写入型工具（add_diet_record）：模型只生成了待确认记录，等用户在卡片上确认
          const target = ai.tools?.find((t: ToolTrace) => t.callId === step.callId)
          if (target) Object.assign(target, { running: false, ok: null, summary: '待确认', pending: step.pending })
        } else {
          const target = ai.tools?.find((t: ToolTrace) => t.callId === step.callId)
          if (target)
            Object.assign(target, {
              running: false,
              ok: step.ok,
              summary: step.summary,
              interventions: step.interventions
            })
          if (step.interventions)
            pilotStore.track('intervention_simulated', { planCount: step.interventions.plans.length })
        }
        scrollToBottom()
      },
      onPlan: (event: AgentPlanEvent) => {
        ai.plan = event.plan
        scrollToBottom()
      }
    })
    ai.source = (res.source || '') as AISource | ''
    ai.refs = (res.refs || []) as KnowledgeReference[]
    ai.notice = res.notice || ''
    ai.truncated = Boolean(res.truncated)
    if (!ai.content) ai.content = res.text || '（本次未获得回复，请重试）'
    if (!res.ok && res.error) {
      const rawError = res.error as Partial<AIError>
      ai.error = {
        code: rawError.code || 'AI_ERROR',
        status: rawError.status,
        message: rawError.message || 'AI 服务暂时不可用',
        detail: rawError.detail
      }
    }
  } catch (err: unknown) {
    // 编排层已做兜底，这里只防止极端情况下卡在「生成中」
    const message = err instanceof Error ? err.message : String(err)
    if (!ai.content) ai.content = `对话过程出现异常：${message}，请重试 🙏`
    ai.error = { message }
  } finally {
    ai.streaming = false
    streaming.value = false
    controller = null
    scrollToBottom()
  }
}

/** 停止生成：中断当前请求，已生成的内容保留 */
function stopGenerating() {
  if (controller) controller.abort()
}

/**
 * 用户在确认卡片上点击「确认记录」：真正写入今日饮食
 * 这是 add_diet_record 的唯一落库入口（防模型误写 / 注入的二次确认）
 */
function confirmToolRecord(tool: ToolTrace) {
  if (!tool?.pending) return
  const res = confirmAddDietRecord(tool.pending, dietStore)
  Object.assign(tool, {
    ok: res.ok,
    summary: res.ok ? '已记录到今日饮食' : res.summary,
    pending: null
  })
}

/** 用户点击「取消」：丢弃待确认记录，不落库 */
function cancelToolRecord(tool: ToolTrace) {
  if (!tool?.pending) return
  Object.assign(tool, { ok: false, summary: '已取消', pending: null })
}

/** 用户确认后应用模拟方案；模型和模拟工具本身都无权直接修改记录。 */
function applyIntervention(tool: ToolTrace, plan: InterventionPlan) {
  const result = applyInterventionPlan(plan, dietStore)
  tool.summary = result.summary
  tool.ok = result.ok
}

function startMicroExperiment(tool: ToolTrace, plan: InterventionPlan) {
  createMicroIntervention(plan)
  pilotStore.track('intervention_created', { planId: plan.id, predictedScore: plan.after.score })
  tool.summary = `已创建「${plan.title}」7 天微干预实验`
  tool.ok = true
  router.push('/intervention')
}

function signed(value: number, unit = ''): string {
  const number = Number(value) || 0
  return `${number > 0 ? '+' : ''}${number}${unit}`
}

/** 清空对话（重新开始），同时清除持久化缓存 */
function clearChat() {
  stopGenerating()
  messages.value = []
  removeKey(STORAGE_KEYS.chat)
}

/** 回车发送（Shift+Enter 换行） */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

function dismissRecognitionContext() {
  recognitionContext.value = null
}

function toggleVoiceInput() {
  if (!speechSupport.recognition) {
    voiceStatus.value = '当前浏览器不支持语音输入，请使用文字输入'
    return
  }
  if (listening.value) {
    speechRecognizer?.stop()
    return
  }

  voiceBaseInput = input.value.trim() ? `${input.value.trim()} ` : ''
  voiceCommitted = ''
  voiceHadError = false
  speechRecognizer = createSpeechRecognizer({
    onResult: (transcript, isFinal) => {
      if (isFinal) {
        voiceCommitted += `${transcript} `
        input.value = `${voiceBaseInput}${voiceCommitted}`.trim()
        voiceStatus.value = '已转成文字，可修改后发送'
      } else {
        input.value = `${voiceBaseInput}${voiceCommitted}${transcript}`.trim()
        voiceStatus.value = '正在聆听…'
      }
    },
    onError: message => {
      voiceHadError = true
      listening.value = false
      voiceStatus.value = `${message}；文字输入仍可正常使用`
    },
    onEnd: () => {
      listening.value = false
      if (!voiceHadError && voiceStatus.value === '正在聆听…') voiceStatus.value = '语音输入已结束'
    }
  })

  if (!speechRecognizer) return
  try {
    speechRecognizer.start()
    listening.value = true
    voiceStatus.value = '正在聆听…再次点击可停止'
  } catch {
    listening.value = false
    voiceStatus.value = '无法启动麦克风，请检查浏览器权限；文字输入仍可正常使用'
  }
}

function toggleSpeech(msg: ChatViewMessage) {
  if (!speechSupport.synthesis || !msg.content) return
  if (speakingMessageId.value === msg.id) {
    if (speechPaused.value) {
      resumeSpeech()
      speechPaused.value = false
    } else {
      pauseSpeech()
      speechPaused.value = true
    }
    return
  }

  speakingMessageId.value = msg.id
  speechPaused.value = false
  speakText(msg.content, {
    onEnd: () => {
      speakingMessageId.value = null
      speechPaused.value = false
    },
    onError: () => {
      speakingMessageId.value = null
      speechPaused.value = false
      voiceStatus.value = '语音播报失败，回答文字不受影响'
    }
  })
}

function stopMessageSpeech() {
  stopSpeech()
  speakingMessageId.value = null
  speechPaused.value = false
}

/** 消息来源徽标 */
function sourceLabel(msg: ChatViewMessage) {
  return msg.source ? CHAT_SOURCE_LABELS[msg.source] || null : null
}

function planStatusIcon(status: AgentPlanStepStatus): string {
  return (
    {
      pending: '○',
      running: '●',
      completed: '✓',
      failed: '!',
      skipped: '–'
    } as Record<AgentPlanStepStatus, string>
  )[status]
}

function completedPlanSteps(plan: AgentExecutionPlan): number {
  return plan.steps.filter(step => step.status === 'completed').length
}

/* ============================ 文本渲染 ============================ */
/**
 * 极简安全的富文本渲染
 * 注意：内容来自模型，必须先转义 HTML 再套用格式，避免 XSS 注入
 * 支持：**加粗**、换行、以 · / - / 数字 开头的列表行
 */
function escapeHtml(s: unknown): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(s || '').replace(/[&<>"']/g, c => entities[c] || c)
}

function renderText(text: string): string {
  return escapeHtml(text)
    .split('\n')
    .map(line => {
      const t = line.trim()
      if (!t) return '<p class="chat-gap"></p>'
      const html = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // 列表行加缩进与项目符号强调
      if (/^([·•\-*]|\d+[.、)])\s*/.test(t)) return `<p class="chat-line chat-item">${html}</p>`
      return `<p class="chat-line">${html}</p>`
    })
    .join('')
}

/* ============================ 生命周期 ============================ */
onMounted(async () => {
  recognitionContext.value = consumeRecognitionConsultContext()
  if (recognitionContext.value) {
    const item = recognitionContext.value
    const n = item.nutrition
    input.value =
      `我刚识别了一份${item.foodName}，约 ${item.grams}g，热量约 ${Math.round(n.calories)} kcal、` +
      `糖约 ${n.sugar}g。结合我的身体档案和今日饮食记录，我适合吃吗？`
  }
  // 恢复上次对话（刷新 / 重新进入页面不丢记录）
  if (restoreChat() > 0) {
    // 恢复后滚到底部，直接看到最近一条
    scrollToBottom()
  }

  aiProbing.value = true
  try {
    aiService.value = await probeAIService()
  } catch (err: unknown) {
    aiService.value = { ok: false, error: `AI 服务探测失败：${err instanceof Error ? err.message : String(err)}` }
  } finally {
    aiProbing.value = false
  }
})

onBeforeUnmount(() => {
  // 组件卸载时中断进行中的流式请求，避免内存泄漏与无效回调
  if (controller) controller.abort()
  speechRecognizer?.abort()
  stopSpeech()
})
</script>

<template>
  <div class="chat-shell">
    <header class="chat-page-head">
      <div>
        <p class="chat-kicker">PERSONAL NUTRITION COPILOT</p>
        <h1>AI 营养对话助手</h1>
        <p>基于你的身体档案与实时饮食记录，持续理解并回答</p>
      </div>
      <div class="assistant-state">
        <span class="state-dot" :class="{ probing: aiProbing }"></span>
        <div>
          <small>当前会话</small><strong>{{ streaming ? '正在生成回答' : '助手已就绪' }}</strong>
        </div>
        <div>
          <small>识别关注</small><strong>{{ conversationFocus.label }}</strong>
        </div>
        <div>
          <small>消息</small><strong class="num">{{ messages.length }}</strong>
        </div>
      </div>
    </header>

    <div class="conversation-workspace">
      <!-- ================= 左栏：对话区 ================= -->
      <MacaronCard
        class="chat-panel"
        theme="cyan"
        title="膳知助手"
        emoji="🧑‍🍳"
        sub="会结合你的身体数据与今日饮食作答"
        flex
      >
        <template #extra>
          <span class="num text-[11px] tx-muted">{{ messages.length }} 条消息</span>
          <button v-if="messages.length" class="btn btn-ghost btn-xs" @click="clearChat">清空对话</button>
        </template>

        <!-- AI 服务状态条 -->
        <div
          v-if="serviceStatus"
          class="mb-3 rounded-[12px] px-3 py-2 text-[11.5px] font-semibold"
          :style="
            serviceStatus.tone === 'ok'
              ? { background: '#eef7f4', color: '#217a5c' }
              : serviceStatus.tone === 'warn'
                ? { background: '#f9f6ec', color: '#a07b1f' }
                : { background: '#f4f6fa', color: '#7b8798' }
          "
        >
          <span aria-hidden="true">{{ serviceStatus.emoji }}</span> {{ serviceStatus.text }}
        </div>

        <div v-if="recognitionContext" class="recognition-context" role="status">
          <span class="recognition-context-icon" aria-hidden="true">📷</span>
          <div>
            <strong>已带入图像识别结果</strong>
            <p>
              {{ recognitionContext.emoji }} {{ recognitionContext.foodName }} · {{ recognitionContext.grams }}g ·
              {{ Math.round(recognitionContext.nutrition.calories) }} kcal · 蛋白质
              {{ recognitionContext.nutrition.protein }}g · 糖 {{ recognitionContext.nutrition.sugar }}g
            </p>
          </div>
          <button type="button" aria-label="移除识别结果" title="移除识别结果" @click="dismissRecognitionContext">
            ×
          </button>
        </div>

        <!-- 消息区（固定高度，内部滚动，自动滚到底部） -->
        <div ref="listRef" class="chat-list">
          <!-- 空状态：欢迎语 + 推荐问题 -->
          <div v-if="isEmpty" class="py-6 text-center">
            <span class="anim-float inline-block text-[52px] leading-none" aria-hidden="true">💬</span>
            <p class="mt-3 text-[15px] font-bold tx-main">你好，我是膳知助手 🧑‍🍳</p>
            <p class="mx-auto mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed tx-sub">
              我读过你的健康档案和今天的饮食记录了。任何关于吃的问题都可以问我， 我会结合你的
              BMI、今日热量缺口给出具体建议，而不是泛泛而谈。
            </p>
            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <button v-for="s in dynamicQuestions" :key="s.text" class="chip" @click="send(s.text)">
                <span aria-hidden="true">{{ s.emoji }}</span
                >{{ s.text }}
              </button>
            </div>
          </div>

          <!-- 消息气泡 -->
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="chat-row"
            :class="msg.role === 'user' ? 'chat-row-user' : ''"
          >
            <!-- 助手头像 -->
            <span v-if="msg.role === 'assistant'" class="chat-avatar" aria-hidden="true">🧑‍🍳</span>

            <div class="chat-body">
              <!-- 气泡 -->
              <div class="chat-bubble" :class="msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'">
                <template v-if="msg.role === 'user'">{{ msg.content }}</template>
                <template v-else>
                  <!-- Plan-and-Execute：只展示行动计划与执行状态，不展示模型隐藏思维过程 -->
                  <details v-if="msg.plan" class="agent-plan" :open="msg.plan.status !== 'completed'">
                    <summary>
                      <span class="agent-plan-title">
                        <i aria-hidden="true">{{ msg.plan.status === 'completed' ? '✓' : '◎' }}</i>
                        Agent 执行计划
                      </span>
                      <span class="agent-plan-progress">
                        {{ completedPlanSteps(msg.plan) }}/{{ msg.plan.steps.length || '…' }}
                        <b v-if="msg.plan.revision > 1">已调整</b>
                      </span>
                    </summary>
                    <p class="agent-plan-goal">{{ msg.plan.summary }}</p>
                    <p v-if="msg.plan.adjustment" class="agent-plan-adjustment">↻ {{ msg.plan.adjustment }}</p>
                    <ol v-if="msg.plan.steps.length" class="agent-plan-steps">
                      <li v-for="step in msg.plan.steps" :key="step.id" :class="`is-${step.status}`">
                        <span class="agent-plan-state" aria-hidden="true">{{ planStatusIcon(step.status) }}</span>
                        <span>
                          <strong>{{ step.title }}</strong>
                          <small>{{ step.resultSummary || step.purpose }}</small>
                        </span>
                      </li>
                    </ol>
                    <p v-else class="agent-plan-waiting">正在拆解目标并选择数据工具…</p>
                  </details>
                  <!-- AI Agent 工具调用轨迹：模型查了哪些真实数据，全程可见 -->
                  <div v-if="msg.tools && msg.tools.length" class="chat-tools">
                    <span
                      v-for="t in msg.tools"
                      :key="t.callId"
                      class="chat-tool"
                      :class="t.running ? 'is-running' : t.pending ? 'is-pending' : t.ok ? 'is-ok' : 'is-fail'"
                    >
                      <span aria-hidden="true">{{ t.running ? '🛠️' : t.emoji }}</span>
                      <span>{{ t.running ? `正在${t.label}…` : t.label }}</span>
                      <span v-if="!t.running && t.summary" class="chat-tool-sum">· {{ t.summary }}</span>
                    </span>
                  </div>
                  <!-- 写入型工具的二次确认卡片：确认后才真正落库 -->
                  <template v-for="t in msg.tools || []" :key="`pending-${t.callId}`">
                    <div v-if="t.pending" class="chat-confirm">
                      <p class="chat-confirm-text">
                        📝 记录 {{ t.pending.mealType }} · {{ t.pending.emoji }} {{ t.pending.name }}
                        {{ t.pending.grams }}{{ t.pending.unit === '100ml' ? 'ml' : 'g' }}？
                      </p>
                      <div class="chat-confirm-btns">
                        <button class="btn btn-primary btn-xs" @click="confirmToolRecord(t)">✅ 确认记录</button>
                        <button class="btn btn-ghost btn-xs" @click="cancelToolRecord(t)">✖️ 取消</button>
                      </div>
                    </div>
                  </template>
                  <!-- 反事实营养干预：比较调整前后，用户确认后才修改真实记录 -->
                  <template v-for="t in msg.tools || []" :key="`interventions-${t.callId}`">
                    <section v-if="t.interventions" class="intervention-comparison">
                      <header>
                        <div>
                          <span>WHAT-IF SIMULATION</span>
                          <strong>如果这样调整，会发生什么？</strong>
                        </div>
                        <p>
                          当前 <b>{{ t.interventions.before.score }}</b> 分 ·
                          {{ Math.round(t.interventions.before.calories) }} kcal · 糖
                          {{ t.interventions.before.sugar }}g
                        </p>
                      </header>
                      <div class="intervention-options">
                        <article v-for="plan in t.interventions.plans" :key="plan.id" class="intervention-option">
                          <div class="intervention-option-head">
                            <div>
                              <strong>{{ plan.title }}</strong>
                              <span>执行难度 {{ plan.difficulty }}</span>
                            </div>
                            <b :class="plan.deltas.score > 0 ? 'is-positive' : ''">
                              {{ signed(plan.deltas.score, '分') }}
                            </b>
                          </div>
                          <p class="intervention-rationale">{{ plan.rationale }}</p>
                          <div class="intervention-metrics">
                            <div>
                              <span>健康评分</span><strong>{{ plan.before.score }} → {{ plan.after.score }}</strong>
                            </div>
                            <div>
                              <span>糖</span><strong>{{ plan.before.sugar }} → {{ plan.after.sugar }}g</strong>
                            </div>
                            <div>
                              <span>蛋白质</span><strong>{{ plan.before.protein }} → {{ plan.after.protein }}g</strong>
                            </div>
                            <div>
                              <span>热量</span><strong>{{ plan.before.calories }} → {{ plan.after.calories }}</strong>
                            </div>
                          </div>
                          <div class="intervention-actions-text">
                            <span v-for="action in plan.actions" :key="action.label">{{ action.label }}</span>
                          </div>
                          <div class="intervention-buttons">
                            <button
                              class="btn btn-primary btn-xs"
                              type="button"
                              :disabled="plan.applied || t.interventions.plans.some(item => item.applied)"
                              @click="applyIntervention(t, plan)"
                            >
                              {{ plan.applied ? '✓ 已采用' : '应用到今天' }}
                            </button>
                            <button class="btn btn-ghost btn-xs" type="button" @click="startMicroExperiment(t, plan)">
                              创建 7 天实验
                            </button>
                          </div>
                        </article>
                      </div>
                      <footer>结果由本地营养规则基于当前记录计算，并非医疗效果预测；采用前不会修改数据。</footer>
                    </section>
                  </template>
                  <div v-if="msg.content" class="chat-rich" v-html="renderText(msg.content)"></div>
                  <!-- 生成中：呼吸光标 -->
                  <span v-if="msg.streaming" class="chat-cursor"></span>
                  <!-- 尚未收到任何增量 -->
                  <p v-else-if="!msg.content && !(msg.tools && msg.tools.length)" class="text-[12.5px] tx-muted">
                    正在思考…
                  </p>
                </template>
              </div>

              <!-- 助手消息底部信息：来源徽标 + 降级提示 + 截断提示 -->
              <div v-if="msg.role === 'assistant' && !msg.streaming" class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  v-if="sourceLabel(msg)"
                  class="rounded-pill px-2 py-0.5 text-[10.5px] font-bold"
                  :style="
                    sourceLabel(msg)?.tone === 'ok'
                      ? { background: '#eef7f4', color: '#217a5c' }
                      : sourceLabel(msg)?.tone === 'warn'
                        ? { background: '#f9f6ec', color: '#a07b1f' }
                        : { background: '#eef2f9', color: '#3a5f8a' }
                  "
                >
                  <span aria-hidden="true">{{ sourceLabel(msg)?.emoji }}</span> {{ sourceLabel(msg)?.text }}
                </span>
                <span
                  v-if="msg.truncated"
                  class="rounded-pill px-2 py-0.5 text-[10.5px] font-bold"
                  style="background: #f9f6ec; color: #a07b1f"
                >
                  ✂️ 响应中断，已展示已接收内容
                </span>
                <button
                  v-if="speechSupport.synthesis && msg.content"
                  class="speech-action"
                  type="button"
                  :aria-label="speakingMessageId === msg.id && !speechPaused ? '暂停播报' : '播报回答'"
                  :title="speakingMessageId === msg.id && !speechPaused ? '暂停播报' : '播报回答'"
                  @click="toggleSpeech(msg)"
                >
                  {{ speakingMessageId === msg.id && !speechPaused ? '⏸' : '🔊' }}
                  {{ speakingMessageId === msg.id ? (speechPaused ? '继续' : '暂停') : '播报' }}
                </button>
                <button
                  v-if="speakingMessageId === msg.id"
                  class="speech-action"
                  type="button"
                  aria-label="停止播报"
                  title="停止播报"
                  @click="stopMessageSpeech"
                >
                  ⏹ 停止
                </button>
              </div>

              <!-- 降级提示（云端失败原因） -->
              <p
                v-if="msg.notice"
                class="mt-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px]"
                style="background: #f9f6ec; color: #a07b1f"
              >
                {{ msg.notice }}
              </p>

              <!-- 参考资料：本次回答召回的本地知识条目（可解释性的体现） -->
              <details v-if="msg.refs && msg.refs.length" class="chat-refs">
                <summary>📚 混合 RAG 参考资料（召回 {{ msg.refs.length }} 条）</summary>
                <ul class="mt-2 space-y-2">
                  <li v-for="r in msg.refs" :key="r.id" class="rag-reference">
                    <div class="rag-reference-head">
                      <strong
                        ><span aria-hidden="true">{{ r.emoji }}</span> {{ r.title }}</strong
                      >
                      <b>{{ r.retrieval?.confidence ?? Math.round(r.score) }}%</b>
                    </div>
                    <div class="rag-reference-meta">
                      <span>{{ r.kind }}</span>
                      <span v-if="r.retrieval?.channels.includes('bm25')">BM25</span>
                      <span v-if="r.retrieval?.channels.includes('semantic')">语义向量</span>
                      <span v-if="r.retrieval?.channels.includes('metadata')">元数据重排</span>
                    </div>
                    <p v-if="r.retrieval?.reason">{{ r.retrieval.reason }}</p>
                  </li>
                </ul>
              </details>
            </div>
          </div>
        </div>

        <div class="composer-zone">
          <div class="mode-switch" aria-label="对话模式">
            <button
              v-for="mode in CHAT_MODES"
              :key="mode.key"
              type="button"
              :class="{ active: activeMode === mode.key }"
              @click="activeMode = mode.key"
            >
              {{ mode.label }}
            </button>
          </div>
          <div class="composer-row">
            <button
              class="voice-input-button"
              type="button"
              :class="{ listening }"
              :disabled="streaming"
              :aria-pressed="listening"
              :aria-label="listening ? '停止语音输入' : '开始语音输入'"
              :title="
                speechSupport.recognition ? (listening ? '停止语音输入' : '语音输入') : '当前浏览器不支持语音输入'
              "
              @click="toggleVoiceInput"
            >
              {{ listening ? '⏹' : '🎙️' }}
            </button>
            <textarea
              v-model="input"
              class="field chat-input"
              rows="2"
              maxlength="500"
              :placeholder="`${inputPlaceholder}（Enter 发送，Shift+Enter 换行）`"
              @keydown="onKeydown"
            ></textarea>
            <button v-if="streaming" class="btn btn-danger-soft shrink-0" @click="stopGenerating">⏹ 停止</button>
            <button v-else class="btn btn-primary shrink-0" :disabled="!input.trim()" @click="send()">发送 ➤</button>
          </div>
          <p v-if="voiceStatus" class="voice-status" :class="{ active: listening }" aria-live="polite">
            {{ voiceStatus }}
          </p>
          <div class="composer-suggestions">
            <span>建议追问</span>
            <button type="button" @click="send('请基于我今天的真实饮食，模拟并比较几种最小调整方案')">
              🧪 模拟今日优化
            </button>
            <button
              v-for="s in dynamicQuestions.slice(0, 3)"
              :key="`composer-${s.text}`"
              type="button"
              @click="send(s.text)"
            >
              {{ s.emoji }} {{ s.text }}
            </button>
          </div>
        </div>
        <p class="chat-disclaimer">
          助手会结合你的健康档案与今日饮食作答；涉及疾病、用药等医疗问题，请以专业医师意见为准。
        </p>
      </MacaronCard>

      <!-- ================= 右栏：个性化上下文与快捷提问 ================= -->
      <aside class="context-rail">
        <!-- 模型「看到的你」——个性化问答的核心卖点 -->
        <MacaronCard
          class="context-panel"
          theme="purple"
          title="模型当前关注"
          emoji="🎯"
          sub="指标会随你的问题自动调整顺序"
        >
          <div class="focus-banner">
            <span>本轮焦点</span><strong>{{ conversationFocus.label }}</strong
            ><i>实时联动</i>
          </div>
          <div class="context-facts">
            <div
              v-for="(tile, index) in activeFactTiles"
              :key="tile.label"
              class="ctx-tile"
              :class="{ primary: index === 0 }"
            >
              <p class="flex items-center gap-1 text-[11px] font-semibold tx-sub">
                <span aria-hidden="true">{{ tile.emoji }}</span
                >{{ tile.label }}
              </p>
              <p class="mt-0.5 text-[16px] font-extrabold tx-main">
                {{ tile.value
                }}<span v-if="tile.unit" class="ml-0.5 text-[11px] font-bold tx-muted">{{ tile.unit }}</span>
              </p>
              <p v-if="tile.note" class="text-[10.5px] tx-muted">{{ tile.note }}</p>
            </div>
          </div>
          <p class="context-note">数据来自身体测评与三餐记录，修改后下一轮对话即刻生效。</p>
        </MacaronCard>

        <!-- 推荐问题（对话开始后仍可随时点击） -->
        <MacaronCard class="prompt-panel" theme="yellow" title="继续探索" emoji="✨" sub="根据当前关注动态推荐">
          <div class="prompt-list">
            <button v-for="(s, index) in dynamicQuestions" :key="s.text" @click="send(s.text)">
              <span class="num">0{{ index + 1 }}</span
              ><strong>{{ s.emoji }} {{ s.text }}</strong
              ><i>→</i>
            </button>
          </div>
        </MacaronCard>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ---------- 消息列表 ---------- */
.chat-list {
  /* 用 min() 兼顾桌面固定高度与手机视口高度，避免小屏上输入区被挤出屏幕 */
  height: min(460px, 62vh);
  overflow-y: auto;
  padding: 4px 2px;
  scroll-behavior: smooth;
}
.chat-list::-webkit-scrollbar {
  width: 6px;
}
.chat-list::-webkit-scrollbar-thumb {
  background: #e0e7f0;
  border-radius: 999px;
}

/* ---------- 消息行 ---------- */
.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 14px;
}
.chat-row-user {
  flex-direction: row-reverse;
}
.chat-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 999px;
  font-size: 17px;
  background: #e8f6f4;
  color: var(--brand);
}
.chat-body {
  max-width: 84%;
  min-width: 0;
}

/* ---------- 气泡 ---------- */
.chat-bubble {
  padding: 10px 13px;
  font-size: 13px;
  line-height: 1.75;
  border-radius: 14px;
  word-break: break-word;
  white-space: pre-wrap;
}
.chat-bubble-user {
  background: var(--brand);
  color: #fff;
  border-bottom-right-radius: 6px;
  box-shadow: 0 2px 8px rgba(15, 143, 132, 0.2);
}
.chat-bubble-ai {
  background: #fff;
  color: var(--tx-main);
  border: 1px solid var(--line);
  border-bottom-left-radius: 6px;
}
.chat-rich :deep(.chat-line) {
  margin: 0;
}
.chat-rich :deep(.chat-gap) {
  height: 7px;
}
.chat-rich :deep(.chat-item) {
  padding-left: 2px;
}
.chat-rich :deep(strong) {
  color: #5b46a8;
}

/* ---------- AI Agent 工具调用轨迹 ---------- */
.agent-plan {
  margin: 0 0 14px;
  border: 1px solid #dce8e5;
  border-left: 3px solid var(--brand);
  background: #f8fbfa;
}
.agent-plan summary {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 11px;
  color: var(--ink);
  cursor: pointer;
  list-style: none;
}
.agent-plan summary::-webkit-details-marker {
  display: none;
}
.agent-plan-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 800;
}
.agent-plan-title i {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 11px;
  font-style: normal;
}
.agent-plan-progress {
  color: var(--tx-muted);
  font-size: 10px;
  font-weight: 700;
}
.agent-plan-progress b {
  margin-left: 6px;
  padding: 2px 5px;
  background: #f9f2dc;
  color: #956d13;
  font-size: 9px;
}
.agent-plan-goal,
.agent-plan-adjustment,
.agent-plan-waiting {
  margin: 0 11px 9px;
  color: var(--tx-sub);
  font-size: 10.5px;
  line-height: 1.55;
}
.agent-plan-adjustment {
  padding: 6px 8px;
  background: #f9f2dc;
  color: #85600f;
}
.agent-plan-steps {
  margin: 0;
  padding: 0 11px 10px;
  list-style: none;
}
.agent-plan-steps li {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 7px;
  padding: 6px 0;
  border-top: 1px solid #e4eeeb;
}
.agent-plan-state {
  color: var(--tx-muted);
  font-size: 12px;
  font-weight: 900;
}
.agent-plan-steps strong,
.agent-plan-steps small {
  display: block;
}
.agent-plan-steps strong {
  color: var(--tx-main);
  font-size: 11px;
}
.agent-plan-steps small {
  margin-top: 2px;
  color: var(--tx-muted);
  font-size: 9.5px;
  line-height: 1.45;
}
.agent-plan-steps .is-running .agent-plan-state {
  color: #a07b1f;
  animation: cursorBlink 1s ease-in-out infinite;
}
.agent-plan-steps .is-completed .agent-plan-state {
  color: #217a5c;
}
.agent-plan-steps .is-failed .agent-plan-state {
  color: #cf3f43;
}
.chat-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 7px;
}
.chat-tool {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.7;
  background: #eef2f9;
  color: #3a5f8a;
  box-shadow: inset 0 0 0 1px #dbe4f0;
}
.chat-tool.is-running {
  background: #f9f6ec;
  color: #a07b1f;
  box-shadow: inset 0 0 0 1px #ecd9a8;
}
.chat-tool.is-pending {
  background: #f9f6ec;
  color: #a07b1f;
  box-shadow: inset 0 0 0 1px #ecd9a8;
}
.chat-tool.is-ok {
  background: #eef7f4;
  color: #217a5c;
  box-shadow: inset 0 0 0 1px #cfe9e2;
}
.chat-tool.is-fail {
  background: #fcede9;
  color: #cf3f43;
  box-shadow: inset 0 0 0 1px #f5d2cf;
}
.chat-tool-sum {
  max-width: 220px;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.85;
}

/* 写入型工具的二次确认卡片 */
.chat-confirm {
  margin: 2px 0 8px;
  padding: 9px 11px;
  border-radius: 12px;
  background: #fbf7ec;
  box-shadow: inset 0 0 0 1px #ecd9a8;
}
.chat-confirm-text {
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.6;
  color: var(--tx-main);
}
.chat-confirm-btns {
  display: flex;
  gap: 8px;
  margin-top: 7px;
}

/* 营养干预模拟：同一基线下的反事实方案横向比较 */
.intervention-comparison {
  margin: 5px 0 14px;
  border-block: 1px solid var(--line);
  background: #fbfcfc;
}
.intervention-comparison > header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 2px 13px;
}
.intervention-comparison > header div {
  display: grid;
  gap: 5px;
}
.intervention-comparison > header span {
  color: var(--brand);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
}
.intervention-comparison > header strong {
  color: var(--ink);
  font-size: 16px;
  line-height: 1.4;
}
.intervention-comparison > header p {
  color: var(--tx-muted);
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
}
.intervention-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  border-top: 1px solid var(--line);
}
.intervention-option {
  min-width: 0;
  padding: 16px 14px;
  border-bottom: 1px solid var(--line);
}
.intervention-option:last-child {
  border-bottom: 0;
}
.intervention-option-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.intervention-option-head > div {
  display: grid;
  gap: 5px;
}
.intervention-option-head strong {
  color: var(--ink);
  font-size: 14px;
  line-height: 1.4;
}
.intervention-option-head span {
  color: var(--tx-muted);
  font-size: 12px;
}
.intervention-option-head > b {
  flex: 0 0 auto;
  color: var(--tx-muted);
  font-size: 14px;
}
.intervention-option-head > b.is-positive {
  color: #217a5c;
}
.intervention-rationale {
  margin-top: 10px;
  color: var(--tx-sub);
  font-size: 12.5px;
  line-height: 1.7;
}
.intervention-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin-top: 12px;
  background: var(--line);
}
.intervention-metrics div {
  min-width: 0;
  display: grid;
  gap: 4px;
  padding: 10px 8px;
  background: #fff;
}
.intervention-metrics span {
  color: var(--tx-muted);
  font-size: 11.5px;
  line-height: 1.4;
}
.intervention-metrics strong {
  color: var(--tx-main);
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.intervention-actions-text {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
  margin: 12px 0;
}
.intervention-actions-text span {
  padding: 5px 8px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.4;
}
.intervention-option .btn {
  width: auto;
  min-height: 36px;
  padding-inline: 14px;
  font-size: 12.5px;
}
.intervention-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.intervention-comparison > footer {
  padding: 11px 2px;
  border-top: 1px solid var(--line);
  color: var(--tx-muted);
  font-size: 11px;
  line-height: 1.6;
}

/* 生成中的呼吸光标 */
.chat-cursor {
  display: inline-block;
  width: 7px;
  height: 14px;
  margin-left: 2px;
  vertical-align: -2px;
  border-radius: 2px;
  background: var(--brand);
  animation: cursorBlink 1s steps(2, start) infinite;
}
@keyframes cursorBlink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.15;
  }
}

/* ---------- 参考资料折叠区 ---------- */
.chat-refs {
  margin-top: 7px;
  font-size: 11.5px;
}
.chat-refs summary {
  cursor: pointer;
  color: var(--brand);
  font-weight: 600;
  list-style: none;
}
.chat-refs summary::-webkit-details-marker {
  display: none;
}
.chat-refs ul {
  padding-left: 4px;
}
.rag-reference {
  padding: 9px 10px;
  border-left: 2px solid var(--brand);
  background: #f7faf9;
}
.rag-reference-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.rag-reference-head strong {
  color: var(--tx-main);
  font-size: 12px;
  line-height: 1.5;
}
.rag-reference-head b {
  flex: 0 0 auto;
  color: var(--brand);
  font-size: 11px;
}
.rag-reference-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
}
.rag-reference-meta span {
  padding: 2px 5px;
  background: #e8f2f0;
  color: #416963;
  font-size: 10px;
  font-weight: 700;
}
.rag-reference p {
  margin-top: 5px;
  color: var(--tx-muted);
  font-size: 11px;
  line-height: 1.55;
}

.recognition-context {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  padding: 10px 12px;
  border-left: 3px solid var(--brand);
  background: var(--brand-soft);
}
.recognition-context-icon {
  font-size: 20px;
}
.recognition-context strong {
  color: var(--ink);
  font-size: 12px;
}
.recognition-context p {
  margin-top: 2px;
  color: var(--tx-sub);
  font-size: 10.5px;
  line-height: 1.5;
}
.recognition-context button {
  width: 30px;
  height: 30px;
  border: 0;
  background: transparent;
  color: var(--tx-muted);
  font-size: 20px;
}

/* ---------- 输入区 ---------- */
.chat-input {
  resize: none;
  line-height: 1.6;
}

/* ---------- 上下文指标格 ---------- */
.ctx-tile {
  padding: 9px 11px;
  border-radius: 14px;
  background: #f6f9f8;
  box-shadow: inset 0 0 0 1px #e0efec;
}

/* ---------- 沉浸式桌面对话工作台 ---------- */
.chat-shell {
  width: min(1380px, 100%);
  margin: 0 auto;
  padding: 4px 0 36px;
}
.chat-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  padding: 16px 0 22px;
  border-bottom: 1px solid var(--line);
}
.chat-kicker {
  margin-bottom: 6px;
  color: var(--brand);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1.2px;
}
.chat-page-head h1 {
  color: var(--ink);
  font-size: 28px;
  line-height: 1.2;
}
.chat-page-head > div > p:last-child {
  margin-top: 7px;
  color: var(--tx-muted);
  font-size: 12px;
}
.assistant-state {
  display: flex;
  align-items: center;
  gap: 20px;
}
.assistant-state > div {
  display: grid;
  min-width: 84px;
  gap: 3px;
  padding-left: 20px;
  border-left: 1px solid var(--line);
}
.assistant-state small {
  color: var(--tx-muted);
  font-size: 10px;
}
.assistant-state strong {
  color: var(--ink);
  font-size: 12px;
}
.state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 5px var(--brand-soft);
}
.state-dot.probing {
  animation: cursorBlink 1s ease-in-out infinite;
}
.conversation-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 350px;
  min-height: 690px;
  border-bottom: 1px solid var(--line);
}
.conversation-workspace :deep(.macaron-card) {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}
.conversation-workspace :deep(.macaron-card:hover) {
  box-shadow: none;
  transform: none;
}
.chat-panel {
  min-width: 0;
  padding: 24px 28px 18px 0 !important;
  border-right: 1px solid var(--line) !important;
}
.chat-panel :deep(.card-head),
.context-panel :deep(.card-head),
.prompt-panel :deep(.card-head) {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}
.chat-panel :deep(.card-title),
.context-panel :deep(.card-title),
.prompt-panel :deep(.card-title) {
  font-size: 15px;
}
.chat-panel :deep(.card-sub),
.context-panel :deep(.card-sub),
.prompt-panel :deep(.card-sub) {
  margin-top: 4px;
  font-size: 12.5px;
  line-height: 1.55;
}
.chat-list {
  height: clamp(400px, calc(100vh - 430px), 555px);
  padding: 22px 8px 10px 0;
}
.chat-row {
  gap: 11px;
  margin-bottom: 22px;
}
.chat-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 19px;
}
.chat-body {
  max-width: 90%;
}
.chat-bubble {
  padding: 12px 15px;
  font-size: 14px;
  line-height: 1.8;
}
.chat-bubble-ai {
  padding: 4px 0 2px;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.chat-bubble-user {
  max-width: 720px;
  border-radius: 7px 7px 2px 7px;
  box-shadow: 0 4px 12px rgba(15, 143, 132, 0.16);
}
.chat-tools {
  position: relative;
  gap: 0;
  margin-bottom: 14px;
  padding-left: 14px;
  border-left: 2px solid var(--brand-soft);
}
.chat-tool {
  margin: 3px 7px 3px 0;
  border-radius: 4px;
  font-size: 11px;
  box-shadow: none !important;
}
.chat-refs {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--line);
  font-size: 12px;
}
.composer-zone {
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.mode-switch {
  display: flex;
  gap: 22px;
  margin-bottom: 11px;
}
.mode-switch button {
  padding: 0 0 7px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--tx-muted);
  font-size: 12.5px;
}
.mode-switch button.active {
  border-bottom-color: var(--brand);
  color: var(--brand);
  font-weight: 800;
}
.composer-row {
  display: flex;
  align-items: flex-end;
  gap: 9px;
}
.chat-input {
  min-width: 0;
  flex: 1;
  min-height: 68px;
  border-radius: 6px;
  font-size: 13px;
}
.voice-input-button {
  width: 42px;
  height: 42px;
  display: grid;
  flex: 0 0 42px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  font-size: 18px;
  transition: 0.18s ease;
}
.voice-input-button:hover:not(:disabled) {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.voice-input-button.listening {
  border-color: #d45b64;
  background: #fff0f1;
  color: #b73d49;
  box-shadow: 0 0 0 3px rgba(212, 91, 100, 0.12);
}
.voice-input-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.voice-status {
  margin-top: 6px;
  color: var(--tx-muted);
  font-size: 10.5px;
  line-height: 1.45;
}
.voice-status.active {
  color: #b73d49;
  font-weight: 700;
}
.speech-action {
  min-height: 24px;
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: #fff;
  color: var(--tx-sub);
  font-size: 10.5px;
  font-weight: 700;
}
.speech-action:hover {
  border-color: var(--brand);
  color: var(--brand);
}
.composer-suggestions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 42px;
  padding: 5px 0;
}
.composer-suggestions > span {
  flex: 0 0 auto;
  color: var(--tx-muted);
  font-size: 12px;
}
.composer-suggestions button {
  min-width: 0;
  flex: 0 1 auto;
  padding: 7px 10px;
  border: 0;
  border-left: 1px solid var(--line);
  background: transparent;
  color: var(--tx-sub);
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}
.composer-suggestions button:hover {
  color: var(--brand);
}
.chat-disclaimer {
  color: var(--tx-muted);
  font-size: 12px;
  line-height: 1.7;
}
.context-rail {
  min-width: 0;
  padding: 24px 0 18px 26px;
}
.context-panel,
.prompt-panel {
  padding: 0 !important;
}
.prompt-panel {
  margin-top: 26px !important;
  padding-top: 24px !important;
  border-top: 1px solid var(--line) !important;
}
.focus-banner {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 15px 0;
  border-bottom: 1px solid var(--line);
}
.focus-banner span {
  color: var(--tx-muted);
  font-size: 11.5px;
}
.focus-banner strong {
  grid-row: 2;
  color: var(--brand);
  font-size: 16px;
}
.focus-banner i {
  grid-row: 1 / 3;
  align-self: center;
  padding: 4px 7px;
  border-radius: 4px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 10.5px;
  font-style: normal;
  font-weight: 800;
}
.context-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.ctx-tile {
  min-height: 86px;
  padding: 15px 12px;
  border-radius: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  box-shadow: none;
}
.ctx-tile:nth-child(even) {
  border-left: 1px solid var(--line);
}
.ctx-tile.primary {
  grid-column: 1 / -1;
  min-height: 96px;
  padding-left: 14px;
  border-left: 3px solid var(--brand);
  background: var(--brand-soft);
}
.ctx-tile.primary p:nth-child(2) {
  font-size: 24px;
}
.context-note {
  margin-top: 12px;
  color: var(--tx-muted);
  font-size: 12px;
  line-height: 1.7;
}
.prompt-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 24px 1fr 14px;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--tx-sub);
  text-align: left;
}
.prompt-list button > span {
  color: var(--tx-muted);
  font-size: 10.5px;
}
.prompt-list button strong {
  font-size: 12px;
  line-height: 1.55;
}
.prompt-list button i {
  color: var(--brand);
  font-style: normal;
  opacity: 0;
  transform: translateX(-5px);
  transition: 0.18s ease;
}
.prompt-list button:hover {
  color: var(--brand);
}
.prompt-list button:hover i {
  opacity: 1;
  transform: translateX(0);
}
/* 平板（768–1023px）：侧边栏收起为抽屉后，把右栏收进正文下方，
   避免 350px 固定栏挤压对话气泡 */
@media (max-width: 1023px) {
  .conversation-workspace {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .chat-panel {
    padding-right: 0 !important;
    border-right: 0 !important;
  }
  .context-rail {
    padding: 20px 0 0;
    border-top: 1px solid var(--line);
  }
  .chat-list {
    height: clamp(360px, calc(100vh - 460px), 520px);
  }
}

@media (max-width: 760px) {
  .chat-page-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
  }
  .assistant-state {
    width: 100%;
    gap: 10px;
    overflow-x: auto;
  }
  .assistant-state > div {
    min-width: 0;
    flex: 1 0 92px;
    padding-left: 10px;
  }
  .composer-row {
    flex-wrap: wrap;
  }
  .chat-input {
    flex-basis: calc(100% - 51px);
  }
  .composer-row > .btn {
    width: 100%;
  }
  .intervention-comparison > header {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }
  .intervention-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .intervention-option .btn {
    width: 100%;
  }
}
</style>

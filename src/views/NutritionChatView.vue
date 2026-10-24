<script setup>
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
 *      食物营养数据）按关键词召回 Top-4，作为「参考资料」注入提示词并展示给用户核对，
 *      既减少模型胡编，也延续了识别页「可解释 AI」的思路；
 *   ③ 流式输出（SSE）：边生成边渲染打字机效果，并支持「停止生成」；
 *   ④ AI Agent 工具调用：模型可自主决定调用工具（读取今日/历史饮食、健康档案、
 *      915 条食物营养库、膳食推荐），拿到真实数据后再作答，调用轨迹实时可见。
 *
 * 如实说明（见页面底部卡片）：模型能力来自调用云端大模型，本项目不含模型训练流程，
 * 因此不宣称任何训练准确率；本地知识库仅作事实依据与兜底，不做医学诊断。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useUserStore } from '@/store/user'
import { useDietStore } from '@/store/diet'
import PageHeader from '@/components/common/PageHeader.vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import {
  askNutritionAI,
  buildContextText,
  retrieveKnowledge,
  knowledgeSize,
  CHAT_SOURCE_LABELS,
  SUGGESTED_QUESTIONS
} from '@/utils/aiChat'
import { probeAIService } from '@/utils/aiRecognition'
import { confirmAddDietRecord } from '@/utils/aiTools'
import { readJSON, writeJSON, removeKey, STORAGE_KEYS } from '@/utils/storage'

const userStore = useUserStore()
const dietStore = useDietStore()

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
const ctxFacts = computed(() => buildContextText(context.value).facts)

/** 今日剩余可摄入热量（可为负，表示已超） */
const remainingCalories = computed(() => Math.round((ctxFacts.value.todayTarget || 0) - (ctxFacts.value.todayCalories || 0)))

/** 右侧个性化面板的指标格子 */
const factTiles = computed(() => {
  const f = ctxFacts.value
  const list = []
  if (f.bmi !== undefined) list.push({ emoji: '⚖️', label: 'BMI', value: f.bmi, unit: '', note: f.bmiLabel || '' })
  if (f.bmr) list.push({ emoji: '🔥', label: '基础代谢', value: f.bmr, unit: 'kcal', note: 'BMR' })
  if (f.tdee) list.push({ emoji: '🏃', label: '每日消耗', value: f.tdee, unit: 'kcal', note: 'TDEE' })
  if (f.todayTarget) list.push({ emoji: '🎯', label: '推荐摄入', value: f.todayTarget, unit: 'kcal', note: f.goal || '' })
  list.push({ emoji: '🍽️', label: '今日已摄入', value: f.todayCalories || 0, unit: 'kcal', note: '' })
  list.push({
    emoji: remainingCalories.value >= 0 ? '✅' : '⚠️',
    label: remainingCalories.value >= 0 ? '今日还可摄入' : '今日已超出',
    value: Math.abs(remainingCalories.value),
    unit: 'kcal',
    note: ''
  })
  if (f.score !== undefined) list.push({ emoji: '📋', label: '饮食评分', value: f.score, unit: '分', note: '' })
  if (f.water) list.push({ emoji: '💧', label: '今日饮水', value: Math.round(f.water), unit: 'ml', note: '' })
  return list
})

/* ============================ AI 服务状态 ============================ */
const aiService = ref(null)
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
const messages = ref([])
const input = ref('')
const streaming = ref(false)
const listRef = ref(null)

/** 最近一次提问（供右侧「知识库命中」预览使用） */
const lastQuestion = ref('')

/** 进行中的请求控制器（用于「停止生成」与组件卸载时中断） */
let controller = null
let msgSeed = 0

/** 对话是否为空（用于展示欢迎页与推荐问题） */
const isEmpty = computed(() => messages.value.length === 0)

/* ============================ 对话持久化 ============================ */
/** 最多持久化的消息条数（超出只留最近，避免 localStorage 无限增长） */
const CHAT_PERSIST_MAX = 50

/**
 * 从消息对象中提取「可持久化的纯数据」
 * 去掉 streaming / error 等瞬时状态，refs 与 tools 保留（刷新后仍可核对依据）
 */
function serializeMessages(list) {
  return list
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-CHAT_PERSIST_MAX)
    .map((m) => ({
      role: m.role,
      content: m.content,
      source: m.source || '',
      refs: Array.isArray(m.refs) ? m.refs : [],
      // 只保留白名单字段：丢弃 pending，避免刷新后出现无法操作的确认卡片（确认动作依赖运行时 store）
      tools: Array.isArray(m.tools)
        ? m.tools.map((t) => ({
            callId: t.callId,
            name: t.name,
            emoji: t.emoji,
            label: t.label,
            ok: t.pending ? false : t.ok,
            summary: t.pending ? '未确认（刷新后已失效）' : t.summary
          }))
        : [],
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
  const stored = readJSON(STORAGE_KEYS.chat, null)
  const list = Array.isArray(stored?.messages) ? stored.messages : []
  list.forEach((m) => {
    messages.value.push(
      reactive({
        id: ++msgSeed,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content || ''),
        source: m.source || '',
        refs: Array.isArray(m.refs) ? m.refs : [],
        tools: Array.isArray(m.tools) ? m.tools : [],
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
async function send(text) {
  const q = String(text ?? input.value).trim()
  if (!q || streaming.value) return

  input.value = ''
  lastQuestion.value = q
  // 历史对话（不含本次提问），传给编排层拼进 messages
  const history = messages.value.map((m) => ({ role: m.role, content: m.content }))

  messages.value.push(reactive({ id: ++msgSeed, role: 'user', content: q }))

  const ai = reactive({
    id: ++msgSeed,
    role: 'assistant',
    content: '',
    source: '',
    refs: [],
    // AI Agent：本次回答调用过的工具（实时显示调用轨迹）
    tools: [],
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
      question: q,
      history,
      context: context.value,
      // Agent 工具的数据源：饮食记录与健康档案都在前端 store 中
      stores: { dietStore, userStore },
      signal: controller.signal,
      // 每个增量都追加到消息上，形成打字机效果
      onDelta: (delta) => {
        ai.content += delta
        scrollToBottom()
      },
      // 工具调用轨迹：开始 → 🛠️ 正在…，结束 → ✅ 结果摘要；写入型工具 → 待确认卡片
      onTool: (step) => {
        if (step.phase === 'start') {
          ai.tools.push({
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
          const target = ai.tools.find((t) => t.callId === step.callId)
          if (target) Object.assign(target, { running: false, ok: null, summary: '待确认', pending: step.pending })
        } else {
          const target = ai.tools.find((t) => t.callId === step.callId)
          if (target) Object.assign(target, { running: false, ok: step.ok, summary: step.summary })
        }
        scrollToBottom()
      }
    })
    ai.source = res.source
    ai.refs = res.refs || []
    ai.notice = res.notice || ''
    ai.truncated = Boolean(res.truncated)
    if (!ai.content) ai.content = res.text || '（本次未获得回复，请重试）'
    if (!res.ok) ai.error = res.error
  } catch (err) {
    // 编排层已做兜底，这里只防止极端情况下卡在「生成中」
    if (!ai.content) ai.content = `对话过程出现异常：${err?.message || err}，请重试 🙏`
    ai.error = { message: String(err?.message || err) }
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
function confirmToolRecord(tool) {
  if (!tool?.pending) return
  const res = confirmAddDietRecord(tool.pending, dietStore)
  Object.assign(tool, {
    ok: res.ok,
    summary: res.ok ? '已记录到今日饮食' : res.summary,
    pending: null
  })
}

/** 用户点击「取消」：丢弃待确认记录，不落库 */
function cancelToolRecord(tool) {
  if (!tool?.pending) return
  Object.assign(tool, { ok: false, summary: '已取消', pending: null })
}

/** 清空对话（重新开始），同时清除持久化缓存 */
function clearChat() {
  stopGenerating()
  messages.value = []
  removeKey(STORAGE_KEYS.chat)
}

/** 回车发送（Shift+Enter 换行） */
function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

/** 消息来源徽标 */
function sourceLabel(msg) {
  return CHAT_SOURCE_LABELS[msg.source] || null
}

/* ============================ 文本渲染 ============================ */
/**
 * 极简安全的富文本渲染
 * 注意：内容来自模型，必须先转义 HTML 再套用格式，避免 XSS 注入
 * 支持：**加粗**、换行、以 · / - / 数字 开头的列表行
 */
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function renderText(text) {
  return escapeHtml(text)
    .split('\n')
    .map((line) => {
      const t = line.trim()
      if (!t) return '<p class="chat-gap"></p>'
      const html = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // 列表行加缩进与项目符号强调
      if (/^([·•\-*]|\d+[.、)])\s*/.test(t)) return `<p class="chat-line chat-item">${html}</p>`
      return `<p class="chat-line">${html}</p>`
    })
    .join('')
}

/** 该问题在本地知识库中的召回情况（用于右侧「知识库命中预览」）
 *  注意：只依赖「最近一次提问」而非整个消息列表，避免流式输出期间反复重算检索 */
const knowledgePreview = computed(() => (lastQuestion.value ? retrieveKnowledge(lastQuestion.value, 3) : []))

/** 本地知识库规模（挂载后延迟计算，避免拖慢首屏） */
const kbSize = ref({ foods: 0, docs: 0 })

/* ============================ 生命周期 ============================ */
onMounted(async () => {
  // 先算知识库规模（构建索引有一定开销，延后到挂载后执行）
  kbSize.value = knowledgeSize()

  // 恢复上次对话（刷新 / 重新进入页面不丢记录）
  if (restoreChat() > 0) {
    // 恢复后滚到底部，直接看到最近一条
    scrollToBottom()
  }

  aiProbing.value = true
  try {
    aiService.value = await probeAIService()
  } catch (err) {
    aiService.value = { ok: false, error: `AI 服务探测失败：${err?.message || err}` }
  } finally {
    aiProbing.value = false
  }
})

onBeforeUnmount(() => {
  // 组件卸载时中断进行中的流式请求，避免内存泄漏与无效回调
  if (controller) controller.abort()
})
</script>

<template>
  <div class="stagger">
    <!-- ① 页面标题栏 -->
    <PageHeader>
      <template #extra>
        <span class="tag tag-cyan">💬 AI 核心功能</span>
      </template>
    </PageHeader>

    <!-- ② 主体：左对话区 / 右个性化面板（窄屏单列堆叠，宽屏两列） -->
    <div class="mb-5 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
      <!-- ================= 左栏：对话区 ================= -->
      <MacaronCard theme="cyan" title="膳知助手" emoji="🧑‍🍳" sub="会结合你的身体数据与今日饮食作答" flex>
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
              ? { background: '#e6f7ef', color: '#2f9e6b' }
              : serviceStatus.tone === 'warn'
                ? { background: '#fff9e6', color: '#b8801a' }
                : { background: '#f4f6fa', color: '#7b8798' }
          "
        >
          <span aria-hidden="true">{{ serviceStatus.emoji }}</span> {{ serviceStatus.text }}
        </div>

        <!-- 消息区（固定高度，内部滚动，自动滚到底部） -->
        <div ref="listRef" class="chat-list">
          <!-- 空状态：欢迎语 + 推荐问题 -->
          <div v-if="isEmpty" class="py-6 text-center">
            <span class="anim-float inline-block text-[52px] leading-none" aria-hidden="true">💬</span>
            <p class="mt-3 text-[15px] font-bold tx-main">你好，我是膳知助手 🧑‍🍳</p>
            <p class="mx-auto mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed tx-sub">
              我读过你的健康档案和今天的饮食记录了。任何关于吃的问题都可以问我，
              我会结合你的 BMI、今日热量缺口给出具体建议，而不是泛泛而谈。
            </p>
            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <button v-for="s in SUGGESTED_QUESTIONS" :key="s.text" class="chip" @click="send(s.text)">
                <span aria-hidden="true">{{ s.emoji }}</span>{{ s.text }}
              </button>
            </div>
          </div>

          <!-- 消息气泡 -->
          <div v-for="msg in messages" :key="msg.id" class="chat-row" :class="msg.role === 'user' ? 'chat-row-user' : ''">
            <!-- 助手头像 -->
            <span v-if="msg.role === 'assistant'" class="chat-avatar" aria-hidden="true">🧑‍🍳</span>

            <div class="chat-body">
              <!-- 气泡 -->
              <div class="chat-bubble" :class="msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'">
                <template v-if="msg.role === 'user'">{{ msg.content }}</template>
                <template v-else>
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
                  <div v-if="msg.content" class="chat-rich" v-html="renderText(msg.content)"></div>
                  <!-- 生成中：呼吸光标 -->
                  <span v-if="msg.streaming" class="chat-cursor"></span>
                  <!-- 尚未收到任何增量 -->
                  <p v-else-if="!msg.content && !(msg.tools && msg.tools.length)" class="text-[12.5px] tx-muted">正在思考…</p>
                </template>
              </div>

              <!-- 助手消息底部信息：来源徽标 + 降级提示 + 截断提示 -->
              <div v-if="msg.role === 'assistant' && !msg.streaming" class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  v-if="sourceLabel(msg)"
                  class="rounded-pill px-2 py-0.5 text-[10.5px] font-bold"
                  :style="
                    sourceLabel(msg).tone === 'ok'
                      ? { background: '#e6f7ef', color: '#2f9e6b' }
                      : sourceLabel(msg).tone === 'warn'
                        ? { background: '#fff9e6', color: '#b8801a' }
                        : { background: '#f3efff', color: '#7a5fd0' }
                  "
                >
                  <span aria-hidden="true">{{ sourceLabel(msg).emoji }}</span> {{ sourceLabel(msg).text }}
                </span>
                <span v-if="msg.truncated" class="rounded-pill px-2 py-0.5 text-[10.5px] font-bold" style="background: #fff9e6; color: #b8801a">
                  ✂️ 响应中断，已展示已接收内容
                </span>
              </div>

              <!-- 降级提示（云端失败原因） -->
              <p v-if="msg.notice" class="mt-1.5 rounded-[10px] px-2.5 py-1.5 text-[11px]" style="background: #fff9e6; color: #b8801a">
                {{ msg.notice }}
              </p>

              <!-- 参考资料：本次回答召回的本地知识条目（可解释性的体现） -->
              <details v-if="msg.refs && msg.refs.length" class="chat-refs">
                <summary>📚 参考资料（本地知识库召回 {{ msg.refs.length }} 条）</summary>
                <ul class="mt-1.5 space-y-1">
                  <li v-for="r in msg.refs" :key="r.id" class="text-[11.5px] leading-relaxed tx-sub">
                    <span aria-hidden="true">{{ r.emoji }}</span> {{ r.title }}
                    <span class="tx-muted">（{{ r.kind }}）</span>
                  </li>
                </ul>
              </details>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <!-- 输入区 -->
        <div class="flex items-end gap-2">
          <textarea
            v-model="input"
            class="field chat-input"
            rows="2"
            maxlength="500"
            placeholder="问我任何营养问题，例如：减脂期晚餐怎么吃？（Enter 发送，Shift+Enter 换行）"
            @keydown="onKeydown"
          ></textarea>
          <button v-if="streaming" class="btn btn-danger-soft shrink-0" @click="stopGenerating">⏹ 停止</button>
          <button v-else class="btn btn-primary shrink-0" :disabled="!input.trim()" @click="send()">发送 ➤</button>
        </div>
        <p class="mt-1.5 text-[11px] tx-muted">
          助手会结合你的健康档案与今日饮食作答；涉及疾病、用药等医疗问题，请以专业医师意见为准。
        </p>
      </MacaronCard>

      <!-- ================= 右栏：个性化上下文与说明 ================= -->
      <div class="space-y-5">
        <!-- 模型「看到的你」——个性化问答的核心卖点 -->
        <MacaronCard theme="purple" title="模型看到的你" emoji="🎯" sub="以下数据会实时注入提示词，让回答更贴合你">
          <div class="grid grid-cols-2 gap-2.5">
            <div v-for="tile in factTiles" :key="tile.label" class="ctx-tile">
              <p class="flex items-center gap-1 text-[11px] font-semibold tx-sub">
                <span aria-hidden="true">{{ tile.emoji }}</span>{{ tile.label }}
              </p>
              <p class="mt-0.5 text-[16px] font-extrabold tx-main">
                {{ tile.value }}<span v-if="tile.unit" class="ml-0.5 text-[11px] font-bold tx-muted">{{ tile.unit }}</span>
              </p>
              <p v-if="tile.note" class="text-[10.5px] tx-muted">{{ tile.note }}</p>
            </div>
          </div>
          <p class="mt-3 text-[11px] leading-relaxed tx-muted">
            提示：这些数据来自「身体数据测评」与「三餐饮食记录」页，修改后下一轮对话即刻生效。
          </p>
        </MacaronCard>

        <!-- 推荐问题（对话开始后仍可随时点击） -->
        <MacaronCard theme="yellow" title="试试这样问" emoji="✨" sub="点击直接发送">
          <div class="flex flex-wrap gap-2">
            <button v-for="s in SUGGESTED_QUESTIONS" :key="s.text" class="chip" @click="send(s.text)">
              <span aria-hidden="true">{{ s.emoji }}</span>{{ s.text }}
            </button>
          </div>
        </MacaronCard>

        <!-- 知识库命中预览：把 RAG 检索过程摊开给用户看 -->
        <MacaronCard theme="green" title="知识库命中" emoji="📚" sub="RAG 会先检索本地知识库作为作答依据">
          <div v-if="knowledgePreview.length" class="space-y-2">
            <div v-for="r in knowledgePreview" :key="r.id" class="flex items-start gap-2">
              <span class="text-[15px] leading-none" aria-hidden="true">{{ r.emoji }}</span>
              <div class="min-w-0 flex-1">
                <p class="ellipsis text-[12.5px] font-bold tx-main">{{ r.title }}</p>
                <p class="ellipsis text-[11px] tx-muted">{{ r.kind }} · 匹配度 {{ r.score }}</p>
              </div>
            </div>
          </div>
          <p v-else class="text-[12px] tx-muted">发送一条提问后，这里会显示知识库的召回结果。</p>
          <p class="mt-2.5 text-[11px] leading-relaxed tx-muted">
            知识库共收录科普文章、食物搭配辟谣、健康习惯，以及 {{ kbSize.foods }} 条食物营养数据
            （合计 {{ kbSize.docs }} 条检索单元），全部在前端本地，无需联网即可检索。
          </p>
        </MacaronCard>

        <!-- 技术说明：如实说明能力边界，避免答辩夸大 -->
        <MacaronCard theme="blue" title="对话助手如何工作" emoji="🧠" sub="五步链路，全程可复核">
          <ol class="space-y-2.5">
            <li v-for="(step, i) in ['个性化上下文注入（BMI / 今日饮食）', '本地知识库 RAG 检索（Top-4 召回）', 'AI Agent 工具调用（按需读取饮食 / 档案 / 食物库）', '云端大模型流式生成（SSE 打字机效果）', '失败自动回退本地知识库作答']" :key="step" class="flex items-start gap-2">
              <span class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold" style="background: #f3efff; color: #7a5fd0">{{ i + 1 }}</span>
              <span class="text-[12px] leading-relaxed tx-sub">{{ step }}</span>
            </li>
          </ol>
          <div class="divider"></div>
          <p class="text-[11.5px] leading-relaxed tx-muted">
            <strong class="tx-sub">如实说明：</strong>
            本页面调用的是准入的云端成熟大模型（与识别页共用同一代理，密钥只存服务端），
            项目自身<strong class="tx-sub">不包含模型训练流程</strong>，因此不宣称任何训练准确率；
            本地知识库用于提供事实依据与断网兜底，不替代专业医疗建议。
          </p>
        </MacaronCard>
      </div>
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
  background: linear-gradient(135deg, #d9f2e6, #bfe9d6);
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
  border-radius: 16px;
  word-break: break-word;
  white-space: pre-wrap;
}
.chat-bubble-user {
  background: linear-gradient(135deg, #b9a6f2, #9b83e8);
  color: #fff;
  border-bottom-right-radius: 6px;
  box-shadow: 0 6px 16px rgba(155, 131, 232, 0.26);
}
.chat-bubble-ai {
  background: #fff;
  color: var(--tx-main);
  border-bottom-left-radius: 6px;
  box-shadow: inset 0 0 0 1px #e7ecf3;
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
  background: #f4f1fd;
  color: #6d55c4;
  box-shadow: inset 0 0 0 1px #e6dffa;
}
.chat-tool.is-running {
  background: #fff9e6;
  color: #b8801a;
  box-shadow: inset 0 0 0 1px #ffe6a6;
}
.chat-tool.is-pending {
  background: #fff9e6;
  color: #b8801a;
  box-shadow: inset 0 0 0 1px #ffe6a6;
}
.chat-tool.is-ok {
  background: #e6f7ef;
  color: #2f9e6b;
  box-shadow: inset 0 0 0 1px #c9ecd9;
}
.chat-tool.is-fail {
  background: #fff1f1;
  color: #d9534f;
  box-shadow: inset 0 0 0 1px #ffd8d8;
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
  background: #fffaf0;
  box-shadow: inset 0 0 0 1px #ffe6a6;
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

/* 生成中的呼吸光标 */
.chat-cursor {
  display: inline-block;
  width: 7px;
  height: 14px;
  margin-left: 2px;
  vertical-align: -2px;
  border-radius: 2px;
  background: #9b83e8;
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
  color: #7a5fd0;
  font-weight: 600;
  list-style: none;
}
.chat-refs summary::-webkit-details-marker {
  display: none;
}
.chat-refs ul {
  padding-left: 4px;
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
  background: #faf8ff;
  box-shadow: inset 0 0 0 1px #efe9ff;
}
</style>

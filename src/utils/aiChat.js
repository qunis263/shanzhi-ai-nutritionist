/**
 * AI 营养对话助手 —— 编排层（前端）
 * ==================================================================
 * 这是「AI 营养对话助手」页面的**唯一入口**，把三件事组合成一条完整链路：
 *
 *   ① 个性化上下文注入（区别于通用问答的关键差异点）
 *      · 从 userStore 取 BMI / BMI 分级 / BMR / TDEE / 推荐热量 / 营养目标
 *      · 从 dietStore 取今日营养合计、健康评分、饮水、已记录食物
 *      · 拼成 system prompt，让模型「知道你是谁、今天吃了什么」，而不是泛泛而谈
 *
 *   ② RAG 检索增强（本地知识库作为事实依据）
 *      · 从本地 916 条营养知识库 / 科普文章 / 食物相克 / 健康习惯中按关键词召回 Top-N
 *      · 作为「参考资料」注入 system prompt，约束模型基于本地数据回答、减少胡编
 *      · 复用识别页同一套「可解释」思路：把召回的知识条目一并展示给用户核对
 *
 *   ③ 三层降级（与识别页同款「永不掉线」叙事）
 *      ☁️ 云端大模型流式输出 → 失败则 🔬 本地知识库检索直接作答 → 保证可演示
 *
 * 安全说明：本文件不含任何密钥。请求经 Node 代理（server/）转发，
 * 密钥只存在于服务端进程，详见 docs/AI接入说明.md。
 */

import { SCIENCE_ARTICLES, FOOD_CONFLICTS, HEALTHY_HABITS } from '@/data/knowledge'
import { FOOD_DB } from '@/data/foods'
import { BRAND } from '@/config/brand'
import { isMockMode } from '@/utils/aiClient'
import { requestChatStream, requestChat, describeError } from '@/utils/aiClient'
import { AGENT_TOOLS, executeTool, toolLabel } from '@/utils/aiTools'

/* ===================================================================
 * 一、识别来源标识（与识别页保持一致的语义）
 * =================================================================== */
export const CHAT_SOURCE = {
  CLOUD: 'cloud',
  MOCK: 'mock',
  LOCAL: 'local'
}

export const CHAT_SOURCE_LABELS = {
  cloud: { emoji: '☁️', text: '云端大模型', tone: 'ok' },
  mock: { emoji: '🧪', text: 'Mock 演示模式', tone: 'warn' },
  local: { emoji: '🔬', text: '本地知识库', tone: 'sub' }
}

/* ===================================================================
 * 二、本地知识库索引（RAG 检索的数据源）
 * ------------------------------------------------------------------
 * 索引在模块加载时构建一次（懒构建），之后每次提问只做打分排序，
 * 因此运行开销极小、且完全离线可用。
 * =================================================================== */

/** 把任意文本切成小写词元：中文按 2 字滑窗，英文/数字按词切 */
function tokenize(text) {
  const s = String(text || '').toLowerCase()
  const tokens = new Set()
  // 英文与数字：按非字母数字切分
  s.replace(/[a-z0-9]+/g, (m) => {
    if (m.length >= 2) tokens.add(m)
    return m
  })
  // 中文：连续汉字串内做 2 字滑窗，尽量保证召回
  const han = s.match(/[\u4e00-\u9fa5]+/g) || []
  han.forEach((seg) => {
    if (seg.length === 1) tokens.add(seg)
    for (let i = 0; i + 2 <= seg.length; i++) tokens.add(seg.slice(i, i + 2))
    if (seg.length >= 4) {
      for (let i = 0; i + 3 <= seg.length; i++) tokens.add(seg.slice(i, i + 3))
    }
  })
  return [...tokens]
}

/** 知识库文档索引（懒构建） */
let DOC_INDEX = null

function buildDocIndex() {
  const docs = []

  // ① 科普文章（结构最完整，权重最高）
  SCIENCE_ARTICLES.forEach((a) => {
    docs.push({
      id: `article:${a.id}`,
      kind: '科普文章',
      emoji: a.emoji || '📖',
      title: a.title,
      tags: a.tags || [],
      text: [a.summary, ...a.sections.map((s) => `${s.h} ${s.p}`)].join(' ')
    })
  })

  // ② 食物相克辟谣（回答「XX 和 YY 能不能一起吃」类问题）
  FOOD_CONFLICTS.forEach((c) => {
    docs.push({
      id: `conflict:${c.id}`,
      kind: '食物搭配',
      emoji: c.a?.emoji || '🍽️',
      title: `${c.a?.name || ''} + ${c.b?.name || ''}`,
      tags: [c.a?.name, c.b?.name, '相克', '搭配', '辟谣'].filter(Boolean),
      text: `民间说法：${c.desc} 科学结论：${c.truth}`
    })
  })

  // ③ 健康习惯（回答「怎么吃更健康 / 生活习惯」类问题）
  HEALTHY_HABITS.forEach((h, i) => {
    docs.push({
      id: `habit:${i}`,
      kind: '健康习惯',
      emoji: h.emoji || '✅',
      title: h.title,
      tags: ['习惯', '生活方式'],
      text: h.desc
    })
  })

  // ④ 食物营养条目（回答「XX 热量多少 / 有什么营养」类问题）
  //    只取核心字段，避免索引过大；数量多但每条很短，检索依然很快
  FOOD_DB.forEach((f) => {
    docs.push({
      id: `food:${f.id}`,
      kind: '食物营养',
      emoji: f.emoji || '🍽️',
      title: f.name,
      tags: [f.category, ...(f.keywords || [])].filter(Boolean),
      text: `${f.name}（${f.category}）每 100g：热量 ${f.calories}kcal、蛋白质 ${f.protein}g、脂肪 ${f.fat}g、碳水 ${f.carb}g、膳食纤维 ${f.fiber}g、钠 ${f.sodium}mg`
    })
  })

  docs.forEach((d) => {
    d.titleTokens = tokenize(d.title)
    d.bodyTokens = tokenize(d.text)
    d.tagTokens = tokenize(d.tags.join(' '))
  })

  return docs
}

function getDocIndex() {
  if (!DOC_INDEX) DOC_INDEX = buildDocIndex()
  return DOC_INDEX
}

/**
 * 本地知识库规模（供页面展示）
 * 采用延迟计算：索引体积较大，不在应用启动时就构建，避免拖慢首屏
 */
export function knowledgeSize() {
  return { foods: FOOD_DB.length, docs: getDocIndex().length }
}

/**
 * 从本地知识库检索与问题最相关的条目
 * @param {string} question 用户提问
 * @param {number} [limit] 返回条数上限
 * @returns {Array<{id, kind, emoji, title, text, score, hitTokens}>}
 */
export function retrieveKnowledge(question, limit = 4) {
  const tokens = tokenize(question)
  if (!tokens.length) return []

  // 预先把问题词元放进 Set，避免在循环里反复 includes（916 条 × 数十词元）
  const querySet = new Set(tokens)
  const scores = []

  getDocIndex().forEach((doc) => {
    let score = 0
    const hit = []

    doc.tagTokens.forEach((t) => {
      if (querySet.has(t)) {
        score += 6 // 标签命中权重最高（类别 / 别名最能代表主题）
        hit.push(t)
      }
    })
    doc.titleTokens.forEach((t) => {
      if (querySet.has(t)) {
        score += 5 // 标题命中
        hit.push(t)
      }
    })
    doc.bodyTokens.forEach((t) => {
      if (querySet.has(t)) {
        score += 1 // 正文命中
        hit.push(t)
      }
    })

    // 类别兜底：科普文章与知识类条目在并列时优先（内容更完整、更适合作答）
    if (score > 0) {
      if (doc.kind === '科普文章') score += 2
      if (doc.kind === '健康习惯') score += 1
      scores.push({ ...doc, score, hitTokens: [...new Set(hit)] })
    }
  })

  return scores
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit)
}

/* ===================================================================
 * 三、个性化上下文构建
 * =================================================================== */

/**
 * 汇总用户档案与今日饮食，生成用于注入 system prompt 的上下文文本
 * @param {{profile: object, metrics: object, summary: object, targets: object, report: object, water: number, records: object[]}} input
 * @returns {{text: string, facts: object}} text 为提示词片段，facts 为结构化事实（供 UI 展示）
 */
export function buildContextText(input = {}) {
  const { profile = {}, metrics = {}, summary = {}, targets = {}, report = {}, water = 0, records = [] } = input

  const lines = []
  const facts = {}

  // ---- 身体指标 ----
  if (profile.height > 0 && profile.weight > 0) {
    facts.bmi = metrics.bmi
    facts.bmiLabel = metrics.bmiGrade?.label
    facts.bmr = Math.round(metrics.bmr || 0)
    facts.tdee = Math.round(metrics.tdee || 0)
    facts.dailyCalories = Math.round(metrics.dailyCalories || 0)

    lines.push(
      `【用户身体数据】性别 ${profile.gender === 'female' ? '女' : '男'}、年龄 ${profile.age} 岁、` +
        `身高 ${profile.height}cm、体重 ${profile.weight}kg；` +
        `BMI ${metrics.bmi}（判定：${metrics.bmiGrade?.label || '未知'}）、` +
        `基础代谢 BMR 约 ${Math.round(metrics.bmr || 0)} kcal、` +
        `每日总消耗 TDEE 约 ${Math.round(metrics.tdee || 0)} kcal、` +
        `为其推荐的每日摄入约 ${Math.round(metrics.dailyCalories || 0)} kcal。`
    )
    if (metrics.dietModeDesc) lines.push(`【当前饮食模式建议】${metrics.dietModeDesc}`)
  } else {
    lines.push('【用户身体数据】用户尚未完成身体数据测评（可在「BMI/BMR 测评」页补充）。')
  }

  if (profile.goal) {
    const goalText = { lose: '减脂', gain: '增肌', keep: '保持体重' }[profile.goal] || '保持体重'
    facts.goal = goalText
    lines.push(`【用户目标】${goalText}`)
  }

  // ---- 今日饮食 ----
  const cal = Math.round(summary.calories || 0)
  facts.todayCalories = cal
  facts.todayTarget = Math.round(targets.calories || 0)
  facts.score = report.score
  facts.water = water

  lines.push(
    `【今日饮食情况】已摄入热量约 ${cal} kcal（目标 ${Math.round(targets.calories || 0)} kcal）；` +
      `蛋白质 ${Math.round(summary.protein || 0)}g（目标 ${Math.round(targets.protein || 0)}g）、` +
      `脂肪 ${Math.round(summary.fat || 0)}g（目标 ${Math.round(targets.fat || 0)}g）、` +
      `碳水 ${Math.round(summary.carb || 0)}g（目标 ${Math.round(targets.carb || 0)}g）、` +
      `膳食纤维 ${Math.round(summary.fiber || 0)}g（目标 ${Math.round(targets.fiber || 0)}g）、` +
      `钠 ${Math.round(summary.sodium || 0)}mg。` +
      `饮水 ${Math.round(water || 0)}ml。今日饮食健康评分 ${report.score ?? '—'} 分。`
  )

  if (Array.isArray(report.strengths) && report.strengths.length) lines.push(`【今日饮食优点】${report.strengths.join('；')}`)
  if (Array.isArray(report.weaknesses) && report.weaknesses.length) lines.push(`【今日饮食待改进】${report.weaknesses.join('；')}`)
  if (Array.isArray(report.suggestions) && report.suggestions.length) lines.push(`【系统给出的改进建议】${report.suggestions.join('；')}`)

  if (records.length) {
    const names = records.slice(0, 12).map((r) => `${r.name}(${r.grams}${r.unit === '100ml' ? 'ml' : 'g'})`)
    lines.push(`【今日已记录的食物】${names.join('、')}${records.length > 12 ? ' 等' : ''}`)
  }

  return { text: lines.join('\n'), facts }
}

/**
 * 组装 system 提示词
 * @param {string} contextText 个性化上下文
 * @param {Array} refs RAG 召回的知识条目
 */
export function buildSystemPrompt(contextText = '', refs = []) {
  const refBlock = refs.length
    ? '\n\n【参考资料（来自本应用内置营养知识库，回答时请优先依据以下内容，不要与它冲突）】\n' +
      refs
        .map((r, i) => `${i + 1}. [${r.kind}] ${r.title}：${String(r.text).slice(0, 300)}`)
        .join('\n')
    : ''

  return (
    `你是「${BRAND.fullName}」应用内置的专业营养顾问，名字叫「膳知助手」。\n\n` +
    '【你的职责】\n' +
    '· 依据用户的身体数据与今日饮食记录，给出**个性化、可执行**的营养建议\n' +
    '· 回答减脂、增肌、控糖、饮水、外卖选择、食物搭配等日常营养问题\n' +
    '· 涉及安全边界时（疾病、用药、极端节食），提示用户咨询专业医师或注册营养师\n\n' +
    '【回答要求】\n' +
    '· 用中文回答，语气亲切专业，像面对面咨询，避免生硬的教科书腔\n' +
    '· 结构清晰：能分点就分点，每点先给结论再给理由，必要时给出具体数字（克、kcal、毫升）\n' +
    '· **结合用户的具体数据**作答，例如直接引用他的 BMI、今日热量缺口，而不是只讲通用知识\n' +
    '· 篇幅控制在 250 字以内，除非用户明确要求详细展开\n' +
    '· 不做医疗诊断，不承诺疗效，不推荐具体药品或保健品品牌\n\n' +
    '【工具使用（AI Agent）】\n' +
    '· 当问题涉及「我」的具体数据（今天吃了多少、昨天/这周吃了什么、我的身体指标、某种食物的营养、下一餐推荐）时，' +
    '优先调用可用工具获取真实数据后再回答，不要凭空猜测用户的记录\n' +
    '· 不需要工具就能回答的通用营养知识，直接回答，不必强行调用工具\n' +
    '· 工具返回的是真实数据，回答时请直接引用其中的数字，不要改动或编造\n' +
    '· 当用户明确要求「帮我记录 / 记一下」某餐食物时，调用 add_diet_record 生成记录卡片；' +
    '该工具不会直接写入，调用后请告诉用户「记录卡片已准备好，请在卡片上确认」，在用户确认前不要说「已记录」\n\n' +
    '【用户当前情况】\n' +
    contextText +
    refBlock
  )
}

/* ===================================================================
 * 四、本地兜底作答（云端不可用时使用）
 * ------------------------------------------------------------------
 * 原则与识别页一致：**不编造**。
 * 只用本地知识库检索到的原始条目组织回答，并在结尾明确说明数据来源。
 * =================================================================== */
/**
 * 基于本地知识库生成确定性回答
 * @param {string} question 用户提问
 * @returns {{text: string, refs: Array, matched: boolean}}
 */
export function localAnswer(question = '') {
  const refs = retrieveKnowledge(question, 4)

  if (!refs.length) {
    return {
      matched: false,
      refs: [],
      text:
        '（本地知识库模式）我暂时没有在本地营养知识库里找到与这个问题直接相关的内容，为避免给出不准确的信息，这里不做推测。\n\n' +
        '你可以换个问法，例如：\n' +
        '· 减脂期蛋白质要吃多少？\n' +
        '· 每天应该喝多少水？\n' +
        '· 一杯奶茶的糖有多少？\n' +
        '· 菠菜和豆腐能一起吃吗？\n\n' +
        '提示：在 .env 中配置 AI_API_KEY 后，即可切换到云端大模型进行自由问答。'
    }
  }

  // 食物营养类条目的回答需要重新组织，其余直接引用知识库原文
  const blocks = refs.map((r, i) => {
    const head = `${i + 1}. ${r.emoji} **${r.title}**（${r.kind}）`
    return `${head}\n${String(r.text).slice(0, 400)}`
  })

  return {
    matched: true,
    refs,
    text:
      '（本地知识库模式）云端大模型暂时不可用，以下内容直接来自本应用内置的营养知识库：\n\n' +
      blocks.join('\n\n') +
      '\n\n以上内容可在「营养知识库」页查看完整原文。'
  }
}

/* ===================================================================
 * 五、主入口：一次提问
 * =================================================================== */
/** 对话历史转 messages 数组时保留的最大轮数（与后端 AI_CHAT_MAX_TURNS 对齐） */
const MAX_TURNS = 12

/** AI Agent 工具调用最多轮数（超过后强制关闭工具，要求模型直接作答） */
const MAX_AGENT_ROUNDS = 4

/** 解析模型返回的工具参数（标准为 JSON 字符串，也兼容已解析对象） */
function parseToolArgs(raw) {
  if (raw && typeof raw === 'object') return raw
  try {
    return JSON.parse(String(raw || '{}'))
  } catch {
    return {}
  }
}

/**
 * 向 AI 营养助手提问（流式 + AI Agent 工具调用）
 * ------------------------------------------------------------------
 * 执行流程：
 *   ① 组装 system（个性化上下文 + RAG 参考资料 + 工具使用约定）+ 历史 + 本次提问
 *   ② 携带 tools 请求模型（SSE 流式）
 *       · 模型直接作答 → 流式展示，结束
 *       · 模型返回 tool_calls → 在前端执行工具（读饮食 / 档案 / 食物库 / 推荐）
 *         把结果以 role=tool 回填，再次请求模型，最多 maxRounds 轮
 *   ③ 任一步失败 → 自动回退本地知识库作答，保证对话不中断
 *
 * @param {object} params
 * @param {string} params.question 本次提问
 * @param {Array<{role:'user'|'assistant', content:string}>} [params.history] 历史对话（不含本次提问）
 * @param {object} [params.context] 个性化上下文（见 buildContextText 的入参）
 * @param {{dietStore: object, userStore: object}} [params.stores] 工具执行所需的数据源
 * @param {(text: string) => void} [params.onDelta] 每个增量文本的回调（用于打字机渲染）
 * @param {(step: object) => void} [params.onTool] 工具调用轨迹回调（用于展示 🛠️ 步骤）
 * @param {AbortSignal} [params.signal] 外部取消信号
 * @param {number} [params.maxRounds] Agent 轮数上限
 * @returns {Promise<{ok: boolean, text: string, source: string, refs: Array, toolCalls?: Array, error?: object, notice?: string, truncated?: boolean, elapsedMs: number}>}
 */
export async function askNutritionAI({
  question,
  history = [],
  context = {},
  stores = null,
  onDelta,
  onTool,
  signal,
  maxRounds = MAX_AGENT_ROUNDS
} = {}) {
  const startedAt = Date.now()
  const emit = typeof onDelta === 'function' ? onDelta : () => {}
  const emitTool = typeof onTool === 'function' ? onTool : () => {}

  const q = String(question || '').trim()
  if (!q) {
    return { ok: false, text: '', source: CHAT_SOURCE.LOCAL, refs: [], error: { code: 'EMPTY', message: '请输入你的问题' }, elapsedMs: 0 }
  }

  // ① RAG 检索：无论走云端还是本地都在用，保证「回答有据可依」
  const refs = retrieveKnowledge(q, 4)

  // ② 组装 messages：system（个性化 + 参考资料）+ 最近若干轮对话 + 本次提问
  const contextText = buildContextText(context).text
  const messages = [{ role: 'system', content: buildSystemPrompt(contextText, refs) }]
  history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-MAX_TURNS)
    .forEach((m) => messages.push({ role: m.role, content: m.content }))
  messages.push({ role: 'user', content: q })

  /* ---- 前端纯 Mock 模式：完全不发请求，直接用本地知识库作答 ---- */
  if (isMockMode()) {
    const local = localAnswer(q)
    await typewriter(local.text, emit, signal)
    return { ok: true, text: local.text, source: CHAT_SOURCE.LOCAL, refs: local.refs.length ? local.refs : refs, note: '前端已开启 VITE_AI_MOCK=1，未发起网络请求', elapsedMs: Date.now() - startedAt }
  }

  /** 是否具备执行 Agent 工具的条件（两个 store 缺一不可） */
  const agentReady = Boolean(stores?.dietStore && stores?.userStore)
  /** 已执行的工具轨迹（随结果返回，供页面展示） */
  const toolTrace = []

  /**
   * 发起一次模型请求（流式优先，浏览器不支持流式时自动退化为非流式）
   * @param {boolean} withTools 是否携带工具声明
   */
  const callModel = async (withTools) => {
    const payload = withTools ? { messages, tools: AGENT_TOOLS } : { messages }
    let res = await requestChatStream(payload, { onDelta: emit, signal })
    if (!res.ok && res.error?.code === 'NO_STREAM_SUPPORT') {
      res = await requestChat(payload, { signal })
      if (res.ok) {
        const text = res.data?.reply || ''
        if (text) await typewriter(text, emit, signal)
        res = { ...res, mode: 'nonstream' }
      }
    }
    return res
  }

  /** 失败兜底：本地知识库作答（保证对话永不中断） */
  const fallbackLocal = async (res) => {
    const local = localAnswer(q)
    const reason = describeError(res?.error)
    const code = res?.error?.code ? `（错误码 ${res.error.code}）` : ''
    const prefix = `☁️ 云端对话失败：${reason}${code}，已自动回退到本地营养知识库。\n\n`
    const text = prefix + local.text
    await typewriter(text, emit, signal)

    return {
      ok: true,
      text,
      source: CHAT_SOURCE.LOCAL,
      refs: local.refs.length ? local.refs : refs,
      toolCalls: toolTrace,
      notice: `${reason}${code}`,
      error: res?.error,
      elapsedMs: Date.now() - startedAt
    }
  }

  /* ---- ③ Agent 循环：模型 → 工具 → 模型 …，直到模型给出最终回答 ---- */
  for (let round = 0; round < maxRounds; round += 1) {
    const res = await callModel(agentReady)
    if (!res.ok) return fallbackLocal(res)
    if (signal?.aborted) break

    const calls = Array.isArray(res.data?.toolCalls) ? res.data.toolCalls : []

    // 没有工具调用（或工具环境不可用）→ 本轮就是最终回答
    if (!calls.length || !agentReady) {
      return {
        ok: true,
        text: res.data?.reply || '',
        source: res.source || CHAT_SOURCE.CLOUD,
        refs,
        toolCalls: toolTrace,
        notice: res.notice || '',
        truncated: Boolean(res.truncated),
        error: res.error,
        meta: res.meta || {},
        elapsedMs: Date.now() - startedAt
      }
    }

    // 把「模型的工具请求」回填进上下文（必须保留原始 id，才能与 tool 消息配对）
    messages.push({ role: 'assistant', content: res.data?.reply || '', tool_calls: calls })

    for (const call of calls) {
      const name = call?.function?.name || ''
      const args = parseToolArgs(call?.function?.arguments)
      const info = toolLabel(name)
      const callId = call.id || `${name}_${round}_${toolTrace.length}`
      const step = { callId, name, emoji: info.emoji, label: info.label, args }

      emitTool({ ...step, phase: 'start' })

      let output
      try {
        output = executeTool(name, args, stores)
      } catch (err) {
        output = { ok: false, summary: '工具执行异常', content: `工具执行异常：${err?.message || err}` }
      }

      if (output.needConfirm && output.pending) {
        // 写入型工具（add_diet_record）：不落库、不阻塞循环。
        // 把 pending 挂到工具轨迹上交给页面渲染确认卡片，
        // 同时正常回填 tool 消息，让模型告知用户「请在卡片上确认」
        emitTool({ ...step, phase: 'confirm', pending: output.pending })
        messages.push({ role: 'tool', tool_call_id: callId, content: output.content })
        toolTrace.push({ ...step, ok: null, summary: output.summary, pending: output.pending })
      } else {
        emitTool({ ...step, phase: 'done', ok: output.ok, summary: output.summary })
        messages.push({ role: 'tool', tool_call_id: callId, content: output.content })
        toolTrace.push({ ...step, ok: output.ok, summary: output.summary })
      }
    }

    // 继续下一轮：让模型基于工具结果组织最终回答
  }

  /* ---- 用户中途停止：不再发起新的模型请求，已生成内容由页面保留 ---- */
  if (signal?.aborted) {
    return {
      ok: true,
      text: '',
      source: CHAT_SOURCE.CLOUD,
      refs,
      toolCalls: toolTrace,
      elapsedMs: Date.now() - startedAt
    }
  }

  /* ---- 轮数用尽：关闭工具再请求一次，强制模型直接作答 ---- */
  const finalRes = await callModel(false)
  if (finalRes.ok) {
    return {
      ok: true,
      text: finalRes.data?.reply || '',
      source: finalRes.source || CHAT_SOURCE.CLOUD,
      refs,
      toolCalls: toolTrace,
      notice: finalRes.notice || '',
      truncated: Boolean(finalRes.truncated),
      error: finalRes.error,
      meta: finalRes.meta || {},
      elapsedMs: Date.now() - startedAt
    }
  }
  return fallbackLocal(finalRes)
}

/** 把整段文本按小段吐出，模拟流式观感（本地兜底与前端 Mock 使用） */
async function typewriter(text, emit, signal, chunkSize = 4) {
  const chars = [...String(text || '')]
  for (let i = 0; i < chars.length; i += chunkSize) {
    if (signal?.aborted) return
    emit(chars.slice(i, i + chunkSize).join(''))
    await new Promise((r) => setTimeout(r, 16))
  }
}

/* ===================================================================
 * 六、推荐问题（首屏引导，降低使用门槛）
 * =================================================================== */
export const SUGGESTED_QUESTIONS = [
  { emoji: '⚖️', text: '我的 BMI 正常吗？有什么建议？', tag: '个性化' },
  { emoji: '🔥', text: '根据我今天的饮食，我还能吃多少？', tag: '个性化' },
  { emoji: '📅', text: '帮我看看昨天吃了什么，吃得怎么样？', tag: 'Agent' },
  { emoji: '🥩', text: '减脂期蛋白质每天要吃多少克？', tag: '减脂' },
  { emoji: '💪', text: '想增肌，一日三餐应该怎么安排？', tag: '增肌' },
  { emoji: '🍬', text: '一杯全糖奶茶大概含多少糖？', tag: '控糖' },
  { emoji: '💧', text: '每天应该喝多少水才够？', tag: '习惯' },
  { emoji: '🛵', text: '点外卖怎么选才更健康？', tag: '实操' },
  { emoji: '🥬', text: '菠菜和豆腐到底能不能一起吃？', tag: '搭配' }
]

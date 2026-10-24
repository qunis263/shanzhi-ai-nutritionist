/**
 * 视觉大模型 API 客户端（服务端专用，零依赖）
 * ------------------------------------------------------------------
 * 职责边界（对应需求「模型 API 客户端的封装与配置」）：
 *   ① 认证机制：以 Bearer Token 形式在请求头携带密钥，密钥只存在于服务端进程
 *   ② 参数格式：按 OpenAI 兼容的 chat/completions 多模态消息体构造请求
 *   ③ 稳定性：AbortController 单次超时 + 指数退避重试 + 错误码中文映射
 *   ④ 输出解析：把模型返回的自然语言/JSON 统一解析成结构化识别结果
 *
 * 兼容性说明：智谱 GLM-4V、通义千问 qwen-vl、豆包 Doubao-vision、GPT-4o
 * 均提供 OpenAI 兼容端点，因此只要替换 AI_API_BASE 与 AI_MODEL 两个环境变量，
 * 本客户端无需改动任何代码即可切换厂商。
 */
import { mockVisionReply, mockChatReply } from './mock.js'

/* ===================================================================
 * 一、错误码 → 中文提示映射表
 * =================================================================== */
/** HTTP 状态码映射（面向模型厂商网关） */
const HTTP_ERROR_MAP = {
  400: '请求参数有误：图片格式或消息体不符合模型要求，请检查图片是否为有效 Base64 / DataURL',
  401: '鉴权失败：API Key 缺失或无效，请检查 .env 中的 AI_API_KEY 是否填写正确',
  403: '权限不足：API Key 已过期或未开通该模型的调用权限，请到平台控制台确认',
  404: '接口或模型不存在：请检查 AI_API_BASE 与 AI_MODEL 配置是否与厂商文档一致',
  408: '模型服务响应超时，请稍后重试或改用更轻量的模型',
  413: '图片体积过大：请压缩图片后重试，或调大 AI_MAX_IMAGE_BYTES 配置',
  422: '请求内容无法处理：图片可能已损坏或格式不受支持',
  429: '调用频率超限或账户额度不足：请稍后重试，或到平台控制台查看额度',
  500: '模型服务内部错误：属于服务端异常，可稍后重试',
  502: '模型服务网关错误：可稍后重试',
  503: '模型服务暂时不可用：可稍后重试',
  504: '模型服务网关超时：可稍后重试'
}

/** 网络层错误码映射（Node 侧 socket / DNS / 中断） */
const NETWORK_ERROR_MAP = {
  ECONNREFUSED: '无法连接到模型服务：请检查网络或代理设置',
  ECONNRESET: '连接被模型服务重置：请稍后重试',
  ETIMEDOUT: '连接模型服务超时：请检查网络状况',
  ENOTFOUND: '模型服务域名解析失败：请检查网络与 DNS 设置',
  EAI_AGAIN: '域名解析暂时失败：请检查网络后重试',
  ABORT_ERR: '本次调用已超时（超过 AI_TIMEOUT_MS）：已自动中断以避免长时间等待',
  UND_ERR_CONNECT_TIMEOUT: '连接模型服务超时：请检查网络状况'
}

/**
 * 需要重试的状态码 / 错误码（仅服务端故障自动重试）
 * 注意：HTTP 429 限流不重试——API 已明确要求降速，立即重试只会加剧限流、
 * 白等退避时间；前端收到 429 会立刻降级到本地知识库/本地引擎，体验不受影响
 */
const RETRYABLE_STATUS = new Set([500, 502, 503, 504])
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'])

/**
 * 把任意错误（HTTP 状态码或网络异常）翻译成「可读中文提示 + 是否可重试」
 * @param {number|null} status
 * @param {string} [rawMessage]
 * @param {string} [errorCode]
 */
export function mapError(status, rawMessage = '', errorCode = '') {
  if (status && HTTP_ERROR_MAP[status]) {
    return {
      code: errorCode || `HTTP_${status}`,
      status,
      message: HTTP_ERROR_MAP[status],
      retryable: RETRYABLE_STATUS.has(status),
      detail: rawMessage.slice(0, 300)
    }
  }
  if (errorCode && NETWORK_ERROR_MAP[errorCode]) {
    return {
      code: errorCode,
      status: null,
      message: NETWORK_ERROR_MAP[errorCode],
      retryable: RETRYABLE_CODES.has(errorCode),
      detail: rawMessage.slice(0, 300)
    }
  }
  if (status) {
    return {
      code: errorCode || `HTTP_${status}`,
      status,
      message: `模型服务返回未知错误（HTTP ${status}），请稍后重试`,
      retryable: status >= 500,
      detail: rawMessage.slice(0, 300)
    }
  }
  return {
    code: errorCode || 'UNKNOWN',
    status: null,
    message: '调用模型服务失败：请检查网络连接与服务端日志',
    retryable: false,
    detail: rawMessage.slice(0, 300)
  }
}

/* ===================================================================
 * 二、请求体构造（OpenAI 兼容多模态格式）
 * =================================================================== */
/** 系统提示词：约束模型只输出结构化 JSON，便于上层稳定解析 */
export const SYSTEM_PROMPT = [
  '你是专业的食物图像识别与营养分析助手，服务于一款饮食营养管理应用。',
  '请辨认图片中**最主要**的那一种食物，并严格只输出一个 JSON 对象，不要输出任何多余文字或代码块围栏。',
  'JSON 字段要求：',
  '{',
  '  "food": "食物中文名称（尽量使用通用家常叫法，如 蛋炒饭、榴莲、清蒸鲈鱼）",',
  '  "confidence": 0 到 1 之间的小数，表示你对本次识别的把握程度,',
  '  "reason": "简短说明判定依据，例如颜色、形状、纹理、配菜等视觉线索",',
  '  "alternatives": ["若存在易混淆的候选食物，按可能性从高到低列出 1-3 个中文名称"]',
  '}',
  '若图片中确实没有可辨认的食物，请把 food 设为空字符串、confidence 设为 0，并在 reason 中说明原因。'
].join('\n')

/** 用户提示词中的补充线索片段（用户手动填写的关键词优先参考） */
function buildUserText(hint, clues) {
  const lines = ['请识别这张图片中的食物。']
  const extra = [...new Set([...(clues || []), hint].filter(Boolean))]
  if (extra.length) {
    lines.push(`补充线索（可能来自文件名或用户输入，仅供参考，若与图片明显不符请以图片为准）：${extra.join('、')}`)
  }
  return lines.join('\n')
}

/**
 * 构造 OpenAI 兼容的请求体
 * @param {{image: string, hint?: string, clues?: string[]}} input
 * @param {object} cfg 配置（含 model）
 */
export function buildRequestBody(input, cfg) {
  const content = []
  if (input.image) {
    // GLM-4V / qwen-vl / GPT-4o 均接受 dataURL 形式的 image_url
    content.push({ type: 'image_url', image_url: { url: input.image } })
  }
  content.push({ type: 'text', text: buildUserText(input.hint, input.clues) })

  return {
    model: cfg.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content }
    ],
    // 识别类任务需要稳定输出，温度取低值
    temperature: 0.1,
    stream: false
  }
}

/* ===================================================================
 * 三、模型输出的统一解析
 * =================================================================== */
/**
 * 从模型返回的自然语言中稳健地提取 JSON
 * 兼容三种常见输出：纯 JSON、```json 围栏、夹带说明文字
 */
export function extractStructuredContent(text) {
  const raw = String(text || '').trim()
  const empty = { food: '', confidence: 0, reason: '', alternatives: [] }
  if (!raw) return { ...empty, reason: '模型返回内容为空' }

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const candidates = [cleaned]

  // 兜底：从第一个 { 到最后一个 } 之间截取
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1))

  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text)
      return normalizeParsed(parsed)
    } catch {
      /* 尝试下一种截取方式 */
    }
  }

  // 完全无法解析为 JSON：退化为「把整段文本当作食物名候选」的宽松解析
  const loose = cleaned.split(/[\n，,。;；]/)[0].slice(0, 20)
  return { ...empty, food: loose, confidence: 0.4, reason: `模型未按 JSON 格式返回，已宽松解析原始内容：${cleaned.slice(0, 120)}` }
}

/** 字段归一化：补默认值、裁剪置信度到 0-1、清洗候选数组 */
function normalizeParsed(parsed) {
  const food = String(parsed.food ?? parsed.name ?? parsed.label ?? '').trim()
  let confidence = Number(parsed.confidence ?? parsed.score ?? 0)
  if (!Number.isFinite(confidence)) confidence = 0
  // 兼容两种越界写法：
  //   · 百分数（如 95 → 0.95）：大于 2 时按百分数换算
  //   · 略微越界的 0-1 值（如 1.5 → 1）：直接按满分处理
  // 注意：早期实现统一用「>1 就除以 100」，会把 1.5 错算成 0.015，属于真实缺陷。
  if (confidence > 1) confidence = confidence > 2 ? confidence / 100 : 1
  confidence = Math.max(0, Math.min(1, confidence))

  const alternatives = Array.isArray(parsed.alternatives)
    ? parsed.alternatives.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
    : []

  return {
    food,
    confidence,
    reason: String(parsed.reason ?? parsed.explanation ?? '').trim(),
    alternatives
  }
}

/* ===================================================================
 * 四、带超时与重试的调用
 * =================================================================== */
/** 指数退避等待 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 单次请求（含超时中断） */
async function requestOnce(url, cfg, body, parentSignal) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  // 允许外部（如服务关闭）联动中断
  const onParentAbort = () => controller.abort()
  if (parentSignal) parentSignal.addEventListener('abort', onParentAbort, { once: true })

  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        // 认证机制：Bearer Token
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    const text = await res.text()
    if (!res.ok) {
      return { ok: false, error: mapError(res.status, text), elapsedMs: Date.now() - startedAt }
    }

    let envelope = null
    try {
      envelope = JSON.parse(text)
    } catch {
      return {
        ok: false,
        error: { code: 'BAD_RESPONSE', status: res.status, message: '模型返回内容不是合法 JSON 信封', retryable: false, detail: text.slice(0, 300) },
        elapsedMs: Date.now() - startedAt
      }
    }

    const message = envelope?.choices?.[0]?.message || null
    const content = message?.content
    // 注意：content 为模型**原始文本**，由各业务入口自行解析
    // （视觉入口用 extractStructuredContent 抽 JSON；对话入口直接用原文）
    // message 同时返回完整消息体，供对话入口读取 tool_calls（AI Agent 工具调用）
    return {
      ok: true,
      content,
      message,
      usage: envelope?.usage || null,
      elapsedMs: Date.now() - startedAt
    }
  } catch (err) {
    const code = err?.name === 'AbortError' ? 'ABORT_ERR' : err?.cause?.code || err?.code || 'UNKNOWN'
    return { ok: false, error: mapError(null, err?.message || String(err), code), elapsedMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timer)
    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort)
  }
}

/**
 * 调用视觉模型（对外主入口）
 * ------------------------------------------------------------------
 * @param {{image: string, hint?: string, clues?: string[]}} input
 * @param {object} cfg 由 readConfig() 产出
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<{ok: boolean, data?: object, error?: object, meta: object}>}
 */
export async function callVisionModel(input, cfg, options = {}) {
  const startedAt = Date.now()

  /* ---- Mock 短路：无密钥或显式开启 Mock 时，走确定性模拟响应 ---- */
  if (cfg.mock || !cfg.apiKey) {
    const data = await mockVisionReply([...(input.clues || []), input.hint].filter(Boolean), { delay: 400 })
    return {
      ok: true,
      data,
      meta: {
        mode: 'mock',
        model: cfg.model,
        attempts: 1,
        elapsedMs: Date.now() - startedAt,
        notice: cfg.mock ? '已在服务端开启 Mock 模式（AI_MOCK=1）' : '未检测到 AI_API_KEY，已自动降级为 Mock 响应'
      }
    }
  }

  /* ---- 真实调用：超时 + 指数退避重试 ---- */
  const url = `${cfg.apiBase}/chat/completions`
  const body = buildRequestBody(input, cfg)
  const maxAttempts = cfg.maxRetry + 1
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await requestOnce(url, cfg, body, options.signal)
    if (result.ok) {
      return {
        ok: true,
        data: extractStructuredContent(result.content),
        meta: { mode: 'cloud', model: cfg.model, attempts: attempt, elapsedMs: Date.now() - startedAt, usage: result.usage || null }
      }
    }

    lastError = result.error
    const canRetry = result.error.retryable && attempt < maxAttempts
    if (!canRetry) break

    // 指数退避：800ms → 1600ms → 3200ms
    const wait = 800 * 2 ** (attempt - 1)
    console.warn(`[aiProxy] 第 ${attempt} 次调用失败（${result.error.code}），${wait}ms 后重试`)
    await sleep(wait)
  }

  return {
    ok: false,
    error: lastError,
    meta: { mode: 'cloud', model: cfg.model, attempts: maxAttempts, elapsedMs: Date.now() - startedAt }
  }
}

/* ===================================================================
 * 五、对话助手（chat）请求体与调用
 * ------------------------------------------------------------------
 * 与视觉入口共用同一套「认证 / 超时 / 重试 / 错误码映射」基础设施，
 * 差别只在：请求体携带多轮 messages、解析时直接取文本、支持 SSE 流式。
 * =================================================================== */

/** 取最后一条用户消息（Mock 关键词匹配用） */
function lastUserText(messages) {
  const users = (messages || []).filter((m) => m.role === 'user')
  return users.length ? users[users.length - 1].content : ''
}

/**
 * 构造对话请求体（OpenAI 兼容）
 * @param {object[]} messages 已标准化的消息数组（含 system）
 * @param {object} cfg 配置
 * @param {boolean} [stream] 是否请求流式返回
 * @param {object[]} [tools] AI Agent 可用工具（function calling schema）
 */
export function buildChatRequestBody(messages, cfg, stream = false, tools = []) {
  const body = {
    model: cfg.chatModel || cfg.model,
    messages,
    temperature: 0.6, // 对话需要一定表达多样性，温度略高于识别任务
    stream: Boolean(stream)
  }
  if (Array.isArray(tools) && tools.length) {
    body.tools = tools
    // 由模型自主决定是否调用工具；不调用则直接作答
    body.tool_choice = 'auto'
  }
  return body
}

/**
 * 归一化模型返回的 tool_calls
 * ------------------------------------------------------------------
 * 兼容两种写法：arguments 为 JSON 字符串（标准）或已解析对象（少数厂商）。
 * 缺少 id 时补一个确定性 id，保证 assistant / tool 消息能正确配对。
 * @param {any} list 模型返回的 message.tool_calls
 */
export function normalizeToolCalls(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((call, i) => {
      const fn = call?.function || {}
      const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {})
      return {
        id: typeof call?.id === 'string' && call.id ? call.id : `call_${i}`,
        type: 'function',
        function: { name: String(fn.name || ''), arguments: args || '{}' }
      }
    })
    .filter((c) => c.function.name)
}

/** 归一化模型返回的 content（兼容「字符串」与「多段文本数组」两种写法） */
export function normalizeChatContent(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('').trim()
  }
  return ''
}

/** 把长文本切成小块（Mock 流式演示用，让逐字输出效果与真实模型一致） */
export function chunkText(text, size = 6) {
  const chars = [...String(text || '')]
  const out = []
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(''))
  return out
}

/**
 * 非流式对话调用（对外主入口之一）
 * @param {object[]} messages
 * @param {object} cfg
 * @param {{signal?: AbortSignal, tools?: object[]}} [options]
 * @returns {Promise<{ok: boolean, data?: {reply: string, toolCalls: object[]}, error?: object, meta: object}>}
 */
export async function callChatModel(messages, cfg, options = {}) {
  const startedAt = Date.now()
  const tools = Array.isArray(options.tools) ? options.tools : []

  /* ---- Mock 短路：与视觉入口同一策略 ---- */
  if (cfg.mock || !cfg.apiKey) {
    const reply = await mockChatReply(lastUserText(messages), { delay: 300 })
    return {
      ok: true,
      data: { reply, toolCalls: [] },
      meta: {
        mode: 'mock',
        model: cfg.chatModel || cfg.model,
        attempts: 1,
        elapsedMs: Date.now() - startedAt,
        notice: cfg.mock ? '已在服务端开启 Mock 模式（AI_MOCK=1）' : '未检测到 AI_API_KEY，已自动降级为 Mock 响应'
      }
    }
  }

  const url = `${cfg.apiBase}/chat/completions`
  const body = buildChatRequestBody(messages, cfg, false, tools)
  const maxAttempts = cfg.maxRetry + 1
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await requestOnce(url, cfg, body, options.signal)
    if (result.ok) {
      const message = result.message || {}
      return {
        ok: true,
        data: {
          reply: normalizeChatContent(message.content),
          toolCalls: normalizeToolCalls(message.tool_calls)
        },
        meta: {
          mode: 'cloud',
          model: cfg.chatModel || cfg.model,
          attempts: attempt,
          elapsedMs: Date.now() - startedAt,
          usage: result.usage || null,
          toolsUsed: tools.length
        }
      }
    }
    lastError = result.error
    if (!(result.error.retryable && attempt < maxAttempts)) break
    await sleep(800 * 2 ** (attempt - 1))
  }

  return {
    ok: false,
    error: lastError,
    meta: { mode: 'cloud', model: cfg.chatModel || cfg.model, attempts: maxAttempts, elapsedMs: Date.now() - startedAt }
  }
}

/**
 * 流式对话调用（SSE）
 * ------------------------------------------------------------------
 * 与 callChatModel 的差别：
 *   · 超时采用**空闲超时**（每收到一个数据块重置计时），避免长回答被整体超时切断；
 *   · 每解析到一个增量就回调 onDelta(text)，由调用方（HTTP 层）实时转发给浏览器；
 *   · 若中途断开但已收到部分内容，则返回 ok:true + meta.truncated，不丢弃已展示的内容。
 * @param {object[]} messages
 * @param {object} cfg
 * @param {{onDelta?: (text: string) => void, signal?: AbortSignal, tools?: object[]}} [options]
 * @returns {Promise<{ok: boolean, data?: {reply: string, toolCalls: object[]}, error?: object, meta: object}>}
 */
export async function streamChatModel(messages, cfg, options = {}) {
  const startedAt = Date.now()
  const onDelta = typeof options.onDelta === 'function' ? options.onDelta : () => {}
  const modelName = cfg.chatModel || cfg.model
  const tools = Array.isArray(options.tools) ? options.tools : []

  /* ---- Mock 分支：逐块推送，模拟真实流式观感（断网也能演示流式） ---- */
  if (cfg.mock || !cfg.apiKey) {
    const reply = await mockChatReply(lastUserText(messages), { delay: 250 })
    for (const piece of chunkText(reply, 6)) {
      if (options.signal?.aborted) break
      await sleep(24)
      onDelta(piece)
    }
    return {
      ok: true,
      data: { reply, toolCalls: [] },
      meta: {
        mode: 'mock',
        model: modelName,
        attempts: 1,
        elapsedMs: Date.now() - startedAt,
        streamed: true,
        notice: cfg.mock ? '已在服务端开启 Mock 模式（AI_MOCK=1）' : '未检测到 AI_API_KEY，已自动降级为 Mock 流式响应'
      }
    }
  }

  const url = `${cfg.apiBase}/chat/completions`
  const body = buildChatRequestBody(messages, cfg, true, tools)
  const controller = new AbortController()
  const idleMs = cfg.chatIdleMs || 20000
  let idleTimer = null
  let reply = ''
  let usage = null
  /** 工具调用增量：按 index 累加（流式协议会把一个 tool_call 拆成多个分片） */
  const toolCallSlots = []

  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(), idleMs)
  }
  const onParentAbort = () => controller.abort()
  if (options.signal) options.signal.addEventListener('abort', onParentAbort, { once: true })

  /** 解析并消费 SSE 缓冲区，返回尚未成帧的剩余文本 */
  const consumeFrames = (text) => {
    const frames = String(text).replace(/\r\n/g, '\n').split('\n\n')
    const rest = frames.pop() ?? ''
    frames.forEach((frame) => {
      frame.split('\n').forEach((line) => {
        if (!line.startsWith('data:')) return
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') return
        let json = null
        try {
          json = JSON.parse(payload)
        } catch {
          return
        }
        const delta = json?.choices?.[0]?.delta?.content
        if (delta) {
          reply += delta
          onDelta(delta)
        }
        // 工具调用增量：同一 index 的 name / arguments 需要分片拼接
        const toolDeltas = json?.choices?.[0]?.delta?.tool_calls
        if (Array.isArray(toolDeltas)) {
          toolDeltas.forEach((part) => {
            const idx = Number.isInteger(part?.index) ? part.index : toolCallSlots.length
            if (!toolCallSlots[idx]) {
              toolCallSlots[idx] = { id: '', type: 'function', function: { name: '', arguments: '' } }
            }
            const slot = toolCallSlots[idx]
            if (part?.id) slot.id = part.id
            if (part?.function?.name) slot.function.name += part.function.name
            if (part?.function?.arguments) slot.function.arguments += part.function.arguments
          })
        }
        if (json?.usage) usage = json.usage
      })
    })
    return rest
  }

  try {
    resetIdle()
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: mapError(res.status, text), meta: { mode: 'cloud', model: modelName, attempts: 1, elapsedMs: Date.now() - startedAt } }
    }
    if (!res.body) {
      // 少数网关不返回流式响应体：交给上层改用非流式接口
      return {
        ok: false,
        error: { code: 'NO_STREAM', status: null, message: '模型未返回流式响应体，请改用非流式模式', retryable: false },
        meta: { mode: 'cloud', model: modelName, attempts: 1, elapsedMs: Date.now() - startedAt, streamFallback: true }
      }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      resetIdle()
      buffer += decoder.decode(value, { stream: true })
      buffer = consumeFrames(buffer)
    }
    if (buffer.trim()) consumeFrames(buffer + '\n\n')

    return {
      ok: true,
      data: { reply: reply.trim(), toolCalls: normalizeToolCalls(toolCallSlots) },
      meta: { mode: 'cloud', model: modelName, attempts: 1, elapsedMs: Date.now() - startedAt, usage, streamed: true }
    }
  } catch (err) {
    const code = err?.name === 'AbortError' ? 'ABORT_ERR' : err?.cause?.code || err?.code || 'UNKNOWN'
    const toolCalls = normalizeToolCalls(toolCallSlots)
    // 已收到部分内容时不丢弃，标记截断并如实提示
    if (reply.trim() || toolCalls.length) {
      return {
        ok: true,
        data: { reply: reply.trim(), toolCalls },
        meta: { mode: 'cloud', model: modelName, attempts: 1, elapsedMs: Date.now() - startedAt, usage, streamed: true, truncated: true, notice: `流式响应中断（${code}），以上为已接收到的内容` }
      }
    }
    return { ok: false, error: mapError(null, err?.message || String(err), code), meta: { mode: 'cloud', model: modelName, attempts: 1, elapsedMs: Date.now() - startedAt } }
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    if (options.signal) options.signal.removeEventListener('abort', onParentAbort)
  }
}

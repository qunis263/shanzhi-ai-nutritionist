/**
 * 请求入参校验与标准化（服务端）
 * ------------------------------------------------------------------
 * 抽成独立模块的原因：既要被 HTTP 服务使用，也要能被自校验脚本（selftest.js）直接调用，
 * 避免「校验逻辑只能通过起服务才能测」的尴尬。
 */
import { normalizeToolCalls } from './modelClient.js'

/**
 * 校验并标准化识别请求入参
 * @param {any} raw 客户端原始请求体
 * @param {object} cfg 运行配置（用到 maxImageBytes）
 * @returns {{ok: true, data: {image: string, hint: string, clues: string[]}} | {ok: false, status: number, error: string}}
 */
export function normalizeRecognitionInput(raw, cfg) {
  const image = typeof raw?.image === 'string' ? raw.image.trim() : ''
  const hint = typeof raw?.hint === 'string' ? raw.hint.trim().slice(0, 100) : ''
  const clues = Array.isArray(raw?.clues)
    ? raw.clues.map((c) => String(c).trim()).filter(Boolean).slice(0, 8)
    : []

  // 只接受 dataURL 或 http(s) 地址，防止把文件路径等奇怪内容透传给模型
  if (image && !/^data:image\/[a-zA-Z+]+;base64,/.test(image) && !/^https?:\/\//.test(image)) {
    return { ok: false, status: 400, error: '图片格式不受支持：应为 data:image/...;base64,... 或 http(s) 图片地址' }
  }
  if (image && Buffer.byteLength(image) > cfg.maxImageBytes) {
    return { ok: false, status: 413, error: `图片体积超出上限（${Math.round(cfg.maxImageBytes / 1024 / 1024)}MB），请压缩后重试` }
  }
  // 三类依据至少要有一个，否则模型无从判断
  if (!image && !hint && !clues.length) {
    return { ok: false, status: 400, error: '缺少识别依据：请至少提供图片、补充线索或文件名关键词之一' }
  }

  return { ok: true, data: { image, hint, clues } }
}

/**
 * 校验并标准化对话请求入参（/api/chat）
 * ------------------------------------------------------------------
 * 规则：
 *   · messages 必须为非空数组；每条需有合法 role
 *   · role 接受 system / user / assistant / tool
 *     - system / user：必须有非空 content
 *     - assistant：content 可为空，但必须带 tool_calls（AI Agent 的「请求调用工具」消息）
 *     - tool：必须有 tool_call_id 与 content（工具执行结果回填）
 *   · 至少包含一条 user 消息（否则模型无从回答）
 *   · 单条内容截断至 chatMaxChars；非 system 的对话轮数只保留最后 chatMaxTurns 条，
 *     避免长会话把 token 撑爆
 * @param {any} raw 客户端原始请求体
 * @param {object} cfg 运行配置
 * @returns {{ok: true, data: {messages: object[]}} | {ok: false, status: number, error: string}}
 */
export function normalizeChatInput(raw, cfg) {
  const list = Array.isArray(raw?.messages) ? raw.messages : []
  if (!list.length) {
    return { ok: false, status: 400, error: '缺少 messages：请至少提供一条用户提问' }
  }

  const maxChars = cfg?.chatMaxChars || 2000
  const maxTurns = cfg?.chatMaxTurns || 12

  const messages = []
  list.forEach((item) => {
    const role = ['system', 'user', 'assistant', 'tool'].includes(item?.role) ? item.role : ''
    if (!role) return
    const content = typeof item?.content === 'string' ? item.content.trim() : ''

    // 工具执行结果：必须能通过 tool_call_id 与 assistant 的 tool_calls 配对
    if (role === 'tool') {
      const toolCallId = typeof item?.tool_call_id === 'string' ? item.tool_call_id.trim() : ''
      if (!toolCallId || !content) return
      // 工具结果可能是结构化数据，放宽到 2 倍上限
      messages.push({ role: 'tool', tool_call_id: toolCallId, content: content.slice(0, maxChars * 2) })
      return
    }

    const toolCalls = role === 'assistant' ? normalizeToolCalls(item?.tool_calls) : []
    // 既没有文本也没有工具调用 → 空消息，丢弃
    if (!content && !toolCalls.length) return
    const message = { role, content: content.slice(0, maxChars) }
    if (toolCalls.length) message.tool_calls = toolCalls
    messages.push(message)
  })

  if (!messages.some((m) => m.role === 'user')) {
    return { ok: false, status: 400, error: '缺少用户提问：messages 中至少需要一条 role=user 的消息' }
  }

  // system（个性化上下文）保留，仅对对话轮数做窗口裁剪
  const system = messages.filter((m) => m.role === 'system')
  const dialogue = messages.filter((m) => m.role !== 'system')
  let kept = dialogue.slice(-maxTurns)

  // 裁剪可能把 assistant.tool_calls 与配对的 tool 消息切开，导致上游报错；
  // 因此向前丢弃不完整的开头（孤立的 tool 消息 / 只有 tool_calls 没有结果）
  while (kept.length && (kept[0].role === 'tool' || (kept[0].role === 'assistant' && kept[0].tool_calls))) {
    kept = kept.slice(1)
  }

  return { ok: true, data: { messages: [...system, ...kept] } }
}

/**
 * 校验并标准化 AI Agent 工具声明（function calling）
 * ------------------------------------------------------------------
 * 只接受 { type:'function', function:{ name, description, parameters } } 结构，
 * 数量上限 20 个，避免恶意客户端塞入超大 schema。
 * @param {any} raw 客户端传入的 tools
 */
export function normalizeTools(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t) => t && t.type === 'function' && t.function && typeof t.function.name === 'string' && t.function.name.trim())
    .slice(0, 20)
    .map((t) => ({
      type: 'function',
      function: {
        name: t.function.name.trim().slice(0, 64),
        description: typeof t.function.description === 'string' ? t.function.description.slice(0, 500) : '',
        parameters:
          t.function.parameters && typeof t.function.parameters === 'object'
            ? t.function.parameters
            : { type: 'object', properties: {} }
      }
    }))
}

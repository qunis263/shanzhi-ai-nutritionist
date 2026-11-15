/**
 * AI 识别接口客户端（前端）
 * ------------------------------------------------------------------
 * 职责（对应需求「客户端封装与配置」「异常处理、超时重试、错误码映射」）：
 *   ① 配置读取：从 Vite 环境变量读取端点、超时、Mock 开关
 *   ② 超时控制：AbortController，超时主动中断，避免用户无限等待
 *   ③ 统一解析：无论成功/失败，都返回同一种结构 { ok, data, error, source, meta }
 *   ④ 错误映射：把 HTTP 状态码与浏览器网络错误翻译成中文提示
 *
 * 安全说明：本文件**不包含任何密钥**。密钥只存在于 Node 代理服务端，
 * 前端只与本地代理 /api/recognize 通信。
 */

import type {
  AIError,
  AIMeta,
  AIResponse,
  AISource,
  ChatPayload,
  ChatResponseData,
  RecognitionModelResult,
  RecognitionPayload,
  ToolCall
} from '@/types'

interface RequestOptions {
  signal?: AbortSignal
}

interface StreamOptions extends RequestOptions {
  onDelta?: (text: string) => void
}

interface HealthData {
  mode: 'cloud' | 'mock'
  model: string
  chatModel: string
  apiKeyReady: boolean
  notice: string
  [key: string]: unknown
}

interface ServerEnvelope<T> {
  ok?: boolean
  data?: T
  source?: AISource
  meta?: AIMeta
  notice?: string
  error?: Partial<AIError>
}

interface SSEFrame extends ServerEnvelope<Partial<ChatResponseData>> {
  delta?: string
  done?: boolean
}

function asEnvelope<T>(value: unknown): ServerEnvelope<T> {
  return value && typeof value === 'object' ? (value as ServerEnvelope<T>) : {}
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '')
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : ''
}

/* ===================================================================
 * 一、配置
 * =================================================================== */
/** 是否启用前端 Mock：开启后完全不发网络请求，断网也能演示 */
export function isMockMode() {
  return String(import.meta.env.VITE_AI_MOCK ?? '') === '1'
}

/** 识别接口地址（默认走 Vite 代理到本地 Node 服务，也可用 VITE_AI_ENDPOINT 直连） */
export function aiEndpoint() {
  return (import.meta.env.VITE_AI_ENDPOINT || '/api').replace(/\/+$/, '')
}

/** 前端超时（毫秒）：略大于服务端超时，保证服务端能先返回它自己的错误码 */
export function aiTimeout() {
  const raw = Number.parseInt(import.meta.env.VITE_AI_TIMEOUT_MS ?? '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : 25000
}

/* ===================================================================
 * 二、错误码 → 中文提示（前端侧兜底，服务端已映射过一轮）
 * =================================================================== */
const FRONTEND_ERROR_MAP: Record<string, string> = {
  HTTP_400: '请求参数有误，请检查图片格式或补充识别线索后重试',
  HTTP_401: '鉴权失败：服务端 API Key 缺失或无效，请检查 .env 配置',
  HTTP_403: '权限不足：API Key 未开通该模型权限或已过期',
  HTTP_404: '接口不存在：请确认代理服务已启动（npm run ai:server）',
  HTTP_413: '图片体积过大，请压缩后重试',
  HTTP_429: '调用频率超限或额度不足，请稍后重试',
  TIMEOUT: '等待模型响应超时，请检查网络后重试',
  NETWORK: '无法连接到本地 AI 代理服务，请先执行 npm run ai:server',
  ABORT: '识别已取消'
}

/** 把错误对象翻译成面向用户的中文提示 */
export function describeError(error?: Partial<AIError> | null): string {
  if (!error) return '未知错误'
  if (error.message) return error.message
  return FRONTEND_ERROR_MAP[error.code || ''] || '识别服务暂时不可用，已切换到本地引擎'
}

/* ===================================================================
 * 三、请求封装
 * =================================================================== */
/**
 * 调用代理接口（统一入参与出参）
 * @param {string} path 例如 '/recognize'
 * @param {object} payload 请求体
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<{ok: boolean, data?: object, source?: string, meta?: object, error?: object, elapsedMs: number}>}
 */
async function request<T>(
  path: string,
  payload: unknown,
  options: RequestOptions = {},
  method: 'GET' | 'POST' = 'POST'
): Promise<AIResponse<T>> {
  const url = `${aiEndpoint()}${path}`
  const controller = new AbortController()
  const timeout = aiTimeout()
  const timer = setTimeout(() => controller.abort(), timeout)

  // 允许调用方（如用户点击「取消」）联动中断
  const onOuterAbort = () => controller.abort()
  if (options.signal) options.signal.addEventListener('abort', onOuterAbort, { once: true })

  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(payload),
      signal: controller.signal,
      // 禁止浏览器缓存：健康检查结果必须反映代理的实时模式（云端 / Mock），
      // 否则配置了 Key 之后状态条仍可能显示旧的 Mock 缓存
      cache: 'no-store'
    })

    const text = await res.text()
    let body: ServerEnvelope<T> = {}
    try {
      body = text ? asEnvelope<T>(JSON.parse(text) as unknown) : {}
    } catch {
      body = {}
    }

    if (!res.ok || !body?.ok) {
      const serverError = body?.error
      return {
        ok: false,
        error: {
          code: serverError?.code || `HTTP_${res.status}`,
          status: res.status,
          message: serverError?.message || FRONTEND_ERROR_MAP[`HTTP_${res.status}`] || `请求失败（HTTP ${res.status}）`,
          detail: serverError?.detail || ''
        },
        elapsedMs: Date.now() - startedAt
      }
    }

    return { ok: true, data: body.data, source: body.source, meta: body.meta, elapsedMs: Date.now() - startedAt }
  } catch (err: unknown) {
    const isAbort = errorName(err) === 'AbortError'
    const isOuterAbort = Boolean(options.signal?.aborted)
    const code = isAbort ? (isOuterAbort ? 'ABORT' : 'TIMEOUT') : 'NETWORK'
    return {
      ok: false,
      error: { code, status: null, message: FRONTEND_ERROR_MAP[code], detail: errorMessage(err) },
      elapsedMs: Date.now() - startedAt
    }
  } finally {
    clearTimeout(timer)
    if (options.signal) options.signal.removeEventListener('abort', onOuterAbort)
  }
}

/**
 * 调用食物识别接口
 * @param {{image: string, hint: string, clues: string[]}} payload 已标准化的请求参数
 * @param {{signal?: AbortSignal}} [options]
 */
export function requestRecognition(
  payload: RecognitionPayload,
  options?: RequestOptions
): Promise<AIResponse<RecognitionModelResult>> {
  return request<RecognitionModelResult>('/recognize', payload, options)
}

/**
 * 健康检查：返回代理服务当前模式（cloud / mock）、模型名、密钥是否就绪
 * 失败时返回 { ok: false }，调用方据此决定是否提示「请先启动代理服务」
 */
export function checkHealth(options?: RequestOptions): Promise<AIResponse<HealthData>> {
  return request<HealthData>('/health', null, options, 'GET')
}

/* ===================================================================
 * 四、对话助手接口（/api/chat）
 * ------------------------------------------------------------------
 * 提供两种形态：
 *   · requestChat        —— 一次性返回完整回复（非流式）
 *   · requestChatStream  —— SSE 流式，逐块回调 onDelta，实现打字机效果
 * 二者共用 request() 的错误映射；流式另有「空闲超时 + 外部取消」两层保护。
 * =================================================================== */

/**
 * 非流式对话
 * @param {{messages: object[]}} payload
 * @param {{signal?: AbortSignal}} [options]
 */
export function requestChat(payload: ChatPayload, options?: RequestOptions): Promise<AIResponse<ChatResponseData>> {
  return request<ChatResponseData>('/chat', { ...payload, stream: false }, options)
}

/**
 * 流式对话（SSE）
 * ------------------------------------------------------------------
 * 返回值与 request() 保持同一种结构，便于上层统一处理：
 *   { ok, data:{reply}, source, meta, mode, error?, elapsedMs }
 *
 * 容错策略：
 *   ① 若服务端未按 SSE 返回（如少数网关），自动按普通 JSON 解析，退化为非流式；
 *   ② 若已收到部分内容但连接中断，返回 ok:true + truncated 标记，不丢弃已展示文字；
 *   ③ 支持外部 signal 联动取消（用户点击「停止生成」）。
 * @param {{messages: object[]}} payload
 * @param {{signal?: AbortSignal, onDelta?: (text: string) => void}} [options]
 */
export async function requestChatStream(
  payload: ChatPayload,
  options: StreamOptions = {}
): Promise<AIResponse<ChatResponseData>> {
  const url = `${aiEndpoint()}/chat`
  const controller = new AbortController()
  // 空闲超时（而非整体超时）：每收到一个数据块就重新计时。
  // Agent 工具调用会分多轮请求，单轮思考时间可能较长；
  // 用整体超时会把「模型正在思考/推理」误判为超时并中断，
  // 因此只要求连接持续有数据在流动即可。
  let timer: ReturnType<typeof setTimeout> | null = null
  const armTimer = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => controller.abort(), aiTimeout())
  }
  armTimer()

  const onOuterAbort = () => controller.abort()
  if (options.signal) options.signal.addEventListener('abort', onOuterAbort, { once: true })

  const onDelta = typeof options.onDelta === 'function' ? options.onDelta : () => {}
  const startedAt = Date.now()
  let reply = ''
  let source: AISource = 'cloud'
  let meta: AIMeta = {}
  let doneError: AIError | null = null
  /** AI Agent：模型本轮请求调用的工具（由服务端在 done 帧回传） */
  let toolCalls: ToolCall[] = []
  /** 服务端附加提示（如模型不支持工具调用时的自动降级） */
  let notice = ''

  /** 解析并消费 SSE 缓冲区，返回尚未成帧的剩余文本 */
  const consumeFrames = (text: string): string => {
    const frames = String(text).replace(/\r\n/g, '\n').split('\n\n')
    const rest = frames.pop() ?? ''
    frames.forEach(frame => {
      frame.split('\n').forEach(line => {
        if (!line.startsWith('data:')) return
        const chunk = line.slice(5).trim()
        if (!chunk) return
        let json: SSEFrame
        try {
          json = asEnvelope<Partial<ChatResponseData>>(JSON.parse(chunk) as unknown) as SSEFrame
        } catch {
          return
        }
        if (json.delta) {
          reply += json.delta
          onDelta(json.delta)
        }
        if (json.done) {
          if (json.source) source = json.source
          if (json.meta) meta = json.meta
          if (typeof json.notice === 'string' && json.notice) notice = json.notice
          // 完整文本以服务端的收尾帧为准，避免增量拼接误差
          if (typeof json.data?.reply === 'string' && json.data.reply) reply = json.data.reply
          // Agent：本轮模型请求调用的工具（前端负责执行）
          if (Array.isArray(json.data?.toolCalls)) toolCalls = json.data.toolCalls as ToolCall[]
          if (json.ok === false && json.error) {
            doneError = {
              code: json.error.code || 'MODEL_ERROR',
              status: json.error.status,
              message: json.error.message || '模型返回错误',
              detail: json.error.detail
            }
          }
        }
      })
    })
    return rest
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal
    })

    const contentType = res.headers.get('Content-Type') || ''
    const isStream = contentType.includes('text/event-stream')

    /* ---- 非 SSE 返回：按普通 JSON 处理（兼容不支持流式的服务端） ---- */
    if (!res.ok || !isStream) {
      const text = await res.text().catch(() => '')
      let body: ServerEnvelope<ChatResponseData> = {}
      try {
        body = text ? asEnvelope<ChatResponseData>(JSON.parse(text) as unknown) : {}
      } catch {
        body = {}
      }
      if (res.ok && body?.ok) {
        const full = body.data?.reply || ''
        if (full) onDelta(full)
        return {
          ok: true,
          data: { reply: full, toolCalls: Array.isArray(body.data?.toolCalls) ? body.data.toolCalls : [] },
          source: body.source,
          meta: body.meta,
          mode: 'nonstream',
          elapsedMs: Date.now() - startedAt
        }
      }
      const serverError = body?.error
      return {
        ok: false,
        error: {
          code: serverError?.code || `HTTP_${res.status}`,
          status: res.status,
          message:
            serverError?.message || FRONTEND_ERROR_MAP[`HTTP_${res.status}`] || `对话请求失败（HTTP ${res.status}）`,
          detail: serverError?.detail || ''
        },
        elapsedMs: Date.now() - startedAt
      }
    }

    /* ---- 浏览器不支持 ReadableStream 时，交由上层改用非流式 ---- */
    if (!res.body || typeof res.body.getReader !== 'function') {
      return {
        ok: false,
        error: {
          code: 'NO_STREAM_SUPPORT',
          status: null,
          message: '当前浏览器不支持流式读取，已切换为一次性返回',
          detail: ''
        },
        elapsedMs: Date.now() - startedAt
      }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      // 收到任意字节（含服务端心跳）即视为连接仍在流动，重新计时
      armTimer()
      buffer += decoder.decode(value, { stream: true })
      buffer = consumeFrames(buffer)
    }
    if (buffer.trim()) consumeFrames(`${buffer}\n\n`)

    if (doneError && !reply.trim() && !toolCalls.length) {
      return { ok: false, error: doneError, elapsedMs: Date.now() - startedAt }
    }
    return {
      ok: true,
      data: { reply: reply.trim(), toolCalls },
      source,
      meta,
      mode: 'stream',
      notice,
      elapsedMs: Date.now() - startedAt
    }
  } catch (err: unknown) {
    const isAbort = errorName(err) === 'AbortError'
    const isOuterAbort = Boolean(options.signal?.aborted)
    const code = isAbort ? (isOuterAbort ? 'ABORT' : 'TIMEOUT') : 'NETWORK'

    // 已收到部分内容时不丢弃，标记截断交由上层如实提示
    if (reply.trim() || toolCalls.length) {
      return {
        ok: true,
        data: { reply: reply.trim(), toolCalls },
        source,
        meta,
        mode: 'stream',
        truncated: true,
        notice,
        error: { code, status: null, message: FRONTEND_ERROR_MAP[code], detail: errorMessage(err) },
        elapsedMs: Date.now() - startedAt
      }
    }
    return {
      ok: false,
      error: { code, status: null, message: FRONTEND_ERROR_MAP[code], detail: errorMessage(err) },
      elapsedMs: Date.now() - startedAt
    }
  } finally {
    if (timer) clearTimeout(timer)
    if (options.signal) options.signal.removeEventListener('abort', onOuterAbort)
  }
}

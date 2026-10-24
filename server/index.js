/**
 * AI 模型代理服务（Node 原生 http 实现，零依赖）
 * ------------------------------------------------------------------
 * 存在的唯一理由：**保护 API Key**。
 * 如果前端直接调用模型厂商接口，密钥会被打包进浏览器产物、并被任何访客看到；
 * 因此由本服务在服务端持有密钥，前端只与本服务通信。
 *
 * 启动：npm run ai:server
 * 端口：AI_PROXY_PORT（默认 8787）
 *
 * 接口：
 *   GET  /api/health     健康检查（返回模式、模型名、密钥是否就绪）
 *   POST /api/recognize  食物识别代理（入参 { image, hint, clues }）
 *   OPTIONS *            跨域预检
 *
 * 运行前提：Node.js >= 18（依赖全局 fetch）
 */
import http from 'node:http'
import { loadDotEnv, readConfig } from './env.js'
import { callVisionModel, callChatModel, streamChatModel } from './modelClient.js'
import { normalizeRecognitionInput, normalizeChatInput, normalizeTools } from './validate.js'
import { MOCK_KEYWORDS, MOCK_CHAT_TOPICS } from './mock.js'
import { runSelfTest } from './selftest.js'

/* ---- 自校验模式：node server/index.js --self-test ---- */
if (process.argv.includes('--self-test')) {
  const passed = await runSelfTest()
  process.exit(passed ? 0 : 1)
}

const dotenv = loadDotEnv()
const config = readConfig()

/** 统一 CORS 响应头（开发期允许任意来源，便于前端 dev / preview 直连） */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
}

/** 发送 JSON 响应 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // API 响应一律不缓存：/api/health 的模式信息需要实时反映 .env 配置，
    // 浏览器启发式缓存会导致「已配置 Key 仍显示 Mock 模式」的假象
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

/**
 * 读取并解析请求体（带体积上限，防止超大图片打满内存）
 * @returns {Promise<{ok: boolean, data?: object, error?: string, status?: number}>}
 */
function readBody(req, limitBytes) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    let finished = false

    req.on('data', (chunk) => {
      if (finished) return
      size += chunk.length
      if (size > limitBytes) {
        finished = true
        resolve({ ok: false, status: 413, error: '图片体积超出上限，请压缩后重试（可通过 AI_MAX_IMAGE_BYTES 调整）' })
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      if (finished) return
      finished = true
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({ ok: false, status: 400, error: '请求体为空' })
      try {
        resolve({ ok: true, data: JSON.parse(text) })
      } catch {
        resolve({ ok: false, status: 400, error: '请求体不是合法 JSON' })
      }
    })

    req.on('error', () => {
      if (finished) return
      finished = true
      resolve({ ok: false, status: 400, error: '读取请求体失败' })
    })
  })
}

/* 入参校验与标准化逻辑已抽到 ./validate.js，便于被自校验脚本直接测试 */

/* ===================================================================
 * 路由处理
 * =================================================================== */
async function handleHealth(res) {
  const keyReady = Boolean(config.apiKey)
  const mockMode = config.mock || !keyReady
  sendJson(res, 200, {
    ok: true,
    service: 'ai-nutrition-proxy',
    mode: mockMode ? 'mock' : 'cloud',
    model: config.model,
    chatModel: config.chatModel,
    apiBase: config.apiBase,
    apiKeyReady: keyReady,
    timeoutMs: config.timeoutMs,
    chatIdleMs: config.chatIdleMs,
    maxRetry: config.maxRetry,
    features: ['recognize', 'chat', 'chatStream', 'agent'],
    agent: { enabled: config.agentEnabled, maxRounds: config.agentMaxRounds },
    mockKeywords: mockMode ? MOCK_KEYWORDS : [],
    mockChatTopics: mockMode ? MOCK_CHAT_TOPICS : [],
    notice: config.mock
      ? '服务端已开启 AI_MOCK=1，当前为确定性 Mock 模式'
      : keyReady
        ? '已配置 API Key，将调用真实模型（失败时前端会自动回退本地引擎 / 本地知识库）'
        : '未配置 AI_API_KEY，自动降级为 Mock 模式；在 .env 中填写后即可调用真实模型'
  })
}

async function handleRecognize(req, res) {
  const parsed = await readBody(req, config.maxImageBytes + 1024)
  if (!parsed.ok) {
    return sendJson(res, parsed.status || 400, { ok: false, error: { code: `HTTP_${parsed.status || 400}`, message: parsed.error } })
  }

  const input = normalizeRecognitionInput(parsed.data, config)
  if (!input.ok) {
    return sendJson(res, input.status || 400, { ok: false, error: { code: `HTTP_${input.status || 400}`, message: input.error } })
  }

  const result = await callVisionModel(input.data, config)
  if (!result.ok) {
    return sendJson(res, 502, {
      ok: false,
      source: result.meta.mode,
      error: result.error,
      meta: result.meta
    })
  }

  console.log(
    `[aiProxy] 识别完成 mode=${result.meta.mode} model=${result.meta.model} ` +
      `attempts=${result.meta.attempts} 耗时=${result.meta.elapsedMs}ms 结果=${result.data.food || '（未识别）'}`
  )

  sendJson(res, 200, {
    ok: true,
    source: result.meta.mode,
    data: result.data,
    meta: result.meta
  })
}

/** SSE：安全地写入一个数据帧（客户端断开时忽略写入异常） */
function sseSend(res, payload) {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  } catch {
    /* 客户端已断开，忽略 */
  }
}

/**
 * 对话助手代理（/api/chat）
 * ------------------------------------------------------------------
 * 支持两种返回方式：
 *   · stream !== false（默认）→ SSE 流式，边生成边推送，前端实时渲染
 *   · stream === false        → 一次性返回完整回复（兼容不支持流式的环境）
 *
 * AI Agent 支持：请求体可携带 tools（function calling schema），代理原样透传给模型；
 * 模型若返回 tool_calls，会随响应体 / done 帧一并回传，由**前端执行工具**后再发起下一轮。
 * 若模型不支持 tools 而返回 400，自动去掉 tools 再重试一次，保证对话不中断。
 */
async function handleChat(req, res, payload) {
  const input = normalizeChatInput(payload, config)
  if (!input.ok) {
    return sendJson(res, input.status || 400, { ok: false, error: { code: `HTTP_${input.status || 400}`, message: input.error } })
  }

  const tools = config.agentEnabled ? normalizeTools(payload?.tools) : []
  const wantStream = payload?.stream !== false

  /* ---------- 非流式：一次性返回 ---------- */
  if (!wantStream) {
    let result = await callChatModel(input.data.messages, config, { tools })
    let toolsDropped = false
    if (!result.ok && tools.length && result.error?.status === 400) {
      toolsDropped = true
      console.warn('[aiProxy] 模型拒绝了 tools 参数，已去掉工具声明重试一次')
      result = await callChatModel(input.data.messages, config)
    }
    if (!result.ok) {
      return sendJson(res, 502, { ok: false, source: result.meta.mode, error: result.error, meta: result.meta })
    }
    console.log(
      `[aiProxy] 对话完成（非流式）mode=${result.meta.mode} model=${result.meta.model} ` +
        `工具调用=${result.data.toolCalls?.length || 0} 耗时=${result.meta.elapsedMs}ms`
    )
    return sendJson(res, 200, {
      ok: true,
      source: result.meta.mode,
      data: result.data,
      meta: { ...result.meta, toolsDropped }
    })
  }

  /* ---------- 流式（SSE） ---------- */
  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // 关闭反向代理的响应缓冲，保证分片能实时到达浏览器
    'X-Accel-Buffering': 'no'
  })

  const controller = new AbortController()
  // 客户端断开时立即中断上游请求，避免无谓消耗模型额度
  res.on('close', () => controller.abort())

  // SSE 心跳：模型推理阶段可能长时间不产出文本分片，
  // 心跳可让浏览器侧的空闲超时不被误触发（前端把收到任意字节都视为「仍在流动」）
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n')
  }, 8000)
  res.on('close', () => clearInterval(heartbeat))

  let chunks = 0
  const onDelta = (delta) => {
    chunks += 1
    if (!res.writableEnded) sseSend(res, { delta })
  }

  let result = await streamChatModel(input.data.messages, config, {
    signal: controller.signal,
    onDelta,
    tools
  })
  let toolsDropped = false

  // 部分模型 / 网关不支持 function calling，会直接返回 400：去掉 tools 重试一次
  if (!result.ok && tools.length && result.error?.status === 400) {
    toolsDropped = true
    console.warn('[aiProxy] 模型拒绝了 tools 参数，已去掉工具声明重试一次（流式）')
    if (!res.writableEnded) sseSend(res, { notice: '当前模型不支持工具调用，已自动降级为普通对话' })
    result = await streamChatModel(input.data.messages, config, {
      signal: controller.signal,
      onDelta
    })
  }

  if (result.ok) {
    if (!res.writableEnded) {
      sseSend(res, {
        done: true,
        source: result.meta.mode,
        data: result.data,
        meta: { ...result.meta, toolsDropped }
      })
    }
    console.log(
      `[aiProxy] 对话完成（流式）mode=${result.meta.mode} model=${result.meta.model} ` +
        `分片=${chunks} 工具调用=${result.data.toolCalls?.length || 0} 耗时=${result.meta.elapsedMs}ms`
    )
  } else if (!res.writableEnded) {
    // 失败同样以 SSE 帧告知，前端据此展示错误并回退本地知识库
    sseSend(res, { done: true, ok: false, error: result.error, meta: result.meta })
  }
  clearInterval(heartbeat)
  if (!res.writableEnded) res.end()
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS)
    return res.end()
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return handleHealth(res)
  }

  if (req.method === 'POST' && url.pathname === '/api/recognize') {
    try {
      return await handleRecognize(req, res)
    } catch (err) {
      console.error('[aiProxy] 处理识别请求时发生未捕获异常：', err)
      return sendJson(res, 500, { ok: false, error: { code: 'PROXY_INTERNAL', message: '代理服务内部异常，请查看服务端日志' } })
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try {
      const parsed = await readBody(req, 256 * 1024) // 对话为纯文本，上限 256KB 足够
      if (!parsed.ok) {
        return sendJson(res, parsed.status || 400, { ok: false, error: { code: `HTTP_${parsed.status || 400}`, message: parsed.error } })
      }
      return await handleChat(req, res, parsed.data)
    } catch (err) {
      console.error('[aiProxy] 处理对话请求时发生未捕获异常：', err)
      // 流式响应可能已开始，此时无法再改状态码
      if (!res.headersSent) {
        return sendJson(res, 500, { ok: false, error: { code: 'PROXY_INTERNAL', message: '代理服务内部异常，请查看服务端日志' } })
      }
      return res.end()
    }
  }

  sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `未定义的接口：${req.method} ${url.pathname}` } })
})

server.listen(config.port, () => {
  const mode = config.mock || !config.apiKey ? 'Mock（确定性模拟）' : `真实模型 ${config.model}`
  console.log('──────────────────────────────────────────────')
  console.log('  AI 模型代理服务已启动')
  console.log(`  地址   : http://localhost:${config.port}`)
  console.log(`  模式   : ${mode}`)
  console.log(`  端点   : ${config.apiBase}/chat/completions`)
  console.log(`  模型   : 视觉 ${config.model} │ 对话 ${config.chatModel}`)
  console.log(`  超时   : ${config.timeoutMs}ms（对话空闲超时 ${config.chatIdleMs}ms）  重试上限: ${config.maxRetry} 次`)
  console.log(`  Agent  : ${config.agentEnabled ? `工具调用已启用（最多 ${config.agentMaxRounds} 轮，工具在前端执行）` : '已关闭（AI_AGENT=0）'}`)
  console.log(`  .env   : ${dotenv.loaded ? `${dotenv.file}（已加载 ${dotenv.count} 项）` : '未找到，使用默认配置'}`)
  console.log('──────────────────────────────────────────────')
  if (!config.apiKey) {
    console.log('  提示：在项目根目录创建 .env 并填写 AI_API_KEY 即可切换到真实模型。')
  }
})

// 优雅退出：避免答辩演示时 Ctrl+C 留下占用端口的僵尸进程
;['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    console.log(`\n[aiProxy] 收到 ${sig}，正在关闭服务…`)
    server.close(() => process.exit(0))
    // 兜底：2 秒内未关闭则强制退出
    setTimeout(() => process.exit(0), 2000)
  })
})

/**
 * AI 识别编排层（云端优先 + 本地兜底）
 * ------------------------------------------------------------------
 * 这一层是「真实模型接入」对页面的唯一入口，负责把三件事组装起来：
 *   ① 云端调用：请求 → Node 代理 → 智谱 GLM-4V（OpenAI 兼容端点）
 *   ② 结果翻译：模型输出 → 适配层 → 页面既有的识别结果结构
 *   ③ 降级兜底：云端不可用时静默回退到本地可解释规则引擎，并如实告知用户
 *
 * 为什么必须有兜底层？
 *   · 答辩现场网络不可控，模型服务也可能限流；有兜底才能保证演示不中断
 *   · 本地引擎能输出「判定依据 + 候选排名」这类可解释信息，与云端结果形成交叉验证
 *   · 因此本项目的能力矩阵是：云端负责「识别准」，本地负责「讲得清 + 永不掉线」
 */
import { recognizeFood } from '@/utils/recognition'
import { buildRequestPayload, parseModelResponse, toRecognitionResult } from '@/utils/visionAdapter'
import { requestRecognition, isMockMode, describeError, aiEndpoint, checkHealth } from '@/utils/aiClient'
import { mockVisionReply } from '../../server/mock.js'

/** 识别来源标识（页面据此展示来源徽标） */
export const AI_SOURCE = {
  CLOUD: 'cloud',
  MOCK: 'mock',
  LOCAL: 'local'
}

/** 各来源的展示信息 */
export const SOURCE_LABELS = {
  cloud: { emoji: '☁️', text: '云端大模型', tone: 'ok' },
  mock: { emoji: '🧪', text: 'Mock 演示模式', tone: 'warn' },
  local: { emoji: '🔬', text: '本地可解释引擎', tone: 'sub' }
}

/** 把本地引擎结果包装为「带降级提示」的返回 */
function withFallbackNotice(localResult, notice) {
  return {
    ...localResult,
    source: AI_SOURCE.LOCAL,
    notice,
    unmatchedName: ''
  }
}

/**
 * 带 AI 模型的识别入口（页面只需调用这一个函数）
 * @param {string} dataUrl 图片 dataURL（示例场景可能为空）
 * @param {string} fileName 文件名 / 示例关键词
 * @param {string} hint 用户补充线索
 * @param {{signal?: AbortSignal}} [options]
 * @returns {Promise<object>} 识别结果（结构兼容原 rankCandidates，另加 source / notice / unmatchedName）
 */
export async function recognizeWithAI(dataUrl, fileName = '', hint = '', options = {}) {
  /* ---- 0. 并行准备：标准入参 + 本地引擎结果（本地结果兼作兜底与可解释素材） ---- */
  const payload = buildRequestPayload(dataUrl, fileName, hint)
  const local = await recognizeFood(dataUrl, fileName, hint)

  /* ---- 1. 前端 Mock 模式：完全不发网络请求，断网也能演示完整链路 ---- */
  if (isMockMode()) {
    const clues = [...payload.clues, payload.hint].filter(Boolean)
    const parsed = parseModelResponse(await mockVisionReply(clues, { delay: 200 }))
    return toRecognitionResult(parsed, {
      source: AI_SOURCE.MOCK,
      meta: { mode: 'mock', model: '前端内置 Mock', notice: 'VITE_AI_MOCK=1，已跳过网络请求' },
      local
    })
  }

  /* ---- 2. 云端优先：调用本地代理，由代理携带密钥请求真实模型 ---- */
  const res = await requestRecognition(payload, { signal: options.signal })

  if (res.ok) {
    const parsed = parseModelResponse(res.data)
    // 模型明确表示「图里没有可辨认的食物」时，等同于识别失败，走本地兜底
    if (!parsed.food) {
      return withFallbackNotice(local, `☁️ 云端模型未识别出具体食物：${parsed.reason || '未给出说明'}，已回退本地可解释引擎`)
    }
    const result = toRecognitionResult(parsed, { source: res.source || AI_SOURCE.CLOUD, meta: res.meta || {}, local })
    if (result.unmatchedName) {
      result.notice = `☁️ 模型判定为「${result.unmatchedName}」，但本地食物库暂无该条目，已改用最接近的「${result.found.name}」展示营养参考，请确认后再记录`
    }
    return result
  }

  /* ---- 3. 降级兜底：云端失败时静默回退本地引擎，并如实告知失败原因 ---- */
  const reason = describeError(res.error)
  const code = res.error?.code ? `（错误码 ${res.error.code}）` : ''
  return withFallbackNotice(local, `☁️ 云端识别失败：${reason}${code}，已回退本地可解释引擎`)
}

/**
 * 探测 AI 服务状态（页面初始化时可调用，用于提示「请先启动代理服务」）
 * @returns {Promise<{ok: boolean, mode?: string, model?: string, notice?: string, error?: string}>}
 */
export async function probeAIService(options = {}) {
  if (isMockMode()) {
    return { ok: true, mode: 'mock', model: '前端内置 Mock', notice: 'VITE_AI_MOCK=1：当前为纯前端 Mock 模式，不依赖代理服务' }
  }
  const res = await checkProxyHealth(options)
  return res
}

/** 内部：健康检查（把代理返回结果翻译成对用户可读的状态说明） */
async function checkProxyHealth(options = {}) {
  const res = await checkHealth(options)
  if (!res.ok) {
    return {
      ok: false,
      error: `未连接到 AI 代理服务（${aiEndpoint()}）：请先执行 npm run ai:server 启动代理`,
      detail: describeError(res.error)
    }
  }
  return {
    ok: true,
    mode: res.data?.mode || 'mock',
    model: res.data?.model || '',
    // 对话助手使用的文本模型（健康检查接口一并返回，供对话页状态条展示）
    chatModel: res.data?.chatModel || '',
    notice: res.data?.notice || ''
  }
}

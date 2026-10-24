/**
 * 环境变量加载与配置读取（零依赖实现）
 * ------------------------------------------------------------------
 * 本文件不引入 dotenv，避免为了读一个 .env 而增加依赖。
 * 解析规则与常见 .env 语法一致：
 *   · 支持 # 注释行
 *   · 支持 KEY=VALUE、KEY="VALUE"、KEY='VALUE'
 *   · 已存在于进程环境中的变量优先（便于用命令行临时覆盖：AI_MOCK=1 npm run ai:server）
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 项目根目录（server/ 的上一级） */
 export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 解析 .env 文本为键值对
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvText(text) {
  const result = {}
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eq = trimmed.indexOf('=')
    if (eq < 0) return
    const key = trimmed.slice(0, eq).trim()
    if (!key) return
    let value = trimmed.slice(eq + 1).trim()
    // 去掉成对的引号
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  })
  return result
}

/** 把 .env 注入 process.env（不覆盖已存在的变量） */
export function loadDotEnv() {
  const file = path.join(PROJECT_ROOT, '.env')
  if (!existsSync(file)) return { loaded: false, file }
  const pairs = parseEnvText(readFileSync(file, 'utf8'))
  Object.entries(pairs).forEach(([key, value]) => {
    if (process.env[key] === undefined) process.env[key] = value
  })
  return { loaded: true, file, count: Object.keys(pairs).length }
}

/** 读取整数配置，非法值回落到默认值 */
function intEnv(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/**
 * 读取运行配置
 * ------------------------------------------------------------------
 * 所有密钥只在此处从服务端环境读取，**绝不下发给浏览器**。
 */
export function readConfig() {
  return {
    port: intEnv('AI_PROXY_PORT', 8787),
    // 智谱开放平台 OpenAI 兼容端点：/api/paas/v4（客户端再拼 /chat/completions）
    apiBase: (process.env.AI_API_BASE || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, ''),
    apiKey: process.env.AI_API_KEY || '',
    // glm-4v-flash 为轻量视觉模型，适合演示；可换成 glm-4v-plus / glm-4v
    model: process.env.AI_MODEL || 'glm-4v-flash',
    timeoutMs: intEnv('AI_TIMEOUT_MS', 20000),
    maxRetry: intEnv('AI_MAX_RETRY', 2),
    // 服务端 Mock：未配置 API Key 时自动开启，保证无网络也能演示
    mock: process.env.AI_MOCK === '1',
    // 单张图片最大体积（字节），默认 8MB
    maxImageBytes: intEnv('AI_MAX_IMAGE_BYTES', 8 * 1024 * 1024),

    /* ---- 对话助手（/api/chat）专用配置 ---- */
    // 对话用的**文本**大模型，与视觉模型分开配置（视觉模型 glm-4v 不擅长纯文本长对话）
    chatModel: process.env.AI_CHAT_MODEL || 'glm-4-flash',
    // 流式对话的**空闲超时**：每收到一个数据块就重置，避免长回答被整体超时切断
    chatIdleMs: intEnv('AI_CHAT_IDLE_MS', 20000),
    // 上下文轮数上限（超过则丢弃最早的对话，控制 token 消耗）
    chatMaxTurns: intEnv('AI_CHAT_MAX_TURNS', 12),
    // 单条消息最大字符数
    chatMaxChars: intEnv('AI_CHAT_MAX_CHARS', 2000),

    /* ---- AI Agent（工具调用）配置 ---- */
    // 前端会随对话请求下发 tools；置 0 可整体关闭工具调用（退化为普通问答）
    agentEnabled: process.env.AI_AGENT !== '0',
    // Agent 工具调用最多轮数（前端循环上限，防止模型无限要求调用工具）
    agentMaxRounds: intEnv('AI_AGENT_MAX_ROUNDS', 4)
  }
}

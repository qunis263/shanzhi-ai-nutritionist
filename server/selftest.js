/**
 * 服务端自校验脚本
 * ------------------------------------------------------------------
 * 运行：npm run ai:verify
 * 作用：在不联网、不起 HTTP 服务的前提下，验证接入链路的每个「纯函数环节」
 *       行为正确，覆盖需求中的「代码自校验」与「单元级功能验证」。
 *
 * 覆盖范围：
 *   ① 环境变量解析与配置读取
 *   ② 错误码映射（401 / 429 / 500 / 网络错误 / 未知错误）
 *   ③ 模型输出解析（纯 JSON / 代码块围栏 / 夹带文字 / 百分数置信度 / 空内容）
 *   ④ 请求体构造（OpenAI 兼容多模态格式）
 *   ⑤ Mock 响应的确定性与关键词命中
 *   ⑥ 入参校验（非法图片格式 / 超大图片 / 无任何识别依据）
 *   ⑦ 对话请求体构造（chat 专用模型 / 多轮 messages / 流式开关）
 *   ⑧ 对话内容归一化（字符串 / 多段数组 / 分块切分）
 *   ⑨ 对话入参校验（缺 messages / 缺 user / 非法 role / 截断与轮数裁剪）
 *   ⑩ 对话 Mock 与调用链路（非流式 + 流式分片一致性）
 *   ⑪ 未配置 Key 时的降级行为（短路 Mock，不发起无谓网络请求）
 *   ⑫ AI Agent：tools 透传 / tool_calls 解析 / tool 消息入参校验
 */
import { parseEnvText, readConfig } from './env.js'
import {
  mapError,
  extractStructuredContent,
  buildRequestBody,
  buildChatRequestBody,
  normalizeChatContent,
  normalizeToolCalls,
  chunkText,
  callChatModel,
  streamChatModel
} from './modelClient.js'
import { mockVisionReply, mockChatReply } from './mock.js'
import { normalizeRecognitionInput, normalizeChatInput, normalizeTools } from './validate.js'

/* ===================================================================
 * 极简断言框架
 * =================================================================== */
let passed = 0
let failed = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✅ ${name}`)
  } else {
    failed += 1
    failures.push(`${name}${detail ? ` —— ${detail}` : ''}`)
    console.log(`  ❌ ${name}${detail ? ` —— ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n【${title}】`)
}

/* ===================================================================
 * 各项校验
 * =================================================================== */
function testEnv() {
  section('① 环境变量解析')
  const pairs = parseEnvText([
    '# 注释行应被忽略',
    'AI_API_KEY=abc123',
    'AI_MODEL="glm-4v-flash"',
    "AI_PROXY_PORT='8787'",
    'MALFORMED_LINE',
    ''
  ].join('\n'))

  check('忽略注释行', !(' # 注释行应被忽略' in pairs))
  check('解析普通键值', pairs.AI_API_KEY === 'abc123')
  check('去除双引号', pairs.AI_MODEL === 'glm-4v-flash')
  check('去除单引号', pairs.AI_PROXY_PORT === '8787')
  check('忽略无等号的非法行', !('MALFORMED_LINE' in pairs))
  check('合法键数量正确（3 项）', Object.keys(pairs).length === 3, `实际 ${Object.keys(pairs).length} 项`)

  const cfg = readConfig()
  check('默认端口为 8787', cfg.port === 8787, `实际 ${cfg.port}`)
  check('默认模型为 glm-4v-flash', cfg.model === 'glm-4v-flash', `实际 ${cfg.model}`)
  check('默认超时 > 0', cfg.timeoutMs > 0, `实际 ${cfg.timeoutMs}`)
  check('apiBase 末尾无斜杠', !cfg.apiBase.endsWith('/'), `实际 ${cfg.apiBase}`)
}

function testErrorMap() {
  section('② 错误码映射')
  const e401 = mapError(401, 'invalid api key')
  check('401 可读中文提示', e401.message.includes('API Key'), e401.message)
  check('401 不可重试', e401.retryable === false)

  const e429 = mapError(429, 'rate limited')
  check('429 提示限流/额度', e429.message.includes('频率超限') || e429.message.includes('额度'), e429.message)
  // 429 限流不重试：立即重试只会加剧限流，由前端快速降级到本地知识库
  check('429 不自动重试（交由前端降级）', e429.retryable === false)

  const e500 = mapError(500, 'server error')
  check('500 可重试', e500.retryable === true)

  const eNet = mapError(null, 'connect ECONNREFUSED', 'ECONNREFUSED')
  check('网络错误有中文提示', eNet.message.includes('无法连接'), eNet.message)
  check('ECONNREFUSED 不可重试（重试无意义）', eNet.retryable === false)

  const eTimeout = mapError(null, 'aborted', 'ABORT_ERR')
  check('超时错误提示含超时说明', eTimeout.message.includes('超时'), eTimeout.message)

  const eUnknown = mapError(418, 'teapot')
  check('未知状态码有兜底提示', eUnknown.message.includes('未知错误'), eUnknown.message)
  check('保留原始 detail 便于排查', eUnknown.detail === 'teapot')
}

function testParser() {
  section('③ 模型输出解析')
  const pure = extractStructuredContent('{"food":"榴莲","confidence":0.97,"reason":"多刺","alternatives":["菠萝蜜"]}')
  check('纯 JSON 正常解析', pure.food === '榴莲' && pure.confidence === 0.97)
  check('候选数组解析', pure.alternatives[0] === '菠萝蜜')

  const fenced = extractStructuredContent('```json\n{"food":"蛋炒饭","confidence":0.9}\n```')
  check('代码块围栏可解析', fenced.food === '蛋炒饭', fenced.food)

  const messy = extractStructuredContent('识别结果是：{"food":"西兰花","confidence":0.8,"reason":"绿色花球"} 以上。')
  check('夹带说明文字可解析', messy.food === '西兰花', messy.food)

  const percent = extractStructuredContent('{"food":"三文鱼","confidence":95}')
  check('百分数置信度归一化到 0-1', percent.confidence === 0.95, String(percent.confidence))

  const over = extractStructuredContent('{"food":"苹果","confidence":1.5}')
  check('越界置信度被裁到 1', over.confidence === 1, String(over.confidence))

  const empty = extractStructuredContent('')
  check('空内容返回空结果', empty.food === '' && empty.confidence === 0)

  const broken = extractStructuredContent('{不是合法json')
  check('非法 JSON 不抛异常且有兜底', typeof broken.food === 'string', `food=${JSON.stringify(broken.food)}`)

  const noConfidence = extractStructuredContent('{"food":"牛奶"}')
  check('缺失字段补默认值', noConfidence.confidence === 0 && Array.isArray(noConfidence.alternatives))
}

function testRequestBody() {
  section('④ 请求体构造（OpenAI 兼容格式）')
  const cfg = { model: 'glm-4v-flash' }
  const body = buildRequestBody(
    { image: 'data:image/png;base64,AAAA', hint: '榴莲', clues: ['durian'] },
    cfg
  )

  check('model 字段正确', body.model === 'glm-4v-flash')
  check('system 提示词存在', body.messages[0].role === 'system' && body.messages[0].content.length > 50)
  check('user 消息角色正确', body.messages[1].role === 'user')
  check('包含 image_url 内容块', body.messages[1].content.some((c) => c.type === 'image_url'))
  check('图片以 dataURL 传入', body.messages[1].content[0].image_url.url.startsWith('data:image/png;base64,'))
  check('包含 text 内容块', body.messages[1].content.some((c) => c.type === 'text'))
  check('线索与 hint 出现在提示词中', body.messages[1].content[1].text.includes('榴莲') && body.messages[1].content[1].text.includes('durian'))
  check('温度取低值保证稳定', body.temperature <= 0.3)
  check('非流式', body.stream === false)

  const noImage = buildRequestBody({ image: '', hint: '蛋炒饭', clues: ['蛋炒饭'] }, cfg)
  check('无图片时不发送 image_url 块', !noImage.messages[1].content.some((c) => c.type === 'image_url'))
}

async function testMock() {
  section('⑤ Mock 响应确定性与命中')
  const a = await mockVisionReply(['榴莲'], { delay: 0 })
  const b = await mockVisionReply(['榴莲'], { delay: 0 })
  check('关键词命中榴莲', a.food === '榴莲', a.food)
  check('同输入结果确定（可复现）', JSON.stringify(a) === JSON.stringify(b))
  check('返回结构含四个字段', ['food', 'confidence', 'reason', 'alternatives'].every((k) => k in a))
  check('置信度在 0-1', a.confidence >= 0 && a.confidence <= 1)

  const viaHint = await mockVisionReply(['蛋炒饭'], { delay: 0 })
  check('关键词命中蛋炒饭', viaHint.food === '蛋炒饭', viaHint.food)

  const unknown = await mockVisionReply(['zzzz不存在'], { delay: 0 })
  check('未命中时返回空 food（不编造）', unknown.food === '', unknown.food)
}

function testValidate() {
  section('⑥ 入参校验')
  const cfgBase = { maxImageBytes: 8 * 1024 * 1024 }

  const ok = normalizeRecognitionInput({ image: 'data:image/png;base64,AAAA', hint: '榴莲' }, cfgBase)
  check('合法入参通过', ok.ok === true)
  check('线索数组被裁剪为最多 8 项', normalizeRecognitionInput({ clues: Array.from({ length: 20 }, (_, i) => `c${i}`), hint: 'x' }, cfgBase).data.clues.length === 8)

  const badFormat = normalizeRecognitionInput({ image: 'C:/Users/a.png' }, cfgBase)
  check('非 dataURL/URL 被拒（400）', badFormat.ok === false && badFormat.status === 400, JSON.stringify(badFormat))

  const huge = normalizeRecognitionInput({ image: `data:image/png;base64,${'A'.repeat(cfgBase.maxImageBytes + 10)}` }, cfgBase)
  check('超大图片被拒（413）', huge.ok === false && huge.status === 413, String(huge.status))

  const nothing = normalizeRecognitionInput({}, cfgBase)
  check('无任何识别依据被拒（400）', nothing.ok === false && nothing.status === 400)

  const onlyClue = normalizeRecognitionInput({ clues: ['榴莲'] }, cfgBase)
  check('仅有线索也可通过', onlyClue.ok === true)
}

function testChatRequestBody() {
  section('⑦ 对话请求体构造')
  const cfg = { chatModel: 'glm-4-flash', model: 'glm-4v-flash' }
  const messages = [
    { role: 'system', content: '你是一位专业营养师…' },
    { role: 'user', content: '我的 BMI 正常吗？' }
  ]

  const body = buildChatRequestBody(messages, cfg, false)
  check('使用对话专用模型（而非视觉模型）', body.model === 'glm-4-flash', body.model)
  check('chatModel 缺失时回退到 model', buildChatRequestBody(messages, { model: 'x' }, false).model === 'x')
  check('透传多轮 messages', body.messages.length === 2 && body.messages[0].role === 'system')
  check('非流式时 stream=false', body.stream === false)
  check('流式时 stream=true', buildChatRequestBody(messages, cfg, true).stream === true)
  check('对话温度高于识别温度', body.temperature > 0.3, String(body.temperature))
}

function testChatContent() {
  section('⑧ 对话内容归一化')
  check('字符串直接 trim', normalizeChatContent('  你好  ') === '你好')
  check('多段数组拼接', normalizeChatContent([{ text: '甲' }, '乙']) === '甲乙')
  check('null 返回空串', normalizeChatContent(null) === '')
  check('数字返回空串（不误转）', normalizeChatContent(123) === '')

  const chunks = chunkText('abcdefg', 3)
  check('分块数量正确', chunks.length === 3, chunks.join('|'))
  check('分块拼接可还原', chunks.join('') === 'abcdefg')
  check('空文本返回空数组', chunkText('').length === 0)
}

function testChatValidate() {
  section('⑨ 对话入参校验')
  const cfg = { chatMaxTurns: 4, chatMaxChars: 50 }

  const missing = normalizeChatInput({}, cfg)
  check('缺少 messages 被拒（400）', missing.ok === false && missing.status === 400)

  const noUser = normalizeChatInput({ messages: [{ role: 'system', content: 'x' }] }, cfg)
  check('缺少 user 消息被拒（400）', noUser.ok === false && noUser.status === 400)

  const badRole = normalizeChatInput({ messages: [{ role: 'hacker', content: 'x' }, { role: 'user', content: 'hi' }] }, cfg)
  check('非法 role 被过滤', badRole.ok === true && badRole.data.messages.length === 1)

  const ok = normalizeChatInput({ messages: [{ role: 'system', content: 'ctx' }, { role: 'user', content: '你好' }] }, cfg)
  check('合法入参通过', ok.ok === true && ok.data.messages.length === 2)

  const long = normalizeChatInput({ messages: [{ role: 'user', content: 'A'.repeat(200) }] }, cfg)
  check('超长内容被截断至 chatMaxChars', long.data.messages[0].content.length === 50, String(long.data.messages[0].content.length))

  const many = normalizeChatInput(
    { messages: [{ role: 'system', content: 'ctx' }, ...Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `m${i}` }))] },
    cfg
  )
  check('对话轮数被裁剪至 chatMaxTurns', many.data.messages.length === 5, String(many.data.messages.length))
  check('裁剪保留 system 与最新的消息', many.data.messages[1].content === 'm6', many.data.messages[1].content)
}

async function testChatMockAndCall() {
  section('⑩ 对话 Mock 与调用链路（Mock 配置）')
  const a = await mockChatReply('我的 BMI 正常吗', { delay: 0 })
  const b = await mockChatReply('我的 BMI 正常吗', { delay: 0 })
  check('Mock 对话命中预设话题', a.includes('BMI'), a.slice(0, 20))
  check('Mock 对话结果确定（可复现）', a === b)

  const unknown = await mockChatReply('qwertyuiop 无关提问', { delay: 0 })
  check('未命中时如实说明且不编造', unknown.includes('Mock 演示模式'))

  const cfg = { mock: true, apiKey: '', model: 'glm-4v-flash', chatModel: 'glm-4-flash' }
  const messages = [{ role: 'user', content: '减脂怎么吃' }]

  const res = await callChatModel(messages, cfg)
  check('无 Key 时 callChatModel 自动走 Mock', res.ok === true && res.meta.mode === 'mock', res.meta.mode)
  check('Mock 分支返回提示语', typeof res.meta.notice === 'string' && res.meta.notice.length > 0)
  check('返回可用的回复文本', typeof res.data.reply === 'string' && res.data.reply.length > 0)
  check('Mock 分支返回空 toolCalls 数组', Array.isArray(res.data.toolCalls) && res.data.toolCalls.length === 0)

  // 流式：逐块回调
  const deltas = []
  const sres = await streamChatModel(messages, cfg, { onDelta: (d) => deltas.push(d) })
  check('流式调用成功', sres.ok === true && sres.meta.streamed === true)
  check('流式分片数 > 1（真的在逐块推送）', deltas.length > 1, String(deltas.length))
  check('分片拼接等于完整回复', deltas.join('') === sres.data.reply)
  check('流式同样返回空 toolCalls 数组', Array.isArray(sres.data.toolCalls) && sres.data.toolCalls.length === 0)
}

async function testChatCallRealMode() {
  section('⑪ 对话链路未配置 Key 时的降级行为（模拟真实模式但无 Key）')
  // apiKey 为空 → 视为未配置，应短路到 Mock 而不是发起网络请求
  const cfg = { mock: false, apiKey: '', model: 'glm-4v-flash', chatModel: 'glm-4-flash', apiBase: 'https://invalid.example', maxRetry: 0 }
  const res = await callChatModel([{ role: 'user', content: '每天喝水多少合适' }], cfg)
  check('未配置 Key 时不发网络请求，直接 Mock', res.ok === true && res.meta.mode === 'mock')
  check('降级原因提示未配置 Key', res.meta.notice.includes('AI_API_KEY'), res.meta.notice)

  const sres = await streamChatModel([{ role: 'user', content: '外卖怎么点' }], cfg, { onDelta: () => {} })
  check('流式同样短路到 Mock', sres.ok === true && sres.meta.mode === 'mock')
}

async function testAgent() {
  section('⑫ AI Agent 工具调用')
  const cfg = { chatModel: 'glm-4-flash', model: 'glm-4v-flash' }
  const tools = [
    {
      type: 'function',
      function: {
        name: 'read_today_summary',
        description: '读取今日营养汇总',
        parameters: { type: 'object', properties: {} }
      }
    }
  ]

  /* ---- 请求体：tools 透传 ---- */
  const body = buildChatRequestBody([{ role: 'user', content: '我今天吃了多少' }], cfg, true, tools)
  check('tools 随请求体下发', Array.isArray(body.tools) && body.tools[0].function.name === 'read_today_summary')
  check('tool_choice 设为 auto（模型自主决定）', body.tool_choice === 'auto')
  check('未传 tools 时不出现该字段', !('tools' in buildChatRequestBody([{ role: 'user', content: 'hi' }], cfg, true)))

  /* ---- tool_calls 解析 ---- */
  const calls = normalizeToolCalls([
    { id: 'c1', type: 'function', function: { name: 'read_diet_history', arguments: '{"days":3}' } }
  ])
  check('tool_calls 保留 id 与 arguments', calls[0].id === 'c1' && calls[0].function.arguments === '{"days":3}')
  check('缺失 id 时自动补齐', normalizeToolCalls([{ function: { name: 'x', arguments: '{}' } }])[0].id === 'call_0')
  check('arguments 为对象时转成 JSON 字符串', normalizeToolCalls([{ function: { name: 'x', arguments: { days: 2 } } }])[0].function.arguments === '{"days":2}')
  check('无 name 的非法调用被过滤', normalizeToolCalls([{ function: {} }]).length === 0)

  /* ---- tools 入参校验 ---- */
  const sanitized = normalizeTools([
    { type: 'function', function: { name: 'a', description: 'd', parameters: { type: 'object' } } },
    { type: 'text', function: { name: 'b' } },
    { type: 'function', function: { name: '' } }
  ])
  check('只保留合法的 function 工具', sanitized.length === 1 && sanitized[0].function.name === 'a')
  check(
    '工具数量上限为 20',
    normalizeTools(Array.from({ length: 30 }, (_, i) => ({ type: 'function', function: { name: `t${i}` } }))).length === 20
  )
  check('非数组 tools 返回空数组', normalizeTools(null).length === 0)

  /* ---- 消息入参：tool 角色与 tool_calls ---- */
  const agentCfg = { chatMaxTurns: 20, chatMaxChars: 500 }
  const okAgent = normalizeChatInput(
    {
      messages: [
        { role: 'system', content: 'ctx' },
        { role: 'user', content: '昨天吃了什么' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_diet_history', arguments: '{"days":1}' } }]
        },
        { role: 'tool', tool_call_id: 'c1', content: '[{"日期":"2026-10-23"}]' }
      ]
    },
    agentCfg
  )
  check('assistant 空 content + tool_calls 被保留', okAgent.ok === true && okAgent.data.messages[2].tool_calls?.length === 1)
  check('tool 消息被保留并带 tool_call_id', okAgent.data.messages[3].role === 'tool' && okAgent.data.messages[3].tool_call_id === 'c1')

  const orphan = normalizeChatInput({ messages: [{ role: 'user', content: 'hi' }, { role: 'tool', content: 'x' }] }, agentCfg)
  check('缺少 tool_call_id 的 tool 消息被丢弃', orphan.ok === true && orphan.data.messages.length === 1)

  // 轮数裁剪不能把 assistant.tool_calls 与配对的 tool 消息切开
  const trimmed = normalizeChatInput(
    {
      messages: [
        { role: 'user', content: 'u0' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: 'ok' },
        { role: 'user', content: 'u1' }
      ]
    },
    { chatMaxTurns: 2, chatMaxChars: 500 }
  )
  check('裁剪后不会出现孤立的 tool 消息', trimmed.ok === true && trimmed.data.messages.every((m) => m.role !== 'tool'))
}

/* ===================================================================
 * 入口
 * =================================================================== */
export async function runSelfTest() {
  console.log('══════════════════════════════════════════════')
  console.log('  AI 接入自校验（不联网 / 不起服务）')
  console.log('══════════════════════════════════════════════')

  testEnv()
  testErrorMap()
  testParser()
  testRequestBody()
  await testMock()
  testValidate()
  testChatRequestBody()
  testChatContent()
  testChatValidate()
  await testChatMockAndCall()
  await testChatCallRealMode()
  await testAgent()

  console.log('\n══════════════════════════════════════════════')
  console.log(`  通过 ${passed} 项，失败 ${failed} 项`)
  if (failed) {
    console.log('  失败明细：')
    failures.forEach((f) => console.log(`   · ${f}`))
  } else {
    console.log('  🎉 全部通过：客户端封装、参数转换、响应解析、错误映射均符合预期')
  }
  console.log('══════════════════════════════════════════════')
  return failed === 0
}

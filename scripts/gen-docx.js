/**
 * 生成《膳知・AI 营养分析师》参赛技术文档（Word .docx 格式）
 * 用法：node scripts/gen-docx.js
 * 输出：docs/技术文档.docx
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, Header, Footer, PageBreak
} from 'docx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'docs', '技术文档.docx')

/** 跨平台 CJK 字体选择 */
const CJK_FONT = os.platform() === 'win32' ? 'Microsoft YaHei'
  : os.platform() === 'darwin' ? 'PingFang SC' : 'Noto Sans CJK SC'
const LATIN_FONT = 'Arial'

/** 常用字号（半磅单位，1pt = 2 half-pt） */
const SIZE = {
  H1: 36, H2: 28, H3: 24, BODY: 22, SMALL: 18, COVER_TITLE: 56, COVER_SUB: 32
}

/** 带 CJK 配置的 TextRun 快捷函数 */
function run(text, opts = {}) {
  return new TextRun({
    text: String(text),
    font: { ascii: LATIN_FONT, hAnsi: LATIN_FONT, eastAsia: CJK_FONT },
    size: SIZE.BODY,
    ...opts
  })
}

function boldRun(text, opts = {}) {
  return run(text, { bold: true, ...opts })
}

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [boldRun(text, { size: SIZE.H1 })],
    spacing: { before: 360, after: 180 },
    outlineLevel: 0
  })
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [boldRun(text, { size: SIZE.H2 })],
    spacing: { before: 280, after: 140 },
    outlineLevel: 1
  })
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [boldRun(text, { size: SIZE.H3 })],
    spacing: { before: 200, after: 100 },
    outlineLevel: 2
  })
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60, line: 360 },
    children: [run(text)],
    ...opts
  })
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 40, after: 40, line: 340 },
    children: [run(text)]
  })
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'numbers', level },
    spacing: { before: 40, after: 40, line: 340 },
    children: [run(text)]
  })
}

function blank() {
  return new Paragraph({ children: [] })
}

/** 表格边框样式 */
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const borders = { top: border, bottom: border, left: border, right: border }
const headerBorder = { style: BorderStyle.SINGLE, size: 1, color: '0F8F84' }
const headerBorders = { top: headerBorder, bottom: headerBorder, left: border, right: border }

/** 创建一个简单表格 */
function simpleTable(headers, rows, colWidths = null) {
  const widths = colWidths || headers.map(() => Math.floor(9026 / headers.length))

  const headerRow = new TableRow({
    cantSplit: true,
    children: headers.map((h, i) => new TableCell({
      borders: headerBorders,
      width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: 'E8F6F4', type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [boldRun(h, { size: SIZE.BODY })]
      })]
    }))
  })

  const dataRows = rows.map((r) => new TableRow({
    cantSplit: true,
    children: r.map((cell, i) => new TableCell({
      borders,
      width: { size: widths[i], type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        spacing: { before: 0, after: 0, line: 300 },
        children: [run(String(cell))]
      })]
    }))
  }))

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    rows: [headerRow, ...dataRows]
  })
}

/** 目录页（Word 里的目录需手动更新域，这里列出各章节标题供阅读） */
function tocParagraph(level, text, page) {
  const indent = level === 1 ? 0 : level === 2 ? 360 : 720
  return new Paragraph({
    indent: { left: indent },
    spacing: { before: 40, after: 40, line: 340 },
    children: [
      run(text, level === 1 ? { bold: true, size: SIZE.BODY } : { size: SIZE.SMALL }),
      run(`  ...................................................  ${page}`)
    ]
  })
}

/* ============================================================
 * 内容开始
 * ============================================================ */
const children = []

// ======== 封面 ========
children.push(blank())
children.push(blank())
children.push(blank())
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [boldRun('膳知・AI 营养分析师', { size: SIZE.COVER_TITLE, color: '0F8F84' })]
}))
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 120, after: 120 },
  children: [run('技术文档', { size: SIZE.COVER_SUB, color: '1D2430' })]
}))
children.push(blank())
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [run('Web 应用（AI + 健康生活服务）')]
}))
children.push(blank())
children.push(blank())
children.push(simpleTable(
  ['属性', '内容'],
  [
    ['作品类型', 'Web 应用（AI + 健康生活服务）'],
    ['技术栈', 'Vue 3 + Vite + TailwindCSS + ECharts + Pinia + Node.js'],
    ['AI 模型', '智谱 GLM-4V（视觉）+ GLM-5.3-Flash（对话）'],
    ['文档版本', 'v1.0'],
    ['编制日期', '2026-10']
  ],
  [2500, 6526]
))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 目录 ========
children.push(heading1('目  录'))
children.push(blank())
const tocItems = [
  [1, '一、项目概述', '1'],
  [2, '1.1 项目背景', '1'],
  [2, '1.2 项目定位', '1'],
  [2, '1.3 项目目标', '2'],
  [2, '1.4 术语说明', '2'],
  [1, '二、需求分析', '3'],
  [2, '2.1 功能需求矩阵', '3'],
  [2, '2.2 非功能需求', '4'],
  [2, '2.3 用户画像', '4'],
  [1, '三、系统架构设计', '5'],
  [2, '3.1 总体架构图', '5'],
  [2, '3.2 技术选型', '6'],
  [2, '3.3 目录结构', '7'],
  [2, '3.4 数据流转', '8'],
  [2, '3.5 状态判定模型', '8'],
  [1, '四、AI 技术方案', '9'],
  [2, '4.1 AI 技术选型理由', '9'],
  [2, '4.2 AI 集成方式', '10'],
  [2, '4.3 优化策略', '12'],
  [1, '五、核心功能实现', '14'],
  [1, '六、测试与部署', '16'],
  [1, '七、总结与展望', '18'],
  [1, '八、创新点', '19'],
  [1, '附录', '20']
]
tocItems.forEach(([level, text, page]) => children.push(tocParagraph(level, text, page)))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 一、项目概述 ========
children.push(heading1('一、项目概述'))

children.push(heading2('1.1 项目背景'))
children.push(para('随着中国居民膳食多样性提升和营养失衡问题加剧，「吃什么、吃多少、怎么搭配」已成为普通大众的日常困扰。现有营养管理产品普遍存在两个不足：一是记录门槛高（手动输入每顿饭菜重量难以坚持），二是 AI 能力薄弱（仅做通用问答，不结合用户身体数据和当日饮食）。'))

children.push(heading2('1.2 项目定位'))
children.push(para('「膳知・AI 营养分析师」是一款面向普通用户的个性化 AI 营养健康管理工具。通过 AI 视觉识别降低记录门槛，通过可解释的营养算法给出客观评价，通过 RAG + Agent 增强的大模型对话提供贴身建议，让用户用最自然的方式管理一日三餐。'))

children.push(heading2('1.3 项目目标'))
children.push(bullet('降低记录成本：拍照即知营养，无需手动查食物成分'))
children.push(bullet('提供可解释评价：每项超标/偏低都给出人话建议，不堆砌数字'))
children.push(bullet('打造个性化咨询：AI 对话助手能「看到」用户身体数据和饮食记录'))
children.push(bullet('保证稳定可用：云端 + Mock + 本地知识库三层降级，任何网络环境下功能不中断'))

children.push(heading2('1.4 术语说明'))
children.push(simpleTable(
  ['术语', '说明'],
  [
    ['RAG', 'Retrieval-Augmented Generation，检索增强生成'],
    ['Agent', 'AI Agent，具备工具调用能力的智能体'],
    ['SSE', 'Server-Sent Events，服务端推送事件，用于流式输出'],
    ['GLM-4V', '智谱 AI 的多模态（视觉 + 文本）大模型'],
    ['GLM-5.3-Flash', '智谱 AI 的轻量化纯文本对话模型'],
    ['BMI', 'Body Mass Index，身体质量指数'],
    ['BMR', 'Basal Metabolic Rate，基础代谢率'],
    ['TDEE', 'Total Daily Energy Expenditure，每日总能量消耗']
  ],
  [2500, 6526]
))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 二、需求分析 ========
children.push(heading1('二、需求分析'))

children.push(heading2('2.1 功能需求矩阵'))
children.push(simpleTable(
  ['模块', '功能', '优先级'],
  [
    ['用户系统', '登录 / 注册', 'P0'],
    ['首页总览', '简洁模式 + 专业模式', 'P0'],
    ['饮食记录', '分餐段记录、食物库搜索、自动营养累加、饮水记录、每日历史回看', 'P0'],
    ['AI 食物识别', '上传照片 → AI 识别 → 一键记录', 'P0'],
    ['AI 对话助手', '多轮对话、个性化上下文、RAG、Agent、SSE', 'P0'],
    ['身体测评', 'BMI / BMR / TDEE / 每日推荐热量', 'P0'],
    ['营养报告', '健康评分 + AI 评语 + 改进建议', 'P1'],
    ['膳食推荐', '基于营养缺口的食谱 + 运动方案', 'P1'],
    ['数据可视化', 'ECharts 图表 + 一周营养趋势', 'P1'],
    ['食物速查', '915 种食物营养成分检索', 'P2'],
    ['营养知识库', '科普文章 + 相克 + 习惯浏览', 'P2']
  ],
  [2000, 6026, 1000]
))

children.push(heading2('2.2 非功能需求'))
children.push(simpleTable(
  ['类别', '指标', '实现方式'],
  [
    ['响应速度', '首屏加载 ≤ 2s', '路由懒加载 + ECharts 按需引入 + Vite 构建'],
    ['可用性', '网络不佳时功能不中断', '云端大模型 → Mock → 本地知识库三层降级'],
    ['可移植性', '换电脑可运行', 'Node ≥ 18，无后端数据库，数据存 localStorage'],
    ['安全性', 'API Key 不暴露', '仅存在 Node 代理进程，前端零密钥'],
    ['响应式', 'PC + 移动端', '侧边栏抽屉 + 栅格自适应 + 断点 1024px'],
    ['可解释性', '每项评价有依据', '本地规则引擎 + RAG 参考资料展示']
  ],
  [1600, 2600, 4826]
))

children.push(heading2('2.3 用户画像'))
children.push(simpleTable(
  ['画像', '特征', '核心诉求'],
  [
    ['白领上班族', '午餐外卖多、时间紧张', '拍照快速记录，AI 给出当天建议'],
    ['健身人群', '有增肌/减脂目标', '精确蛋白碳水脂肪比例，对比目标值'],
    ['慢病管理', '高血压、糖尿病', '钠糖油等单项目精准监控与超标提醒'],
    ['健康意识觉醒者', '关注饮食但知识不足', '科普内容 + AI 咨询 + 简单易懂建议']
  ],
  [1800, 2800, 4426]
))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 三、系统架构设计 ========
children.push(heading1('三、系统架构设计'))

children.push(heading2('3.1 总体架构图'))
children.push(para('整体采用「前端 SPA + 轻量 Node 代理 + 云端大模型」三层结构：'))
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 120, after: 120 },
  children: [run('┌─────────────── 浏览器（Vue 3 SPA） ───────────────┐', { size: SIZE.SMALL })]
}))
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [run('11 个页面 · Pinia Store · 工具函数层 · 数据层', { size: SIZE.SMALL, color: '666666' })]
}))
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [boldRun('↓ /api/* （Vite 代理）', { size: SIZE.SMALL, color: '0F8F84' })]
}))
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [run('┌────── Node 代理服务（server/，零依赖） ──────┐', { size: SIZE.SMALL })]
}))
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [run('env.js · validate.js · modelClient.js · mock.js', { size: SIZE.SMALL, color: '666666' })]
}))
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [boldRun('↓ HTTPS + Bearer Token', { size: SIZE.SMALL, color: '0F8F84' })]
}))
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [run('智谱 AI 开放平台 · GLM-4V + GLM-5.3-Flash', { size: SIZE.SMALL })]
}))
children.push(blank())

children.push(heading2('3.2 技术选型'))
children.push(simpleTable(
  ['层级', '技术', '选型理由'],
  [
    ['前端框架', 'Vue 3', '组合式 API 利于 AI 交互状态管理'],
    ['构建工具', 'Vite 6', '开发启动快（HMR ms 级），生产构建产物小'],
    ['样式方案', 'TailwindCSS 3', '原子化类名，令牌体系改色零改动'],
    ['状态管理', 'Pinia 2', 'Vue 官方推荐，API 简洁'],
    ['图表库', 'ECharts 6.1', '功能完整，按需引入约 598KB'],
    ['路由', 'Vue Router 4', 'Hash 模式支持任意子目录静态托管，无需服务端路由回退；构建产物需通过 HTTP 服务访问'],
    ['后端代理', 'Node.js 原生 http', '零依赖，避免安全风险'],
    ['AI 模型', '智谱 GLM 系列', '国内厂商合规，OpenAI 兼容端点'],
    ['数据存储', 'localStorage', '纯前端演示，无需数据库']
  ],
  [1600, 2000, 5426]
))

children.push(heading2('3.3 目录结构'))
children.push(para('项目目录采用分层结构：'))
const dirTree = [
  ['ai-nutrition-analyst/', '项目根目录'],
  ['├── public/login.html', '登录页（独立原生 JS）'],
  ['├── server/', 'Node AI 代理（零依赖）'],
  ['│   ├── index.js', 'HTTP 路由 + 请求分发'],
  ['│   ├── env.js', '.env 解析与配置读取'],
  ['│   ├── modelClient.js', '云端模型调用'],
  ['│   ├── validate.js', '入参校验'],
  ['│   ├── mock.js', 'Mock 兜底数据'],
  ['│   └── selftest.js', '代理自检脚本（99 项）'],
  ['├── src/', '前端源码'],
  ['│   ├── views/', '11 个页面组件'],
  ['│   ├── components/', '公共组件（MacaronCard、Sidebar 等）'],
  ['│   ├── store/', 'Pinia Store（userStore、dietStore）'],
  ['│   ├── utils/', '业务逻辑层（nutrition、aiChat、aiTools 等）'],
  ['│   ├── data/', '静态数据（foods、knowledge、recipes）'],
  ['│   ├── router/', '路由配置（11 页 + 懒加载）'],
  ['│   └── styles/', '全局样式 + 令牌体系'],
  ['├── .env', 'AI 模型 API Key（不入库）'],
  ['└── docs/', '技术文档与接入说明']
]
dirTree.forEach(([line]) => children.push(new Paragraph({
  spacing: { before: 20, after: 20, line: 300 },
  children: [run(line, { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
})))

children.push(heading2('3.4 数据流转'))
children.push(new Paragraph({ children: [boldRun('用户操作（记录饮食 / 识别食物 / 发送对话）')] }))
children.push(new Paragraph({ children: [run('    ↓')] }))
children.push(new Paragraph({ children: [boldRun('Pinia Store')] }))
children.push(new Paragraph({ children: [run('    ↓ 本地消费：页面响应式更新（ProgressBar / StatusBadge）')] }))
children.push(new Paragraph({ children: [run('    ↓ AI 请求：Vite /api → Node 代理 → 云端大模型')] }))
children.push(new Paragraph({ children: [run('         ├── 成功：返回真实 AI 结果')] }))
children.push(new Paragraph({ children: [run('         ├── 超时/429/5xx：Mock 降级')] }))
children.push(new Paragraph({ children: [run('         └── Key 未配置：本地知识库 + 规则引擎兜底')] }))

children.push(heading2('3.5 状态判定模型'))
children.push(simpleTable(
  ['营养素', '类型', '达标', '偏少', '轻微超标', '严重超标'],
  [
    ['热量 / 碳水', 'range', '0.8–1.0x', '< 0.8x', '1.0–1.2x', '> 1.2x'],
    ['蛋白质 / 纤维 / 饮水', 'min', '≥ 0.8x', '< 0.8x', '—', '—'],
    ['脂肪 / 糖 / 钠', 'max', '≤ 1.0x', '—', '1.0–1.2x', '> 1.2x']
  ],
  [1800, 1200, 1200, 1200, 1213, 1213]
))
children.push(para('四级预警色彩：达标（薄荷绿 #3d8a70）/ 偏少（浅鹅黄 #a98a26）/ 轻微超标（暖橙 #b0652b）/ 严重超标（珊瑚红 #bd5252）'))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 四、AI 技术方案 ========
children.push(heading1('四、AI 技术方案'))

children.push(heading2('4.1 AI 技术选型理由'))
children.push(simpleTable(
  ['决策项', '选型', '理由'],
  [
    ['视觉模型', '智谱 GLM-4V-Flash', '轻量视觉模型，响应快（< 3s），适合食物识别'],
    ['对话模型', '智谱 GLM-5.3-Flash', '纯文本模型更经济；支持 tool calling；延迟低'],
    ['RAG 框架', '自研（2字滑窗 + 加权打分）', '避免引入 LangChain 重依赖；前端本地毫秒级响应'],
    ['Agent 框架', '自研 function calling 循环', '参考 Vercel AI SDK 模式；6 个工具覆盖查询 + 写入'],
    ['流式协议', 'SSE（text/event-stream）', '比 WebSocket 更简单，原生支持 getReader()'],
    ['降级架构', '三层（云端 → Mock → 本地）', '保证任何网络环境下功能不中断'],
    ['Key 管理', 'Node 代理持有', '前端直连会导致密钥泄露；代理模式 + localhost 监听']
  ],
  [2000, 2200, 4826]
))

children.push(heading2('4.2 AI 集成方式'))

children.push(heading3('4.2.1 食物识别链路'))
children.push(numbered('前端 uploadDataURL → visionAdapter 标准化参数'))
children.push(numbered('POST /api/recognize { image, hint, clues }'))
children.push(numbered('Node 代理：validate.js 校验 → modelClient.callVisionModel()'))
children.push(numbered('智谱 GLM-4V-Flash 返回食物名称、估算分量、营养成分、健康标签'))
children.push(numbered('前端 FOOD_DB 匹配 → 渲染结果 → 用户确认后 addRecord()'))

children.push(heading3('4.2.2 对话助手链路（含 Agent）'))
children.push(new Paragraph({ children: [boldRun('① 个性化上下文注入（aiChat.js buildContextText）')] }))
children.push(para('从 userStore 取 BMI/BMR/TDEE/推荐热量；从 dietStore 取今日营养合计/健康评分/已记录食物；拼成 system prompt。'))
children.push(new Paragraph({ children: [boldRun('② RAG 检索增强（tokenize + 加权打分）')] }))
children.push(para('本地 916 条知识库：中文 2/3 字滑窗 + 英文按词切分 → 科普 ×3 + 相克 ×2 + 习惯 ×1 → 召回 Top-4 注入 prompt，同时展示给用户核对。'))
children.push(new Paragraph({ children: [boldRun('③ Agent 工具调用（最多 4 轮）')] }))
children.push(para('模型返回 tool_calls → 前端执行 6 个工具（5 只读 + 1 写入）→ tool 消息回填 messages → 再次请求模型。add_diet_record 必须用户二次确认才落库。'))
children.push(new Paragraph({ children: [boldRun('④ SSE 流式输出（aiClient.js）')] }))
children.push(para('fetch + body.getReader() 增量解析 → data: 行 → JSON → 累加 delta.content / delta.tool_calls → 打字机效果 + 调用轨迹实时可见。'))

children.push(heading3('4.2.3 Agent 工具列表'))
children.push(simpleTable(
  ['工具名', '类型', '能力', '权限'],
  [
    ['read_today_summary', '查询', '今日营养合计 + 健康评分', '只读'],
    ['read_diet_history', '查询', '历史饮食记录', '只读'],
    ['read_user_profile', '查询', '身体数据档案', '只读'],
    ['search_food_nutrition', '查询', '食物库营养检索', '只读'],
    ['get_meal_plan', '查询', '获取推荐膳食方案', '只读'],
    ['add_diet_record', '写入', '添加饮食记录', '二次确认后落库']
  ],
  [2200, 1000, 2800, 1026]
))

children.push(heading2('4.3 优化策略'))
children.push(heading3('4.3.1 性能优化'))
children.push(bullet('首屏加载：路由级懒加载 + ECharts 按需引入 → 首屏 JS ~144KB（gzip 49KB）'))
children.push(bullet('RAG 检索：索引懒构建 + 纯前端打分排序 → 毫秒级响应，完全离线'))
children.push(bullet('流式对话：SSE + getReader() + 空闲超时重置 → 打字机流畅，长回答不截断'))
children.push(bullet('图片请求体：服务端 8MB 上限 + 前端压缩 → 避免超大图片拖慢识别'))

children.push(heading3('4.3.2 成本优化'))
children.push(bullet('视觉模型仅用于识别，对话用更经济的 Flash 版文本模型'))
children.push(bullet('RAG 在前端执行，只把 Top-N 召回注入 prompt，控制 token 消耗'))
children.push(bullet('Agent 最多 4 轮工具调用，防止无限循环消耗额度'))

children.push(heading3('4.3.3 稳定性优化'))
children.push(simpleTable(
  ['场景', '处理'],
  [
    ['云端超时（> 20s）', '自动降级 Mock → 本地知识库'],
    ['429 限流', '不重试，直接降级'],
    ['5xx 服务端错误', '指数退避重试 2 次后降级'],
    ['API Key 未配置', '启动即切换 Mock 模式，不报错'],
    ['断网', '自动切换本地知识库 + 规则引擎']
  ],
  [3500, 5526]
))

children.push(heading3('4.3.4 安全优化'))
children.push(bullet('API Key 仅存 Node 进程：.env 由 env.js 读取，从不打包进前端'))
children.push(bullet('写操作二次确认：Agent add_diet_record 必须用户点击确认'))
children.push(bullet('入参校验：validate.js 对图片格式、体积、文本长度严格校验'))
children.push(bullet('无数据库：纯前端 localStorage，不涉及 SQL 注入'))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 五、核心功能实现 ========
children.push(heading1('五、核心功能实现'))

children.push(heading2('5.1 首页总览（简洁 / 专业双模式）'))
children.push(boldRun('简洁模式（默认）：'))
children.push(para('只展示今日热量进度条、饮水进度条 + 一条优先提醒文案。文案规则（buildDailyBrief）：先正向夸奖（热量达标 > 蛋白达标 > 饮水达标 > 无超标），再只输出 1 条最高优先级超标建议，用人话表达。例如「🍬糖分偏高，大概率来自奶茶甜品，建议减少甜饮」。'))
children.push(boldRun('专业模式：'))
children.push(para('点击「查看详细营养」切换，展开 8 项 StatTile 指标卡 + 完整进度总览表（emoji + 名称 + 实际值/目标值 + 进度条 + 状态标签）。'))
children.push(boldRun('AI 营养评语上移：'))
children.push(para('放在简洁进度区下方、详细营养模块上方，让用户打开页面优先看到饮食结构的总结分析。'))

children.push(heading2('5.2 AI 食物识别'))
children.push(para('核心数据结构：'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('{ food: { id, name, emoji, nutrition }, grams, source, confidence, healthTags }', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))
children.push(para('识别历史用 sessionStorage 持久化（同标签页内切换路由不丢失），数据超过 1.2MB 时不保存预览图。'))

children.push(heading2('5.3 AI 营养对话助手'))
children.push(boldRun('个性化上下文注入（buildContextText）：'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('你正在与一位注册营养师对话。以下是关于我的信息：\n【身体数据】BMI 22.3（标准）| BMR 1450 kcal | TDEE 1895 kcal | 每日推荐摄入 1895 kcal\n【今日饮食】已记录 3 餐，健康评分 76（良好）\n【今日营养合计】热量 1832/1895 kcal | …', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))

children.push(boldRun('RAG 检索算法（tokenize + 加权打分）：'))
children.push(numbered('中文 2 字 + 3 字滑窗、英文按词切分 → query tokens'))
children.push(numbered('对 916 条知识条目计算 token overlap 得分'))
children.push(numbered('科普 ×3、食物相克 ×2、健康习惯 ×1'))
children.push(numbered('召回 Top-4 注入 prompt，并在 UI 中展示给用户核对'))

children.push(boldRun('Agent 工具调用（aiTools.js）：'))
children.push(para('定义 6 个 function（JSON Schema 格式），前端循环：解析 SSE 中的 tool_calls → 执行对应函数 → 把 tool 消息追加到 messages → 再次请求模型。最多 4 轮，每轮在 UI 中展示调用轨迹。add_diet_record 触发后弹出待确认卡片，用户点击确认才落库。'))

children.push(boldRun('SSE 流式解析（aiClient.js）：'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('const response = await fetch("/api/chat", body)\nconst reader = response.body.getReader()\nwhile (true) { const { done, value } = await reader.read(); if (done) break; // 解析 SSE data: 行 }', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))

children.push(heading2('5.4 健康评分模型'))
children.push(para('可解释加权算法（nutrition.js buildReport）：'))
children.push(simpleTable(
  ['营养素', '权重', '评分规则'],
  [
    ['热量', '25', '达标区间（0.8–1.0x）得满分，偏离按比例扣分'],
    ['蛋白质', '15', '≥ 0.8x 目标得满分，每低 10% 扣 10 分'],
    ['膳食纤维', '20', '每 1g 缺口扣 4 分，满分 25g'],
    ['脂肪', '10', '超目标每 10% 扣 5 分'],
    ['碳水', '10', '超目标每 10% 扣 3 分'],
    ['糖分', '10', '超目标每 10% 扣 4 分'],
    ['钠', '10', '超目标每 100mg 扣 2 分']
  ],
  [1600, 1200, 6226]
))
children.push(para('总分 0–100，映射为：优秀 ≥ 85 / 良好 70–84 / 及格 60–69 / 需改善 < 60'))

children.push(heading2('5.5 路由守卫'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('router.beforeEach(() => {\n  if (!isLoggedIn()) redirectToLogin() // 未登录 → 跳转独立 login.html\n  return true\n})', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))
children.push(para('登录态：勾选「记住我」→ localStorage；未勾选 → sessionStorage。与业务数据键完全隔离，退出登录不影响健康档案与饮食记录。'))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 六、测试与部署 ========
children.push(heading1('六、测试与部署'))

children.push(heading2('6.1 测试策略'))
children.push(simpleTable(
  ['测试类型', '方式', '覆盖'],
  [
    ['静态检查', 'ESLint + Prettier', 'npm run lint 全量扫描 src + server，0 error / 0 warning'],
    ['构建验证', 'Vite production build', '产物 ~3.8MB，chunk 拆分合理'],
    ['代理自检', 'Node 自检脚本', 'npm run ai:verify 99 项检查'],
    ['功能测试', '11 页完整走通', '登录 → 测评 → 记录 → 识别 → 对话 → 报告 → 推荐 → 速查'],
    ['边界验证', '无 Key / 断网 / 429', '三层降级均触发，功能不中断']
  ],
  [1800, 2600, 4626]
))

children.push(heading2('6.2 自检项示例（server/selftest.js）'))
const selfTests = [
  '✅ server/health 健康检查接口',
  '✅ server/env .env 解析',
  '✅ server/mock Mock 兜底数据完整性',
  '✅ modelClient.chat.parse 对话 JSON 解析',
  '✅ modelClient.chat.error 429 限流处理',
  '✅ modelClient.chat.timeout 超时处理',
  '✅ modelClient.chat.stream SSE 流式解析',
  '✅ validate.recognize 识别入参校验',
  '✅ aiChat.tokenize 中文滑窗 tokenization',
  '✅ aiTools.schema 6 个工具 JSON Schema',
  '✅ aiTools.execute 每个工具的实际执行',
  '✅ nutrition.bmi.boundary BMI 边界值',
  '✅ nutrition.status.severe > 1.2 严重超标判定',
  '✅ nutrition.low.min type=min 偏少判定',
  '...（共 99 项）'
]
selfTests.forEach((s) => children.push(new Paragraph({
  spacing: { before: 20, after: 20, line: 300 },
  children: [run(s, { size: SIZE.SMALL })]
})))

children.push(heading2('6.3 部署方式'))
children.push(boldRun('开发模式（推荐答辩演示）：'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('# 终端 1：AI 代理服务\nnpm run ai:server\n\n# 终端 2：前端开发服务\nnpm run dev\n# 浏览器访问 http://localhost:5173/', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))
children.push(boldRun('生产部署（dist + 独立代理）：'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('npm run build              # 生成 dist/\nnpm run ai:server &        # 后台启动代理\nnpx serve dist -p 4173     # 静态服务器托管 dist', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))

children.push(heading2('6.4 环境变量（.env）'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('# 必填：智谱 AI API Key\nAI_API_KEY=xxxxxxxx\n\n# 可选\nAI_MODEL=glm-4v-flash\nAI_CHAT_MODEL=glm-5.3-flash\nAI_PROXY_PORT=8787\nAI_AGENT=1', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))

children.push(heading2('6.5 依赖清单'))
children.push(simpleTable(
  ['依赖', '版本', '用途'],
  [
    ['vue', '^3.5.13', '前端框架'],
    ['vue-router', '^4.5.0', '路由'],
    ['pinia', '^2.2.8', '状态管理'],
    ['echarts', '^6.1.0', '图表'],
    ['vite', '^6.0.7', '构建'],
    ['tailwindcss', '^3.4.17', '样式'],
    ['@vitejs/plugin-vue', '^5.2.1', 'Vue 插件'],
    ['eslint', '^8.57.1', '代码检查'],
    ['prettier', '^3.9.10', '格式化']
  ],
  [2800, 1500, 4726]
))

children.push(heading2('6.6 运行环境要求'))
children.push(simpleTable(
  ['项目', '要求'],
  [
    ['Node.js', '≥ 18（依赖全局 fetch）'],
    ['浏览器', 'Chrome / Edge / Safari 最新版（支持 ES2022 + getReader）'],
    ['内存', '≥ 1GB'],
    ['网络', 'AI 功能需要能访问 https://open.bigmodel.cn']
  ],
  [2800, 6226]
))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 七、总结与展望 ========
children.push(heading1('七、总结与展望'))

children.push(heading2('7.1 已完成能力回顾'))
children.push(simpleTable(
  ['维度', '状态'],
  [
    ['核心 AI 能力', '✅ 视觉识别 + 多轮对话 + RAG + Agent 工具调用 + SSE 流式'],
    ['三层降级', '✅ 云端 → Mock → 本地知识库，保证答辩不断线'],
    ['可解释 AI', '✅ 每项评价有依据，RAG 召回条目展示给用户核对'],
    ['个性化', '✅ 身体数据 + 当日饮食自动注入上下文'],
    ['功能覆盖', '✅ 11 个页面，10 大功能模块完整可用'],
    ['工程质量', '✅ ESLint 0 错误 + 路由懒加载 + 健康检查 + 99 项自检'],
    ['安全', '✅ API Key 服务端持有 + 写操作二次确认 + 入参校验']
  ],
  [3500, 5526]
))

children.push(heading2('7.2 后续改进方向'))
children.push(simpleTable(
  ['优先级', '方向', '预期收益'],
  [
    ['P0', '图片压缩（上传前 canvas 压到 1024px）', '请求体从 MB 级降到 150KB 内'],
    ['P1', '算法单测（nutrition.js 20–30 条断言）', '回归 bug 预防'],
    ['P1', 'AI 代理简单鉴权 + 限流', '防止局域网内他人盗用代理'],
    ['P2', 'LocalStorage 写入失败 → toast 提示', '配额溢出时用户能感知'],
    ['P2', 'ECharts chunk 按需加载 + 延迟初始化', '首屏从 ~560KB 进一步优化'],
    ['P3', '图表 aria / 进度条 role="progressbar"', '无障碍访问支持'],
    ['P3', '数据导入导出（JSON）', '换设备或答辩时迁移更方便']
  ],
  [900, 3000, 5126]
))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 八、创新点 ========
children.push(heading1('八、创新点'))

children.push(heading2('8.1 技术创新点'))
children.push(simpleTable(
  ['#', '创新点', '说明', '对比现状'],
  [
    ['1', '可解释的 RAG 检索', '自研 tokenize + 加权打分，召回条目直接展示给用户核对', '多数 RAG 只返回答案，不公开检索依据'],
    ['2', '自研 Agent 工具调用', '手写 SSE 增量解析 + tool_calls 累加，无 LangChain 重依赖', '多数 Agent 依赖重量级框架'],
    ['3', '三层降级架构', '云端 → Mock → 本地知识库，任何网络下功能不中断', '多数 AI 功能强依赖网络'],
    ['4', '营养算法前后端同源', 'nutrition.js 纯前端实现，无需后端服务', '传统营养应用把算法放服务端'],
    ['5', '密钥与业务物理隔离', 'Key 仅在 Node 进程 process.env，前端零密钥', '前端直连大模型会导致密钥泄露']
  ],
  [500, 2200, 2600, 3726]
))

children.push(heading2('8.2 应用创新点'))
children.push(simpleTable(
  ['#', '创新点', '说明', '对比现状'],
  [
    ['1', '「先夸奖、再建议」文案规则', 'buildDailyBrief 正向反馈优先，只输出 1 条最高优先级建议', '多数超标提示堆砌多条，造成焦虑感'],
    ['2', '简洁 / 专业双视图首页', '默认简洁（热量 + 饮水 + 一条提醒），点击切换到专业（8 项指标）', '多数产品要么信息过载要么过于简单'],
    ['3', 'Agent 写入工具二次确认', 'add_diet_record 触发后弹出待确认卡片，用户点击才落库', '多数 Agent 调用写入工具直接执行'],
    ['4', '健康评分可解释加权模型', '0–100 分，7 项营养素各有权重，公式完全透明可复核', '多数 AI 健康评分不公开计算逻辑'],
    ['5', '轮换温柔营养短句', '首页空白区 6 秒轮换「慢慢吃七分饱」等治愈文案，不遮挡按钮', '多数产品首页压迫感强，缺少情感化设计']
  ],
  [500, 2200, 2600, 3726]
))

children.push(new Paragraph({ children: [new PageBreak()] }))

// ======== 附录 ========
children.push(heading1('附录'))

children.push(heading2('A. AI 接口说明'))
children.push(simpleTable(
  ['接口', '方法', '入参', '出参'],
  [
    ['/api/health', 'GET', '—', '{ ok, mode, model, apiKeyReady, features }'],
    ['/api/recognize', 'POST', '{ image, hint, clues }', '{ food, grams, confidence, nutrition, tags }'],
    ['/api/chat', 'POST', '{ messages, tools? }', 'text/event-stream SSE 流']
  ],
  [2200, 1000, 2500, 3326]
))

children.push(heading2('B. Store 数据结构'))
children.push(boldRun('userStore.metrics：'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('{ bmi, bmiGrade: { key, label, emoji, color, bg, advice, min, max }, bmr, tdee, dailyCalories, targets: { calories, protein, fat, carb, fiber, sugar, sodium, water } }', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))
children.push(boldRun('dietStore：'))
children.push(new Paragraph({
  spacing: { before: 40, after: 40, line: 300 },
  children: [run('{ records: [{ id, mealType, food, grams, nutrition }], summary, water, targets, report, progressList, history }', { font: { ascii: 'Consolas', hAnsi: 'Consolas', eastAsia: CJK_FONT }, size: SIZE.SMALL })]
}))

children.push(heading2('C. 知识库规模'))
children.push(simpleTable(
  ['数据源', '条目数', '用途'],
  [
    ['食物库', '915', '饮食记录、识别匹配、营养速查、Agent 检索'],
    ['科普文章', '40+', 'RAG 知识注入、知识库浏览'],
    ['食物相克', '30+', 'RAG 检索、知识库浏览'],
    ['健康习惯', '20+', 'RAG 检索、知识库浏览'],
    ['检索单元合计', '916+', 'RAG 语料总量']
  ],
  [2800, 1800, 4426]
))

children.push(heading2('D. 合规声明'))
children.push(bullet('本项目不包含模型训练流程，AI 能力来自调用云端成熟大模型 API'))
children.push(bullet('本项目不宣称训练准确率，可陈述的指标为：规则命中率、实测响应耗时'))
children.push(bullet('本地可解释引擎是规则引擎（非神经网络），定位为云端兜底与可解释性素材'))
children.push(bullet('用户数据全部存储在浏览器本地（localStorage），不上传任何服务器'))

/* ============================================================
 * 文档组装
 * ============================================================ */
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: { ascii: LATIN_FONT, hAnsi: LATIN_FONT, eastAsia: CJK_FONT },
          size: SIZE.BODY
        }
      }
    }
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      },
      {
        reference: 'numbers',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [run('膳知・AI 营养分析师 技术文档', { size: SIZE.SMALL, color: '888888' })]
        })]
      })
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            run('第 ', { size: SIZE.SMALL }),
            new TextRun({ children: [PageNumber.CURRENT], size: SIZE.SMALL, font: { ascii: LATIN_FONT, hAnsi: LATIN_FONT, eastAsia: CJK_FONT } }),
            run(' 页 / 共 ', { size: SIZE.SMALL }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: SIZE.SMALL, font: { ascii: LATIN_FONT, hAnsi: LATIN_FONT, eastAsia: CJK_FONT } }),
            run(' 页', { size: SIZE.SMALL })
          ]
        })]
      })
    },
    children
  }]
})

Packer.toBuffer(doc).then((buffer) => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, buffer)
  console.log(`✅ Word 文档已生成：${OUT}`)
  console.log(`   文件大小：${(buffer.length / 1024).toFixed(1)} KB`)
}).catch((err) => {
  console.error('❌ 生成失败：', err.message)
  process.exit(1)
})

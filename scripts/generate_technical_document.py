from __future__ import annotations

from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[1]
DOCX_PATH = ROOT / "docs" / "技术文档.docx"
MD_PATH = ROOT / "docs" / "技术文档.md"
PDF_PATH = ROOT / "output" / "pdf" / "膳知AI营养分析师技术文档.pdf"
TODAY = date(2026, 11, 15)


def P(text: str):
    return {"type": "p", "text": text}


def H(text: str):
    return {"type": "h", "text": text}


def B(*items: str):
    return {"type": "bullets", "items": list(items)}


def T(headers, rows, widths=None, caption=None):
    return {"type": "table", "headers": headers, "rows": rows, "widths": widths, "caption": caption}


def D(caption: str, layers):
    return {"type": "diagram", "caption": caption, "layers": layers}


def C(text: str):
    return {"type": "code", "text": text}


SECTIONS = [
    {
        "title": "一 项目概述",
        "blocks": [
            H("1.1 项目背景与定位"),
            P("膳知 AI 营养分析师面向高校学生与日常健康管理人群，解决饮食记录成本高、营养数据难理解、建议缺少个性化与 AI 服务不稳定等问题。系统以食物识别和饮食记录为数据入口，将身体档案、当日摄入、营养知识与可解释评分统一到一个闭环中，为用户提供可执行、可核对、可持续跟踪的营养建议。"),
            P("项目定位为学科竞赛演示型 Web 应用，而非医疗诊断系统。当前版本采用 Vue 3 单页应用加轻量 Node AI 代理，业务数据保存在浏览器本地；云端模型负责视觉理解与自然语言生成，本地规则和知识库负责营养计算、结果约束及断网兜底。"),
            H("1.2 建设目标"),
            B(
                "降低记录门槛：支持图片识别、搜索录入和对话式记录。",
                "提高解释能力：健康评分、营养缺口、RAG 来源和工具轨迹均可核对。",
                "形成干预闭环：从发现问题、模拟方案到 7 天打卡和结果复盘。",
                "保证演示稳定：云端模型、确定性 Mock、本地规则与知识库三级降级。",
                "保护模型密钥：密钥仅由 Node 代理读取，不进入前端构建产物。",
            ),
            H("1.3 当前项目规模"),
            T(
                ["指标", "当前状态", "证据口径"],
                [
                    ["业务页面", "14 个", "路由表中 14 个带 order 的业务路由"],
                    ["食物营养库", "915 条", "手工整理、种子扩充与组合推算后去重"],
                    ["RAG 检索单元", "943 个", "915 食物 + 6 科普 + 10 搭配辟谣 + 12 健康习惯"],
                    ["Agent 工具", "7 个", "6 个查询或模拟工具 + 1 个确认后写入工具"],
                    ["AI 固定评测", "50 条", "五类能力各 10 条，完整系统 50/50 通过"],
                    ["代理自检", "99 项", "不联网、不起服务的纯函数自检"],
                ],
                [0.22, 0.22, 0.56],
            ),
            H("1.4 适用边界"),
            P("系统输出仅用于营养学习和生活方式参考，不替代医生或注册营养师诊疗。项目没有训练自有神经网络，不宣称模型训练准确率；图像与文本能力来自第三方成熟大模型，评测结果仅代表固定测试集和当前评分规则。演示登录为纯前端账号体系，不应视为生产级身份认证。"),
        ],
    },
    {
        "title": "二 需求分析",
        "blocks": [
            H("2.1 用户与核心场景"),
            T(
                ["用户角色", "主要需求", "典型场景"],
                [
                    ["普通使用者", "快速知道吃了什么、营养是否均衡", "上传照片、记录三餐、查看当日报告"],
                    ["健身或控重人群", "结合身体指标获得个性化摄入建议", "BMI/BMR/TDEE 测评、营养缺口与膳食推荐"],
                    ["试点组织者", "观察匿名参与、执行与前后测变化", "创建试点、邀请码加入、7 天微干预统计"],
                    ["评审与开发者", "验证 AI 深度、工程完整性和可复现性", "能力评测、工具轨迹、自检与部署说明"],
                ],
                [0.22, 0.38, 0.40],
            ),
            H("2.2 功能需求"),
            T(
                ["模块", "功能要求", "实现状态"],
                [
                    ["身体测评", "计算 BMI、BMR、TDEE 与每日营养目标", "已实现"],
                    ["食物识别", "图片压缩、云端识别、本地营养条目绑定与降级", "已实现"],
                    ["饮食记录", "按餐次记录、饮水、营养累加和历史回看", "已实现"],
                    ["AI 对话", "多轮对话、语音、个性化上下文、RAG、工具调用", "已实现"],
                    ["报告与看板", "0-100 可解释评分、趋势、图表和 PDF 打印", "已实现"],
                    ["膳食推荐", "按营养缺口排序食谱并给出运动建议", "已实现"],
                    ["微干预", "反事实模拟、方案选择、7 天打卡和预测校准", "已实现"],
                    ["试点评测", "匿名试点漏斗、前后测、AI 固定测试集与消融", "已实现"],
                ],
                [0.21, 0.59, 0.20],
            ),
            H("2.3 非功能需求"),
            T(
                ["类别", "要求", "设计响应"],
                [
                    ["可用性", "PC 与移动端均可操作，关键状态有反馈", "响应式布局、抽屉导航、空状态与错误边界"],
                    ["性能", "首屏与图表加载可接受", "路由懒加载、ECharts 按需引入、图片压缩"],
                    ["可靠性", "无 Key、限流、超时或断网时仍能演示", "三级降级、超时、重试、错误映射与本地兜底"],
                    ["安全性", "API Key 不进入浏览器，写操作受控", "Node 代理持钥、入参校验、写入二次确认"],
                    ["可维护性", "前后端边界清晰，关键算法可验证", "Store 分层、工具白名单、严格类型与质量门禁"],
                    ["可部署性", "支持子目录静态托管", "Hash 路由与相对资源路径；必须通过 HTTP 服务访问"],
                ],
                [0.20, 0.38, 0.42],
            ),
            H("2.4 关键业务闭环"),
            D(
                "图 1 用户营养管理闭环",
                [
                    "身体档案与目标设定",
                    "图片识别或三餐记录",
                    "营养汇总与可解释评分",
                    "AI 对话与反事实方案模拟",
                    "7 天微干预打卡",
                    "预测与实际对比后调整策略",
                ],
            ),
        ],
    },
    {
        "title": "三 系统架构设计",
        "blocks": [
            H("3.1 总体架构"),
            D(
                "图 2 系统总体架构",
                [
                    "表现层：14 个 Vue 3 业务页面、响应式布局、ECharts 可视化",
                    "应用层：Pinia 状态、营养算法、RAG 检索、Agent 规划与工具执行",
                    "数据层：915 条食物库、知识库、localStorage 与 sessionStorage",
                    "代理层：Node HTTP 服务、入参校验、SSE 转发、超时重试与 Mock",
                    "模型层：智谱 GLM 视觉模型与文本模型，OpenAI 兼容协议",
                ],
            ),
            P("业务数据和工具执行位于前端，Node 服务只负责持有模型密钥并转发识别与对话请求。该边界既避免密钥泄露，也使无后端数据库的竞赛作品保持易部署。模型无法直接读取浏览器状态，因此前端在每轮对话中主动注入必要上下文，并在本地执行白名单工具。"),
            H("3.2 技术选型"),
            T(
                ["层级", "技术", "选择理由"],
                [
                    ["前端框架", "Vue 3.5 + Pinia 2", "组合式 API、响应式状态与组件复用能力成熟"],
                    ["构建与样式", "Vite 6 + TailwindCSS 3", "构建快、路由级拆分方便、设计令牌易统一"],
                    ["类型与质量", "TypeScript 6 + ESLint", "AI 核心链路严格类型，降低工具参数与 SSE 解析错误"],
                    ["图表", "ECharts 6.1", "仪表盘、雷达、折线、柱状与饼图覆盖完整；按需引入"],
                    ["服务端", "Node 原生 http", "零运行时依赖，直接使用全局 fetch 与 SSE"],
                    ["AI 协议", "OpenAI 兼容接口", "视觉、文本与 function calling 可统一封装并替换厂商"],
                    ["本地存储", "localStorage/sessionStorage", "适合单机演示与小规模试点，无数据库部署负担"],
                ],
                [0.19, 0.29, 0.52],
            ),
            H("3.3 前端模块划分"),
            T(
                ["目录", "职责"],
                [
                    ["src/views", "14 个路由级业务页面，全部懒加载"],
                    ["src/components", "通用卡片、状态、进度、弹窗、图表与布局组件"],
                    ["src/store", "用户档案、饮食记录、试点与微干预状态"],
                    ["src/utils", "营养计算、AI 客户端、RAG、Agent、干预模拟、语音与存储"],
                    ["src/data", "食物、知识、食谱、评测案例与演示历史数据"],
                    ["server", "环境变量、模型请求、验证、Mock 与 99 项自检"],
                ],
                [0.27, 0.73],
            ),
            H("3.4 数据流与状态管理"),
            B(
                "userStore 保存身体档案并派生 BMI、BMR、TDEE、推荐热量和营养目标。",
                "dietStore 保存按日饮食与饮水记录，集中计算汇总、目标完成度和健康评分。",
                "pilotStore 保存匿名试点批次、参与授权、前后测和行为事件。",
                "识别结果必须绑定本地 FOOD_DB 后才允许形成营养记录，避免模型自由生成营养数值。",
                "写入操作通过确认卡片落库，模型仅生成候选参数，不直接修改用户数据。",
            ),
        ],
    },
    {
        "title": "四 AI 技术方案",
        "blocks": [
            H("4.1 AI 技术选型理由"),
            T(
                ["能力", "选型", "理由"],
                [
                    ["视觉识别", "GLM-4V-Flash", "支持图像与文本联合输入，OpenAI 兼容，适合低成本演示"],
                    ["营养对话", "GLM-5.3-Flash 推荐配置", "纯文本生成与工具调用能力更匹配对话场景，延迟与成本可控"],
                    ["知识检索", "本地 BM25 + 语义概念向量 + RRF", "离线可复现、可解释、无需远程向量库"],
                    ["Agent", "自研 Plan-and-Execute + function calling", "工具在浏览器执行，能读取真实本地状态并控制写权限"],
                    ["本地兜底", "规则识别与知识库问答", "无网络仍可演示，并能展示判定依据"],
                ],
                [0.20, 0.30, 0.50],
            ),
            P("项目没有训练自有模型。选型重点不是追求单一模型参数规模，而是把成熟模型的感知和生成能力与本地可信数据、确定性算法、权限控制和可复现评测组合起来。视觉模型只负责识别候选，最终营养值由本地食物库提供；文本模型负责解释和规划，真实数据读取与写入由工具执行器完成。"),
            H("4.2 集成方式"),
            D(
                "图 3 AI 请求与执行闭环",
                [
                    "用户问题或食物图片进入前端编排层",
                    "前端压缩图片或构建身体档案与今日摄入上下文",
                    "混合 RAG 从 943 个单元召回 Top-4 并附带来源",
                    "Node 代理注入服务端密钥并调用云端模型",
                    "模型返回文本或 tool_calls，前端校验白名单和参数",
                    "本地工具读取 Store 或模拟干预，结果回填模型",
                    "生成最终回答；写入类结果等待用户二次确认",
                ],
            ),
            H("4.3 规划执行型 Agent"),
            P("复杂问题先由 agentPlanner 生成 2-5 步结构化计划，再逐步执行工具、校验结果，并在数据不足时最多受控重规划一次。页面展示计划、步骤状态、工具名称和结果摘要，不展示模型隐藏思维过程。简单查询可直接进入反应式工具调用，避免不必要的规划延迟。"),
            T(
                ["工具", "作用", "权限"],
                [
                    ["read_today_summary", "读取今日摄入、目标、饮水与评分", "只读"],
                    ["read_diet_history", "读取最近 1-7 天饮食与汇总", "只读"],
                    ["read_user_profile", "读取档案、BMI、BMR、TDEE 与目标", "只读"],
                    ["search_food_nutrition", "检索 915 条食物营养数据", "只读"],
                    ["get_meal_plan", "获取按当前营养缺口生成的膳食推荐", "只读"],
                    ["simulate_diet_interventions", "比较 2-3 种最小调整的营养与评分变化", "只读模拟"],
                    ["add_diet_record", "生成待确认饮食记录", "确认后写入"],
                ],
                [0.34, 0.48, 0.18],
            ),
            H("4.4 混合 RAG"),
            P("检索层将 915 条食物营养、6 篇科普、10 条食物搭配辟谣和 12 条健康习惯构造成 943 个文档。中文使用 2/3 字滑窗，英文按词切分；BM25 负责精确词法匹配，本地概念向量处理控糖、补水、便秘等同义表达，最后通过 RRF 融合排序。Top-4 结果随问题注入提示词，并在界面展示标题、类别和来源，便于用户核对。"),
            H("4.5 优化策略"),
            T(
                ["方向", "策略", "效果"],
                [
                    ["性能", "路由懒加载、ECharts 按需引入、图片压缩、SSE 增量渲染", "降低首屏和大图请求压力"],
                    ["成本", "视觉与文本模型分工、Top-4 注入、上下文轮数限制、Agent 最多 4 轮", "控制 token 与调用次数"],
                    ["稳定性", "20 秒超时、5xx 指数退避、429 立即降级、SSE 心跳", "减少卡死并避免无效重试"],
                    ["可信性", "本地数据绑定、工具白名单、参数裁剪、可解释评分", "限制幻觉影响范围"],
                    ["安全", "服务端持钥、8MB 图片上限、文本长度限制、写入确认", "保护密钥与用户数据"],
                ],
                [0.16, 0.50, 0.34],
            ),
            H("4.6 三级降级"),
            D(
                "图 4 AI 稳定性降级链路",
                [
                    "云端模型：真实视觉识别、流式对话与工具调用",
                    "确定性 Mock：未配置 Key 或主动演示模式下返回可复现结果",
                    "本地规则与知识库：断网、超时或服务异常时提供解释型识别与检索回答",
                ],
            ),
        ],
    },
    {
        "title": "五 核心功能实现",
        "blocks": [
            H("5.1 身体评估与营养目标"),
            P("用户录入性别、年龄、身高、体重、活动强度和目标后，系统在前端计算 BMI、基础代谢 BMR、每日总消耗 TDEE 与推荐摄入量，并派生热量、蛋白质、脂肪、碳水、纤维、糖、钠和饮水目标。所有公式集中在 nutrition.js，供首页、报告、推荐、Agent 与干预模拟复用。"),
            H("5.2 食物识别与营养绑定"),
            B(
                "上传前通过 Canvas 限制长边和图片体积，降低请求负担。",
                "云端模型只返回食物候选、分量和置信度，不直接决定营养数值。",
                "visionAdapter 对名称、别名、标签进行加权匹配，绑定本地 FOOD_DB。",
                "绑定失败明确提示，不允许把不确定结果写入饮食记录。",
                "云端失败时使用像素特征和规则候选展示本地解释依据。",
            ),
            H("5.3 可解释健康评分"),
            T(
                ["指标", "权重", "判定重点"],
                [
                    ["热量", "25", "接近目标区间得分更高，过低或过高均扣分"],
                    ["蛋白质", "15", "低于目标按比例扣分"],
                    ["膳食纤维", "20", "根据与每日目标的缺口扣分"],
                    ["脂肪", "10", "超出目标后逐级扣分"],
                    ["碳水", "10", "超出目标后逐级扣分"],
                    ["糖", "10", "超出推荐上限后扣分"],
                    ["钠", "10", "超出推荐上限后扣分"],
                ],
                [0.25, 0.18, 0.57],
            ),
            P("总分限制在 0-100，并映射为优秀、良好、及格和需改善。报告页同时展示评分构成、超标项、缺口项和近 7 天趋势，因此用户可以理解分数变化来自哪些营养素，而不是只看到不可解释的结论。"),
            H("5.4 反事实干预与 7 天实验"),
            P("simulate_diet_interventions 基于当天真实记录生成控糖、补蛋白或均衡优化等最小调整，使用同一套本地营养算法重新计算调整前后的热量、糖、蛋白质、纤维和健康评分。用户选择方案后才创建 7 天微干预，随后按日记录真实结果并比较预测与实际差异。该能力用于行为反馈，不宣称医疗效果预测。"),
            H("5.5 匿名试点与 AI 评测"),
            P("试点模块通过邀请码、匿名授权、前后测和行为事件形成可审计漏斗，不采集姓名、手机号、学号或完整聊天内容。AI 评测模块使用固定 50 条案例覆盖事实性、个性化、知识依据、工具准确性和安全边界，并展示基线、BM25、混合 RAG 与完整系统的消融结果。"),
            H("5.6 页面清单"),
            T(
                ["分组", "页面"],
                [
                    ["每日使用", "首页、AI 食物识别、AI 营养对话、三餐记录、身体测评"],
                    ["分析洞察", "营养报告、数据大屏、膳食推荐、营养知识库、食物速查"],
                    ["方法与证据", "7 天微干预、试点与成效、AI 能力评测"],
                    ["账户", "个人中心"],
                ],
                [0.24, 0.76],
            ),
        ],
    },
    {
        "title": "六 测试与部署",
        "blocks": [
            H("6.1 质量门禁"),
            T(
                ["检查", "结果", "说明"],
                [
                    ["ESLint", "通过", "src 与 server 全量扫描"],
                    ["TypeScript", "通过", "vue-tsc 严格模式无类型错误"],
                    ["生产构建", "通过", "Vite 6 构建 695 个模块，dist 约 5.70 MiB"],
                    ["代理自检", "99/99", "环境变量、验证、Mock、SSE、错误映射与工具调用"],
                    ["依赖安全", "0 漏洞", "npm 官方漏洞库；ECharts 已升级至 6.1.0"],
                ],
                [0.24, 0.20, 0.56],
            ),
            H("6.2 AI 固定评测"),
            T(
                ["系统版本", "通过率", "综合分", "说明"],
                [
                    ["无上下文与无 RAG 基线", "24%", "63.2", "仅保留基础回答能力"],
                    ["BM25 词法检索", "46%", "72.9", "加入词法证据"],
                    ["混合 RAG", "46%", "72.9", "专项同义表达另行统计"],
                    ["完整系统", "100%", "92.6", "上下文、RAG、工具与安全策略全部启用"],
                ],
                [0.33, 0.18, 0.18, 0.31],
            ),
            P("完整系统的五项得分为：事实性 79.7、个性化 100、知识依据 100、工具准确性 76.7、安全性 100。结果由项目内确定性评分器生成，可复现但不等同于真实用户满意度或医学有效性；后续仍需真实模型复评和人工双盲评分。"),
            H("6.3 本地运行"),
            C("npm install\nCopy-Item .env.example .env\nnpm run ai:server    # http://localhost:8787\nnpm run dev          # http://localhost:5173"),
            H("6.4 生产构建与预览"),
            C("npm run check\nnpm run preview      # http://localhost:4173"),
            P("构建产物采用相对资源路径和 Hash 路由，可部署到任意 HTTP 静态服务或子目录。入口使用 ES Module，不能通过 file:// 双击可靠运行。真实 AI 部署时需要将 /api 反向代理到 Node 服务，并在生产环境限制监听地址、允许来源、调用频率和访问凭证。"),
            H("6.5 部署安全注意事项"),
            B(
                "不得提交包含真实 AI_API_KEY 的 .env；交付包使用 .env.example。",
                "当前代理为竞赛演示实现，开发期 CORS 允许任意来源；公网部署前必须配置 Origin 白名单。",
                "建议默认绑定 127.0.0.1，确需局域网演示时通过显式配置开放。",
                "生产环境增加身份鉴权、速率限制、请求日志脱敏和 HTTPS。",
                "localStorage 适合单机演示；多人正式试点应迁移到具备权限与加密的服务端存储。",
            ),
        ],
    },
    {
        "title": "七 技术与应用创新",
        "blocks": [
            H("7.1 技术创新点"),
            T(
                ["创新点", "实现方式", "价值"],
                [
                    ["本地可信数据约束生成", "模型只识别和解释，营养数值绑定本地 915 条食物库", "降低营养数值幻觉"],
                    ["可解释混合 RAG", "BM25、概念向量和 RRF 融合，Top-4 来源可见", "兼顾精确词与口语同义表达"],
                    ["前端规划执行 Agent", "2-5 步计划、7 个真实工具、结果校验和受控重规划", "直接利用浏览器中的真实用户状态"],
                    ["权限分级工具调用", "查询和模拟默认只读，写入必须二次确认", "把自主性限制在可控范围"],
                    ["三级可解释降级", "云端、Mock、本地规则与知识库逐级接管", "断网和限流下仍可演示"],
                    ["同源反事实计算", "报告与干预模拟复用同一营养算法", "预测变化可复算、可对照"],
                ],
                [0.24, 0.49, 0.27],
            ),
            H("7.2 应用创新点"),
            T(
                ["创新点", "应用设计", "用户价值"],
                [
                    ["从建议到实验", "推荐方案转化为 7 天微干预并记录实际结果", "让一次性建议变为可持续行为闭环"],
                    ["最小改变优先", "比较控糖、补蛋白与均衡方案的综合影响", "避免简单地把少吃等同于更健康"],
                    ["证据与轨迹可见", "展示 RAG 来源、计划步骤、工具结果和评分构成", "提升信任并便于答辩核验"],
                    ["匿名试点量化", "前后测、行为漏斗和微干预结果统一统计", "把社会价值主张变成可采集证据"],
                    ["本地优先的隐私设计", "健康档案与饮食数据默认不上传业务服务器", "适合低成本单机演示和小规模试点"],
                ],
                [0.24, 0.49, 0.27],
            ),
            H("7.3 创新边界与验证方式"),
            P("创新性建立在系统集成与交互闭环，而非自研基础模型。项目通过固定评测、消融实验、工具执行记录、确定性反事实计算和真实打卡对创新主张进行验证。当前试点模块不预填真实人数或改善率，正式结论必须来自实际参与数据。"),
        ],
    },
    {
        "title": "八 总结与展望",
        "blocks": [
            H("8.1 总结"),
            P("当前版本已经形成从身体评估、食物识别、饮食记录、营养分析、AI 对话、膳食推荐到微干预和效果复盘的完整闭环。技术上以 Vue 3 和本地营养算法为可信底座，通过 Node 代理安全接入视觉与文本模型，再用混合 RAG、规划执行 Agent、权限控制和三级降级增强可解释性与稳定性。"),
            H("8.2 已知限制"),
            B(
                "演示鉴权与本地存储不适用于多人正式生产环境。",
                "本地规则识别只能作为兜底，准确性明显低于成熟视觉模型。",
                "固定评测由确定性评分器生成，仍缺少真实模型重复实验和人工双盲评价。",
                "营养数据库包含组合推算条目，仅供学习与演示，不替代权威检测数据。",
                "生产代理尚需补充 Origin 白名单、鉴权、限流和审计日志。",
            ),
            H("8.3 后续计划"),
            T(
                ["优先级", "改进项", "预期收益"],
                [
                    ["P0", "代理绑定地址、Origin 白名单、身份鉴权与限流", "满足真实部署的安全基线"],
                    ["P1", "营养算法与 Agent 工具增加独立自动化测试", "降低核心规则回归风险"],
                    ["P1", "真实模型多次复评与人工双盲评分", "提高 AI 评测可信度"],
                    ["P2", "服务端账户、加密存储与跨设备同步", "支持多人试点和长期使用"],
                    ["P2", "权威数据来源标注与版本管理", "提高营养数据可追溯性"],
                    ["P3", "图表无障碍、键盘操作与导入导出", "提升可访问性与数据迁移能力"],
                ],
                [0.15, 0.53, 0.32],
            ),
            H("8.4 文档要求符合性"),
            T(
                ["要求项", "对应章节", "状态"],
                [
                    ["项目概述、需求分析、系统架构设计", "第一至第三章", "完整覆盖"],
                    ["AI 技术选型、集成方式、优化策略", "第四章", "重点阐述"],
                    ["核心功能实现", "第五章", "完整覆盖"],
                    ["测试与部署", "第六章", "含实测结果和安全说明"],
                    ["技术创新点与应用创新点", "第七章", "分别列出"],
                    ["总结与展望", "第八章", "含限制和后续计划"],
                    ["PDF 不超过 30 页", "最终版式检查", "生成后验证"],
                ],
                [0.36, 0.44, 0.20],
            ),
        ],
    },
]


def set_cell_shading(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=90, start=110, bottom=90, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_run_font(run, name="Microsoft YaHei", size=10.5, bold=False, color="000000"):
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)


def add_page_field(paragraph, field_name: str):
    run = paragraph.add_run()
    fld_begin = OxmlElement("w:fldChar")
    fld_begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = field_name
    fld_end = OxmlElement("w:fldChar")
    fld_end.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_begin, instr, fld_end])
    set_run_font(run, size=9, color="666666")


def add_docx_table(doc, block):
    rows = [block["headers"], *block["rows"]]
    table = doc.add_table(rows=len(rows), cols=len(block["headers"]))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_repeat_table_header(table.rows[0])
    available = 17.4
    ratios = block.get("widths") or [1 / len(block["headers"])] * len(block["headers"])
    for i, row in enumerate(rows):
        for j, value in enumerate(row):
            cell = table.cell(i, j)
            cell.width = Cm(available * ratios[j])
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            set_cell_margins(cell)
            set_cell_shading(cell, "25364A" if i == 0 else ("F4F7FA" if i % 2 == 0 else "FFFFFF"))
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.line_spacing = 1.15
            run = paragraph.add_run(str(value))
            set_run_font(run, size=9, bold=i == 0, color="FFFFFF" if i == 0 else "1F2933")
    if block.get("caption"):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(4)
        set_run_font(p.add_run(block["caption"]), size=9, color="555555")
    else:
        doc.add_paragraph().paragraph_format.space_after = Pt(0)


def add_docx_diagram(doc, block):
    for index, layer in enumerate(block["layers"]):
        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = table.cell(0, 0)
        set_cell_margins(cell, top=130, bottom=130, start=160, end=160)
        set_cell_shading(cell, "E8F1F5" if index % 2 == 0 else "F2F6F8")
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_run_font(p.add_run(layer), size=9.5, bold=True, color="173B4D")
        if index < len(block["layers"]) - 1:
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.space_before = Pt(2)
            set_run_font(p.add_run("↓"), size=11, bold=True, color="5D7785")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(4)
    set_run_font(p.add_run(block["caption"]), size=9, color="555555")


def build_docx():
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.6)
    section.left_margin = Cm(1.8)
    section.right_margin = Cm(1.8)
    section.different_first_page_header_footer = True

    normal = doc.styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(10.5)
    normal.paragraph_format.line_spacing = 1.35
    normal.paragraph_format.space_after = Pt(5)

    for style_name, size, before, after in (("Title", 26, 0, 0), ("Heading 1", 17, 12, 8), ("Heading 2", 13, 9, 5)):
        style = doc.styles[style_name]
        style.font.name = "Microsoft YaHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_run_font(header.add_run("膳知 AI 营养分析师 技术文档"), size=8.5, color="777777")
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(footer.add_run("第 "), size=9, color="666666")
    add_page_field(footer, "PAGE")
    set_run_font(footer.add_run(" 页"), size=9, color="666666")

    title = doc.add_paragraph(style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(110)
    set_run_font(title.add_run("膳知 AI 营养分析师"), size=28, bold=True)
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.paragraph_format.space_before = Pt(14)
    set_run_font(subtitle.add_run("技术文档"), size=21, bold=True)
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub.paragraph_format.space_before = Pt(30)
    set_run_font(sub.add_run("AI 营养健康 Web 应用\nVue 3 + Vite + Node AI 代理"), size=12, color="465A65")
    meta = doc.add_paragraph()
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta.paragraph_format.space_before = Pt(120)
    set_run_font(meta.add_run("版本 1.1\n编制日期 2026 年 11 月 15 日\n文档状态 提交版"), size=10.5, color="555555")
    doc.add_page_break()

    doc.add_heading("目录", level=1)
    for section_data in SECTIONS:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(3)
        set_run_font(p.add_run(section_data["title"]), size=11, bold=True)
        for block in section_data["blocks"]:
            if block["type"] == "h":
                q = doc.add_paragraph()
                q.paragraph_format.left_indent = Cm(0.6)
                q.paragraph_format.space_after = Pt(1)
                set_run_font(q.add_run(block["text"]), size=9.5, color="555555")
    doc.add_page_break()

    for section_index, section_data in enumerate(SECTIONS):
        if section_index:
            doc.add_page_break()
        doc.add_heading(section_data["title"], level=1)
        for block in section_data["blocks"]:
            block_type = block["type"]
            if block_type == "h":
                doc.add_heading(block["text"], level=2)
            elif block_type == "p":
                p = doc.add_paragraph(block["text"])
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
                p.paragraph_format.first_line_indent = Cm(0.74)
            elif block_type == "bullets":
                for item in block["items"]:
                    p = doc.add_paragraph(style="List Bullet")
                    p.paragraph_format.left_indent = Cm(0.75)
                    p.paragraph_format.first_line_indent = Cm(-0.35)
                    run = p.add_run(item)
                    set_run_font(run, size=10)
            elif block_type == "table":
                add_docx_table(doc, block)
            elif block_type == "diagram":
                add_docx_diagram(doc, block)
            elif block_type == "code":
                p = doc.add_paragraph()
                p.paragraph_format.left_indent = Cm(0.45)
                p.paragraph_format.right_indent = Cm(0.45)
                p.paragraph_format.space_before = Pt(3)
                p.paragraph_format.space_after = Pt(6)
                p.paragraph_format.line_spacing = 1.15
                pPr = p._p.get_or_add_pPr()
                shd = OxmlElement("w:shd")
                shd.set(qn("w:fill"), "F2F4F6")
                pPr.append(shd)
                set_run_font(p.add_run(block["text"]), name="Consolas", size=9, color="263238")

    DOCX_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc.save(DOCX_PATH)


class TechnicalDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        self._bookmark_id = 0

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ("H1", "H2"):
            level = 0 if flowable.style.name == "H1" else 1
            text = flowable.getPlainText()
            key = f"heading-{self._bookmark_id}"
            self._bookmark_id += 1
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)
            self.notify("TOCEntry", (level, text, self.page, key))


def register_pdf_fonts():
    pdfmetrics.registerFont(TTFont("YaHei", r"C:\Windows\Fonts\msyh.ttc", subfontIndex=0))
    pdfmetrics.registerFont(TTFont("YaHeiBold", r"C:\Windows\Fonts\msyhbd.ttc", subfontIndex=0))


def pdf_paragraph(text, style):
    return Paragraph(escape(str(text)).replace("\n", "<br/>"), style)


def pdf_table(block, styles, available_width):
    ratios = block.get("widths") or [1 / len(block["headers"])] * len(block["headers"])
    col_widths = [available_width * ratio for ratio in ratios]
    data = [[pdf_paragraph(value, styles["TableHead"]) for value in block["headers"]]]
    for row in block["rows"]:
        data.append([pdf_paragraph(value, styles["TableCell"]) for value in row])
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="CENTER")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#25364A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#D9D9D9")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for row_index in range(1, len(data)):
        if row_index % 2 == 0:
            commands.append(("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#F4F7FA")))
    table.setStyle(TableStyle(commands))
    result = [table, Spacer(1, 3 * mm)]
    if block.get("caption"):
        result.insert(1, pdf_paragraph(block["caption"], styles["Caption"]))
    return result


def pdf_diagram(block, styles, available_width):
    items = []
    for index, layer in enumerate(block["layers"]):
        table = Table([[pdf_paragraph(layer, styles["Diagram"]) ]], colWidths=[available_width * 0.88], hAlign="CENTER")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#E8F1F5" if index % 2 == 0 else "#F2F6F8")),
            ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#B8C9D2")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]))
        items.append(table)
        if index < len(block["layers"]) - 1:
            items.append(pdf_paragraph("↓", styles["Arrow"]))
    items.append(pdf_paragraph(block["caption"], styles["Caption"]))
    items.append(Spacer(1, 2 * mm))
    return [KeepTogether(items)]


def build_pdf():
    register_pdf_fonts()
    PAGE_W, PAGE_H = A4
    left = right = 18 * mm
    top = 18 * mm
    bottom = 16 * mm
    available = PAGE_W - left - right

    base = getSampleStyleSheet()
    styles = {
        "CoverTitle": ParagraphStyle("CoverTitle", parent=base["Title"], fontName="YaHeiBold", fontSize=27, leading=38, alignment=TA_CENTER, textColor=colors.black, spaceAfter=8 * mm),
        "CoverSub": ParagraphStyle("CoverSub", parent=base["Normal"], fontName="YaHei", fontSize=15, leading=24, alignment=TA_CENTER, textColor=colors.HexColor("#405461")),
        "CoverMeta": ParagraphStyle("CoverMeta", parent=base["Normal"], fontName="YaHei", fontSize=10.5, leading=20, alignment=TA_CENTER, textColor=colors.HexColor("#555555")),
        "H1": ParagraphStyle("H1", parent=base["Heading1"], fontName="YaHeiBold", fontSize=17, leading=24, textColor=colors.black, spaceBefore=4 * mm, spaceAfter=4 * mm, keepWithNext=True),
        "H2": ParagraphStyle("H2", parent=base["Heading2"], fontName="YaHeiBold", fontSize=12.5, leading=18, textColor=colors.black, spaceBefore=3.5 * mm, spaceAfter=2 * mm, keepWithNext=True),
        "Body": ParagraphStyle("Body", parent=base["BodyText"], fontName="YaHei", fontSize=10.2, leading=16.5, alignment=TA_LEFT, textColor=colors.HexColor("#202830"), firstLineIndent=20, spaceAfter=2.2 * mm),
        "Bullet": ParagraphStyle("Bullet", parent=base["BodyText"], fontName="YaHei", fontSize=9.8, leading=15.5, leftIndent=16, firstLineIndent=-10, textColor=colors.HexColor("#202830"), spaceAfter=1.2 * mm),
        "TableHead": ParagraphStyle("TableHead", parent=base["BodyText"], fontName="YaHeiBold", fontSize=8.7, leading=12, alignment=TA_CENTER, textColor=colors.white),
        "TableCell": ParagraphStyle("TableCell", parent=base["BodyText"], fontName="YaHei", fontSize=8.5, leading=12.5, alignment=TA_LEFT, textColor=colors.HexColor("#1F2933")),
        "Caption": ParagraphStyle("Caption", parent=base["BodyText"], fontName="YaHei", fontSize=8.5, leading=12, alignment=TA_CENTER, textColor=colors.HexColor("#555555"), spaceBefore=1.5 * mm, spaceAfter=2 * mm),
        "Diagram": ParagraphStyle("Diagram", parent=base["BodyText"], fontName="YaHeiBold", fontSize=9.2, leading=14, alignment=TA_CENTER, textColor=colors.HexColor("#173B4D")),
        "Arrow": ParagraphStyle("Arrow", parent=base["BodyText"], fontName="YaHeiBold", fontSize=11, leading=12, alignment=TA_CENTER, textColor=colors.HexColor("#5D7785")),
        "Code": ParagraphStyle("Code", parent=base["Code"], fontName="YaHei", fontSize=8.8, leading=14, leftIndent=8, rightIndent=8, borderColor=colors.HexColor("#D9D9D9"), borderWidth=0.5, borderPadding=7, backColor=colors.HexColor("#F2F4F6"), textColor=colors.HexColor("#263238"), spaceBefore=2 * mm, spaceAfter=3 * mm),
    }

    def draw_header_footer(canvas, doc):
        canvas.saveState()
        if doc.page > 1:
            canvas.setFont("YaHei", 8)
            canvas.setFillColor(colors.HexColor("#777777"))
            canvas.drawRightString(PAGE_W - right, PAGE_H - 10 * mm, "膳知 AI 营养分析师 技术文档")
        canvas.setFont("YaHei", 8.5)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawCentredString(PAGE_W / 2, 8 * mm, f"第 {doc.page} 页")
        canvas.restoreState()

    frame = Frame(left, bottom, available, PAGE_H - top - bottom, id="normal")
    template = PageTemplate(id="main", frames=[frame], onPage=draw_header_footer)
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf = TechnicalDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=left,
        rightMargin=right,
        topMargin=top,
        bottomMargin=bottom,
        title="膳知 AI 营养分析师 技术文档",
        author="膳知项目组",
        subject="AI 营养健康 Web 应用技术文档",
    )
    pdf.addPageTemplates([template])

    story = [Spacer(1, 46 * mm)]
    story.append(pdf_paragraph("膳知 AI 营养分析师", styles["CoverTitle"]))
    story.append(pdf_paragraph("技术文档", ParagraphStyle("CoverDoc", parent=styles["CoverTitle"], fontSize=22, leading=30, spaceAfter=14 * mm)))
    story.append(pdf_paragraph("AI 营养健康 Web 应用\nVue 3 + Vite + Node AI 代理", styles["CoverSub"]))
    story.append(Spacer(1, 45 * mm))
    story.append(pdf_paragraph("版本 1.1\n编制日期 2026 年 11 月 15 日\n文档状态 提交版", styles["CoverMeta"]))
    story.append(PageBreak())

    story.append(pdf_paragraph("目录", styles["H1"]))
    toc_main = ParagraphStyle("TOCMain", fontName="YaHeiBold", fontSize=10.5, leading=18, leftIndent=0, textColor=colors.black)
    toc_sub = ParagraphStyle("TOCSub", fontName="YaHei", fontSize=9, leading=14, leftIndent=14, textColor=colors.HexColor("#555555"))
    for section_data in SECTIONS:
        story.append(pdf_paragraph(section_data["title"], toc_main))
        for block in section_data["blocks"]:
            if block["type"] == "h":
                story.append(pdf_paragraph(block["text"], toc_sub))

    for section_index, section_data in enumerate(SECTIONS):
        if section_index == 0:
            story.append(PageBreak())
        else:
            story.append(CondPageBreak(55 * mm))
        story.append(pdf_paragraph(section_data["title"], styles["H1"]))
        blocks = section_data["blocks"]
        for block_index, block in enumerate(blocks):
            block_type = block["type"]
            if block_type == "h":
                if block_index + 1 < len(blocks) and blocks[block_index + 1]["type"] == "diagram":
                    story.append(CondPageBreak(95 * mm))
                story.append(pdf_paragraph(block["text"], styles["H2"]))
            elif block_type == "p":
                story.append(pdf_paragraph(block["text"], styles["Body"]))
            elif block_type == "bullets":
                for item in block["items"]:
                    story.append(pdf_paragraph(f"• {item}", styles["Bullet"]))
            elif block_type == "table":
                story.extend(pdf_table(block, styles, available))
            elif block_type == "diagram":
                story.extend(pdf_diagram(block, styles, available))
            elif block_type == "code":
                story.append(pdf_paragraph(block["text"], styles["Code"]))

    pdf.build(story)


def build_markdown():
    lines = [
        "# 膳知 AI 营养分析师技术文档",
        "",
        "版本：1.1",
        "编制日期：2026-11-15",
        "文档状态：提交版",
        "",
    ]
    for section_data in SECTIONS:
        lines.extend([f"## {section_data['title']}", ""])
        for block in section_data["blocks"]:
            block_type = block["type"]
            if block_type == "h":
                lines.extend([f"### {block['text']}", ""])
            elif block_type == "p":
                lines.extend([block["text"], ""])
            elif block_type == "bullets":
                lines.extend([f"- {item}" for item in block["items"]])
                lines.append("")
            elif block_type == "table":
                lines.append("| " + " | ".join(block["headers"]) + " |")
                lines.append("| " + " | ".join(["---"] * len(block["headers"])) + " |")
                for row in block["rows"]:
                    lines.append("| " + " | ".join(str(value).replace("|", "\\|") for value in row) + " |")
                lines.append("")
            elif block_type == "diagram":
                lines.append(" → ".join(block["layers"]))
                lines.extend(["", f"*{block['caption']}*", ""])
            elif block_type == "code":
                lines.extend(["```text", block["text"], "```", ""])
    MD_PATH.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    build_docx()
    build_pdf()
    build_markdown()
    print(f"DOCX: {DOCX_PATH}")
    print(f"PDF:  {PDF_PATH}")
    print(f"MD:   {MD_PATH}")

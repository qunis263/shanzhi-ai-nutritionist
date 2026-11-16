from __future__ import annotations

from pathlib import Path
from typing import Iterable

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from PIL import Image as PILImage


ROOT = Path(__file__).resolve().parents[1]
DOCX_PATH = ROOT / "docs" / "作品介绍文档.docx"
PDF_PATH = ROOT / "output" / "pdf" / "膳知AI营养分析师作品介绍文档.pdf"
ASSET_DIR = ROOT / "docs" / "assets" / "work-intro"

FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")
NAVY = "24374B"
TEAL = "118C82"
PALE = "EEF5F4"
GRAY = "F4F6F8"
TEXT = "1F2937"
LIGHT_BORDER = "D9DEE5"


TEAM = {
    "院校": "沧州交通学院",
    "队员": "沙擎炘  李晓瑞  赵家庆",
    "指导老师": "孙真真",
    "文档日期": "2026 年 11 月",
}


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for edge, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{edge}"))
        if node is None:
            node = OxmlElement(f"w:{edge}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=LIGHT_BORDER, size=5) -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), str(size))
        tag.set(qn("w:color"), color)


def set_repeat_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_run_font(run, size=10.5, bold=False, color=TEXT, name="Microsoft YaHei") -> None:
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.font.color.rgb = RGBColor.from_string(color)


def add_docx_table(doc: Document, headers: list[str], rows: Iterable[Iterable[str]], widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    set_repeat_header(table.rows[0])
    for idx, value in enumerate(headers):
        cell = table.rows[0].cells[idx]
        set_cell_shading(cell, NAVY)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(0)
        set_run_font(p.add_run(value), size=9.5, bold=True, color="FFFFFF")
    for row_idx, values in enumerate(rows):
        cells = table.add_row().cells
        for col_idx, value in enumerate(values):
            cell = cells[col_idx]
            if row_idx % 2:
                set_cell_shading(cell, GRAY)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if col_idx == 0 else WD_ALIGN_PARAGRAPH.LEFT
            set_run_font(p.add_run(str(value)), size=9.2)
    if widths:
        for row in table.rows:
            for idx, width in enumerate(widths):
                row.cells[idx].width = Cm(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return table


def add_body(doc: Document, text: str, first_indent=True) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.45
    p.paragraph_format.space_after = Pt(6)
    if first_indent:
        p.paragraph_format.first_line_indent = Pt(21)
    set_run_font(p.add_run(text), size=10.5)


def add_bullets(doc: Document, items: Iterable[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.left_indent = Cm(0.7)
        p.paragraph_format.first_line_indent = Cm(-0.3)
        p.paragraph_format.line_spacing = 1.35
        p.paragraph_format.space_after = Pt(4)
        set_run_font(p.add_run(item), size=10.2)


def add_picture(doc: Document, filename: str, caption: str) -> None:
    path = ASSET_DIR / filename
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_with_next = True
    run = p.add_run()
    run.add_picture(str(path), width=Cm(16.0))
    c = doc.add_paragraph()
    c.alignment = WD_ALIGN_PARAGRAPH.CENTER
    c.paragraph_format.space_after = Pt(8)
    set_run_font(c.add_run(caption), size=9, color="5F6B78")


def add_page_number(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char1, instr_text, fld_char2])
    set_run_font(run, size=8.5, color="777777")


def build_docx() -> None:
    DOCX_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(1.8)
    section.left_margin = Cm(2.2)
    section.right_margin = Cm(2.2)

    normal = doc.styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(10.5)
    for style_name, size in (("Title", 27), ("Heading 1", 18), ("Heading 2", 13)):
        style = doc.styles[style_name]
        style.font.name = "Microsoft YaHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(14 if style_name != "Title" else 0)
        style.paragraph_format.space_after = Pt(7)
        if style_name == "Title":
            style_ppr = style._element.get_or_add_pPr()
            style_border = style_ppr.find(qn("w:pBdr"))
            if style_border is not None:
                style_ppr.remove(style_border)

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_run_font(header.add_run("膳知 AI 营养分析师 作品介绍文档"), size=8.5, color="777777")
    add_page_number(section.footer.paragraphs[0])

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(78)
    r = p.add_run("膳知 AI 营养分析师")
    set_run_font(r, size=28, bold=True, color="000000")
    p.style = doc.styles["Title"]
    p2 = doc.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.space_after = Pt(32)
    set_run_font(p2.add_run("作品介绍文档"), size=19, bold=True, color=TEAL)
    lead = doc.add_paragraph()
    lead.alignment = WD_ALIGN_PARAGRAPH.CENTER
    lead.paragraph_format.space_after = Pt(40)
    set_run_font(lead.add_run("面向个人营养管理的可信 AI Web 应用"), size=11.5, color="4B5563")
    cover_table = doc.add_table(rows=4, cols=2)
    cover_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cover_table.autofit = False
    set_table_borders(cover_table, color="C7D6D3", size=6)
    for i, (label, value) in enumerate(TEAM.items()):
        cover_table.rows[i].cells[0].width = Cm(4.0)
        cover_table.rows[i].cells[1].width = Cm(10.0)
        for c in cover_table.rows[i].cells:
            set_cell_margins(c, top=150, bottom=150, start=180, end=180)
            c.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        set_cell_shading(cover_table.rows[i].cells[0], PALE)
        p = cover_table.rows[i].cells[0].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_run_font(p.add_run(label), size=10.5, bold=True, color=NAVY)
        p = cover_table.rows[i].cells[1].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_run_font(p.add_run(value), size=10.5)
    doc.add_page_break()

    doc.add_heading("目录", level=1)
    toc_items = [
        "一 项目详情与使用方式", "二 项目亮点", "三 AI 测试技术落地情况",
        "四 关键技术", "五 项目图片", "六 发表获奖与项目来源说明", "七 应用价值与后续计划", "八 提交要求核对"
    ]
    for idx, text in enumerate(toc_items, 1):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(8)
        set_run_font(p.add_run(text), size=11, bold=idx in (1, 3, 5))
    doc.add_heading("作品摘要", level=1)
    add_body(doc, "膳知 AI 营养分析师是一套面向个人日常饮食管理的 Web 应用。作品将身体评估、食物识别、三餐记录、营养分析、AI 对话、膳食推荐和 7 天微干预连接成可持续的行为闭环，并通过本地可信营养数据、混合 RAG、受控 Agent 和三层降级机制减少模型幻觉与演示中断。当前版本包含 14 个业务页面、915 条食物数据、943 个检索单元和 7 个 Agent 工具，固定 50 条 AI 评测用例全部通过，综合得分 92.6。")
    add_docx_table(doc, ["核心规模", "当前结果", "说明"], [
        ["业务页面", "14 个", "覆盖记录、分析、建议、实验和证据页面"],
        ["本地食物库", "915 条", "模型识别结果必须绑定本地条目后才能写入"],
        ["RAG 检索单元", "943 个", "食物、科普、辟谣与健康习惯统一检索"],
        ["AI 固定评测", "50/50", "事实性、个性化、知识依据、工具准确性和安全性"],
    ], widths=[3.4, 3.0, 9.0])

    doc.add_heading("一 项目详情与使用方式", level=1)
    doc.add_heading("1.1 项目定位", level=2)
    add_body(doc, "作品面向希望改善日常饮食但缺少专业工具的普通用户，解决营养信息零散、记录成本高、建议缺少个体背景、一次性建议难以持续和 AI 结论难核验等问题。系统不替代医疗诊断，不宣称自研基础模型；其定位是把成熟模型能力与本地可信数据、确定性营养算法和可验证交互组合成可演示、可复现的营养管理工具。")
    doc.add_heading("1.2 使用方式", level=2)
    add_docx_table(doc, ["步骤", "用户操作", "系统输出"], [
        ["1 建立档案", "填写性别、年龄、身高、体重、活动强度与目标", "BMI、BMR、TDEE 和营养目标"],
        ["2 识别或记录", "上传食物照片，或按餐次添加食物和饮水", "食物候选、营养绑定与当日累计"],
        ["3 查看分析", "进入报告或数据大屏", "健康评分、营养缺口、趋势与可解释提示"],
        ["4 咨询 AI", "以文本或语音提出饮食问题", "结合档案、当日摄入和 RAG 证据生成回答"],
        ["5 持续干预", "选择小幅调整方案并完成 7 天打卡", "预测与实际结果对照，形成行为反馈"],
    ], widths=[2.8, 6.3, 6.3])
    add_body(doc, "本地开发运行需先启动 Node AI 代理，再启动 Vite 前端；提交后的生产构建应通过 HTTP 静态服务或反向代理访问，不能使用 file:// 直接双击入口文件。未配置模型密钥时，系统自动进入确定性 Mock 或本地知识库模式，保证核心流程仍可演示。")

    doc.add_heading("二 项目亮点", level=1)
    add_docx_table(doc, ["亮点", "实现方式", "用户价值"], [
        ["可信数据约束生成", "模型识别食物名称，本地 915 条食物库提供营养数值", "避免模型自由生成营养值"],
        ["可解释混合 RAG", "BM25、概念向量与 RRF 融合，展示 Top-4 来源", "回答有依据且便于核对"],
        ["规划执行型 Agent", "复杂任务分解为 2 至 5 步，通过 7 个白名单工具执行", "直接利用真实档案和饮食状态"],
        ["最小改变优先", "比较控糖、补蛋白与均衡优化的反事实结果", "把建议转化为可执行的小调整"],
        ["三级稳定降级", "云端模型、确定性 Mock、本地规则与知识库逐级接管", "断网或限流时仍可演示"],
        ["评测证据内置", "固定测试、消融实验、失败案例和工具执行轨迹可视化", "让技术效果可复现、可答辩"],
    ], widths=[3.5, 7.0, 5.0])

    doc.add_heading("三 AI 测试技术落地情况", level=1)
    doc.add_heading("3.1 AI 能力与集成方式", level=2)
    add_docx_table(doc, ["能力", "技术方案", "落地位置"], [
        ["视觉识别", "GLM-4V 兼容接口，本地规则引擎兜底", "AI 食物识别页面"],
        ["营养对话", "文本模型、个性化上下文、SSE 流式输出", "AI 营养对话助手"],
        ["知识检索", "943 单元混合 RAG，Top-4 证据注入", "对话、评测和知识来源展示"],
        ["工具调用", "Plan-and-Execute 与 function calling", "档案、记录、检索、推荐和干预工具"],
        ["离线兜底", "确定性 Mock、本地规则和本地知识库", "无密钥、超时或异常场景"],
    ], widths=[3.0, 7.0, 5.5])
    doc.add_heading("3.2 评测方法与结果", level=2)
    add_body(doc, "AI 评测使用固定 50 条用例，分别覆盖事实性、个性化、知识依据、工具准确性和安全边界。相同用例在无上下文基线、BM25、混合 RAG 与完整系统上重复运行，用于观察检索与工具链路带来的增益。评测由项目内确定性评分器生成，可复现但不等同于真实用户满意度或医学有效性。")
    add_docx_table(doc, ["指标", "结果", "说明"], [
        ["固定用例通过率", "50/50  100%", "完整系统全部通过既定规则"],
        ["综合得分", "92.6 / 100", "五类能力加权汇总"],
        ["事实性", "79.7", "仍是下一阶段重点提升项"],
        ["个性化", "100", "能使用档案和当日饮食上下文"],
        ["知识依据", "100", "RAG 来源满足既定检查"],
        ["工具准确性", "76.7", "复杂参数和执行链仍需扩充测试"],
        ["安全性", "100", "覆盖医疗边界和危险建议拦截"],
    ], widths=[4.0, 3.8, 7.7])
    add_body(doc, "工程质量门禁包括 ESLint、TypeScript 严格检查、Vite 生产构建、99 项代理自检和 npm 官方漏洞审计。当前 ECharts 已升级至 6.1.0，依赖审计为 0 个已知漏洞。真实模型准确性仍需在同一测试集上进行多次复评，并增加人工双盲评分。")

    doc.add_heading("四 关键技术", level=1)
    add_docx_table(doc, ["层级", "技术", "作用"], [
        ["前端", "Vue 3、Pinia、Vue Router、TailwindCSS、ECharts 6.1", "14 个响应式业务页面、状态管理与可视化"],
        ["AI 接入", "Node 原生 http、OpenAI 兼容接口、SSE", "密钥隔离、流式对话、超时和错误映射"],
        ["智能编排", "混合 RAG、Agent、Function Calling", "召回依据、读取真实状态和执行受控工具"],
        ["算法", "BMI、BMR、TDEE、营养目标与健康评分", "为不同页面提供一致的确定性计算"],
        ["数据", "localStorage、sessionStorage、本地食物和知识库", "适配单机演示和小规模试点"],
        ["安全", "参数裁剪、工具白名单、写入确认、图片上限", "限制模型权限和异常输入影响"],
    ], widths=[2.5, 6.2, 6.8])
    doc.add_heading("4.1 核心执行链", level=2)
    add_bullets(doc, [
        "用户问题或食物图片进入前端编排层，图片先压缩并校验体积。",
        "系统注入身体档案、当日摄入和目标信息，并从 943 个检索单元召回 Top-4 证据。",
        "Node 代理保存密钥并调用云端模型；模型可返回文本或白名单 tool_calls。",
        "前端工具读取 Pinia 状态或执行干预模拟，写入操作必须经用户二次确认。",
        "模型异常时依次降级为确定性 Mock 和本地规则知识库，并显示结果来源。",
    ])
    doc.add_heading("4.2 部署与隐私边界", level=2)
    add_body(doc, "当前版本的登录与本地存储适合竞赛演示、单机体验和小规模试点，不等同于生产级账号系统。公开部署前需限制代理监听地址、配置 Origin 白名单、身份鉴权、速率限制、HTTPS 和日志脱敏；多人长期使用时应迁移到具备权限与加密能力的服务端存储。")

    doc.add_heading("五 项目图片", level=1)
    add_picture(doc, "01-home.png", "图 1  首页总览与四步营养管理主线")
    add_picture(doc, "02-ai-chat.png", "图 2  结合身体档案和当日饮食的 AI 营养对话助手")
    add_picture(doc, "03-intervention.png", "图 3  7 天微干预实验入口与预测结果")
    add_picture(doc, "04-evaluation.png", "图 4  固定测试、混合 RAG 消融结果与能力评分")

    doc.add_heading("六 发表获奖与项目来源说明", level=1)
    doc.add_heading("6.1 发表与获奖情况", level=2)
    add_body(doc, "截至本作品介绍文档编制日期，项目材料中未提供公开发表、软件著作权授权或既往赛事获奖证明，因此本次提交不作已发表或已获奖声明。后续如取得正式证明，应以证书、公告或可核验链接为依据更新本节。")
    doc.add_heading("6.2 是否基于其他项目优化", level=2)
    add_body(doc, "本作品不是在某一既有参赛作品或已发布业务系统上直接改造形成。项目采用 Vue、Vite、ECharts 等成熟开源技术和云端模型接口，但营养业务流程、915 条本地食物数据组织、943 单元混合 RAG、7 个 Agent 工具、三级降级、7 天微干预和评测证据页面均在本项目中完成集成与实现。使用通用开源框架不等同于基于其他项目优化。")

    doc.add_heading("七 应用价值与后续计划", level=1)
    add_docx_table(doc, ["优先级", "计划", "预期收益"], [
        ["P0", "代理绑定地址、Origin 白名单、身份鉴权和限流", "满足真实部署安全基线"],
        ["P1", "营养算法、RAG 和 Agent 工具增加自动化回归测试", "降低规则变更导致的功能回退"],
        ["P1", "真实模型多次复评与人工双盲评分", "提升 AI 评测可信度"],
        ["P2", "服务端账户、加密存储和跨设备同步", "支持多人试点与长期使用"],
        ["P2", "权威营养数据来源标注与版本管理", "增强数据可追溯性"],
    ], widths=[2.2, 8.2, 5.1])

    doc.add_heading("八 提交要求核对", level=1)
    add_docx_table(doc, ["提交要求", "对应内容", "状态"], [
        ["描述项目详情及使用方式", "第一章", "已覆盖"],
        ["描述项目亮点", "第二章", "已覆盖"],
        ["AI 测试技术落地使用情况概述", "第三章", "已覆盖"],
        ["描述项目中涉及的关键技术", "第四章", "已覆盖"],
        ["项目相关图片或照片", "第五章 4 张真实界面截图", "已覆盖"],
        ["项目之前是否发表或获奖", "第六章 6.1", "已如实说明"],
        ["是否基于其他项目优化及优化部分", "第六章 6.2", "已如实说明"],
        ["上传限制", "最终 PDF 单文件且小于 100 MB", "生成后复核"],
    ], widths=[6.0, 6.5, 3.0])
    add_body(doc, "建议提交平台仅上传最终 PDF 文件；DOCX 作为队伍内部可编辑备份保留。提交前再次核对队伍姓名、指导老师、院校名称和赛事材料中的称谓是否一致。", first_indent=False)

    props = doc.core_properties
    props.title = "膳知 AI 营养分析师 作品介绍文档"
    props.subject = "参赛作品介绍"
    props.author = "膳知项目组"
    props.keywords = "AI 营养分析 作品介绍 沧州交通学院"
    doc.save(DOCX_PATH)


pdfmetrics.registerFont(TTFont("MSYH", str(FONT_REGULAR), subfontIndex=0))
pdfmetrics.registerFont(TTFont("MSYH-Bold", str(FONT_BOLD), subfontIndex=0))


class IntroDocTemplate(BaseDocTemplate):
    def __init__(self, filename, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        self.addPageTemplates(PageTemplate(id="main", frames=frame, onPage=self.draw_page))

    def draw_page(self, canvas, doc):
        canvas.saveState()
        if doc.page > 1:
            canvas.setFont("MSYH", 8)
            canvas.setFillColor(colors.HexColor("#777777"))
            canvas.drawRightString(A4[0] - 20 * mm, A4[1] - 12 * mm, "膳知 AI 营养分析师 作品介绍文档")
            canvas.drawCentredString(A4[0] / 2, 10 * mm, f"第 {doc.page} 页")
        canvas.restoreState()


def pdf_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("TitleCN", parent=base["Title"], fontName="MSYH-Bold", fontSize=27, leading=38, textColor=colors.black, alignment=TA_CENTER, spaceAfter=12),
        "subtitle": ParagraphStyle("SubtitleCN", parent=base["Normal"], fontName="MSYH-Bold", fontSize=18, leading=26, textColor=colors.HexColor("#118C82"), alignment=TA_CENTER, spaceAfter=18),
        "cover": ParagraphStyle("CoverCN", parent=base["Normal"], fontName="MSYH", fontSize=10.5, leading=18, textColor=colors.HexColor("#4B5563"), alignment=TA_CENTER),
        "h1": ParagraphStyle("H1CN", parent=base["Heading1"], fontName="MSYH-Bold", fontSize=17, leading=24, textColor=colors.black, spaceBefore=13, spaceAfter=8, keepWithNext=True),
        "h2": ParagraphStyle("H2CN", parent=base["Heading2"], fontName="MSYH-Bold", fontSize=12.5, leading=19, textColor=colors.black, spaceBefore=10, spaceAfter=6, keepWithNext=True),
        "body": ParagraphStyle("BodyCN", parent=base["BodyText"], fontName="MSYH", fontSize=9.8, leading=17, textColor=colors.HexColor("#1F2937"), alignment=TA_LEFT, firstLineIndent=19, spaceAfter=6),
        "table_header": ParagraphStyle("TableHeaderCN", parent=base["BodyText"], fontName="MSYH-Bold", fontSize=9.4, leading=15, textColor=colors.white, alignment=TA_CENTER),
        "bullet": ParagraphStyle("BulletCN", parent=base["BodyText"], fontName="MSYH", fontSize=9.5, leading=16, textColor=colors.HexColor("#1F2937"), leftIndent=15, firstLineIndent=-8, bulletIndent=4, spaceAfter=4),
        "caption": ParagraphStyle("CaptionCN", parent=base["Normal"], fontName="MSYH", fontSize=8.5, leading=13, textColor=colors.HexColor("#667085"), alignment=TA_CENTER, spaceAfter=8),
        "toc": ParagraphStyle("TocCN", parent=base["Normal"], fontName="MSYH", fontSize=10.5, leading=19, textColor=colors.HexColor("#1F2937"), spaceAfter=4),
    }


def P(text, style):
    return Paragraph(text.replace("\n", "<br/>"), style)


def pdf_table(headers, rows, widths):
    data = [[P(h, PDF_STYLES["table_header"]) for h in headers]]
    data.extend([[P(str(v), PDF_STYLES["body"]) for v in row] for row in rows])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="CENTER")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#24374B")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "MSYH-Bold"),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#D9DEE5")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for row_idx in range(1, len(data)):
        commands.append(("BACKGROUND", (0, row_idx), (-1, row_idx), colors.HexColor("#F4F6F8") if row_idx % 2 == 0 else colors.white))
    table.setStyle(TableStyle(commands))
    return table


def pdf_picture(filename, caption):
    path = ASSET_DIR / filename
    with PILImage.open(path) as source:
        width, height = source.size
    max_width = 166 * mm
    max_height = 90 * mm
    scale = min(max_width / width, max_height / height)
    image = Image(str(path), width=width * scale, height=height * scale)
    image.hAlign = "CENTER"
    return KeepTogether([image, Spacer(1, 3 * mm), P(caption, PDF_STYLES["caption"])])


def build_pdf() -> None:
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = IntroDocTemplate(
        str(PDF_PATH), pagesize=A4, leftMargin=21 * mm, rightMargin=21 * mm,
        topMargin=19 * mm, bottomMargin=17 * mm,
        title="膳知 AI 营养分析师 作品介绍文档", author="膳知项目组",
        subject="参赛作品介绍",
    )
    s = PDF_STYLES
    story = [Spacer(1, 45 * mm), P("膳知 AI 营养分析师", s["title"]), P("作品介绍文档", s["subtitle"]), P("面向个人营养管理的可信 AI Web 应用", s["cover"]), Spacer(1, 24 * mm)]
    cover_rows = [[k, v] for k, v in TEAM.items()]
    story.extend([pdf_table(["队伍信息", "内容"], cover_rows, [42 * mm, 92 * mm]), PageBreak()])
    story.extend([P("目录", s["h1"])])
    for item in ["一 项目详情与使用方式", "二 项目亮点", "三 AI 测试技术落地情况", "四 关键技术", "五 项目图片", "六 发表获奖与项目来源说明", "七 应用价值与后续计划", "八 提交要求核对"]:
        story.append(P(item, s["toc"]))
    story.extend([P("作品摘要", s["h1"]), P("膳知 AI 营养分析师是一套面向个人日常饮食管理的 Web 应用。作品将身体评估、食物识别、三餐记录、营养分析、AI 对话、膳食推荐和 7 天微干预连接成可持续的行为闭环，并通过本地可信营养数据、混合 RAG、受控 Agent 和三层降级机制减少模型幻觉与演示中断。当前版本包含 14 个业务页面、915 条食物数据、943 个检索单元和 7 个 Agent 工具，固定 50 条 AI 评测用例全部通过，综合得分 92.6。", s["body"]), pdf_table(["核心规模", "当前结果", "说明"], [["业务页面", "14 个", "覆盖记录、分析、建议、实验和证据页面"], ["本地食物库", "915 条", "识别结果绑定本地条目后才能写入"], ["RAG 检索单元", "943 个", "食物、科普、辟谣与健康习惯"], ["AI 固定评测", "50/50", "五类能力完整覆盖"]], [32 * mm, 29 * mm, 99 * mm])])

    story.extend([P("一 项目详情与使用方式", s["h1"]), P("1.1 项目定位", s["h2"]), P("作品面向希望改善日常饮食但缺少专业工具的普通用户，解决营养信息零散、记录成本高、建议缺少个体背景、一次性建议难以持续和 AI 结论难核验等问题。系统不替代医疗诊断，不宣称自研基础模型；其定位是把成熟模型能力与本地可信数据、确定性营养算法和可验证交互组合成可演示、可复现的营养管理工具。", s["body"]), P("1.2 使用方式", s["h2"]), pdf_table(["步骤", "用户操作", "系统输出"], [["1 建立档案", "填写身体数据和目标", "BMI、BMR、TDEE 和营养目标"], ["2 识别或记录", "上传食物照片或添加饮食", "营养绑定与当日累计"], ["3 查看分析", "进入报告或数据大屏", "评分、缺口、趋势和解释"], ["4 咨询 AI", "文本或语音提问", "结合档案、摄入和 RAG 的回答"], ["5 持续干预", "选择方案并完成 7 天打卡", "预测和真实结果对照"]], [29 * mm, 63 * mm, 68 * mm]), P("本地开发运行需先启动 Node AI 代理，再启动 Vite 前端；生产构建应通过 HTTP 静态服务或反向代理访问，不能使用 file:// 直接双击入口文件。未配置模型密钥时，系统自动进入确定性 Mock 或本地知识库模式。", s["body"])])

    story.extend([P("二 项目亮点", s["h1"]), pdf_table(["亮点", "实现方式", "用户价值"], [["可信数据约束生成", "视觉模型识别名称，本地食物库提供营养数值", "避免模型自由生成营养值"], ["可解释混合 RAG", "BM25、概念向量与 RRF 融合，展示 Top-4 来源", "回答有依据且便于核对"], ["规划执行型 Agent", "2 至 5 步计划，通过 7 个白名单工具执行", "直接利用真实用户状态"], ["最小改变优先", "比较控糖、补蛋白与均衡优化结果", "把建议转为可执行小调整"], ["三级稳定降级", "云端模型、Mock、本地规则逐级接管", "异常时仍可演示"], ["评测证据内置", "固定测试、消融实验与失败案例可视化", "技术效果可复现、可答辩"]], [34 * mm, 72 * mm, 54 * mm])])

    story.extend([P("三 AI 测试技术落地情况", s["h1"]), P("3.1 AI 能力与集成方式", s["h2"]), pdf_table(["能力", "技术方案", "落地位置"], [["视觉识别", "GLM-4V 兼容接口，本地规则兜底", "食物识别页面"], ["营养对话", "文本模型、上下文注入、SSE", "AI 营养对话助手"], ["知识检索", "943 单元混合 RAG，Top-4 注入", "对话、评测和来源展示"], ["工具调用", "Plan-and-Execute 与 function calling", "档案、记录、推荐和干预"], ["离线兜底", "确定性 Mock、本地规则与知识库", "异常场景"]], [28 * mm, 76 * mm, 56 * mm]), P("3.2 评测方法与结果", s["h2"]), P("AI 评测使用固定 50 条用例，覆盖事实性、个性化、知识依据、工具准确性和安全边界。相同用例在无上下文基线、BM25、混合 RAG 与完整系统上重复运行。评测由项目内确定性评分器生成，可复现但不等同于真实用户满意度或医学有效性。", s["body"]), pdf_table(["指标", "结果", "说明"], [["固定用例通过率", "50/50  100%", "完整系统全部通过既定规则"], ["综合得分", "92.6 / 100", "五类能力加权汇总"], ["事实性", "79.7", "下一阶段重点提升"], ["个性化", "100", "使用档案和当日饮食"], ["知识依据", "100", "RAG 来源满足检查"], ["工具准确性", "76.7", "仍需扩充参数测试"], ["安全性", "100", "覆盖医疗边界和危险建议"]], [42 * mm, 35 * mm, 83 * mm]), P("工程质量门禁包括 ESLint、TypeScript 严格检查、Vite 生产构建、99 项代理自检和 npm 官方漏洞审计。当前 ECharts 已升级至 6.1.0，依赖审计为 0 个已知漏洞。真实模型准确性仍需在同一测试集上多次复评，并增加人工双盲评分。", s["body"])])

    story.extend([P("四 关键技术", s["h1"]), pdf_table(["层级", "技术", "作用"], [["前端", "Vue 3、Pinia、Vue Router、TailwindCSS、ECharts 6.1", "响应式页面、状态管理和可视化"], ["AI 接入", "Node 原生 http、OpenAI 兼容接口、SSE", "密钥隔离、流式对话和错误映射"], ["智能编排", "混合 RAG、Agent、Function Calling", "召回依据和执行受控工具"], ["算法", "BMI、BMR、TDEE、营养目标与评分", "跨页面一致的确定性计算"], ["数据", "localStorage、sessionStorage、本地知识库", "适配单机演示和小规模试点"], ["安全", "参数裁剪、工具白名单、写入确认", "限制模型权限和异常输入影响"]], [24 * mm, 76 * mm, 60 * mm]), P("4.1 核心执行链", s["h2"])])
    for text in ["用户问题或食物图片进入前端编排层，图片先压缩并校验体积。", "系统注入身体档案、当日摄入和目标，并从 943 个检索单元召回 Top-4 证据。", "Node 代理保存密钥并调用云端模型；模型可返回文本或白名单 tool_calls。", "前端工具读取真实状态或执行干预模拟，写入操作必须经用户二次确认。", "模型异常时依次降级为确定性 Mock 和本地知识库，并显示结果来源。"]:
        story.append(P("• " + text, s["bullet"]))
    story.extend([P("4.2 部署与隐私边界", s["h2"]), P("当前登录与本地存储适合竞赛演示、单机体验和小规模试点，不等同于生产级账号系统。公开部署前需限制代理监听地址、配置 Origin 白名单、身份鉴权、速率限制、HTTPS 和日志脱敏；多人长期使用时应迁移到具备权限与加密能力的服务端存储。", s["body"])])

    story.extend([PageBreak(), P("五 项目图片", s["h1"]), pdf_picture("01-home.png", "图 1  首页总览与四步营养管理主线"), CondPageBreak(100 * mm), pdf_picture("02-ai-chat.png", "图 2  结合身体档案和当日饮食的 AI 营养对话助手"), PageBreak(), pdf_picture("03-intervention.png", "图 3  7 天微干预实验入口与预测结果"), CondPageBreak(100 * mm), pdf_picture("04-evaluation.png", "图 4  固定测试、混合 RAG 消融结果与能力评分")])

    story.extend([P("六 发表获奖与项目来源说明", s["h1"]), P("6.1 发表与获奖情况", s["h2"]), P("截至本作品介绍文档编制日期，项目材料中未提供公开发表、软件著作权授权或既往赛事获奖证明，因此本次提交不作已发表或已获奖声明。后续如取得正式证明，应以证书、公告或可核验链接为依据更新本节。", s["body"]), P("6.2 是否基于其他项目优化", s["h2"]), P("本作品不是在某一既有参赛作品或已发布业务系统上直接改造形成。项目采用 Vue、Vite、ECharts 等成熟开源技术和云端模型接口，但营养业务流程、915 条本地食物数据组织、943 单元混合 RAG、7 个 Agent 工具、三级降级、七天微干预和评测证据页面均在本项目中完成集成与实现。使用通用开源框架不等同于基于其他项目优化。", s["body"]), P("七 应用价值与后续计划", s["h1"]), pdf_table(["优先级", "计划", "预期收益"], [["P0", "代理绑定地址、Origin 白名单、鉴权和限流", "满足部署安全基线"], ["P1", "算法、RAG 和 Agent 增加自动化回归测试", "降低功能回退风险"], ["P1", "真实模型多次复评与人工双盲评分", "提升 AI 评测可信度"], ["P2", "服务端账户、加密存储和跨设备同步", "支持多人长期使用"], ["P2", "权威数据来源标注与版本管理", "增强数据可追溯性"]], [22 * mm, 84 * mm, 54 * mm]), P("八 提交要求核对", s["h1"]), pdf_table(["提交要求", "对应内容", "状态"], [["描述项目详情及使用方式", "第一章", "已覆盖"], ["描述项目亮点", "第二章", "已覆盖"], ["AI 测试技术落地使用情况", "第三章", "已覆盖"], ["描述关键技术", "第四章", "已覆盖"], ["项目相关图片或照片", "第五章 4 张真实界面截图", "已覆盖"], ["是否发表或获奖", "第六章 6.1", "已如实说明"], ["是否基于其他项目优化", "第六章 6.2", "已如实说明"], ["上传限制", "最终 PDF 单文件且小于 100 MB", "生成后复核"]], [62 * mm, 68 * mm, 30 * mm]), P("建议提交平台只上传最终 PDF 文件，DOCX 作为队伍内部可编辑备份。提交前核对队伍成员、指导老师和院校名称与赛事材料一致。", s["body"])])
    doc.build(story)


PDF_STYLES = pdf_styles()


if __name__ == "__main__":
    required = [ASSET_DIR / f for f in ("01-home.png", "02-ai-chat.png", "03-intervention.png", "04-evaluation.png")]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing screenshots: " + ", ".join(missing))
    build_docx()
    build_pdf()
    print(f"DOCX: {DOCX_PATH}")
    print(f"PDF:  {PDF_PATH}")

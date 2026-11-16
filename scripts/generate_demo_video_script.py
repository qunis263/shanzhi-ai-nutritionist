from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
DOCX_PATH = ROOT / "docs" / "演示视频发言稿.docx"
MD_PATH = ROOT / "docs" / "参赛讲解视频脚本.md"

NAVY = "24374B"
TEAL = "118C82"
PALE = "EEF5F4"
GRAY = "F4F6F8"
TEXT = "1F2937"
BORDER = "D9DEE5"


SEGMENTS = [
    {
        "time": "0:00-0:35",
        "title": "一 开场",
        "screen": "显示项目名称页或登录页。鼠标保持稳定，开始讲话后再缓慢移向登录按钮。",
        "speech": "大家好，我是沧州交通学院参赛队员沙擎炘，团队成员还有李晓瑞、赵家庆，指导老师是孙真真。今天向大家展示我们的作品——膳知 AI 营养分析师。它是一套面向普通用户的营养健康 Web 应用，希望把复杂的营养数据，转化为每天都能理解、能够执行的小建议。",
    },
    {
        "time": "0:35-1:20",
        "title": "二 项目介绍",
        "screen": "登录并进入首页。先停留在首页总览，再缓慢滚动到四步主线区域。",
        "speech": "我们发现，日常饮食管理主要有三个问题：记录麻烦，数据看不懂，建议难坚持。很多应用只能告诉用户吃了多少，却不能结合身体情况解释下一步应该怎么调整。膳知把身体评估、食物识别、三餐记录、营养报告、AI 对话、膳食推荐和七天微干预连接起来，形成从识别、记录、分析到干预的完整闭环。当前系统包含十四个业务页面，前端使用 Vue 3、Pinia 和 ECharts，AI 请求通过轻量 Node 代理转发，模型密钥不会进入浏览器。",
    },
    {
        "time": "1:20-2:10",
        "title": "三 核心功能一 身体评估与饮食记录",
        "screen": "打开身体数据测评页，展示 BMI、BMR、TDEE；切换到三餐记录页，搜索鸡蛋或米饭并加入一条记录。",
        "speech": "首先是身体评估。用户录入年龄、身高、体重、活动强度和目标后，系统会计算 BMI、基础代谢和每日总消耗，并生成热量、蛋白质、脂肪、碳水、膳食纤维、糖、钠和饮水目标。这些计算由本地确定性算法完成，各页面使用同一套结果。接着进入三餐记录。系统内置九百一十五条食物数据，支持搜索、分类和份量换算。现在我选择一种食物加入早餐，可以看到当日摄入、目标完成度和健康评分同步更新。",
    },
    {
        "time": "2:10-3:00",
        "title": "四 核心功能二 AI 食物识别",
        "screen": "进入 AI 食物识别页，上传事先准备的清晰食物图片。展示候选结果、分量和营养信息，再点击加入记录或咨询 AI。",
        "speech": "如果用户不想手动搜索，可以直接上传食物照片。系统先压缩图片并校验大小，再调用视觉模型识别食物名称和候选结果。这里有一个关键设计：模型只负责识别和解释，不直接决定最终营养数值。识别名称必须匹配本地食物库，系统才会根据分量计算营养；如果匹配失败，会明确提示，也不会把不确定结果写入记录。这样可以减少大模型自由生成营养数据造成的误差。识别结果还可以一键加入三餐记录，或者携带结构化数据继续咨询 AI。",
    },
    {
        "time": "3:00-4:05",
        "title": "五 核心功能三 AI 营养对话与 RAG",
        "screen": "进入 AI 营养对话助手。展示右侧个人健康基线，点击一个推荐问题并发送。等待流式输出后展开参考资料。",
        "speech": "接下来是 AI 营养对话助手。它和普通聊天机器人最大的区别，是能够读取用户的身体档案、今日摄入、营养目标和最近饮食记录。比如我询问今天还能吃多少，回答会结合当前热量缺口和营养结构，而不是给出通用模板。每次提问前，系统还会从本地九百四十三个检索单元中召回最相关的四条资料。检索采用 BM25、概念语义匹配和 RRF 融合排序，回答下方会展示资料标题、类别和来源，方便用户核对。对话使用 SSE 流式返回；如果云端异常，系统会自动降级，同时明确显示结果来源。",
    },
    {
        "time": "4:05-5:00",
        "title": "六 核心功能四 Agent 与七天微干预",
        "screen": "在对话页展示计划步骤或工具轨迹，再进入七天微干预实验页，展示推荐方案和预测分数变化。",
        "speech": "对于需要多步处理的问题，系统会进入规划执行型 Agent。它先生成二到五步结构化计划，再按需调用七个白名单工具，例如读取身体档案、查询饮食历史、检索食物营养、生成膳食方案和模拟饮食调整。查询与模拟默认只读，真正写入记录必须由用户再次确认。七天微干预把一次性建议变成持续行动。系统会比较控糖、补蛋白和均衡优化等小幅方案，使用同一套本地营养算法重新计算热量、糖、蛋白质、纤维和健康评分。用户选择后每天打卡，最终把预测和真实结果放在同一时间线上对照。这里展示的是行为反馈，不是医疗效果预测。",
    },
    {
        "time": "5:00-5:50",
        "title": "七 核心功能五 报告与评测证据",
        "screen": "快速展示营养报告或数据大屏，然后进入 AI 能力评测页，停留在综合分、通过率和消融实验区域。",
        "speech": "在营养报告和数据大屏中，用户可以看到健康总分、营养缺口、超标项、七天趋势和改进建议。评分过程由确定性规则计算，因此能够解释分数来自哪些营养指标。为了验证 AI 链路，项目内置固定五十条测试用例，覆盖事实性、个性化、知识依据、工具准确性和安全边界。当前完整系统五十条全部通过，综合得分九十二点六。这里需要说明，这是一组离线、可重复的工程合同评测，用来比较无上下文、BM25、混合 RAG 和完整系统，不代表真实模型准确率，也不等同于医学有效性。",
    },
    {
        "time": "5:50-6:35",
        "title": "八 AI 技术亮点总结",
        "screen": "继续停留在评测页或切回对话页，同时展示 RAG 流程、工具轨迹或来源徽标。",
        "speech": "综合来看，项目的 AI 技术亮点有四点。第一，本地可信数据约束生成，避免模型随意编造营养值。第二，混合 RAG 提供可见来源，让回答能够核验。第三，受控 Agent 只调用白名单工具，并把读取、模拟和写入权限分开。第四，建立云端模型、确定性 Mock、本地规则与知识库三级降级链路，即使没有密钥、网络超时或服务限流，核心流程仍能继续演示。我们的重点不是训练一个新的基础模型，而是把成熟模型、本地数据、营养算法和权限控制组合成稳定、可解释、可复现的应用。",
    },
    {
        "time": "6:35-6:55",
        "title": "九 结尾",
        "screen": "回到首页，停留在项目整体界面。最后一句结束后保持画面两秒，再停止录制。",
        "speech": "以上就是膳知 AI 营养分析师的演示。我们希望通过更低门槛的记录、更可信的分析和更容易坚持的微干预，帮助用户逐步改善日常饮食。感谢各位评委老师观看，欢迎批评指正。",
    },
]


PREP = [
    "录屏画布设置为 1920×1080，浏览器缩放保持 100%，隐藏无关通知和个人信息。",
    "启动前端和 AI 代理，提前登录；准备一张清晰食物照片，并预先跑通识别和对话。",
    "录入少量演示饮食数据，使首页、报告和趋势图有可展示内容。",
    "真实模型响应较慢时可剪去等待过程，但不要剪掉结果来源、RAG 资料和工具轨迹。",
    "口播使用普通话，建议后期自动生成字幕并人工校对专有名词。",
]


def set_run_font(run, size=10.5, bold=False, color=TEXT, italic=False):
    name = "Microsoft YaHei"
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    for key in ("eastAsia", "ascii", "hAnsi"):
        rpr.rFonts.set(qn(f"w:{key}"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic
    run.font.color.rgb = RGBColor.from_string(color)


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=100, start=120, bottom=100, end=120):
    tc_pr = cell._tc.get_or_add_tcPr()
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


def set_table_borders(table):
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
        tag.set(qn("w:sz"), "5")
        tag.set(qn("w:color"), BORDER)


def set_repeat_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    tr_pr.append(header)


def add_page_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = " PAGE "
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instruction, end])
    set_run_font(run, size=8.5, color="777777")


def add_timeline_table(doc):
    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    set_repeat_header(table.rows[0])
    headers = ["时间", "段落", "画面重点"]
    widths = [3.0, 5.2, 8.0]
    for idx, label in enumerate(headers):
        cell = table.rows[0].cells[idx]
        cell.width = Cm(widths[idx])
        set_cell_shading(cell, NAVY)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_run_font(p.add_run(label), size=9.5, bold=True, color="FFFFFF")
    for row_idx, segment in enumerate(SEGMENTS):
        cells = table.add_row().cells
        values = [segment["time"], segment["title"], segment["screen"]]
        for idx, value in enumerate(values):
            cell = cells[idx]
            cell.width = Cm(widths[idx])
            set_cell_margins(cell)
            if row_idx % 2:
                set_cell_shading(cell, GRAY)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER if idx < 2 else WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_after = Pt(0)
            set_run_font(p.add_run(value), size=8.8)


def add_label_paragraph(doc, label, text, color, italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.35
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = label == "画面操作"
    set_run_font(p.add_run(label + "："), size=10, bold=True, color=color)
    set_run_font(p.add_run(text), size=10.2, color=TEXT, italic=italic)


def build_docx():
    DOCX_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(1.8)
    section.bottom_margin = Cm(1.7)
    section.left_margin = Cm(2.1)
    section.right_margin = Cm(2.1)

    normal = doc.styles["Normal"]
    normal.font.name = "Microsoft YaHei"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(10.5)
    for style_name, size in (("Title", 24), ("Heading 1", 17), ("Heading 2", 13)):
        style = doc.styles[style_name]
        style.font.name = "Microsoft YaHei"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.space_before = Pt(12 if style_name != "Title" else 0)
        style.paragraph_format.space_after = Pt(7)
        if style_name == "Title":
            ppr = style._element.get_or_add_pPr()
            border = ppr.find(qn("w:pBdr"))
            if border is not None:
                ppr.remove(border)

    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_run_font(header.add_run("膳知 AI 营养分析师 演示视频发言稿"), size=8.5, color="777777")
    add_page_number(section.footer.paragraphs[0])

    title = doc.add_paragraph(style="Title")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_before = Pt(20)
    set_run_font(title.add_run("膳知 AI 营养分析师演示视频发言稿"), size=24, bold=True, color="000000")
    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.paragraph_format.space_after = Pt(12)
    set_run_font(subtitle.add_run("建议成片时长 6 分 55 秒"), size=11.5, bold=True, color=TEAL)
    info = doc.add_paragraph()
    info.alignment = WD_ALIGN_PARAGRAPH.CENTER
    info.paragraph_format.space_after = Pt(18)
    set_run_font(info.add_run("普通话讲解  MP4 格式  分辨率不低于 1080p  建议配字幕"), size=9.8, color="5F6B78")

    doc.add_heading("使用说明", level=1)
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.4
    p.paragraph_format.space_after = Pt(8)
    set_run_font(p.add_run("灰色的画面操作不需要念出；只朗读“口播”部分。建议先按时间轴完整练习一遍，再根据个人语速微调停顿。"), size=10.5)

    doc.add_heading("时间轴总览", level=1)
    add_timeline_table(doc)

    doc.add_heading("详细发言稿", level=1)
    for segment in SEGMENTS:
        h = doc.add_heading(f'{segment["title"]}  {segment["time"]}', level=2)
        h.paragraph_format.keep_with_next = True
        if segment["title"].startswith("四 "):
            h.paragraph_format.page_break_before = True
        add_label_paragraph(doc, "画面操作", segment["screen"], "5F6B78", italic=True)
        add_label_paragraph(doc, "口播", segment["speech"], TEAL)

    doc.add_page_break()
    doc.add_heading("录制前检查清单", level=1)
    for item in PREP:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.6)
        p.paragraph_format.first_line_indent = Cm(-0.4)
        p.paragraph_format.line_spacing = 1.35
        p.paragraph_format.space_after = Pt(6)
        set_run_font(p.add_run("□  " + item), size=10.3)

    doc.add_heading("口播边界提醒", level=1)
    reminders = [
        "不要说“自研大模型”或“自研识别模型”；项目使用成熟云端模型接口。",
        "不要把 50/50 和 92.6 表述为模型准确率；应称为固定测试集的工程合同评测结果。",
        "不要宣称医疗诊断或治疗效果；项目提供营养学习和生活方式参考。",
        "演示 file:// 双击运行不受支持；录制时使用开发服务器或 HTTP 预览服务。",
    ]
    for item in reminders:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.line_spacing = 1.35
        p.paragraph_format.space_after = Pt(5)
        set_run_font(p.add_run(item), size=10.3)

    props = doc.core_properties
    props.title = "膳知 AI 营养分析师演示视频发言稿"
    props.subject = "5 至 8 分钟参赛演示视频口播与画面操作"
    props.author = "膳知项目组"
    doc.save(DOCX_PATH)


def build_markdown():
    lines = [
        "# 膳知 AI 营养分析师演示视频发言稿",
        "",
        "- 建议成片时长：6 分 55 秒",
        "- 格式：MP4，分辨率不低于 1080p",
        "- 语言：普通话，建议配字幕",
        "- 使用方式：画面操作不需要念出，只朗读口播部分",
        "",
        "## 时间轴总览",
        "",
        "| 时间 | 段落 | 画面重点 |",
        "| --- | --- | --- |",
    ]
    for segment in SEGMENTS:
        lines.append(f'| {segment["time"]} | {segment["title"]} | {segment["screen"]} |')
    lines.extend(["", "## 详细发言稿", ""])
    for segment in SEGMENTS:
        lines.extend([
            f'### {segment["title"]} {segment["time"]}',
            "",
            f'**画面操作：** {segment["screen"]}',
            "",
            f'**口播：** {segment["speech"]}',
            "",
        ])
    lines.extend(["## 录制前检查清单", ""])
    lines.extend([f"- [ ] {item}" for item in PREP])
    lines.extend([
        "",
        "## 口播边界提醒",
        "",
        "- 不宣称自研大模型或自研识别模型。",
        "- 50/50 和 92.6 是固定测试集的工程合同评测结果，不是模型准确率。",
        "- 不宣称医疗诊断或治疗效果。",
        "- 演示通过开发服务器或 HTTP 预览服务运行，不使用 file:// 双击入口。",
        "",
    ])
    MD_PATH.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    build_docx()
    build_markdown()
    spoken = "".join(segment["speech"] for segment in SEGMENTS)
    chinese_chars = sum("\u4e00" <= char <= "\u9fff" for char in spoken)
    print(f"DOCX: {DOCX_PATH}")
    print(f"MD:   {MD_PATH}")
    print(f"Chinese spoken characters: {chinese_chars}")

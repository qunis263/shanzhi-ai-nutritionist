<script setup>
/**
 * NutritionReportView · AI 营养分析报告
 * ------------------------------------------------------------------
 * 页面定位：把「今日饮食记录」交给 nutrition.js 的评分 / 报告算法，
 * 生成一份可解释的 AI 报告，覆盖需求中的三大点评测点：
 *   1. 0–100 当日健康总分（仪表盘 + 等级 + AI 自然语言评语）
 *   2. 分析饮食优缺点（优点 / 待改进双栏）
 *   3. 营养超标项与缺少的营养素（超标 / 缺口双栏 + 改进建议）
 *
 * 视觉约束：明亮马卡龙浅色主题、六大低饱和底色、统一卡片 / 徽章 / 进度条，
 *           承载 ECharts 的卡片一律使用 card-hover-static（只上浮不缩放）。
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
// 算法常量：营养素元信息、评分权重、数值取整
import { NUTRIENT_META, SCORE_WEIGHTS, round1 } from '@/utils/nutrition'
// 图表构造：全站统一配色，禁止自行书写 ECharts option
import {
  macaronGaugeOption,
  macaronPieOption,
  macaronLineOption,
  macaronRadarOption,
  MACARON,
  MACRO_COLORS
} from '@/utils/charts'
import { themeBg, themeText, themeByIndex } from '@/utils/theme'
import { formatCN, weekdayCN, todayStr, isToday } from '@/utils/date'

import MacaronCard from '@/components/common/MacaronCard.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseChart from '@/components/charts/BaseChart.vue'

const dietStore = useDietStore()
const userStore = useUserStore()

/* ===================================================================
 * 一、基础派生数据
 * =================================================================== */
/** 今日 AI 报告（评分 / 优缺点 / 超标项 / 缺口项 / AI 评语） */
const report = computed(() => dietStore.report)
/** 用户档案与身体指标 */
const profile = computed(() => userStore.profile)
const metrics = computed(() => userStore.metrics)
/** 今日是否有饮食记录（用于空状态兜底） */
const hasRecords = computed(() => dietStore.records.length > 0)

/** 报告日期文案（含星期） */
const dateText = computed(() => `${formatCN(todayStr())} ${weekdayCN(todayStr())}`)
/** 「AI 生成的第 N 份报告」——统计有记录的累计天数（含今天） */
const reportNo = computed(() => dietStore.historyDays.filter(d => d.recordCount > 0).length || 1)

/** 参与评分的营养素 key（权重模型的 7 项，不含饮水） */
const scoreKeys = computed(() => Object.keys(SCORE_WEIGHTS))
/** 权重合计（用于说明「满分 100 分」） */
const totalWeight = computed(() => Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0))

/** 等级徽章配色：底色取等级主题、文字取等级主色 */
const gradeBadgeStyle = computed(() => ({
  backgroundColor: themeBg(report.value.grade.theme),
  color: report.value.grade.color
}))

/**
 * 评分构成明细行
 * detail 只给出「权重 / 实得 / 实际值 / 目标值」，这里补两项展示信息：
 *   percent —— 得分率 = got / weight（驱动进度条）
 *   status  —— 取该营养素的实际评估状态（达标 ✅ / 超标 🔴 / 偏少 💡），拿不到时按得分率兜底
 */
const detailRows = computed(() => {
  const items = report.value.items
  return report.value.detail.map(d => {
    const item = items.find(i => i.key === d.key)
    const ratio = d.weight > 0 ? d.got / d.weight : 0
    const status = item ? item.status : ratio >= 0.8 ? 'ok' : ratio >= 0.5 ? 'low' : 'over'
    return { ...d, percent: Math.round(ratio * 100), status }
  })
})

/** 超标项 / 缺口项（双栏渲染） */
const overItems = computed(() => report.value.overItems)
const lowItems = computed(() => report.value.lowItems)

/** 建议序号的循环配色（六种马卡龙底色依次取用） */
function idxStyle(i) {
  return { backgroundColor: themeBg(themeByIndex(i)), color: themeText(themeByIndex(i)) }
}

/** 打印 / 导出报告（调用浏览器打印，可直接另存为 PDF） */
function onPrint() {
  window.print()
}

/* ===================================================================
 * 二、图表配置（必须为 computed）
 * =================================================================== */
/** 健康总分仪表盘：颜色取评分等级主色 */
const gaugeOption = computed(() =>
  macaronGaugeOption({ value: report.value.score, color: report.value.grade.color, name: '健康总分' })
)

/** 三大营养素摄入占比环形饼图（固定配色：碳水橙 / 蛋白绿 / 脂肪黄） */
const pieOption = computed(() => {
  const s = dietStore.summary
  return macaronPieOption({
    data: [
      { name: '碳水', value: s.carb, color: MACRO_COLORS.carb },
      { name: '蛋白质', value: s.protein, color: MACRO_COLORS.protein },
      { name: '脂肪', value: s.fat, color: MACRO_COLORS.fat }
    ],
    centerTitle: '总热量',
    centerValue: Math.round(s.calories),
    centerUnit: 'kcal'
  })
})

/** 雷达图指标（取目标值中可比的 5 项） */
const RADAR_KEYS = ['protein', 'carb', 'fat', 'fiber', 'sugar']
/** 营养素均衡度雷达图：今日实际值与目标值两条系列对比 */
const radarOption = computed(() => {
  const s = dietStore.summary
  const t = dietStore.targets
  const indicators = RADAR_KEYS.map(k => ({
    name: NUTRIENT_META[k].label,
    max: Math.round(Math.max(Number(t[k]) || 1, Number(s[k]) || 0) * 1.3)
  }))
  return macaronRadarOption({
    indicators,
    series: [
      { name: '今日摄入', value: RADAR_KEYS.map(k => round1(s[k])), color: MACARON.green },
      { name: '目标值', value: RADAR_KEYS.map(k => Number(t[k]) || 0), color: MACARON.blue }
    ]
  })
})

/** 近 7 天健康评分折线（含 80 分优秀参考线） */
const scoreLineOption = computed(() =>
  macaronLineOption({
    labels: dietStore.weekData.map(d => d.label),
    series: [{ name: '健康评分', data: dietStore.weekData.map(d => d.score), color: MACARON.green, area: true }],
    target: 80,
    targetLabel: '优秀线',
    unit: '分'
  })
)
</script>

<template>
  <div class="stagger">
    <!-- ================= 页面标题：打印按钮 + 报告日期 ================= -->
    <PageHeader>
      <template #extra>
        <span class="chip chip-strong">🗓️ {{ dateText }}</span>
        <button class="btn btn-ghost" title="打开浏览器打印窗口，选择「另存为 PDF」" @click="onPrint">
          🖨️ 导出 PDF / 打印
        </button>
      </template>
    </PageHeader>

    <!-- ================= 1. 报告头部卡片（档案信息 + 报告份数） ================= -->
    <MacaronCard theme="orange" class="mb-5">
      <div class="flex items-start justify-between gap-6">
        <!-- 左：用户头像与身体档案 -->
        <div class="flex items-center gap-4">
          <span class="emoji-badge-lg mc-white">{{ profile.avatar }}</span>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-[18px] font-extrabold tx-main">{{ profile.nickname }}</h2>
              <span class="tag tag-orange">📋 今日 AI 报告</span>
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tx-sub">
              <span>👤 性别 {{ userStore.genderText }}</span>
              <span>🎂 {{ profile.age }} 岁</span>
              <span>📏 {{ profile.height }} cm</span>
              <span>⚖️ {{ profile.weight }} kg</span>
              <span>📐 BMI {{ metrics.bmi }}（{{ metrics.bmiGrade.label }}）</span>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <span class="tag tag-purple">{{ metrics.dietModeEmoji }} 饮食模式 · {{ metrics.dietMode }}</span>
              <span class="chip">{{ userStore.activityInfo.emoji }} 运动强度 · {{ userStore.activityInfo.label }}</span>
            </div>
          </div>
        </div>

        <!-- 右：报告生成信息 -->
        <div class="shrink-0 text-right">
          <p class="text-[12px] tx-muted">🗓️ 报告日期 · {{ dateText }}</p>
          <p class="mt-1 text-[13px] font-bold tx-main">
            🤖 AI 生成的第 <span class="num text-[20px]">{{ reportNo }}</span> 份报告
          </p>
          <p class="mt-1 num text-[11px] tx-muted">数据口径：今日已记录 {{ dietStore.records.length }} 条饮食</p>
        </div>
      </div>
    </MacaronCard>

    <!-- ================= 2. 总分主卡（仪表盘 + AI 评语） ================= -->
    <div class="mb-5 grid grid-cols-2 gap-5">
      <!-- 左：0–100 健康总分仪表盘（承载图表 → static-scale） -->
      <MacaronCard theme="green" static-scale title="当日健康总分" emoji="🏆" sub="0–100 分 · 加权可解释评分模型">
        <BaseChart :option="gaugeOption" height="220px" />
        <div class="mt-1 flex flex-col items-center gap-2">
          <span class="badge text-[14px] px-4 py-2" :style="gradeBadgeStyle">
            <span aria-hidden="true">{{ report.grade.emoji }}</span>
            <span>{{ report.grade.label }}</span>
          </span>
          <p class="text-center text-[12px] tx-sub">{{ report.grade.desc }}</p>
        </div>
      </MacaronCard>

      <!-- 右：AI 自然语言评语 + 分析维度说明 -->
      <MacaronCard theme="purple" title="AI 智能评语" emoji="🧠" sub="依据今日饮食结构自动生成">
        <p class="text-[13px] leading-relaxed tx-main">{{ report.aiComment }}</p>
        <div class="divider"></div>
        <p class="mb-2 text-[12px] font-bold tx-sub">🔍 AI 分析维度（共 {{ scoreKeys.length }} 项）</p>
        <div class="flex flex-wrap gap-2">
          <span v-for="k in scoreKeys" :key="k" class="tag tag-purple">
            {{ NUTRIENT_META[k].emoji }} {{ NUTRIENT_META[k].label }} · {{ SCORE_WEIGHTS[k] }} 分
          </span>
        </div>
      </MacaronCard>
    </div>

    <!-- 空数据引导：无任何记录时，引导用户先去记录饮食 -->
    <MacaronCard v-if="!hasRecords" theme="white" class="mb-5">
      <EmptyState
        emoji="🍽️"
        text="今日还没有任何饮食记录"
        sub="记录一餐后即可生成完整的 AI 营养分析报告"
        height="150px"
      >
        <RouterLink to="/diet" class="btn btn-primary mt-2">🍽️ 去记录饮食</RouterLink>
      </EmptyState>
    </MacaronCard>

    <!-- ================= 3. 评分构成明细 ================= -->
    <MacaronCard
      theme="yellow"
      class="mb-5"
      title="评分构成明细"
      emoji="🧮"
      :sub="`可解释加权模型 · ${scoreKeys.length} 项权重合计 ${totalWeight} 分`"
    >
      <div class="soft-panel">
        <div v-for="row in detailRows" :key="row.key" class="list-item">
          <span class="emoji-badge mc-yellow">{{ row.emoji }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-3">
              <p class="text-[13px] font-bold tx-main">{{ row.label }}</p>
              <span class="text-[12px] tx-sub">
                实得 <b class="num text-[14px] tx-main">{{ row.got }}</b> / {{ row.weight }} 分
              </span>
            </div>
            <div class="mt-1 flex items-center justify-between text-[11px] tx-muted">
              <span>权重 {{ row.weight }} 分（该指标满分）</span>
              <span class="num">实际 {{ row.value }} / 目标 {{ row.target }}</span>
            </div>
            <div class="mt-2">
              <ProgressBar :percent="row.percent" :status="row.status" height="8px" />
            </div>
          </div>
        </div>
      </div>
    </MacaronCard>

    <!-- ================= 4. 优点 / 待改进 双栏 ================= -->
    <div class="mb-5 grid grid-cols-2 gap-5">
      <!-- 左：饮食优点 -->
      <MacaronCard theme="green" title="饮食优点" emoji="✨" :sub="`共 ${report.strengths.length} 条做得不错的地方`">
        <div class="soft-panel">
          <div v-for="(s, i) in report.strengths" :key="i" class="list-item">
            <span class="text-[15px] leading-none" aria-hidden="true">✅</span>
            <p class="flex-1 text-[13px] leading-relaxed tx-main">{{ s }}</p>
          </div>
          <p v-if="!report.strengths.length" class="p-3 text-[13px] tx-muted">🌱 开始记录饮食，就会慢慢积累出优点～</p>
        </div>
      </MacaronCard>

      <!-- 右：待改进项 -->
      <MacaronCard theme="yellow" title="待改进项" emoji="⚠️" :sub="`共 ${report.weaknesses.length} 条需要留意的问题`">
        <div class="soft-panel">
          <div v-for="(w, i) in report.weaknesses" :key="i" class="list-item">
            <span class="text-[15px] leading-none" aria-hidden="true">🔸</span>
            <p class="flex-1 text-[13px] leading-relaxed tx-main">{{ w }}</p>
          </div>
          <p v-if="!report.weaknesses.length" class="p-3 text-[13px] tx-muted">🎉 今日饮食结构很健康，暂无需改进项</p>
        </div>
      </MacaronCard>
    </div>

    <!-- ================= 5. 营养超标项 与 营养缺口 双栏 ================= -->
    <div class="mb-5 grid grid-cols-2 gap-5">
      <!-- 左：超标项 -->
      <MacaronCard theme="orange" title="营养超标项" emoji="🔴" :sub="`共 ${overItems.length} 项超出建议上限`">
        <div v-if="overItems.length" class="space-y-3">
          <div v-for="i in overItems" :key="i.key" class="soft-panel">
            <div class="flex items-center justify-between gap-2">
              <p class="flex items-center gap-2 text-[13px] font-bold tx-main">
                <span class="emoji-badge mc-orange">{{ i.emoji }}</span
                >{{ i.label }}
              </p>
              <StatusBadge :status="i.status" />
            </div>
            <div class="mt-2 flex items-center justify-between text-[12px]">
              <span class="num tx-over">实际 {{ i.value }}{{ i.unit }}</span>
              <span class="tx-muted">超出目标 {{ i.percent - 100 }}%</span>
            </div>
            <div class="mt-2">
              <ProgressBar :percent="i.percent" status="over" height="8px" />
            </div>
          </div>
        </div>
        <EmptyState v-else emoji="🎉" text="今日没有超标项" sub="各项营养素都控制在建议范围内" height="140px" />
      </MacaronCard>

      <!-- 右：缺口项 -->
      <MacaronCard theme="blue" title="营养缺口" emoji="💡" :sub="`共 ${lowItems.length} 项未达标`">
        <div v-if="lowItems.length" class="space-y-3">
          <div v-for="i in lowItems" :key="i.key" class="soft-panel">
            <div class="flex items-center justify-between gap-2">
              <p class="flex items-center gap-2 text-[13px] font-bold tx-main">
                <span class="emoji-badge mc-blue">{{ i.emoji }}</span
                >{{ i.label }}
              </p>
              <StatusBadge :status="i.status" />
            </div>
            <div class="mt-2 flex items-center justify-between text-[12px]">
              <span class="num tx-muted">实际 {{ i.value }} / 目标 {{ i.target }}{{ i.unit }}</span>
              <span class="num tx-low">还差 {{ round1(i.target - i.value) }}{{ i.unit }}</span>
            </div>
            <div class="mt-2">
              <ProgressBar :percent="i.percent" status="low" height="8px" />
            </div>
          </div>
        </div>
        <EmptyState v-else emoji="✅" text="今日营养无缺口" sub="各项营养素均已达到推荐目标" height="140px" />
      </MacaronCard>
    </div>

    <!-- ================= 6. AI 改进建议 ================= -->
    <MacaronCard theme="purple" class="mb-5" title="AI 改进建议" emoji="💡" sub="按优先级从高到低给出可执行动作">
      <div class="soft-panel space-y-1">
        <div v-for="(s, i) in report.suggestions" :key="i" class="list-item">
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded-pill text-[12px] font-bold"
            :style="idxStyle(i)"
          >
            {{ i + 1 }}
          </span>
          <p class="flex-1 text-[13px] leading-relaxed tx-main">{{ s }}</p>
        </div>
      </div>
    </MacaronCard>

    <!-- ================= 7. 三大营养素占比饼图 + 营养素均衡度雷达图 ================= -->
    <div class="mb-5 grid grid-cols-2 gap-5">
      <MacaronCard theme="orange" static-scale title="三大营养素摄入占比" emoji="🍩" sub="碳水 / 蛋白质 / 脂肪供能结构">
        <BaseChart v-if="hasRecords" :option="pieOption" height="260px" />
        <EmptyState v-else emoji="📊" text="暂无营养素数据" sub="记录饮食后自动生成占比" height="260px" />
      </MacaronCard>

      <MacaronCard theme="cyan" static-scale title="营养素均衡度" emoji="🎯" sub="今日实际摄入 vs 推荐目标值">
        <BaseChart :option="radarOption" height="260px" />
      </MacaronCard>
    </div>

    <!-- ================= 8. 历史报告对比（近 7 天评分） ================= -->
    <MacaronCard
      theme="cyan"
      static-scale
      title="历史报告对比"
      emoji="📈"
      sub="近 7 天健康评分走势（含 80 分优秀参考线）"
    >
      <BaseChart :option="scoreLineOption" height="240px" />

      <!-- 每天一张小卡：评分 + 等级，今日高亮 -->
      <div class="mt-3 grid grid-cols-7 gap-2">
        <div
          v-for="d in dietStore.weekData"
          :key="d.date"
          class="tile mc-white text-center"
          :style="isToday(d.date) ? { boxShadow: 'inset 0 0 0 1px #0f8f84' } : {}"
        >
          <p class="text-[11px] tx-muted">{{ d.label }}</p>
          <p class="tile-value text-[20px]" :style="{ color: d.grade.color }">{{ d.score }}</p>
          <p class="mt-1 text-[11px] font-bold" :style="{ color: d.grade.color }">
            {{ d.grade.emoji }} {{ d.grade.label }}
          </p>
        </div>
      </div>
    </MacaronCard>
  </div>
</template>

<style>
/**
 * 报告页打印 / 导出 PDF 样式（必须非 scoped：侧栏与顶栏在 App.vue 中）
 * ------------------------------------------------------------------
 * 目标：A4 纵向、去掉导航与交互按钮，只保留报告正文，
 *      让用户直接「打印 → 另存为 PDF」即可得到一份干净的营养分析报告。
 */
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm;
  }

  html,
  body {
    background: #fff !important;
  }

  /* 隐藏全局导航、顶栏与路由加载条 */
  .sidebar,
  .topbar,
  .route-progress {
    display: none !important;
  }

  /* 隐藏所有交互按钮，避免 PDF 中出现无效操作 */
  .btn {
    display: none !important;
  }

  /* 主区域去掉内边距与最大宽度，占满 A4 版心 */
  main {
    max-width: none !important;
    padding: 0 !important;
  }

  /* 卡片去阴影、禁止跨页断裂，保留细描边以区分区块 */
  .macaron-card {
    box-shadow: none !important;
    border: 1px solid #e7eaef !important;
    break-inside: avoid;
    page-break-inside: avoid;
    overflow: visible !important;
  }

  /* 关闭入场动画与悬停位移，避免打印时出现半透明或错位 */
  .stagger > * {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .card-hover,
  .card-hover-static {
    transform: none !important;
  }
}
</style>

<script setup>
/**
 * DashboardView · AI 营养数据可视化大屏
 * ------------------------------------------------------------------
 * 页面定位：PC 端「明亮马卡龙风」数据大屏，信息密度高、排布工整，
 *           用 8+ 个 ECharts 图表块 + 概览指标 + 实时时钟，直观展示今日与近一周营养数据。
 *
 * 关键实现：
 *   · 实时时钟：ref + setInterval 每秒刷新，onBeforeUnmount 清理定时器
 *   · 全部图表 option 均为 computed，且一律来自 utils/charts.js 构造函数（配色统一）
 *   · 承载 ECharts 的卡片统一 static-scale（card-hover-static），避免缩放导致画布模糊
 *   · 空数据兜底：无今日记录时用 EmptyState 替代，绝不出现「图表白块」
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
// 营养素元信息（雷达图指标名）+ 数值取整
import { NUTRIENT_META, round1 } from '@/utils/nutrition'
// 图表构造：统一配色，禁止自写 ECharts option
import {
  macaronPieOption,
  macaronLineOption,
  macaronRadarOption,
  macaronMealWaterOption,
  MACARON,
  MACRO_COLORS,
  PALETTE
} from '@/utils/charts'
import { themeByIndex } from '@/utils/theme'
import { formatCN, weekdayCN, todayStr } from '@/utils/date'
// 食物库：用于「食物分类摄入占比」的聚合
import { FOOD_DB } from '@/data/foods'
import { BRAND } from '@/config/brand'

import MacaronCard from '@/components/common/MacaronCard.vue'
import StatTile from '@/components/common/StatTile.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseChart from '@/components/charts/BaseChart.vue'

const dietStore = useDietStore()
const userStore = useUserStore()

/* ===================================================================
 * 一、实时时钟（每秒刷新，组件卸载时务必清理定时器）
 * =================================================================== */
const now = ref(new Date())
let clockTimer = null

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  // 清理定时器，避免内存泄漏与后台空转
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})

/** 补零：9 → '09' */
function pad2(n) {
  return String(n).padStart(2, '0')
}

/** 时钟文案：YYYY年MM月DD日 周三 HH:mm:ss */
const clockText = computed(() => {
  const d = now.value
  return `${d.getFullYear()}年${pad2(d.getMonth() + 1)}月${pad2(d.getDate())}日 ${weekdayCN(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
})

/** 今日日期文案 */
const dateText = computed(() => `${formatCN(todayStr())} ${weekdayCN(todayStr())}`)

/* ===================================================================
 * 二、核心数据派生
 * =================================================================== */
const summary = computed(() => dietStore.summary)
const targets = computed(() => dietStore.targets)
const records = computed(() => dietStore.records)
const hasRecords = computed(() => dietStore.records.length > 0)
const score = computed(() => dietStore.report.score)
const grade = computed(() => dietStore.report.grade)
const stats = computed(() => dietStore.stats)

/** 取某营养素的实际评估状态（供概览指标的状态徽章使用） */
function nutrientStatus(key) {
  const item = dietStore.report.items.find((i) => i.key === key)
  return item ? item.status : 'ok'
}

/* 今日记录流水的展示辅助 */
/** 记录单位：乳品 / 饮品为 ml，其余为 g */
function unitText(r) {
  return String(r.unit || '').includes('ml') ? 'ml' : 'g'
}

/* ===================================================================
 * 三、食物分类聚合（今日记录按 FOOD_DB 分类汇总热量）
 * =================================================================== */
/** id → 分类 的快速索引 */
const FOOD_CATEGORY = FOOD_DB.reduce((acc, f) => {
  acc[f.id] = f.category
  return acc
}, {})

/** 今日各食物分类的热量聚合结果（空数据返回空数组，用于兜底判断） */
const categoryData = computed(() => {
  const sum = {}
  records.value.forEach((r) => {
    const cat = FOOD_CATEGORY[r.foodId] || '其他'
    sum[cat] = (sum[cat] || 0) + (Number(r.nutrition?.calories) || 0)
  })
  return Object.keys(sum).map((name, i) => ({ name, value: round1(sum[name]), color: PALETTE[i % PALETTE.length] }))
})

/* ===================================================================
 * 四、图表配置（全部 computed）
 * =================================================================== */
/** a. 今日三大营养素摄入占比（碳水橙 / 蛋白绿 / 脂肪黄） */
const macroPieOption = computed(() =>
  macaronPieOption({
    data: [
      { name: '碳水', value: summary.value.carb, color: MACRO_COLORS.carb },
      { name: '蛋白质', value: summary.value.protein, color: MACRO_COLORS.protein },
      { name: '脂肪', value: summary.value.fat, color: MACRO_COLORS.fat }
    ],
    centerTitle: '总热量',
    centerValue: Math.round(summary.value.calories),
    centerUnit: 'kcal'
  })
)

/** b. 近一周热量摄入趋势（含目标参考线 + 面积渐变） */
const calorieLineOption = computed(() =>
  macaronLineOption({
    labels: dietStore.weekData.map((d) => d.label),
    series: [{ name: '热量', data: dietStore.weekData.map((d) => d.calories), color: MACARON.orange, area: true }],
    target: targets.value.calories,
    targetLabel: '目标',
    unit: 'kcal'
  })
)

/** d. 饮水与三餐热量分布（双轴柱状图） */
const mealWaterOption = computed(() =>
  macaronMealWaterOption({
    mealLabels: ['早餐', '午餐', '晚餐', '零食'],
    mealValues: dietStore.mealCalories,
    water: dietStore.water,
    waterTarget: targets.value.water
  })
)

/** e. 近一周健康评分走势（含 80 分优秀参考线） */
const scoreLineOption = computed(() =>
  macaronLineOption({
    labels: dietStore.weekData.map((d) => d.label),
    series: [{ name: '健康评分', data: dietStore.weekData.map((d) => d.score), color: MACARON.green, area: true }],
    target: 80,
    targetLabel: '优秀线',
    unit: '分'
  })
)

/** f. 今日食物分类摄入占比（按分类聚合热量） */
const categoryPieOption = computed(() =>
  macaronPieOption({
    data: categoryData.value,
    centerTitle: '今日热量',
    centerValue: Math.round(summary.value.calories),
    centerUnit: 'kcal'
  })
)

/** g. 营养素均衡度雷达（今日实际摄入） */
const RADAR_KEYS = ['protein', 'carb', 'fat', 'fiber', 'sugar']
const radarOption = computed(() => {
  const indicators = RADAR_KEYS.map((k) => ({
    name: NUTRIENT_META[k].label,
    max: Math.round(Math.max(Number(targets.value[k]) || 1, Number(summary.value[k]) || 0) * 1.3)
  }))
  return macaronRadarOption({
    indicators,
    series: [{ name: '今日摄入', value: RADAR_KEYS.map((k) => round1(summary.value[k])), color: MACARON.cyan }]
  })
})

/** h. 近一周蛋白质 / 膳食纤维摄入（双折线） */
const proteinFiberOption = computed(() =>
  macaronLineOption({
    labels: dietStore.weekData.map((d) => d.label),
    series: [
      { name: '蛋白质', data: dietStore.weekData.map((d) => d.protein), color: MACARON.green },
      { name: '膳食纤维', data: dietStore.weekData.map((d) => d.fiber), color: MACARON.cyan }
    ],
    unit: 'g'
  })
)
</script>

<template>
  <div class="stagger flex flex-col gap-5">
    <!-- ================= 顶部标题区：大标题 + 实时时钟 + 用户 / 评分 chip ================= -->
    <header class="flex items-center justify-between gap-6">
      <div class="flex items-center gap-3.5">
        <span class="emoji-badge-lg mc-blue anim-float text-[30px]" aria-hidden="true">🥗</span>
        <div>
          <h1 class="page-title">AI 营养数据可视化大屏</h1>
          <p class="page-desc">🍽️ 实时联动今日饮食记录 · ECharts 多维度营养洞察</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2.5">
        <span class="chip chip-strong num">⏱️ {{ clockText }}</span>
        <span class="chip">{{ userStore.profile.avatar }} {{ userStore.profile.nickname }}</span>
        <span class="chip">
          <span aria-hidden="true">{{ grade.emoji }}</span>
          今日健康评分
          <b class="num" :style="{ color: grade.color }">{{ score }}</b>
          <span class="tx-muted">/ 100</span>
        </span>
      </div>
    </header>

    <!-- ================= 概览指标行：8 个数据小卡（按索引循环配色） ================= -->
    <div class="stagger grid grid-cols-4 gap-5">
      <StatTile :theme="themeByIndex(0)" label="今日热量" emoji="🔥" :value="Math.round(summary.calories)" unit="kcal">
        <StatusBadge :status="nutrientStatus('calories')" size="sm" />
      </StatTile>
      <StatTile :theme="themeByIndex(1)" label="蛋白质" emoji="🥩" :value="round1(summary.protein)" unit="g">
        <StatusBadge :status="nutrientStatus('protein')" size="sm" />
      </StatTile>
      <StatTile :theme="themeByIndex(2)" label="膳食纤维" emoji="🌿" :value="round1(summary.fiber)" unit="g">
        <StatusBadge :status="nutrientStatus('fiber')" size="sm" />
      </StatTile>
      <StatTile :theme="themeByIndex(3)" label="糖分" emoji="🍬" :value="round1(summary.sugar)" unit="g">
        <StatusBadge :status="nutrientStatus('sugar')" size="sm" />
      </StatTile>
      <StatTile :theme="themeByIndex(4)" label="钠" emoji="🧂" :value="Math.round(summary.sodium)" unit="mg">
        <StatusBadge :status="nutrientStatus('sodium')" size="sm" />
      </StatTile>
      <StatTile :theme="themeByIndex(5)" label="饮水" emoji="💧" :value="dietStore.water" unit="ml">
        <StatusBadge :status="nutrientStatus('water')" size="sm" />
      </StatTile>
      <StatTile
        :theme="themeByIndex(6)"
        label="今日健康评分"
        emoji="🏆"
        :value="score"
        unit="分"
        :color="grade.color"
        :sub="`等级：${grade.emoji} ${grade.label}`"
      />
      <StatTile
        :theme="themeByIndex(7)"
        label="本周平均评分"
        emoji="📊"
        :value="stats.avgScore"
        unit="分"
        :sub="`近 ${stats.days} 天有效记录`"
      />
    </div>

    <!-- ================= 图表网格：3 列 + 跨列，共 8 个图表块 ================= -->
    <div class="grid grid-cols-3 gap-5">
      <!-- a. 今日三大营养素摄入占比 -->
      <MacaronCard class="col-span-1" theme="orange" static-scale title="今日三大营养素摄入占比" emoji="🍩" sub="供能结构 / 环形图">
        <BaseChart v-if="hasRecords" :option="macroPieOption" height="260px" />
        <EmptyState v-else emoji="📊" text="暂无营养素数据" sub="去记录一餐即可生成" height="260px" />
      </MacaronCard>

      <!-- b. 近一周热量摄入趋势 -->
      <MacaronCard class="col-span-2" theme="blue" static-scale title="近一周热量摄入趋势" emoji="📈" sub="含每日目标参考线">
        <BaseChart :option="calorieLineOption" height="260px" />
      </MacaronCard>

      <!-- c. 营养达标进度（无 canvas → 普通 hover 即可） -->
      <MacaronCard class="col-span-1" theme="green" title="营养达标进度" emoji="✅" sub="实际 / 目标 逐项达标率">
        <div class="scroll-area no-scrollbar max-h-[248px] space-y-3 pr-1">
          <div v-for="p in dietStore.progressList" :key="p.key" class="soft-panel">
            <div class="flex items-center justify-between gap-2">
              <p class="flex items-center gap-2 text-[12px] font-bold tx-main">
                <span aria-hidden="true">{{ p.emoji }}</span>{{ p.label }}
              </p>
              <StatusBadge :status="p.status" size="sm" />
            </div>
            <div class="mt-1 flex items-center justify-between text-[11px] tx-muted">
              <span class="num">{{ p.value }} / {{ p.target }}{{ p.unit }}</span>
              <span class="num">{{ p.percent }}%</span>
            </div>
            <div class="mt-1.5">
              <ProgressBar :percent="p.percent" :status="p.status" height="8px" :show-label="false" />
            </div>
          </div>
        </div>
      </MacaronCard>

      <!-- d. 饮水与三餐热量分布（双轴柱状图） -->
      <MacaronCard class="col-span-2" theme="cyan" static-scale title="饮水与三餐热量分布" emoji="💧" sub="左轴 kcal / 右轴 ml">
        <BaseChart :option="mealWaterOption" height="260px" />
      </MacaronCard>

      <!-- e. 近一周健康评分走势 -->
      <MacaronCard class="col-span-1" theme="yellow" static-scale title="近一周健康评分走势" emoji="🏆" sub="80 分为优秀线">
        <BaseChart :option="scoreLineOption" height="260px" />
      </MacaronCard>

      <!-- f. 今日食物分类摄入占比 -->
      <MacaronCard class="col-span-1" theme="purple" static-scale title="今日食物分类摄入占比" emoji="🥦" sub="按食物分类聚合热量">
        <BaseChart v-if="categoryData.length" :option="categoryPieOption" height="260px" />
        <EmptyState v-else emoji="🥗" text="暂无分类数据" sub="记录食物后自动聚合" height="260px" />
      </MacaronCard>

      <!-- g. 营养素均衡度雷达 -->
      <MacaronCard class="col-span-1" theme="cyan" static-scale title="营养素均衡度" emoji="🎯" sub="今日实际摄入雷达">
        <BaseChart :option="radarOption" height="260px" />
      </MacaronCard>

      <!-- h. 近一周蛋白质 / 膳食纤维摄入 -->
      <MacaronCard class="col-span-3" theme="blue" static-scale title="近一周蛋白质 / 膳食纤维摄入" emoji="🌿" sub="双折线对比">
        <BaseChart :option="proteinFiberOption" height="240px" />
      </MacaronCard>
    </div>

    <!-- ================= 今日记录流水（整行，可滚动） ================= -->
    <MacaronCard theme="orange" title="今日记录流水" emoji="📝" :sub="`共 ${records.length} 条记录 · 与图表实时联动`">
      <div v-if="records.length" class="scroll-area no-scrollbar max-h-[200px] space-y-2 pr-1">
        <div v-for="r in records" :key="r.id" class="list-item">
          <span class="emoji-badge mc-white" aria-hidden="true">{{ r.emoji }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-[13px] font-bold tx-main">{{ r.name }}</p>
              <span class="tag" :class="'tag-' + dietStore.MEAL_THEME[r.mealType]">
                {{ dietStore.MEAL_EMOJI[r.mealType] }} {{ r.mealType }}
              </span>
            </div>
            <p class="num mt-0.5 text-[11px] tx-muted">{{ r.grams }}{{ unitText(r) }} · {{ r.time }}</p>
          </div>
          <span class="num shrink-0 text-[13px] font-bold tx-main">
            {{ Math.round(r.nutrition.calories) }}<span class="ml-1 text-[11px] tx-muted">kcal</span>
          </span>
        </div>
      </div>
      <EmptyState v-else emoji="🍽️" text="今日暂无记录" sub="去「三餐饮食记录」添加一条，大屏即刻联动" height="160px" />
    </MacaronCard>

    <!-- ================= 底部数据说明 ================= -->
    <p class="text-center text-[11px] tx-muted">
      📌 大屏数据说明：全部数据来源于前端模拟（localStorage 本地持久化），用于教学与学科竞赛演示，不构成真实医疗或营养建议。
      今日日期 {{ dateText }} · {{ BRAND.fullName }} © 大学生学科竞赛项目
    </p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
import { NUTRIENT_META, round1 } from '@/utils/nutrition'
import {
  macaronPieOption,
  macaronLineOption,
  macaronRadarOption,
  macaronMealWaterOption,
  MACARON,
  MACRO_COLORS,
  PALETTE
} from '@/utils/charts'
import { formatCN, weekdayCN, todayStr } from '@/utils/date'
import { FOOD_DB } from '@/data/foods'
import { BRAND } from '@/config/brand'

import StatusBadge from '@/components/common/StatusBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseChart from '@/components/charts/BaseChart.vue'

const dietStore = useDietStore()
const userStore = useUserStore()

const TOPICS = [
  {
    key: 'overview',
    index: '01',
    label: '今日总览',
    eyebrow: '供能结构',
    title: '今天的能量从哪里来',
    description: '查看三大营养素的供能比例与总热量。'
  },
  {
    key: 'energy',
    index: '02',
    label: '能量趋势',
    eyebrow: '近 7 天',
    title: '热量摄入趋势',
    description: '对照每日目标，识别摄入波动。'
  },
  {
    key: 'balance',
    index: '03',
    label: '营养均衡',
    eyebrow: '今日评估',
    title: '营养素均衡度',
    description: '观察关键营养素之间的结构差异。'
  },
  {
    key: 'meals',
    index: '04',
    label: '餐次结构',
    eyebrow: '餐次与饮水',
    title: '餐次热量与饮水分布',
    description: '定位能量集中在哪一餐，并同步查看饮水。'
  },
  {
    key: 'sources',
    index: '05',
    label: '食物来源',
    eyebrow: '分类聚合',
    title: '食物分类摄入占比',
    description: '按食物分类追踪今日热量来源。'
  },
  {
    key: 'score',
    index: '06',
    label: '评分走势',
    eyebrow: '健康表现',
    title: '近一周健康评分',
    description: '以 80 分优秀线观察近期变化。'
  },
  {
    key: 'nutrients',
    index: '07',
    label: '营养趋势',
    eyebrow: '长期结构',
    title: '蛋白质与膳食纤维趋势',
    description: '比较两项关键营养素的周内变化。'
  }
]

const activeTopic = ref('overview')
const recordsOpen = ref(false)
const now = ref(new Date())
let clockTimer = null

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
})

function pad2(value) {
  return String(value).padStart(2, '0')
}

function ratio(value, target) {
  if (!Number(target)) return 0
  return Math.min(100, Math.round((Number(value) / Number(target)) * 100))
}

const clockText = computed(() => {
  const date = now.value
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
})
const dateText = computed(() => `${formatCN(todayStr())} ${weekdayCN(todayStr())}`)
const summary = computed(() => dietStore.summary)
const targets = computed(() => dietStore.targets)
const records = computed(() => dietStore.records)
const hasRecords = computed(() => records.value.length > 0)
const score = computed(() => dietStore.report.score)
const grade = computed(() => dietStore.report.grade)
const stats = computed(() => dietStore.stats)
const activeMeta = computed(() => TOPICS.find(topic => topic.key === activeTopic.value) || TOPICS[0])

function nutrientStatus(key) {
  const item = dietStore.report.items.find(entry => entry.key === key)
  return item ? item.status : 'ok'
}

function unitText(record) {
  return String(record.unit || '').includes('ml') ? 'ml' : 'g'
}

const FOOD_CATEGORY = FOOD_DB.reduce((index, food) => {
  index[food.id] = food.category
  return index
}, {})

const categoryData = computed(() => {
  const totals = {}
  records.value.forEach(record => {
    const category = FOOD_CATEGORY[record.foodId] || '其他'
    totals[category] = (totals[category] || 0) + (Number(record.nutrition?.calories) || 0)
  })
  return Object.keys(totals)
    .map((name, index) => ({ name, value: round1(totals[name]), color: PALETTE[index % PALETTE.length] }))
    .sort((a, b) => b.value - a.value)
})

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

const calorieLineOption = computed(() =>
  macaronLineOption({
    labels: dietStore.weekData.map(day => day.label),
    series: [{ name: '热量', data: dietStore.weekData.map(day => day.calories), color: MACARON.orange, area: true }],
    target: targets.value.calories,
    targetLabel: '目标',
    unit: 'kcal'
  })
)

const mealWaterOption = computed(() =>
  macaronMealWaterOption({
    mealLabels: ['早餐', '午餐', '晚餐', '零食'],
    mealValues: dietStore.mealCalories,
    water: dietStore.water,
    waterTarget: targets.value.water
  })
)

const scoreLineOption = computed(() =>
  macaronLineOption({
    labels: dietStore.weekData.map(day => day.label),
    series: [{ name: '健康评分', data: dietStore.weekData.map(day => day.score), color: MACARON.green, area: true }],
    target: 80,
    targetLabel: '优秀线',
    unit: '分'
  })
)

const categoryPieOption = computed(() =>
  macaronPieOption({
    data: categoryData.value,
    centerTitle: '今日热量',
    centerValue: Math.round(summary.value.calories),
    centerUnit: 'kcal'
  })
)

const RADAR_KEYS = ['protein', 'carb', 'fat', 'fiber', 'sugar']
const radarOption = computed(() => {
  const indicators = RADAR_KEYS.map(key => ({
    name: NUTRIENT_META[key].label,
    max: Math.round(Math.max(Number(targets.value[key]) || 1, Number(summary.value[key]) || 0) * 1.3)
  }))
  return macaronRadarOption({
    indicators,
    series: [{ name: '今日摄入', value: RADAR_KEYS.map(key => round1(summary.value[key])), color: MACARON.cyan }]
  })
})

const proteinFiberOption = computed(() =>
  macaronLineOption({
    labels: dietStore.weekData.map(day => day.label),
    series: [
      { name: '蛋白质', data: dietStore.weekData.map(day => day.protein), color: MACARON.green },
      { name: '膳食纤维', data: dietStore.weekData.map(day => day.fiber), color: MACARON.cyan }
    ],
    unit: 'g'
  })
)

const chartOptions = computed(() => ({
  overview: macroPieOption.value,
  energy: calorieLineOption.value,
  balance: radarOption.value,
  meals: mealWaterOption.value,
  sources: categoryPieOption.value,
  score: scoreLineOption.value,
  nutrients: proteinFiberOption.value
}))

function readableAxis(axis) {
  if (!axis) return axis
  if (Array.isArray(axis)) return axis.map(readableAxis)
  return {
    ...axis,
    axisLabel: { ...(axis.axisLabel || {}), fontSize: 13 },
    nameTextStyle: { ...(axis.nameTextStyle || {}), fontSize: 12 }
  }
}

function readableChartOption(option) {
  return {
    ...option,
    tooltip: option.tooltip
      ? { ...option.tooltip, textStyle: { ...(option.tooltip.textStyle || {}), fontSize: 13 } }
      : option.tooltip,
    legend: option.legend
      ? { ...option.legend, textStyle: { ...(option.legend.textStyle || {}), fontSize: 13 }, itemGap: 20 }
      : option.legend,
    title: option.title
      ? {
          ...option.title,
          textStyle: { ...(option.title.textStyle || {}), fontSize: 26 },
          subtextStyle: { ...(option.title.subtextStyle || {}), fontSize: 13 }
        }
      : option.title,
    xAxis: readableAxis(option.xAxis),
    yAxis: readableAxis(option.yAxis),
    radar: option.radar
      ? { ...option.radar, axisName: { ...(option.radar.axisName || {}), fontSize: 13 } }
      : option.radar
  }
}

const activeOption = computed(() => readableChartOption(chartOptions.value[activeTopic.value]))
const activeChartEmpty = computed(
  () =>
    (activeTopic.value === 'overview' && !hasRecords.value) ||
    (activeTopic.value === 'sources' && !categoryData.value.length)
)

const metricItems = computed(() =>
  [
    {
      key: 'calories',
      label: '今日热量',
      value: Math.round(summary.value.calories),
      unit: 'kcal',
      target: targets.value.calories,
      status: nutrientStatus('calories')
    },
    {
      key: 'protein',
      label: '蛋白质',
      value: round1(summary.value.protein),
      unit: 'g',
      target: targets.value.protein,
      status: nutrientStatus('protein')
    },
    {
      key: 'fiber',
      label: '膳食纤维',
      value: round1(summary.value.fiber),
      unit: 'g',
      target: targets.value.fiber,
      status: nutrientStatus('fiber')
    },
    {
      key: 'sugar',
      label: '糖分',
      value: round1(summary.value.sugar),
      unit: 'g',
      target: targets.value.sugar,
      status: nutrientStatus('sugar')
    },
    {
      key: 'sodium',
      label: '钠',
      value: Math.round(summary.value.sodium),
      unit: 'mg',
      target: targets.value.sodium,
      status: nutrientStatus('sodium')
    },
    {
      key: 'water',
      label: '饮水',
      value: dietStore.water,
      unit: 'ml',
      target: targets.value.water,
      status: nutrientStatus('water')
    },
    {
      key: 'score',
      label: '今日评分',
      value: score.value,
      unit: '分',
      target: 80,
      status: score.value >= 80 ? 'ok' : 'low'
    },
    {
      key: 'week',
      label: '本周均分',
      value: stats.value.avgScore,
      unit: '分',
      target: 80,
      status: stats.value.avgScore >= 80 ? 'ok' : 'low'
    }
  ].map(item => ({ ...item, percent: ratio(item.value, item.target) }))
)

const weekCalories = computed(() => dietStore.weekData.map(day => Number(day.calories) || 0))
const highestMealIndex = computed(() => dietStore.mealCalories.indexOf(Math.max(...dietStore.mealCalories)))
const highestMeal = computed(() => ['早餐', '午餐', '晚餐', '零食'][highestMealIndex.value] || '暂无')
const highestMealCalories = computed(() => dietStore.mealCalories[highestMealIndex.value] || 0)
const topCategory = computed(() => categoryData.value[0] || { name: '暂无', value: 0 })

const topicFacts = computed(() => {
  const facts = {
    overview: [
      {
        label: '今日总热量',
        value: `${Math.round(summary.value.calories)} kcal`,
        note: `目标 ${targets.value.calories} kcal`
      },
      { label: '蛋白质', value: `${round1(summary.value.protein)} g`, note: `目标 ${targets.value.protein} g` },
      { label: '健康评分', value: `${score.value} 分`, note: grade.value.label }
    ],
    energy: [
      { label: '本周最高', value: `${Math.max(...weekCalories.value)} kcal`, note: '单日摄入峰值' },
      { label: '本周最低', value: `${Math.min(...weekCalories.value)} kcal`, note: '单日摄入低点' },
      { label: '日均热量', value: `${stats.value.avgCalories} kcal`, note: `目标 ${targets.value.calories} kcal` }
    ],
    balance: [
      {
        label: '达标项目',
        value: `${dietStore.progressList.filter(item => item.status === 'ok').length} 项`,
        note: `共 ${dietStore.progressList.length} 项`
      },
      { label: '膳食纤维', value: `${round1(summary.value.fiber)} g`, note: `目标 ${targets.value.fiber} g` },
      { label: '糖分', value: `${round1(summary.value.sugar)} g`, note: `参考 ${targets.value.sugar} g` }
    ],
    meals: [
      { label: '热量最高餐次', value: highestMeal.value, note: `${Math.round(highestMealCalories.value)} kcal` },
      { label: '今日饮水', value: `${dietStore.water} ml`, note: `目标 ${targets.value.water} ml` },
      { label: '记录数量', value: `${records.value.length} 条`, note: '今日饮食流水' }
    ],
    sources: [
      { label: '主要来源', value: topCategory.value.name, note: `${Math.round(topCategory.value.value)} kcal` },
      { label: '食物分类', value: `${categoryData.value.length} 类`, note: '根据今日记录聚合' },
      { label: '记录数量', value: `${records.value.length} 条`, note: '点击下方查看流水' }
    ],
    score: [
      { label: '今日评分', value: `${score.value} 分`, note: grade.value.label },
      { label: '本周平均', value: `${stats.value.avgScore} 分`, note: `近 ${stats.value.days} 天` },
      { label: '本周最高', value: `${stats.value.bestScore} 分`, note: formatCN(stats.value.bestDate) }
    ],
    nutrients: [
      { label: '平均蛋白质', value: `${stats.value.avgProtein} g`, note: '近 7 天' },
      { label: '平均膳食纤维', value: `${stats.value.avgFiber} g`, note: '近 7 天' },
      { label: '有效记录', value: `${stats.value.days} 天`, note: '趋势数据范围' }
    ]
  }
  return facts[activeTopic.value] || facts.overview
})

const attentionItems = computed(() => {
  const issues = dietStore.progressList.filter(item => item.status !== 'ok')
  return (issues.length ? issues : dietStore.progressList).slice(0, 4)
})
</script>

<template>
  <div class="dashboard-shell">
    <header class="dashboard-head">
      <div>
        <p class="dashboard-kicker">AI NUTRITION COMMAND CENTER</p>
        <h1>营养数据指挥舱</h1>
        <p>聚焦今日状态，按主题探索营养变化</p>
      </div>
      <div class="live-context">
        <span class="live-dot" aria-hidden="true"></span>
        <div>
          <small>{{ dateText }}</small
          ><strong class="num">{{ clockText }}</strong>
        </div>
        <div>
          <small>当前档案</small><strong>{{ userStore.profile.avatar }} {{ userStore.profile.nickname }}</strong>
        </div>
        <div class="score-context">
          <small>健康评分</small><strong class="num" :style="{ color: grade.color }">{{ score }}<em>/100</em></strong>
        </div>
      </div>
    </header>

    <section class="signal-strip" aria-label="今日核心指标">
      <div v-for="item in metricItems" :key="item.key" class="signal-item" :class="`is-${item.status}`">
        <div class="signal-label">
          <span>{{ item.label }}</span
          ><i>{{ item.percent }}%</i>
        </div>
        <strong class="num"
          >{{ item.value }} <small>{{ item.unit }}</small></strong
        >
        <div class="signal-track"><i :style="{ width: `${item.percent}%` }"></i></div>
      </div>
    </section>

    <section class="command-workspace">
      <nav class="topic-rail" aria-label="分析主题">
        <p>分析主题</p>
        <button
          v-for="topic in TOPICS"
          :key="topic.key"
          type="button"
          :class="{ active: activeTopic === topic.key }"
          @click="activeTopic = topic.key"
        >
          <span class="num">{{ topic.index }}</span
          ><strong>{{ topic.label }}</strong
          ><i aria-hidden="true">→</i>
        </button>
        <div class="rail-footer">
          <span>数据实时联动</span><b>{{ records.length }} 条今日记录</b>
        </div>
      </nav>

      <main class="focus-stage">
        <Transition name="topic-fade" mode="out-in">
          <div :key="activeTopic" class="focus-inner">
            <header class="focus-head">
              <div>
                <p>{{ activeMeta.eyebrow }}</p>
                <h2>{{ activeMeta.title }}</h2>
              </div>
              <span>{{ activeMeta.description }}</span>
            </header>
            <div class="chart-field">
              <BaseChart v-if="!activeChartEmpty" :key="activeTopic" :option="activeOption" height="410px" />
              <EmptyState v-else emoji="📊" text="暂无可分析数据" sub="记录一餐后，当前视图会自动生成" height="410px" />
            </div>
          </div>
        </Transition>
      </main>

      <aside class="intel-rail">
        <header>
          <p>动态情报</p>
          <span>{{ activeMeta.label }}</span>
        </header>
        <div class="fact-list">
          <div v-for="fact in topicFacts" :key="fact.label">
            <span>{{ fact.label }}</span
            ><strong class="num">{{ fact.value }}</strong
            ><small>{{ fact.note }}</small>
          </div>
        </div>
        <div class="attention-list">
          <div class="attention-title">
            <strong>今日关注</strong><span>{{ attentionItems.length }} 项</span>
          </div>
          <div v-for="item in attentionItems" :key="item.key" class="attention-row">
            <div>
              <span>{{ item.emoji }} {{ item.label }}</span
              ><small class="num">{{ item.value }} / {{ item.target }}{{ item.unit }}</small>
            </div>
            <StatusBadge :status="item.status" size="sm" />
          </div>
        </div>
        <button type="button" class="records-trigger" @click="recordsOpen = true">
          <span
            ><small>今日饮食流水</small><strong>{{ records.length }} 条记录</strong></span
          ><i aria-hidden="true">→</i>
        </button>
      </aside>
    </section>

    <footer class="dashboard-foot">
      <span>全部数据来自本机饮食记录，并随录入实时更新</span><span>{{ BRAND.fullName }} · {{ dateText }}</span>
    </footer>

    <Transition name="drawer-fade"
      ><div v-if="recordsOpen" class="records-backdrop" @click="recordsOpen = false"></div
    ></Transition>
    <Transition name="drawer-slide">
      <aside v-if="recordsOpen" class="records-drawer" aria-label="今日饮食流水">
        <header>
          <div>
            <p>实时数据源</p>
            <h2>今日饮食流水</h2>
            <span>{{ records.length }} 条记录与当前图表同步</span>
          </div>
          <button type="button" @click="recordsOpen = false">关闭</button>
        </header>
        <div v-if="records.length" class="records-list">
          <div v-for="record in records" :key="record.id" class="record-row">
            <span class="record-emoji" aria-hidden="true">{{ record.emoji }}</span>
            <div>
              <strong>{{ record.name }}</strong
              ><small
                >{{ dietStore.MEAL_EMOJI[record.mealType] }} {{ record.mealType }} · {{ record.grams
                }}{{ unitText(record) }} · {{ record.time }}</small
              >
            </div>
            <b class="num">{{ Math.round(record.nutrition.calories) }} <small>kcal</small></b>
          </div>
        </div>
        <EmptyState v-else emoji="🍽️" text="今日暂无记录" sub="记录一餐后，大屏会立即联动" height="260px" />
        <footer><RouterLink to="/diet" class="btn btn-primary">前往记录饮食</RouterLink></footer>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.dashboard-shell {
  width: min(1460px, 100%);
  margin: 0 auto;
  padding: 4px 0 36px;
  color: var(--ink);
}
.dashboard-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 34px;
  padding: 16px 0 23px;
  border-bottom: 1px solid var(--line);
}
.dashboard-kicker {
  margin-bottom: 7px;
  color: var(--brand);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1.4px;
}
.dashboard-head h1 {
  font-size: 30px;
  line-height: 1.15;
}
.dashboard-head > div > p:last-child {
  margin-top: 8px;
  color: var(--tx-muted);
  font-size: 13px;
}
.live-context {
  display: flex;
  align-items: center;
  gap: 24px;
}
.live-context > div {
  display: grid;
  gap: 4px;
  padding-left: 24px;
  border-left: 1px solid var(--line);
}
.live-context small {
  color: var(--tx-muted);
  font-size: 11px;
}
.live-context strong {
  font-size: 14px;
}
.live-context .score-context strong {
  font-size: 23px;
}
.score-context em {
  margin-left: 3px;
  color: var(--tx-muted);
  font-size: 11px;
  font-style: normal;
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #27a58b;
  box-shadow: 0 0 0 5px rgba(39, 165, 139, 0.11);
  animation: livePulse 2s ease-in-out infinite;
}
.signal-strip {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  border-bottom: 1px solid var(--line);
}
.signal-item {
  min-width: 0;
  padding: 22px 15px 18px;
}
.signal-item:first-child {
  padding-left: 0;
}
.signal-item + .signal-item {
  border-left: 1px solid var(--line);
}
.signal-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  color: var(--tx-muted);
  font-size: 11px;
}
.signal-label i {
  font-style: normal;
}
.signal-item > strong {
  display: block;
  margin-top: 9px;
  font-size: 22px;
  white-space: nowrap;
}
.signal-item > strong small {
  font-size: 10px;
}
.signal-track {
  height: 3px;
  margin-top: 14px;
  background: #edf0ef;
  overflow: hidden;
}
.signal-track i {
  display: block;
  height: 100%;
  max-width: 100%;
  background: #27a58b;
  transition: width 0.45s ease;
}
.signal-item.is-low .signal-track i {
  background: #d9a33e;
}
.signal-item.is-over .signal-track i {
  background: #d96d72;
}
.command-workspace {
  display: grid;
  grid-template-columns: 205px minmax(0, 1fr) 300px;
  min-height: 590px;
  border-bottom: 1px solid var(--line);
}
.topic-rail {
  display: flex;
  flex-direction: column;
  padding: 30px 24px 24px 0;
  border-right: 1px solid var(--line);
}
.topic-rail > p,
.intel-rail header p {
  margin-bottom: 15px;
  color: var(--tx-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.5px;
}
.topic-rail button {
  display: grid;
  grid-template-columns: 28px 1fr 16px;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 0 10px 0 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--tx-muted);
  text-align: left;
}
.topic-rail button span {
  font-size: 10px;
}
.topic-rail button strong {
  font-size: 13px;
}
.topic-rail button i {
  opacity: 0;
  font-size: 14px;
  font-style: normal;
  transform: translateX(-5px);
  transition: 0.2s;
}
.topic-rail button:hover,
.topic-rail button.active {
  color: var(--brand);
}
.topic-rail button.active strong {
  font-weight: 900;
}
.topic-rail button.active i {
  opacity: 1;
  transform: translateX(0);
}
.rail-footer {
  display: grid;
  gap: 5px;
  margin-top: auto;
  padding-top: 20px;
  color: var(--tx-muted);
  font-size: 10px;
}
.rail-footer b {
  color: var(--tx-sub);
  font-size: 12px;
}
.focus-stage {
  min-width: 0;
  padding: 30px 34px;
}
.focus-inner {
  height: 100%;
}
.focus-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  padding-bottom: 21px;
  border-bottom: 1px solid var(--line);
}
.focus-head p {
  margin-bottom: 5px;
  color: var(--brand);
  font-size: 11px;
  font-weight: 900;
}
.focus-head h2 {
  font-size: 23px;
}
.focus-head > span {
  max-width: 360px;
  color: var(--tx-muted);
  font-size: 11px;
  line-height: 1.6;
  text-align: right;
}
.chart-field {
  padding-top: 16px;
}
.intel-rail {
  padding: 30px 0 24px 28px;
  border-left: 1px solid var(--line);
}
.intel-rail header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
}
.intel-rail header p {
  margin-bottom: 14px;
}
.intel-rail header span {
  padding-bottom: 14px;
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.fact-list > div {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 5px 12px;
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}
.fact-list span {
  color: var(--tx-muted);
  font-size: 11px;
}
.fact-list strong {
  font-size: 17px;
}
.fact-list small {
  grid-column: 1/-1;
  color: var(--tx-muted);
  font-size: 10px;
}
.attention-list {
  margin-top: 24px;
}
.attention-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 10px;
}
.attention-title strong {
  font-size: 13px;
}
.attention-title span {
  color: var(--tx-muted);
  font-size: 10px;
}
.attention-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 13px 0;
  border-top: 1px solid var(--line);
}
.attention-row > div {
  display: grid;
  gap: 4px;
}
.attention-row span {
  font-size: 11px;
  font-weight: 700;
}
.attention-row small {
  color: var(--tx-muted);
  font-size: 10px;
}
.records-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding: 18px 0;
  border: 0;
  border-block: 1px solid var(--line);
  background: transparent;
  text-align: left;
}
.records-trigger span {
  display: grid;
  gap: 4px;
}
.records-trigger small {
  color: var(--tx-muted);
  font-size: 10px;
}
.records-trigger strong {
  font-size: 13px;
}
.records-trigger i {
  color: var(--brand);
  font-size: 15px;
  font-style: normal;
}
.records-trigger:hover {
  color: var(--brand);
}
.dashboard-foot {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding-top: 16px;
  color: var(--tx-muted);
  font-size: 10px;
}
.records-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(28, 38, 35, 0.25);
}
.records-drawer {
  position: fixed;
  z-index: 70;
  top: 0;
  right: 0;
  width: 500px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: -18px 0 50px rgba(25, 38, 34, 0.14);
}
.records-drawer > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 27px 30px 22px;
  border-bottom: 1px solid var(--line);
}
.records-drawer header p {
  color: var(--brand);
  font-size: 11px;
  font-weight: 900;
}
.records-drawer header h2 {
  margin: 5px 0;
  font-size: 23px;
}
.records-drawer header span {
  color: var(--tx-muted);
  font-size: 11px;
}
.records-drawer header button {
  border: 0;
  background: transparent;
  color: var(--tx-muted);
  font-size: 11px;
}
.records-list {
  flex: 1;
  overflow: auto;
  padding: 9px 30px;
}
.record-row {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  border-bottom: 1px solid var(--line);
}
.record-emoji {
  font-size: 22px;
}
.record-row > div {
  display: grid;
  gap: 5px;
}
.record-row strong {
  font-size: 13px;
}
.record-row small {
  color: var(--tx-muted);
  font-size: 10px;
}
.record-row > b {
  font-size: 13px;
}
.record-row > b small {
  font-size: 9px;
}
.records-drawer > footer {
  display: flex;
  justify-content: flex-end;
  padding: 18px 30px;
  border-top: 1px solid var(--line);
}
.attention-row :deep(.badge) {
  font-size: 10px;
}
.topic-fade-enter-active,
.topic-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.topic-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.topic-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.28s ease;
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}
@keyframes livePulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
/* 平板（768–1023px）：侧边栏收起为抽屉，三栏指挥台改为纵向堆叠，
   指标条由 8 列收敛为 4 列，保证图表与情报区都有足够宽度 */
@media (max-width: 1023px) {
  .signal-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .signal-item:nth-child(-n + 4) {
    border-bottom: 1px solid var(--line);
  }
  .signal-item:nth-child(4n + 1) {
    padding-left: 0;
  }
  .command-workspace {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .topic-rail {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    padding: 18px 0;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .topic-rail > p {
    width: 100%;
    margin-bottom: 4px;
  }
  .topic-rail button {
    flex: 1 1 150px;
    grid-template-columns: 20px 1fr 14px;
    min-height: 48px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  .rail-footer {
    display: none;
  }
  .focus-stage {
    padding: 24px 0;
  }
  .focus-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
  .focus-head > span {
    max-width: none;
    text-align: left;
  }
  .intel-rail {
    padding: 22px 0;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
  .topic-fade-enter-active,
  .topic-fade-leave-active,
  .drawer-slide-enter-active,
  .drawer-slide-leave-active {
    transition: none;
  }
}
</style>

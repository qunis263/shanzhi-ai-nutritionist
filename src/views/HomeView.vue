<script setup>
/**
 * HomeView 首页主页
 * ------------------------------------------------------------------
 * 项目《膳知・AI 营养分析师》的门户页面，目标：让评委一进入就看到
 * 「数据实时联动 + AI 分析 + 可视化图表」的整体效果。
 *
 * 页面结构（自上而下）：
 *   ① 页面标题栏（PageHeader）+ 两个快捷入口按钮
 *   ② Hero 概览大卡片：欢迎语 / 今日日期 / 饮食模式 + 健康评分仪表盘 + AI 评语
 *   ③ 今日营养合计：8 个 StatTile（热量 / 蛋白 / 脂肪 / 碳水 / 纤维 / 糖 / 钠 / 饮水）
 *   ④ 两栏图表区：三大营养素占比环形饼图 + 一周热量趋势折线图
 *   ⑤ 今日三餐概览：早餐 / 午餐 / 晚餐 / 零食 四张小卡
 *   ⑥ 营养达标进度条（mc-cyan）
 *   ⑦ AI 营养评语（mc-purple）
 *   ⑧ AI 膳食推荐预览（mc-green）
 *   ⑨ 底部「功能导航」九宫格
 *
 * 说明：所有数据均来自 Pinia Store 的派生 computed，页面本身不保存状态。
 */
import { computed } from 'vue'
import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
import { NAV_ITEMS } from '@/router'
import PageHeader from '@/components/common/PageHeader.vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import StatTile from '@/components/common/StatTile.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseChart from '@/components/charts/BaseChart.vue'
import { macaronGaugeOption, macaronPieOption, macaronLineOption, MACARON } from '@/utils/charts'
import { themeBg, themeByIndex } from '@/utils/theme'
import { NUTRIENT_META, round1 } from '@/utils/nutrition'
import { formatCN, weekdayCN, todayStr } from '@/utils/date'

const dietStore = useDietStore()
const userStore = useUserStore()

/* ============================ 基础数据 ============================ */
const profile = computed(() => userStore.profile) // 用户档案
const metrics = computed(() => userStore.metrics) // 身体指标 / 饮食模式 / 目标
const summary = computed(() => dietStore.summary) // 今日营养合计
const targets = computed(() => dietStore.targets) // 今日营养目标
const report = computed(() => dietStore.report) // 今日 AI 报告
const mealPlan = computed(() => dietStore.mealPlan) // AI 膳食推荐方案
/** 今日是否有饮食记录（用于空状态判断） */
const hasRecords = computed(() => dietStore.records.length > 0)

/** 今日日期展示：10月15日 周三 */
const dateText = computed(() => `${formatCN(todayStr())} ${weekdayCN(todayStr())}`)

/* ============================ 图表配置 ============================ */

/** 健康评分仪表盘（颜色随评分等级变化） */
const gaugeOption = computed(() =>
  macaronGaugeOption({ value: report.value.score, color: report.value.grade.color })
)

/** 三大营养素摄入占比环形饼图 */
const pieOption = computed(() =>
  macaronPieOption({
    data: [
      { name: '碳水', value: summary.value.carb, color: MACARON.orange },
      { name: '蛋白质', value: summary.value.protein, color: MACARON.green },
      { name: '脂肪', value: summary.value.fat, color: MACARON.yellow }
    ],
    centerTitle: '今日总热量',
    centerValue: Math.round(summary.value.calories),
    centerUnit: 'kcal'
  })
)

/** 一周热量趋势折线图（含目标参考线） */
const lineOption = computed(() =>
  macaronLineOption({
    labels: dietStore.weekData.map((d) => d.label),
    series: [{ name: '热量', data: dietStore.weekData.map((d) => d.calories), color: MACARON.orange, area: true }],
    target: targets.value.calories,
    targetLabel: '目标',
    unit: 'kcal'
  })
)

/* ============================ 营养合计小卡 ============================ */

/** 8 项营养素的展示顺序（与 NUTRIENT_META 一致） */
const TILE_KEYS = ['calories', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium', 'water']

/**
 * 组装 8 个 StatTile 的数据：
 * 数值取当日实际摄入，状态取报告中的逐项判定（含饮水）
 */
const tileList = computed(() => {
  const s = summary.value
  const t = targets.value
  const items = report.value.items
  return TILE_KEYS.map((key, i) => {
    const meta = NUTRIENT_META[key]
    const raw = key === 'water' ? dietStore.water : s[key]
    const item = items.find((it) => it.key === key)
    return {
      key,
      theme: themeByIndex(i), // 六色循环配色
      emoji: meta.emoji,
      label: meta.label,
      unit: meta.unit,
      value: key === 'calories' ? Math.round(raw) : round1(raw),
      target: t[key],
      status: item || 'ok'
    }
  })
})

/* ============================ 三餐概览 ============================ */

/** 四个餐段小卡（含餐段合计热量） */
const mealCards = computed(() =>
  dietStore.MEAL_TYPES.map((type, i) => ({
    type,
    emoji: dietStore.MEAL_EMOJI[type],
    theme: dietStore.MEAL_THEME[type],
    records: dietStore.mealGroups[type],
    calories: dietStore.mealCalories[i]
  }))
)

/* ============================ 膳食推荐预览 ============================ */

/** 早 / 午 / 晚三餐推荐（取自 mealPlan） */
const planMeals = computed(() => [
  { key: 'breakfast', label: '早餐', emoji: '🌅', data: mealPlan.value.breakfast },
  { key: 'lunch', label: '午餐', emoji: '☀️', data: mealPlan.value.lunch },
  { key: 'dinner', label: '晚餐', emoji: '🌙', data: mealPlan.value.dinner }
])

/* ============================ 导航 ============================ */

/** 功能导航九宫格数据（由路由表推导，保证与侧边栏一致） */
const navItems = computed(() => NAV_ITEMS)
</script>

<template>
  <div class="stagger">
    <!-- ① 页面标题栏 + 两个快捷入口 -->
    <PageHeader>
      <template #extra>
        <RouterLink to="/recognize" class="btn btn-purple">📷 去识别食物</RouterLink>
        <RouterLink to="/diet" class="btn btn-primary">🍽️ 记录饮食</RouterLink>
      </template>
    </PageHeader>

    <!-- ② Hero 概览大卡片（左：欢迎语与快捷入口 / 右：评分仪表盘与 AI 评语） -->
    <section class="macaron-card mc-orange card-hover-static mb-5">
      <div class="grid items-center gap-6 lg:grid-cols-[1.5fr_1fr]">
        <!-- 左栏：欢迎语 + 日期 + 饮食模式 + 快捷入口 -->
        <div class="flex flex-col justify-center">
          <p class="text-[12px] font-bold" style="color: #b46b3a">🌤️ 今日营养总览</p>
          <h2 class="mt-1.5 text-[24px] font-extrabold tx-main">{{ profile.nickname }}，你好 👋</h2>
          <p class="mt-1 text-[13px] tx-sub">今天是 {{ dateText }}，一起看看今天的饮食表现吧～</p>

          <!-- 今日饮食模式 + 热量进度胶囊 -->
          <div class="mt-3.5 flex flex-wrap items-center gap-2">
            <span class="chip chip-strong">
              <span aria-hidden="true">🎯</span>
              {{ metrics.dietMode }}
              <span class="tx-muted">· 目标 {{ targets.calories }} kcal</span>
            </span>
            <span class="chip">
              <span aria-hidden="true">🔥</span>
              已摄入
              <b class="num chip-strong">{{ Math.round(summary.calories) }}</b>
              kcal
            </span>
          </div>

          <!-- 5 个快捷入口按钮 -->
          <div class="mt-4 flex flex-wrap gap-2.5">
            <RouterLink to="/diet" class="btn btn-primary">🍽️ 记录饮食</RouterLink>
            <RouterLink to="/recognize" class="btn btn-purple">📷 AI食物识别</RouterLink>
            <RouterLink to="/chat" class="btn btn-green">💬 问营养助手</RouterLink>
            <RouterLink to="/foods" class="btn btn-ghost">🍱 食物营养速查</RouterLink>
            <RouterLink to="/report" class="btn btn-ghost">📋 查看报告</RouterLink>
          </div>
        </div>

        <!-- 右栏：健康评分仪表盘 + 等级标签 + AI 评语 -->
        <div class="rounded-[18px] p-4" style="background: rgba(255, 255, 255, 0.72)">
          <BaseChart :option="gaugeOption" height="168px" />
          <div class="mt-2 flex flex-wrap items-center justify-center gap-2">
            <!-- 评分等级标签（底色与文字色随等级变化） -->
            <span class="badge" :style="{ backgroundColor: themeBg(report.grade.theme), color: report.grade.color }">
              {{ report.grade.emoji }} 健康等级 · {{ report.grade.label }}
            </span>
            <span class="chip">📝 已记录 {{ dietStore.records.length }} 条</span>
          </div>
          <!-- 一句话 AI 评语（限 3 行，点击可查看完整报告） -->
          <div class="mt-3 rounded-[14px] bg-white p-3">
            <p class="ellipsis-3 text-[12px] leading-relaxed tx-sub">{{ report.aiComment }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ③ 今日营养合计：8 个 StatTile -->
    <section class="mb-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-[17px] font-extrabold tx-main">
          <span class="emoji-badge mc-green" aria-hidden="true">🧮</span> 今日营养合计
        </h2>
        <span class="text-[12px] tx-muted">目标值随身体档案自动更新 ✨</span>
      </div>

      <div v-if="hasRecords" class="grid grid-cols-4 gap-5">
        <!-- 每张 StatTile 顶部为 Emoji + 名称，主数值为实际摄入，底部副文案为「目标值 + 状态标签」 -->
        <StatTile
          v-for="tile in tileList"
          :key="tile.key"
          :theme="tile.theme"
          :label="tile.label"
          :emoji="tile.emoji"
          :value="tile.value"
          :unit="tile.unit"
        >
          <span>目标 {{ tile.target }}{{ tile.unit }} · </span>
          <StatusBadge :status="tile.status" size="sm" />
        </StatTile>
      </div>

      <!-- 空状态：引导先去记录饮食 -->
      <div v-else class="macaron-card">
        <EmptyState emoji="🍽️" text="今天还没有任何饮食记录" sub="记录第一餐后，这里会自动汇总 8 项营养数据">
          <RouterLink to="/diet" class="btn btn-primary btn-xs mt-2">🍽️ 去记录饮食</RouterLink>
        </EmptyState>
      </div>
    </section>

    <!-- ④ 两栏图表区：三大营养素占比饼图 + 一周热量趋势折线图 -->
    <section class="mb-5 grid grid-cols-2 gap-5">
      <MacaronCard
        theme="orange"
        title="三大营养素摄入占比"
        emoji="🥗"
        sub="碳水 / 蛋白质 / 脂肪供能结构"
        static-scale
      >
        <BaseChart :option="pieOption" height="280px" />
      </MacaronCard>

      <MacaronCard theme="blue" title="一周热量趋势" emoji="📈" sub="最近 7 天热量摄入与目标对比" static-scale>
        <BaseChart :option="lineOption" height="280px" />
      </MacaronCard>
    </section>

    <!-- ⑤ 今日三餐概览 -->
    <section class="mb-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="flex items-center gap-2 text-[17px] font-extrabold tx-main">
          <span class="emoji-badge mc-orange" aria-hidden="true">🍱</span> 今日三餐概览
        </h2>
        <RouterLink to="/diet" class="btn btn-ghost btn-xs">去记录 +</RouterLink>
      </div>

      <div v-if="hasRecords" class="grid grid-cols-4 gap-5">
        <MacaronCard
          v-for="meal in mealCards"
          :key="meal.type"
          :theme="meal.theme"
          :title="meal.type"
          :emoji="meal.emoji"
          :sub="`${meal.records.length} 种食物`"
          flex
        >
          <!-- 有记录：逐条展示「Emoji + 名称 + 热量小标签」 -->
          <div v-if="meal.records.length" class="space-y-2.5">
            <div v-for="r in meal.records" :key="r.id" class="flex items-center gap-2">
              <span aria-hidden="true">{{ r.emoji }}</span>
              <span class="ellipsis flex-1 text-[12px] tx-main">{{ r.name }}</span>
              <span class="tag tag-orange num">{{ Math.round(r.nutrition.calories) }} kcal</span>
            </div>
          </div>
          <!-- 空餐段：小尺寸空状态提示 -->
          <EmptyState v-else emoji="🥢" text="该餐段暂无记录" height="96px" />

          <!-- 卡片底部：餐段合计热量 -->
          <template #footer>
            <div class="flex items-center justify-between pt-3" style="border-top: 1px solid #eff3f8">
              <span class="text-[12px] tx-muted">餐段合计</span>
              <span class="num text-[15px] font-extrabold tx-main">
                {{ meal.calories }}<span class="ml-1 text-[11px] tx-muted">kcal</span>
              </span>
            </div>
          </template>
        </MacaronCard>
      </div>

      <div v-else class="macaron-card">
        <EmptyState emoji="🍽️" text="三餐空空如也" sub="快去记录今天吃了什么吧">
          <RouterLink to="/diet" class="btn btn-primary btn-xs mt-2">🍽️ 去记录饮食</RouterLink>
        </EmptyState>
      </div>
    </section>

    <!-- ⑥ 营养达标进度条（mc-cyan） -->
    <MacaronCard theme="cyan" title="营养达标进度" emoji="📈" sub="实际摄入 / 目标值（含饮水）" class="mb-5">
      <div v-if="hasRecords" class="space-y-4">
        <div v-for="p in dietStore.progressList" :key="p.key" class="flex items-center gap-3">
          <span class="w-6 shrink-0 text-center text-[16px]" aria-hidden="true">{{ p.emoji }}</span>
          <span class="w-[76px] shrink-0 text-[12px] font-semibold tx-main">{{ p.label }}</span>
          <span class="num w-[132px] shrink-0 text-[12px] tx-sub">
            {{ p.value }} / {{ p.target }} {{ p.unit }}
          </span>
          <ProgressBar class="flex-1" :percent="p.percent" :status="p.status" />
          <StatusBadge :status="p" size="sm" />
        </div>
      </div>

      <EmptyState v-else emoji="📊" text="暂无营养数据" sub="记录一餐后即可看到各项达标进度">
        <RouterLink to="/diet" class="btn btn-primary btn-xs mt-2">🍽️ 去记录饮食</RouterLink>
      </EmptyState>
    </MacaronCard>

    <!-- ⑦ AI 营养评语（mc-purple） -->
    <MacaronCard
      theme="purple"
      title="AI 营养评语"
      emoji="🤖"
      sub="基于当日营养结构生成的智能点评"
      class="mb-5"
    >
      <template #extra>
        <RouterLink to="/report" class="btn btn-purple btn-xs">查看完整报告</RouterLink>
      </template>
      <p class="text-[13px] leading-[1.9] tx-main">{{ report.aiComment }}</p>
    </MacaronCard>

    <!-- ⑧ AI 膳食推荐预览（mc-green） -->
    <MacaronCard
      theme="green"
      title="AI 膳食推荐预览"
      emoji="🧑‍🍳"
      sub="按当前营养缺口智能定制三餐方案"
      class="mb-5"
    >
      <template #extra>
        <RouterLink to="/plan" class="btn btn-green btn-xs">查看完整方案</RouterLink>
      </template>
      <div class="grid grid-cols-3 gap-5">
        <div v-for="meal in planMeals" :key="meal.key" class="soft-panel">
          <div class="flex items-center gap-2.5">
            <span class="emoji-badge-lg" :class="`mc-${meal.data.theme}`" aria-hidden="true">
              {{ meal.data.emoji }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-1.5 text-[13px] font-bold tx-main">
                <span aria-hidden="true">{{ meal.emoji }}</span>{{ meal.label }}
              </p>
              <p class="mt-0.5 ellipsis text-[12px] tx-sub">{{ meal.data.name }}</p>
            </div>
            <span class="tag tag-green num shrink-0">🔥 {{ meal.data.nutrition.calories }} kcal</span>
          </div>
          <!-- 推荐理由（AI 决策解释） -->
          <p class="mt-3 ellipsis-2 text-[12px] leading-relaxed tx-muted">{{ meal.data.reason }}</p>
        </div>
      </div>
    </MacaronCard>

    <!-- ⑨ 功能导航九宫格 -->
    <section>
      <div class="mb-3 flex items-center gap-2">
        <span class="emoji-badge mc-blue" aria-hidden="true">🧭</span>
        <h2 class="text-[17px] font-extrabold tx-main">功能导航</h2>
      </div>
      <div class="grid grid-cols-3 gap-5">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="macaron-card card-hover block"
          :class="`mc-${item.theme}`"
        >
          <div class="flex items-start gap-3">
            <span class="emoji-badge-lg" aria-hidden="true">{{ item.emoji }}</span>
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-2 text-[14px] font-bold tx-main">
                <span class="truncate">{{ item.title }}</span>
                <span v-if="item.badge" class="tag tag-purple text-[10px]">{{ item.badge }}</span>
              </p>
              <p class="mt-1 ellipsis-2 text-[12px] tx-sub">{{ item.desc }}</p>
            </div>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

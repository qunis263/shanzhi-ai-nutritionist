<script setup>
/**
 * HomeView 首页主页
 * ------------------------------------------------------------------
 * 首页只回答两个问题：今天状态如何，以及下一步最该做什么。
 * 完整营养数据、趋势图和长篇 AI 分析由对应功能页承载，避免首页重复堆叠。
 */
import { computed } from 'vue'
import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
import PageHeader from '@/components/common/PageHeader.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import { buildDailyBrief } from '@/utils/nutrition'
import { formatCN, weekdayCN, todayStr } from '@/utils/date'

const dietStore = useDietStore()
const userStore = useUserStore()

const profile = computed(() => userStore.profile)
const metrics = computed(() => userStore.metrics)
const summary = computed(() => dietStore.summary)
const targets = computed(() => dietStore.targets)
const report = computed(() => dietStore.report)
const mealPlan = computed(() => dietStore.mealPlan)
const dateText = computed(() => `${formatCN(todayStr())} ${weekdayCN(todayStr())}`)
const hasRecords = computed(() => dietStore.records.length > 0)

function itemOf(key) {
  return report.value.items.find(item => item.key === key) || { percent: 0, status: 'ok' }
}

const calorieItem = computed(() => itemOf('calories'))
const waterItem = computed(() => itemOf('water'))
const calorieValue = computed(() => Math.round(summary.value.calories))
const waterValue = computed(() => dietStore.water)
const brief = computed(() => buildDailyBrief({ report: report.value, records: dietStore.records }))

const scoreStyle = computed(() => ({
  background: `conic-gradient(var(--brand) 0 ${Math.max(0, Math.min(100, report.value.score))}%, #e9eeed ${Math.max(0, Math.min(100, report.value.score))}% 100%)`
}))

const mealRows = computed(() =>
  dietStore.MEAL_TYPES.map((type, index) => {
    const records = dietStore.mealGroups[type]
    return {
      type,
      emoji: dietStore.MEAL_EMOJI[type],
      records,
      calories: dietStore.mealCalories[index],
      summary: records.length
        ? records
            .slice(0, 3)
            .map(record => record.name)
            .join('、')
        : '尚未记录'
    }
  })
)

const nextMeal = computed(() => {
  const unrecorded = mealRows.value.find(meal => meal.type !== '零食' && !meal.records.length)
  return unrecorded || null
})

const focusTitle = computed(() => {
  if (!hasRecords.value) return `${profile.value.nickname}，先记录今天的第一餐`
  if (nextMeal.value) return `${profile.value.nickname}，先把${nextMeal.value.type}安排好`
  return `${profile.value.nickname}，今天还有一件事值得调整`
})

const focusAction = computed(() => {
  if (!hasRecords.value) return '记录后，热量、饮水和健康建议会自动更新。'
  return brief.value.tip
})

const nextTitle = computed(() => (nextMeal.value ? `补记${nextMeal.value.type}` : '查看今日完整分析'))
const nextDescription = computed(() => {
  if (!hasRecords.value) return '从早餐、午餐或刚刚吃过的食物开始。'
  if (nextMeal.value?.type === '晚餐') {
    return mealPlan.value?.dinner?.name ? `推荐：${mealPlan.value.dinner.name}` : '建议选择优质蛋白、蔬菜和适量主食。'
  }
  if (nextMeal.value) return `补全${nextMeal.value.type}后，今日评分会更准确。`
  return '查看营养缺口、趋势变化和更完整的 AI 建议。'
})

/** 首页主线四步：识别 → 记录 → 报告 → 干预，构成完整使用闭环 */
const flowSteps = [
  { to: '/recognize', emoji: '📷', title: '拍照识别', desc: '上传食物照片，AI 判断食材并估算分量' },
  { to: '/diet', emoji: '🍽️', title: '记录饮食', desc: '确认分量后加入今日记录，热量自动核算' },
  { to: '/report', emoji: '📊', title: '查看报告', desc: '获得健康总分、营养缺口与 AI 改进建议' },
  { to: '/intervention', emoji: '🌱', title: '7 天干预', desc: '按计划逐日调整，跟踪连续改善效果' }
]
</script>

<template>
  <div class="home-focus stagger">
    <PageHeader>
      <template #extra>
        <RouterLink to="/recognize" class="btn btn-ghost">📷 识别食物</RouterLink>
        <RouterLink to="/diet" class="btn btn-primary">🍽️ 记录饮食</RouterLink>
      </template>
    </PageHeader>

    <main class="focus-shell">
      <section class="focus-heading">
        <div>
          <p class="focus-eyebrow">今日重点 · {{ dateText }}</p>
          <h2>{{ focusTitle }}</h2>
          <p>{{ focusAction }}</p>
        </div>
        <div class="focus-heading-actions">
          <RouterLink to="/diet" class="btn btn-primary">记录饮食</RouterLink>
          <RouterLink to="/chat" class="btn btn-ghost">问营养助手</RouterLink>
        </div>
      </section>

      <section class="focus-overview">
        <div class="focus-message">
          <span class="focus-status" :style="{ color: report.grade.color }">
            {{ report.grade.emoji }} {{ report.grade.label }}
          </span>
          <h3>{{ brief.praise }}</h3>
          <p>{{ brief.tip }}</p>
          <div class="focus-profile-line">
            <span>目标：{{ metrics.dietMode }}</span>
            <span>已记录 {{ dietStore.records.length }} 条</span>
          </div>
        </div>

        <div class="focus-score" :style="scoreStyle" :aria-label="`今日健康评分 ${report.score} 分`">
          <div>
            <strong class="num">{{ report.score }}</strong>
            <span>今日健康分</span>
          </div>
        </div>
      </section>

      <section class="focus-progress" aria-label="今日核心进度">
        <div class="focus-progress-item">
          <div class="focus-progress-head">
            <span>🔥 今日热量</span>
            <strong class="num"
              >{{ calorieValue }} <small>/ {{ targets.calories }} kcal</small></strong
            >
          </div>
          <ProgressBar :percent="calorieItem.percent" :status="calorieItem.status" :show-label="false" />
        </div>
        <div class="focus-progress-item">
          <div class="focus-progress-head">
            <span>💧 今日饮水</span>
            <strong class="num"
              >{{ waterValue }} <small>/ {{ targets.water }} ml</small></strong
            >
          </div>
          <ProgressBar :percent="waterItem.percent" :status="waterItem.status" :show-label="false" />
        </div>
      </section>

      <section class="focus-flow" aria-label="核心使用流程">
        <div class="focus-section-head">
          <div>
            <h3>四步完成今天</h3>
            <p>识别 → 记录 → 报告 → 干预，形成可持续的调整闭环</p>
          </div>
          <RouterLink to="/report">查看报告 →</RouterLink>
        </div>
        <div class="flow-grid">
          <RouterLink v-for="(step, i) in flowSteps" :key="step.to" :to="step.to" class="flow-step">
            <span class="flow-step-index num" aria-hidden="true">0{{ i + 1 }}</span>
            <span class="flow-step-emoji" aria-hidden="true">{{ step.emoji }}</span>
            <span class="flow-step-title">{{ step.title }}</span>
            <span class="flow-step-desc">{{ step.desc }}</span>
            <span class="flow-step-link">进入 →</span>
          </RouterLink>
        </div>
      </section>

      <section class="focus-lower">
        <div class="focus-meals">
          <div class="focus-section-head">
            <div>
              <h3>今日饮食</h3>
              <p>只保留餐次摘要，食物明细在饮食记录页查看</p>
            </div>
            <RouterLink to="/diet">全部记录 →</RouterLink>
          </div>

          <div v-if="hasRecords" class="meal-list">
            <RouterLink v-for="meal in mealRows" :key="meal.type" to="/diet" class="meal-row">
              <span class="meal-name"
                ><b aria-hidden="true">{{ meal.emoji }}</b
                >{{ meal.type }}</span
              >
              <span class="meal-summary">{{ meal.summary }}</span>
              <span v-if="meal.records.length" class="meal-calories num">{{ meal.calories }} kcal</span>
              <span v-else class="meal-empty">去记录</span>
            </RouterLink>
          </div>

          <div v-else class="focus-empty">
            <span aria-hidden="true">🥢</span>
            <div>
              <strong>今天还没有饮食记录</strong>
              <p>添加第一餐后，这里会形成清晰的餐次摘要。</p>
            </div>
            <RouterLink to="/diet" class="btn btn-primary btn-xs">记录第一餐</RouterLink>
          </div>
        </div>

        <aside class="focus-next">
          <p class="focus-eyebrow">下一步</p>
          <h3>{{ nextTitle }}</h3>
          <p>{{ nextDescription }}</p>
          <RouterLink v-if="nextMeal || !hasRecords" to="/diet" class="btn btn-primary">
            {{ nextMeal ? `添加${nextMeal.type}` : '开始记录' }}
          </RouterLink>
          <RouterLink v-else to="/report" class="btn btn-primary">查看完整报告</RouterLink>
          <RouterLink to="/plan" class="focus-secondary-link">查看膳食方案 →</RouterLink>
        </aside>
      </section>

      <nav class="focus-footer-links" aria-label="首页次要功能">
        <RouterLink to="/report">营养分析报告</RouterLink>
        <RouterLink to="/foods">食物营养速查</RouterLink>
        <RouterLink to="/body">身体数据测评</RouterLink>
        <RouterLink to="/dashboard">数据趋势大屏</RouterLink>
      </nav>
    </main>
  </div>
</template>

<style scoped>
.focus-shell {
  width: min(980px, 100%);
  margin: 0 auto;
  padding: 8px 0 48px;
}
.focus-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 0 28px;
}
.focus-eyebrow {
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.focus-heading h2 {
  margin-top: 7px;
  color: var(--ink);
  font-size: clamp(25px, 3vw, 34px);
  font-weight: 800;
  letter-spacing: 0;
}
.focus-heading > div > p:last-child {
  margin-top: 8px;
  color: var(--tx-sub);
  font-size: 13px;
}
.focus-heading-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  padding-top: 18px;
}
.focus-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 170px;
  align-items: center;
  gap: 40px;
  padding: 28px 0;
  border-block: 1px solid var(--line);
}
.focus-message {
  display: grid;
  justify-items: start;
  gap: 8px;
}
.focus-status {
  font-size: 12px;
  font-weight: 800;
}
.focus-message h3 {
  color: var(--ink);
  font-size: 20px;
  font-weight: 800;
}
.focus-message > p {
  max-width: 620px;
  color: var(--tx-sub);
  font-size: 13px;
  line-height: 1.8;
}
.focus-profile-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 5px;
  color: var(--tx-muted);
  font-size: 11px;
}
.focus-score {
  width: 146px;
  height: 146px;
  display: grid;
  place-items: center;
  justify-self: end;
  border-radius: 50%;
  position: relative;
}
.focus-score::after {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: #fff;
}
.focus-score > div {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
}
.focus-score strong {
  color: var(--ink);
  font-size: 34px;
  line-height: 1;
}
.focus-score span {
  margin-top: 6px;
  color: var(--tx-muted);
  font-size: 10px;
}
.focus-progress {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 34px;
  padding: 26px 0;
  border-bottom: 1px solid var(--line);
}
.focus-progress-item {
  display: grid;
  gap: 10px;
}
.focus-progress-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
}
.focus-progress-head > span {
  color: var(--tx-main);
  font-weight: 700;
}
.focus-progress-head strong {
  color: var(--ink);
  font-size: 14px;
}
.focus-progress-head small {
  color: var(--tx-muted);
  font-size: 10px;
  font-weight: 500;
}
.focus-lower {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 42px;
  padding: 30px 0;
}
.focus-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 12px;
}
.focus-section-head h3,
.focus-next h3 {
  color: var(--ink);
  font-size: 16px;
  font-weight: 800;
}
.focus-section-head p {
  margin-top: 3px;
  color: var(--tx-muted);
  font-size: 11px;
}
.focus-section-head a,
.focus-secondary-link {
  color: var(--brand);
  font-size: 11px;
  font-weight: 700;
}
.meal-list {
  border-top: 1px solid var(--line);
}
.meal-row {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) 84px;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  border-bottom: 1px solid var(--line);
  transition: background 0.2s ease;
}
.meal-row:hover {
  background: #fafcfc;
}
.meal-name {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}
.meal-summary {
  overflow: hidden;
  color: var(--tx-sub);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meal-calories,
.meal-empty {
  justify-self: end;
  font-size: 11px;
}
.meal-calories {
  color: var(--tx-sub);
}
.meal-empty {
  color: var(--brand);
  font-weight: 700;
}
.focus-next {
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 10px;
  padding-left: 24px;
  border-left: 3px solid var(--brand);
}
.focus-next > p:not(.focus-eyebrow) {
  color: var(--tx-sub);
  font-size: 12px;
  line-height: 1.7;
}
.focus-next .btn {
  margin-top: 4px;
}
.focus-secondary-link {
  margin-top: 2px;
}
.focus-empty {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 13px;
  padding: 24px 0;
  border-block: 1px solid var(--line);
}
.focus-empty > span {
  font-size: 28px;
}
.focus-empty strong {
  color: var(--ink);
  font-size: 13px;
}
.focus-empty p {
  margin-top: 2px;
  color: var(--tx-muted);
  font-size: 11px;
}
.focus-footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.focus-footer-links a {
  color: var(--tx-muted);
  font-size: 11px;
  font-weight: 700;
}
.focus-footer-links a:hover {
  color: var(--brand);
}
/* 主线四步：识别 → 记录 → 报告 → 干预 */
.focus-flow {
  padding: 26px 0;
  border-bottom: 1px solid var(--line);
}
.flow-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.flow-step {
  position: relative;
  display: grid;
  align-content: start;
  gap: 5px;
  padding: 14px 14px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.flow-step:hover {
  border-color: var(--brand);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(15, 143, 132, 0.08);
}
.flow-step:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.flow-step-index {
  position: absolute;
  top: 12px;
  right: 12px;
  color: var(--tx-muted);
  font-size: 11px;
  font-weight: 800;
}
.flow-step-emoji {
  font-size: 20px;
  line-height: 1.2;
}
.flow-step-title {
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
}
.flow-step-desc {
  color: var(--tx-sub);
  font-size: 12px;
  line-height: 1.6;
}
.flow-step-link {
  margin-top: 1px;
  color: var(--brand);
  font-size: 11px;
  font-weight: 700;
}
@media (max-width: 720px) {
  .home-focus :deep(header.mb-5) {
    display: block;
  }
  .home-focus :deep(header.mb-5 > div:last-child) {
    display: none;
  }
  .home-focus :deep(header.mb-5 > div:first-child) {
    min-width: 0;
  }
  .focus-shell {
    padding-top: 0;
  }
  .focus-heading {
    align-items: stretch;
    flex-direction: column;
    padding-top: 8px;
  }
  .focus-heading-actions {
    padding-top: 0;
  }
  .focus-heading-actions .btn {
    flex: 1;
  }
  .focus-overview {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .focus-score {
    width: 120px;
    height: 120px;
    justify-self: start;
  }
  .focus-score strong {
    font-size: 28px;
  }
  .focus-progress,
  .focus-lower {
    grid-template-columns: 1fr;
  }
  .flow-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .focus-progress {
    gap: 20px;
  }
  .focus-lower {
    gap: 28px;
  }
  .focus-next {
    padding: 20px 0 0;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .meal-row {
    grid-template-columns: 68px minmax(0, 1fr) 70px;
  }
  .focus-empty {
    grid-template-columns: auto 1fr;
  }
  .focus-empty .btn {
    grid-column: 1 / -1;
    width: 100%;
  }
}
</style>

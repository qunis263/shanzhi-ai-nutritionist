<script setup>
import { computed, reactive, ref } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
import { MEAL_EMOJI } from '@/data/mockHistory'

const dietStore = useDietStore()
const userStore = useUserStore()
const plan = computed(() => dietStore.mealPlan)
const noRecords = computed(() => dietStore.records.length === 0)

const MEAL_CONFIG = [
  { key: 'breakfast', label: '早餐', time: '08:00', icon: MEAL_EMOJI['早餐'], optional: false },
  { key: 'lunch', label: '午餐', time: '12:30', icon: MEAL_EMOJI['午餐'], optional: false },
  { key: 'fruit', label: '水果', time: '15:30', icon: '🍓', optional: true },
  { key: 'dinner', label: '晚餐', time: '18:30', icon: MEAL_EMOJI['晚餐'], optional: false },
  { key: 'snack', label: '加餐', time: '20:30', icon: '🥜', optional: true }
]

const picks = reactive({ breakfast: 0, lunch: 0, fruit: 0, dinner: 0, snack: 0 })
const expandedMeal = ref('lunch')
const decisionOpen = ref(false)
const workoutOpen = ref(false)
const drawerMode = ref('')
const replacementKey = ref('')

const itinerary = computed(() =>
  MEAL_CONFIG.map(meal => {
    const base = plan.value?.[meal.key]
    const list = base ? [base, ...(base.alternatives || [])] : []
    const index = list.length ? picks[meal.key] % list.length : 0
    return { ...meal, list, index, current: list[index] }
  }).filter(meal => meal.current)
)

const selectedTotals = computed(() => {
  const totals = { calories: 0, protein: 0, fat: 0, carb: 0, fiber: 0 }
  itinerary.value.forEach(({ current }) => {
    Object.keys(totals).forEach(key => {
      totals[key] += Number(current.nutrition?.[key]) || 0
    })
  })
  Object.keys(totals).forEach(key => {
    totals[key] = key === 'calories' ? Math.round(totals[key]) : Math.round(totals[key] * 10) / 10
  })
  return totals
})

const matchScore = computed(() => {
  const target = dietStore.targets.calories || 1
  return Math.max(0, Math.round(100 - (Math.abs(selectedTotals.value.calories - target) / target) * 100))
})

const matchLabel = computed(() => {
  if (matchScore.value >= 90) return '高度匹配'
  if (matchScore.value >= 75) return '匹配良好'
  return '建议调整'
})

const currentFocus = computed(() => (plan.value?.gap?.notes || []).join(' · '))

const decisionSteps = computed(() => [
  { index: '01', title: '缺什么', text: plan.value?.gap?.notes?.join('，') || '当前营养结构均衡' },
  {
    index: '02',
    title: '控制什么',
    text:
      plan.value?.reasons?.find(reason => /控制|超标|剔除|替代/.test(reason)) || '控制精制糖、重盐与不必要的额外热量'
  },
  { index: '03', title: '如何安排', text: '三餐稳定供能，下午安排水果，必要时用小份加餐补足营养缺口' }
])

const replacementMeal = computed(() => itinerary.value.find(meal => meal.key === replacementKey.value))

const shoppingList = computed(() => {
  const merged = new Map()
  itinerary.value.forEach(meal => {
    const ingredients = meal.current.ingredients?.length
      ? meal.current.ingredients
      : [{ name: meal.current.name, amount: meal.current.portion || meal.current.portionNote || '1 份' }]
    ingredients.forEach(ingredient => {
      const name = ingredient.name
      const amount = ingredient.amount || '适量'
      const entry = merged.get(name)
      if (entry) {
        entry.amounts.push(amount)
        if (!entry.meals.includes(meal.label)) entry.meals.push(meal.label)
      } else {
        merged.set(name, { name, amounts: [amount], meals: [meal.label] })
      }
    })
  })
  return [...merged.values()].map(item => ({ ...item, amount: item.amounts.join(' + ') }))
})

function toggleMeal(key) {
  expandedMeal.value = expandedMeal.value === key ? '' : key
}

function openReplacement(key) {
  replacementKey.value = key
  drawerMode.value = 'replace'
}

function chooseReplacement(index) {
  if (!replacementKey.value) return
  picks[replacementKey.value] = index
  expandedMeal.value = replacementKey.value
  closeDrawer()
}

function openShopping() {
  drawerMode.value = 'shopping'
}

function closeDrawer() {
  drawerMode.value = ''
}

function portionText(recipe) {
  return recipe.portion || recipe.portionNote || '标准份量'
}
</script>

<template>
  <div class="meal-plan-page stagger">
    <PageHeader>
      <template #extra>
        <RouterLink to="/diet" class="btn btn-ghost">记录饮食</RouterLink>
        <button class="btn btn-primary" type="button" @click="openShopping">购物清单</button>
      </template>
    </PageHeader>

    <main v-if="plan && plan.breakfast" class="plan-shell">
      <section class="plan-hero">
        <div class="plan-intro">
          <p class="section-eyebrow">AI 今日营养策略</p>
          <h1>把营养缺口，安排进每一餐</h1>
          <p>{{ currentFocus }}</p>
          <p v-if="noRecords" class="record-hint">
            今天还没有饮食记录，当前方案以均衡搭配为基准；记录后会随缺口实时调整。
          </p>
        </div>
        <div class="hero-energy">
          <span>今日计划</span>
          <strong class="num">{{ selectedTotals.calories }}</strong>
          <small>kcal · 目标 {{ dietStore.targets.calories }} kcal</small>
        </div>
      </section>

      <section class="gap-strip" aria-label="今日营养缺口摘要">
        <div>
          <span>剩余可摄入</span><strong class="num">{{ plan.gap.remainCalories }} <small>kcal</small></strong>
        </div>
        <div>
          <span>蛋白质缺口</span><strong class="num">{{ plan.remainder.protein }} <small>g</small></strong>
        </div>
        <div>
          <span>膳食纤维缺口</span><strong class="num">{{ plan.remainder.fiber }} <small>g</small></strong>
        </div>
        <div class="match-metric">
          <span>方案匹配度</span><strong class="num">{{ matchScore }}<small>%</small></strong
          ><em>{{ matchLabel }}</em>
        </div>
      </section>

      <section class="decision-section">
        <button
          class="section-toggle"
          type="button"
          :aria-expanded="decisionOpen"
          @click="decisionOpen = !decisionOpen"
        >
          <span><small>AI 决策链</small><strong>缺什么 → 控制什么 → 如何安排</strong></span>
          <span>{{ decisionOpen ? '收起' : '查看依据' }}</span>
        </button>
        <Transition name="panel-reveal">
          <div v-if="decisionOpen" class="decision-detail">
            <div class="decision-flow">
              <div v-for="step in decisionSteps" :key="step.index">
                <span>{{ step.index }}</span
                ><strong>{{ step.title }}</strong>
                <p>{{ step.text }}</p>
              </div>
            </div>
            <ul class="reason-list">
              <li v-for="reason in plan.reasons" :key="reason">{{ reason }}</li>
            </ul>
          </div>
        </Transition>
      </section>

      <section class="itinerary-section">
        <header class="section-head">
          <div>
            <p class="section-eyebrow">一日膳食行程</p>
            <h2>按时间吃，按需展开</h2>
          </div>
          <p>当前选择 · 蛋白质 {{ selectedTotals.protein }}g · 膳食纤维 {{ selectedTotals.fiber }}g</p>
        </header>

        <div class="meal-itinerary">
          <article
            v-for="meal in itinerary"
            :key="meal.key"
            class="meal-stop"
            :class="{ expanded: expandedMeal === meal.key }"
          >
            <div class="time-axis">
              <time>{{ meal.time }}</time
              ><span>{{ meal.icon }}</span>
            </div>
            <div class="meal-main">
              <button class="meal-row" type="button" @click="toggleMeal(meal.key)">
                <span class="meal-kind"
                  ><strong>{{ meal.label }}</strong
                  ><small v-if="meal.optional">可选</small></span
                >
                <span class="meal-name"
                  ><strong>{{ meal.current.name }}</strong
                  ><small>{{ meal.current.reason }}</small></span
                >
                <span class="meal-nutrition num"
                  ><strong>{{ meal.current.nutrition.calories }} kcal</strong
                  ><small>蛋白 {{ meal.current.nutrition.protein }}g</small></span
                >
                <span class="expand-label">{{ expandedMeal === meal.key ? '收起' : '展开' }}</span>
              </button>

              <Transition name="panel-reveal">
                <div v-if="expandedMeal === meal.key" class="meal-expanded">
                  <div v-if="meal.current.ingredients?.length" class="recipe-columns">
                    <section class="ingredient-list">
                      <h3>食材</h3>
                      <div v-for="ingredient in meal.current.ingredients" :key="ingredient.name">
                        <span>{{ ingredient.name }}</span
                        ><strong>{{ ingredient.amount }}</strong>
                      </div>
                    </section>
                    <section class="step-list">
                      <h3>做法</h3>
                      <ol>
                        <li v-for="(step, index) in meal.current.steps" :key="step">
                          <span>{{ index + 1 }}</span>
                          <p>{{ step }}</p>
                        </li>
                      </ol>
                    </section>
                  </div>
                  <p v-else class="extra-reason">{{ meal.current.reason }}</p>

                  <footer class="meal-footer">
                    <div class="macro-line">
                      <span
                        >热量 <strong class="num">{{ meal.current.nutrition.calories }} kcal</strong></span
                      >
                      <span
                        >蛋白 <strong class="num">{{ meal.current.nutrition.protein }}g</strong></span
                      >
                      <span
                        >脂肪 <strong class="num">{{ meal.current.nutrition.fat }}g</strong></span
                      >
                      <span
                        >碳水 <strong class="num">{{ meal.current.nutrition.carb }}g</strong></span
                      >
                    </div>
                    <div class="portion-line">
                      <span>份量建议 · {{ portionText(meal.current) }}</span
                      ><button type="button" @click="openReplacement(meal.key)">换一个 →</button>
                    </div>
                  </footer>
                </div>
              </Transition>
            </div>
          </article>
        </div>
      </section>

      <section class="workout-section">
        <button class="section-toggle" type="button" :aria-expanded="workoutOpen" @click="workoutOpen = !workoutOpen">
          <span
            ><small>配套活动建议</small
            ><strong>{{ plan.workout.emoji }} {{ plan.workout.label }} · {{ plan.workout.weekly }}</strong></span
          >
          <span>{{ workoutOpen ? '收起' : '展开' }}</span>
        </button>
        <Transition name="panel-reveal">
          <div v-if="workoutOpen" class="workout-detail">
            <div v-for="item in plan.workout.items" :key="item.name">
              <span>{{ item.emoji }}</span
              ><strong>{{ item.name }}</strong
              ><small>{{ item.duration }} · 约 {{ item.burn }} kcal</small>
            </div>
            <p>{{ plan.workout.tip }} 已按你的运动强度（{{ userStore.activityInfo.label }}）匹配。</p>
          </div>
        </Transition>
      </section>
    </main>

    <div v-else class="empty-wrap">
      <EmptyState emoji="🍽️" text="暂无推荐方案" sub="请先在身体数据测评中完善档案" />
    </div>

    <Transition name="drawer-fade"
      ><div v-if="drawerMode" class="drawer-backdrop" @click="closeDrawer"></div
    ></Transition>
    <Transition name="drawer-slide">
      <aside
        v-if="drawerMode"
        class="plan-drawer"
        :aria-label="drawerMode === 'replace' ? '更换推荐餐品' : '今日购物清单'"
      >
        <header class="drawer-head">
          <div>
            <p class="section-eyebrow">
              {{ drawerMode === 'replace' ? replacementMeal?.label + '备选' : '按当前方案生成' }}
            </p>
            <h2>{{ drawerMode === 'replace' ? '换一道更合适的' : '今日购物清单' }}</h2>
          </div>
          <button type="button" aria-label="关闭抽屉" @click="closeDrawer">关闭</button>
        </header>

        <div v-if="drawerMode === 'replace' && replacementMeal" class="drawer-scroll">
          <button
            v-for="(recipe, index) in replacementMeal.list"
            :key="recipe.id || recipe.name"
            class="replacement-option"
            :class="{ active: replacementMeal.index === index }"
            type="button"
            @click="chooseReplacement(index)"
          >
            <span class="option-emoji">{{ recipe.emoji }}</span>
            <span class="option-copy"
              ><strong>{{ recipe.name }}</strong
              ><small>{{ recipe.reason }}</small
              ><em>{{ portionText(recipe) }}</em></span
            >
            <span class="option-nutrition num"
              ><strong>{{ recipe.nutrition.calories }} kcal</strong
              ><small>蛋白 {{ recipe.nutrition.protein }}g · 纤维 {{ recipe.nutrition.fiber }}g</small></span
            >
            <b>{{ replacementMeal.index === index ? '当前' : '选择' }}</b>
          </button>
        </div>

        <div v-else class="drawer-scroll shopping-scroll">
          <p class="shopping-summary">共 {{ shoppingList.length }} 种食材，重复项已合并。清单会随餐品替换自动更新。</p>
          <label v-for="item in shoppingList" :key="item.name" class="shopping-item">
            <input type="checkbox" />
            <span
              ><strong>{{ item.name }}</strong
              ><small>{{ item.meals.join(' · ') }}</small></span
            >
            <em>{{ item.amount }}</em>
          </label>
        </div>

        <footer class="drawer-footer">
          <button v-if="drawerMode === 'shopping'" class="btn btn-primary" type="button" @click="closeDrawer">
            完成查看
          </button>
          <span v-else>选择餐品后，全天营养汇总将立即重新计算。</span>
        </footer>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.plan-shell {
  width: min(1080px, 100%);
  margin: 0 auto;
  padding: 4px 0 52px;
}
.section-eyebrow {
  color: var(--brand);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
}
.plan-hero {
  display: grid;
  grid-template-columns: 1fr 250px;
  align-items: end;
  gap: 48px;
  padding: 30px 0 26px;
  border-bottom: 1px solid var(--line);
}
.plan-intro h1 {
  margin: 6px 0 8px;
  color: var(--ink);
  font-size: 28px;
  letter-spacing: 0;
}
.plan-intro > p:not(.section-eyebrow) {
  color: var(--tx-sub);
  font-size: 12px;
}
.plan-intro .record-hint {
  margin-top: 9px;
  color: var(--tx-muted);
  font-size: 10px;
}
.hero-energy {
  display: grid;
  justify-items: end;
}
.hero-energy span,
.hero-energy small {
  color: var(--tx-muted);
  font-size: 10px;
}
.hero-energy strong {
  color: var(--ink);
  font-size: 42px;
  line-height: 1;
}
.hero-energy small {
  margin-top: 5px;
}
.gap-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--line);
}
.gap-strip > div {
  position: relative;
  display: grid;
  gap: 5px;
  padding: 18px 24px 18px 0;
}
.gap-strip > div + div {
  padding-left: 24px;
  border-left: 1px solid var(--line);
}
.gap-strip span {
  color: var(--tx-muted);
  font-size: 10px;
}
.gap-strip strong {
  color: var(--ink);
  font-size: 20px;
}
.gap-strip strong small {
  font-size: 10px;
  font-weight: 600;
}
.match-metric em {
  position: absolute;
  right: 0;
  bottom: 20px;
  color: var(--brand);
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
}
.decision-section,
.workout-section {
  border-bottom: 1px solid var(--line);
}
.section-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 0;
  border: 0;
  background: transparent;
  text-align: left;
}
.section-toggle > span:first-child {
  display: grid;
  gap: 3px;
}
.section-toggle small {
  color: var(--tx-muted);
  font-size: 9px;
}
.section-toggle strong {
  color: var(--ink);
  font-size: 13px;
}
.section-toggle > span:last-child {
  color: var(--brand);
  font-size: 10px;
  font-weight: 800;
}
.decision-detail {
  padding: 4px 0 22px;
}
.decision-flow {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
}
.decision-flow > div {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 5px 10px;
  padding-top: 12px;
  border-top: 2px solid var(--line);
}
.decision-flow > div > span {
  grid-row: 1/3;
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.decision-flow strong {
  color: var(--ink);
  font-size: 12px;
}
.decision-flow p {
  color: var(--tx-sub);
  font-size: 10px;
  line-height: 1.65;
}
.reason-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px 24px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  list-style: none;
}
.reason-list li {
  position: relative;
  padding-left: 12px;
  color: var(--tx-sub);
  font-size: 10px;
}
.reason-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--brand);
}
.itinerary-section {
  padding-top: 34px;
}
.section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 30px;
  margin-bottom: 14px;
}
.section-head h2 {
  margin-top: 3px;
  color: var(--ink);
  font-size: 19px;
}
.section-head > p {
  color: var(--tx-muted);
  font-size: 10px;
}
.meal-itinerary {
  position: relative;
}
.meal-itinerary::before {
  content: '';
  position: absolute;
  left: 66px;
  top: 50px;
  bottom: 50px;
  width: 1px;
  background: var(--line-strong);
}
.meal-stop {
  position: relative;
  display: grid;
  grid-template-columns: 94px 1fr;
}
.time-axis {
  z-index: 1;
  display: grid;
  grid-template-columns: 42px 44px;
  align-items: start;
  gap: 4px;
  padding-top: 16px;
}
.time-axis time {
  padding-top: 13px;
  color: var(--tx-muted);
  font-size: 10px;
}
.time-axis span {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: #fff;
  font-size: 18px;
}
.meal-stop.expanded .time-axis span {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.meal-main {
  min-width: 0;
  border-bottom: 1px solid var(--line);
}
.meal-row {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) 120px 42px;
  align-items: center;
  gap: 18px;
  border: 0;
  background: transparent;
  text-align: left;
}
.meal-kind,
.meal-name,
.meal-nutrition {
  display: grid;
  gap: 3px;
}
.meal-kind strong,
.meal-name strong {
  color: var(--ink);
  font-size: 13px;
}
.meal-kind small {
  width: max-content;
  padding: 1px 5px;
  border: 1px solid var(--line);
  border-radius: 3px;
  color: var(--tx-muted);
  font-size: 8px;
}
.meal-name small {
  overflow: hidden;
  color: var(--tx-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meal-nutrition {
  text-align: right;
}
.meal-nutrition strong {
  color: var(--ink);
  font-size: 12px;
}
.meal-nutrition small,
.expand-label {
  color: var(--tx-muted);
  font-size: 9px;
}
.expand-label {
  text-align: right;
}
.meal-expanded {
  padding: 2px 0 20px;
}
.recipe-columns {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 38px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
}
.recipe-columns h3 {
  margin-bottom: 9px;
  color: var(--ink);
  font-size: 11px;
}
.ingredient-list > div {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--line);
  font-size: 10px;
}
.ingredient-list span {
  color: var(--tx-sub);
}
.ingredient-list strong {
  color: var(--tx-muted);
  font-weight: 500;
}
.step-list ol {
  display: grid;
  gap: 9px;
  list-style: none;
}
.step-list li {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 9px;
  color: var(--tx-sub);
  font-size: 10px;
  line-height: 1.6;
}
.step-list li span {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  color: var(--brand);
  font-size: 8px;
  font-weight: 800;
}
.extra-reason {
  padding: 18px 0;
  color: var(--tx-sub);
  font-size: 11px;
}
.meal-footer {
  border-top: 1px solid var(--line);
}
.macro-line,
.portion-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.macro-line {
  padding: 11px 0;
  color: var(--tx-muted);
  font-size: 9px;
}
.macro-line strong {
  margin-left: 4px;
  color: var(--ink);
  font-size: 10px;
}
.portion-line {
  padding-top: 10px;
  color: var(--tx-sub);
  font-size: 10px;
}
.portion-line button {
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: 10px;
  font-weight: 800;
}
.workout-section {
  margin-top: 26px;
  border-top: 1px solid var(--line);
}
.workout-detail {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0 24px;
  padding-bottom: 20px;
}
.workout-detail > div {
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 2px 8px;
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.workout-detail > div > span {
  grid-row: 1/3;
  font-size: 18px;
}
.workout-detail strong {
  color: var(--ink);
  font-size: 10px;
}
.workout-detail small {
  color: var(--tx-muted);
  font-size: 9px;
}
.workout-detail > p {
  grid-column: 1/-1;
  margin-top: 8px;
  color: var(--tx-sub);
  font-size: 10px;
}
.empty-wrap {
  width: min(1080px, 100%);
  margin: 40px auto;
}
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(30, 37, 39, 0.26);
}
.plan-drawer {
  position: fixed;
  z-index: 70;
  top: 0;
  right: 0;
  width: 460px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: -18px 0 50px rgba(30, 37, 39, 0.13);
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 26px 18px;
  border-bottom: 1px solid var(--line);
}
.drawer-head h2 {
  margin-top: 4px;
  color: var(--ink);
  font-size: 20px;
}
.drawer-head > button {
  border: 0;
  background: transparent;
  color: var(--tx-sub);
  font-size: 10px;
}
.drawer-scroll {
  flex: 1;
  overflow: auto;
  padding: 8px 26px 30px;
}
.replacement-option {
  width: 100%;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 100px 32px;
  align-items: center;
  gap: 11px;
  padding: 18px 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: #fff;
  text-align: left;
}
.replacement-option.active {
  box-shadow: inset 3px 0 var(--brand);
  padding-left: 12px;
}
.option-emoji {
  font-size: 27px;
}
.option-copy {
  display: grid;
  gap: 4px;
}
.option-copy strong {
  color: var(--ink);
  font-size: 12px;
}
.option-copy small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--tx-muted);
  font-size: 9px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.option-copy em {
  color: var(--tx-sub);
  font-size: 9px;
  font-style: normal;
}
.option-nutrition {
  display: grid;
  justify-items: end;
  gap: 3px;
}
.option-nutrition strong {
  color: var(--ink);
  font-size: 11px;
}
.option-nutrition small {
  color: var(--tx-muted);
  font-size: 8px;
  text-align: right;
}
.replacement-option > b {
  color: var(--brand);
  font-size: 9px;
}
.shopping-summary {
  padding: 14px 0;
  color: var(--tx-muted);
  font-size: 10px;
  line-height: 1.6;
}
.shopping-item {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
}
.shopping-item input {
  accent-color: var(--brand);
}
.shopping-item span {
  display: grid;
  gap: 2px;
}
.shopping-item strong {
  color: var(--ink);
  font-size: 11px;
}
.shopping-item small {
  color: var(--tx-muted);
  font-size: 8px;
}
.shopping-item em {
  max-width: 150px;
  color: var(--tx-sub);
  font-size: 9px;
  font-style: normal;
  text-align: right;
}
.drawer-footer {
  padding: 16px 26px;
  border-top: 1px solid var(--line);
}
.drawer-footer .btn {
  width: 100%;
  min-height: 42px;
}
.drawer-footer > span {
  color: var(--tx-muted);
  font-size: 9px;
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
.drawer-fade-leave-active,
.panel-reveal-enter-active,
.panel-reveal-leave-active {
  transition: opacity 0.22s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to,
.panel-reveal-enter-from,
.panel-reveal-leave-to {
  opacity: 0;
}
</style>

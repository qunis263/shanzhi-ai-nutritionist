<script setup>
/**
 * DietRecordView 三餐饮食记录页
 * ------------------------------------------------------------------
 * 页面职责（纯前端 mock 数据）：
 *   1. 添加一条饮食记录：餐段选择 → 食物搜索 / 分类筛选 → 分量 / 时间 → 实时营养预估 → 写入 Store
 *   2. 今日四餐分组展示：早餐 / 午餐 / 晚餐 / 零食，各自统计热量与营养小结，支持删除
 *   3. 饮水记录：快捷加减 + 自定义设置 + 目标进度
 *   4. 全天营养合计：4 个关键数值小卡 + 逐项「实际 / 目标 + 进度条 + 状态标签」
 *   5. 每日历史饮食查看：最近 7 天日期切换，查看历史明细（历史记录不可删除）
 *
 * 说明：所有数据来自 Pinia Store（dietStore / userStore），组件只负责展示与交互，
 *      不重复实现任何营养计算逻辑（统一复用 utils/nutrition 与 data/foods）。
 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'

import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
import { MEAL_EMOJI, MEAL_TYPES } from '@/data/mockHistory'
import { FOOD_CATEGORIES, findFood, scaleNutrition, searchFood } from '@/data/foods'
import { sumNutrition } from '@/utils/nutrition'
import { celebrateStars } from '@/utils/celebrate'
import { formatCN, guessMealByNow, nowTimeStr, todayStr } from '@/utils/date'
import { confirm } from '@/composables/useConfirm'

const dietStore = useDietStore()
const userStore = useUserStore()

/* =================================================================
 * 一、轻量 Toast 提示（ref 控制显隐，2 秒自动消失）
 * ================================================================= */
const toast = reactive({ visible: false, text: '' })
let toastTimer = null

/** 展示一条 2 秒后自动消失的提示 */
function showToast(text) {
  toast.text = text
  toast.visible = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.visible = false
  }, 2000)
}

// 卸载时清理定时器，避免内存泄漏
onBeforeUnmount(() => clearTimeout(toastTimer))

/* =================================================================
 * 二、添加记录表单
 * ================================================================= */
/** 右侧添加抽屉：桌面 Web 中按需出现，不再常驻占用页面。 */
const drawerOpen = ref(false)
const waterOpen = ref(false)
const expandedMeal = ref(guessMealByNow())

/** 表单状态：餐段 / 搜索词 / 分类 / 选中食物 / 分量 / 时间 */
const form = reactive({
  mealType: guessMealByNow(), // 按当前时间段自动定位默认餐段
  keyword: '',
  category: '全部',
  foodId: '',
  grams: 100,
  time: nowTimeStr()
})

/** 当前选中的食物对象（未选择时为 null） */
const selectedFood = computed(() => (form.foodId ? findFood(form.foodId) : null))

/** 搜索结果每次渲染的条数（点击「展开更多」继续追加，避免一次渲染近千条） */
const PAGE_SIZE = 60
/** 当前已展示条数 */
const visibleCount = ref(PAGE_SIZE)

/**
 * 全量匹配结果：先取整库（limit=0 表示不限），再按分类筛选。
 * 注意：分类筛选必须作用在**全库**上，否则「水果」等分类只会过滤前 40 条而显示为空。
 */
const matchedFoods = computed(() => {
  const list = searchFood(form.keyword, 0)
  if (form.category === '全部') return list
  return list.filter(f => f.category === form.category)
})

/** 当前实际渲染的结果（分页后的切片） */
const searchResults = computed(() => matchedFoods.value.slice(0, visibleCount.value))

/** 是否还有更多可展开 */
const hasMore = computed(() => matchedFoods.value.length > visibleCount.value)

/** 展开更多（每次追加一页） */
function loadMore() {
  visibleCount.value += PAGE_SIZE
}

/** 重置搜索词与分类（回到「全部」整库浏览） */
function resetFilter() {
  form.keyword = ''
  form.category = '全部'
  visibleCount.value = PAGE_SIZE
}

// 关键词或分类变化时，回到第一页
watch(
  () => [form.keyword, form.category],
  () => {
    visibleCount.value = PAGE_SIZE
  }
)

/** 选中食物 + 分量下的实时营养预估（复用 scaleNutrition） */
const previewNutrition = computed(() =>
  selectedFood.value ? scaleNutrition(selectedFood.value, Number(form.grams) || 0) : null
)

/** 选择食物 */
function pickFood(food) {
  form.foodId = food.id
}

/** 从时间轴打开添加抽屉，并自动带入目标餐段。 */
function openAddDrawer(mealType = form.mealType) {
  form.mealType = mealType
  expandedMeal.value = mealType
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
}
/** 切换分类筛选 */
function pickCategory(category) {
  form.category = category
}
/** 快捷设置分量 */
function setGrams(grams) {
  form.grams = grams
}

/** 把记录的 unit（形如 100g / 100ml）转换为实际计量单位 */
function unitText(unit) {
  return String(unit || '').includes('ml') ? 'ml' : 'g'
}
/** 记录的分量文案：如 150g / 250ml */
function amountText(record) {
  return `${record.grams}${unitText(record.unit)}`
}

/**
 * 添加记录：写入 Store → Toast 提示 → 重置表单
 * 重置策略：清空食物选择与搜索词，保留餐段与时间（便于连续录入同一餐）
 */
function addRecord() {
  if (!selectedFood.value) {
    showToast('请先选择要记录的食物 🍽️')
    return
  }
  const grams = Number(form.grams)
  if (!(grams > 0)) {
    showToast('请输入正确的分量 ⚖️')
    return
  }
  const record = dietStore.addRecord({
    mealType: form.mealType,
    foodId: form.foodId,
    grams,
    time: form.time
  })
  if (!record) {
    showToast('添加失败，请重试')
    return
  }
  showToast(`已添加到${record.mealType}：${record.emoji}${record.name} ${amountText(record)}`)
  celebrateStars()
  // 重置：食物选择清空，餐段 / 时间保留
  form.foodId = ''
  form.keyword = ''
  form.category = '全部'
  form.grams = 100
  drawerOpen.value = false
}

/** 删除今日的一条记录（历史记录不提供删除入口） */
async function removeRecord(id) {
  const ok = await confirm({
    title: '删除这条饮食记录？',
    message: '删除后该条记录的营养数据会从今日合计中扣除。',
    confirmText: '删除'
  })
  if (!ok) return
  dietStore.removeRecord(id)
  showToast('已删除该条记录 🗑️')
}

/* =================================================================
 * 四、饮水记录
 * ================================================================= */
const customWater = ref('')

/** 饮水达标比例（饮水目标随档案变化） */
const waterRatio = computed(() => {
  const target = dietStore.targets.water || 0
  return target > 0 ? dietStore.water / target : 0
})
/** 进度条百分比（封顶 100） */
const waterPercent = computed(() => Math.min(100, Math.round(waterRatio.value * 100)))
/** 饮水状态：达标 ✅ / 偏少 💡 */
const waterStatus = computed(() => (waterRatio.value >= 0.8 ? 'ok' : 'low'))
/** 饮水提示文案 */
const waterHint = computed(() =>
  waterRatio.value >= 0.8 ? '✅ 饮水量已达标，水合状态良好，继续保持' : '💡 饮水偏少，建议每 1.5 小时补水 200ml'
)

/** 自定义设置饮水量 */
function applyCustomWater() {
  const value = Number(customWater.value)
  if (!(value >= 0)) {
    showToast('请输入有效的饮水量 💧')
    return
  }
  dietStore.setWater(value)
  customWater.value = ''
  showToast(`饮水已设置为 ${dietStore.water} ml`)
}

/* =================================================================
 * 六、每日历史饮食查看（最近 7 天，含今天）
 * ================================================================= */
/** 当前选中的历史日期，默认今天 */
const selectedDate = ref(todayStr())

/** 选中日期的完整数据（来自 historyDays，倒序且含今天） */
const activeDay = computed(
  () => dietStore.historyDays.find(d => d.date === selectedDate.value) || dietStore.historyDays[0] || null
)

/** 选中日期是否为「今天」（仅今天允许删除记录） */
const activeIsToday = computed(() => !!activeDay.value && activeDay.value.date === todayStr())

/** 选中日期的记录按餐段分组（用于明细展示） */
const activeGroups = computed(() => {
  const day = activeDay.value
  if (!day) return []
  return MEAL_TYPES.map(type => {
    const records = (day.records || []).filter(r => r.mealType === type)
    const summary = sumNutrition(records)
    return {
      type,
      emoji: MEAL_EMOJI[type],
      records,
      summary: { ...summary, calories: Math.round(summary.calories) }
    }
  })
})

/** 所选日期顶部摘要；历史日期同样复用时间轴，不再另起历史卡片。 */
const activeSummary = computed(() => ({
  calories: activeDay.value?.calories || 0,
  protein: activeDay.value?.protein || 0,
  water: activeDay.value?.water || 0,
  score: activeDay.value?.score || 0,
  target: activeDay.value?.target || dietStore.targets.calories
}))

/* =================================================================
 * 七、用户档案（用于顶部展示用户昵称，保持页面间一致性）
 * ================================================================= */
const nickname = computed(() => userStore.profile.nickname)
</script>

<template>
  <div class="diet-timeline stagger">
    <PageHeader>
      <template #extra>
        <span class="timeline-count">{{ nickname }} · 今日 {{ dietStore.records.length }} 条</span>
        <button class="btn btn-ghost" type="button" @click="waterOpen = !waterOpen">💧 记录饮水</button>
        <button class="btn btn-primary" type="button" @click="openAddDrawer()">＋ 添加饮食</button>
      </template>
    </PageHeader>

    <main class="timeline-shell">
      <header class="timeline-toolbar">
        <div class="date-switcher" aria-label="选择记录日期">
          <button
            v-for="day in dietStore.historyDays"
            :key="day.date"
            type="button"
            :class="{ active: day.date === selectedDate }"
            @click="selectedDate = day.date"
          >
            <span>{{ day.label }}</span
            ><small>{{ day.weekday }}</small>
          </button>
        </div>
        <RouterLink to="/dashboard" class="timeline-link">查看长期趋势 →</RouterLink>
      </header>

      <section class="day-summary">
        <div>
          <p class="section-eyebrow">{{ activeIsToday ? '今天' : formatCN(selectedDate) }}的饮食节奏</p>
          <h2>
            <span class="num">{{ activeSummary.calories }}</span> kcal
          </h2>
          <p>共 {{ activeDay?.recordCount || 0 }} 条记录 · 健康评分 {{ activeSummary.score }}</p>
        </div>
        <div class="summary-metrics">
          <div>
            <span>蛋白质</span><strong class="num">{{ activeSummary.protein }}g</strong>
          </div>
          <div>
            <span>饮水</span><strong class="num">{{ activeSummary.water }}ml</strong>
          </div>
          <div>
            <span>目标热量</span><strong class="num">{{ activeSummary.target }} kcal</strong>
          </div>
        </div>
      </section>

      <Transition name="panel-reveal">
        <section v-if="waterOpen && activeIsToday" class="water-strip">
          <div>
            <strong>今日饮水 {{ dietStore.water }} / {{ dietStore.targets.water }} ml</strong>
            <p>{{ waterHint }}</p>
          </div>
          <div class="water-progress">
            <ProgressBar :percent="waterPercent" :status="waterStatus" :show-label="false" />
          </div>
          <div class="water-actions">
            <button type="button" @click="dietStore.addWater(200)">＋200ml</button>
            <button type="button" @click="dietStore.addWater(300)">＋300ml</button>
            <input v-model.number="customWater" type="number" min="0" placeholder="自定义 ml" />
            <button type="button" @click="applyCustomWater">设置</button>
          </div>
        </section>
      </Transition>

      <section class="meal-timeline" aria-label="当日餐次时间轴">
        <article
          v-for="group in activeGroups"
          :key="group.type"
          class="meal-event"
          :class="{ expanded: expandedMeal === group.type }"
        >
          <div class="meal-axis">
            <span>{{ group.emoji }}</span>
          </div>
          <div class="meal-content">
            <button
              class="meal-summary-button"
              type="button"
              @click="expandedMeal = expandedMeal === group.type ? '' : group.type"
            >
              <span class="meal-title"
                ><strong>{{ group.type }}</strong
                ><small>{{ group.records.length }} 项</small></span
              >
              <span class="meal-preview">{{
                group.records.length ? group.records.map(r => r.name).join('、') : '尚未记录'
              }}</span>
              <span class="meal-total num">{{ group.summary.calories }} kcal</span>
              <span class="meal-chevron">{{ expandedMeal === group.type ? '收起' : '展开' }}</span>
            </button>

            <Transition name="panel-reveal">
              <div v-if="expandedMeal === group.type" class="meal-detail">
                <div v-if="group.records.length" class="record-list">
                  <div v-for="record in group.records" :key="record.id" class="record-row">
                    <span class="record-emoji" aria-hidden="true">{{ record.emoji }}</span>
                    <div>
                      <strong>{{ record.name }}</strong>
                      <p>{{ amountText(record) }} · {{ record.time }}</p>
                    </div>
                    <div class="record-nutrients num">
                      <span>{{ record.nutrition.calories }} kcal</span
                      ><small>蛋白 {{ record.nutrition.protein }}g · 碳水 {{ record.nutrition.carb }}g</small>
                    </div>
                    <button
                      v-if="activeIsToday"
                      type="button"
                      class="delete-button"
                      aria-label="删除记录"
                      @click="removeRecord(record.id)"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <p v-else class="meal-empty-copy">这个餐次还没有记录。</p>
                <footer class="meal-detail-footer">
                  <span
                    >合计：蛋白 {{ group.summary.protein }}g · 脂肪 {{ group.summary.fat }}g · 碳水
                    {{ group.summary.carb }}g</span
                  >
                  <button v-if="activeIsToday" type="button" class="add-inline" @click="openAddDrawer(group.type)">
                    ＋ 添加{{ group.type }}食物
                  </button>
                </footer>
              </div>
            </Transition>
          </div>
        </article>
      </section>

      <section class="daily-progress">
        <div class="daily-progress-head">
          <div>
            <h3>全天营养进度</h3>
            <p>保留必要数据，异常项会自动突出</p>
          </div>
          <RouterLink to="/report">查看完整分析 →</RouterLink>
        </div>
        <div class="nutrient-lines">
          <div
            v-for="item in dietStore.progressList"
            :key="item.key"
            class="nutrient-line"
            :class="{ alert: item.status === 'over' || item.status === 'severe' }"
          >
            <span>{{ item.emoji }} {{ item.label }}</span>
            <ProgressBar :percent="item.percent" :status="item.status" :show-label="false" />
            <strong class="num">{{ item.value }} / {{ item.target }} {{ item.unit }}</strong>
            <StatusBadge size="sm" :status="item.status" />
          </div>
        </div>
      </section>
    </main>

    <Transition name="drawer-fade">
      <div v-if="drawerOpen" class="drawer-backdrop" @click="closeDrawer"></div>
    </Transition>
    <Transition name="drawer-slide">
      <aside v-if="drawerOpen" class="add-drawer" aria-label="添加饮食记录">
        <header class="drawer-head">
          <div>
            <p class="section-eyebrow">快速记录</p>
            <h2>添加一条饮食</h2>
          </div>
          <button type="button" @click="closeDrawer">关闭</button>
        </header>

        <div class="drawer-scroll">
          <section class="drawer-section">
            <label>餐次与时间</label>
            <div class="drawer-meals">
              <button
                v-for="type in MEAL_TYPES"
                :key="type"
                type="button"
                :class="{ active: form.mealType === type }"
                @click="form.mealType = type"
              >
                {{ MEAL_EMOJI[type] }} {{ type }}
              </button>
            </div>
            <input v-model="form.time" type="time" class="drawer-input compact" />
          </section>

          <section class="drawer-section">
            <label for="food-search">搜索食物</label>
            <input id="food-search" v-model="form.keyword" class="drawer-input" placeholder="输入食物名称或关键词" />
            <div class="category-row">
              <button
                v-for="category in FOOD_CATEGORIES"
                :key="category"
                type="button"
                :class="{ active: form.category === category }"
                @click="pickCategory(category)"
              >
                {{ category }}
              </button>
            </div>
            <div class="result-meta">
              <span>{{ matchedFoods.length }} 条结果</span
              ><button v-if="form.keyword || form.category !== '全部'" type="button" @click="resetFilter">重置</button>
            </div>
            <div class="food-results">
              <button
                v-for="food in searchResults"
                :key="food.id"
                type="button"
                :class="{ active: form.foodId === food.id }"
                @click="pickFood(food)"
              >
                <span>{{ food.emoji }}</span
                ><span
                  ><strong>{{ food.name }}</strong
                  ><small>{{ food.category }} · {{ food.calories }} kcal/{{ food.unit }}</small></span
                ><b>{{ form.foodId === food.id ? '✓' : '' }}</b>
              </button>
              <button v-if="hasMore" type="button" class="load-more" @click="loadMore">
                加载更多（剩余 {{ matchedFoods.length - searchResults.length }} 条）
              </button>
              <p v-if="!searchResults.length" class="no-results">没有匹配结果，请更换关键词。</p>
            </div>
          </section>

          <Transition name="panel-reveal">
            <section v-if="selectedFood" class="drawer-section selected-step">
              <label>确认分量</label>
              <div class="selected-food">
                <span>{{ selectedFood.emoji }}</span>
                <div>
                  <strong>{{ selectedFood.name }}</strong>
                  <p>每 {{ selectedFood.unit }} {{ selectedFood.calories }} kcal</p>
                </div>
              </div>
              <div class="amount-row">
                <button
                  type="button"
                  aria-label="减少份量 50"
                  @click="form.grams = Math.max(1, Number(form.grams) - 50)"
                >
                  −</button
                ><input v-model.number="form.grams" type="number" min="1" /><span>{{
                  unitText(selectedFood.unit)
                }}</span
                ><button type="button" aria-label="增加份量 50" @click="form.grams = Number(form.grams) + 50">＋</button>
              </div>
              <div class="quick-amount">
                <button
                  v-for="g in [50, 100, 150, 200, 300]"
                  :key="g"
                  type="button"
                  :class="{ active: form.grams === g }"
                  @click="setGrams(g)"
                >
                  {{ g }}{{ unitText(selectedFood.unit) }}
                </button>
              </div>
              <div v-if="previewNutrition" class="nutrition-preview">
                <span>预计增加</span><strong class="num">{{ previewNutrition.calories }} kcal</strong
                ><small
                  >蛋白 {{ previewNutrition.protein }}g · 脂肪 {{ previewNutrition.fat }}g · 碳水
                  {{ previewNutrition.carb }}g</small
                >
              </div>
            </section>
          </Transition>
        </div>
        <footer class="drawer-footer">
          <button class="btn btn-primary" type="button" :disabled="!selectedFood" @click="addRecord">
            确认加入{{ form.mealType }}
          </button>
        </footer>
      </aside>
    </Transition>

    <div v-if="toast.visible" class="timeline-toast">{{ toast.text }}</div>
  </div>
</template>

<style scoped>
.timeline-shell {
  width: min(1100px, 100%);
  margin: 0 auto;
  padding: 6px 0 48px;
}
.timeline-count {
  color: var(--tx-sub);
  font-size: 12px;
}
.timeline-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 8px 0 22px;
  border-bottom: 1px solid var(--line);
}
.date-switcher {
  display: flex;
  gap: 4px;
}
.date-switcher button {
  min-width: 72px;
  padding: 7px 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--tx-muted);
}
.date-switcher button span,
.date-switcher button small {
  display: block;
}
.date-switcher button small {
  font-size: 9px;
}
.date-switcher button.active {
  border-bottom-color: var(--brand);
  color: var(--brand);
  font-weight: 800;
}
.timeline-link,
.daily-progress a {
  color: var(--brand);
  font-size: 11px;
  font-weight: 700;
}
.day-summary {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 30px;
  padding: 28px 0;
  border-bottom: 1px solid var(--line);
}
.section-eyebrow {
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.day-summary h2 {
  margin-top: 5px;
  color: var(--ink);
  font-size: 32px;
}
.day-summary > div > p:last-child {
  color: var(--tx-muted);
  font-size: 11px;
}
.summary-metrics {
  display: flex;
  gap: 34px;
}
.summary-metrics div {
  display: grid;
  gap: 3px;
  text-align: right;
}
.summary-metrics span {
  color: var(--tx-muted);
  font-size: 10px;
}
.summary-metrics strong {
  color: var(--ink);
  font-size: 13px;
}
.water-strip {
  display: grid;
  grid-template-columns: 220px 1fr auto;
  align-items: center;
  gap: 24px;
  padding: 16px 0;
  border-bottom: 1px solid var(--line);
}
.water-strip p {
  color: var(--tx-muted);
  font-size: 10px;
}
.water-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.water-actions button,
.water-actions input {
  height: 32px;
  border: 1px solid var(--line-strong);
  border-radius: 5px;
  background: #fff;
  color: var(--tx-sub);
  font-size: 11px;
}
.water-actions button {
  padding: 0 9px;
}
.water-actions input {
  width: 94px;
  padding: 0 8px;
}
.meal-timeline {
  position: relative;
  padding: 22px 0;
}
.meal-timeline::before {
  content: '';
  position: absolute;
  left: 22px;
  top: 46px;
  bottom: 46px;
  width: 1px;
  background: var(--line-strong);
}
.meal-event {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 15px;
  position: relative;
}
.meal-axis {
  padding-top: 16px;
  z-index: 1;
}
.meal-axis span {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: #fff;
  font-size: 19px;
}
.meal-event.expanded .meal-axis span {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.meal-content {
  min-width: 0;
  border-bottom: 1px solid var(--line);
}
.meal-summary-button {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr) 92px 42px;
  align-items: center;
  gap: 14px;
  border: 0;
  background: transparent;
  text-align: left;
}
.meal-title {
  display: grid;
  gap: 3px;
}
.meal-title strong {
  color: var(--ink);
  font-size: 14px;
}
.meal-title small,
.meal-preview,
.meal-chevron {
  color: var(--tx-muted);
  font-size: 11px;
}
.meal-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meal-total {
  color: var(--ink);
  font-size: 13px;
  text-align: right;
}
.meal-chevron {
  text-align: right;
}
.meal-detail {
  padding: 0 0 16px 2px;
}
.record-list {
  border-top: 1px solid var(--line);
}
.record-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 190px 42px;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  border-bottom: 1px solid var(--line);
}
.record-emoji {
  font-size: 19px;
}
.record-row strong {
  color: var(--ink);
  font-size: 12px;
}
.record-row p,
.record-nutrients small {
  color: var(--tx-muted);
  font-size: 10px;
}
.record-nutrients {
  display: grid;
  justify-items: end;
  gap: 2px;
  color: var(--tx-sub);
  font-size: 11px;
}
.delete-button {
  border: 0;
  background: transparent;
  color: #bd5555;
  font-size: 10px;
}
.meal-empty-copy {
  padding: 15px 0;
  color: var(--tx-muted);
  font-size: 11px;
}
.meal-detail-footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-top: 12px;
  color: var(--tx-muted);
  font-size: 10px;
}
.add-inline {
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.daily-progress {
  padding: 28px 0;
  border-top: 1px solid var(--line);
}
.daily-progress-head {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
}
.daily-progress-head h3 {
  color: var(--ink);
  font-size: 16px;
}
.daily-progress-head p {
  color: var(--tx-muted);
  font-size: 11px;
}
.nutrient-lines {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 28px;
}
.nutrient-line {
  display: grid;
  grid-template-columns: 80px 1fr 116px 54px;
  align-items: center;
  gap: 9px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.nutrient-line > span,
.nutrient-line > strong {
  font-size: 10px;
}
.nutrient-line > strong {
  text-align: right;
}
.nutrient-line.alert > span {
  color: #b45c3a;
  font-weight: 800;
}
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(30, 37, 39, 0.26);
}
.add-drawer {
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
  font-size: 21px;
}
.drawer-head button {
  border: 0;
  background: transparent;
  color: var(--tx-sub);
  font-size: 11px;
}
.drawer-scroll {
  flex: 1;
  overflow: auto;
  padding: 4px 26px 28px;
}
.drawer-section {
  padding: 18px 0;
  border-bottom: 1px solid var(--line);
}
.drawer-section > label {
  display: block;
  margin-bottom: 10px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
}
.drawer-meals,
.category-row,
.quick-amount {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.drawer-meals button,
.category-row button,
.quick-amount button {
  min-height: 32px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: #fff;
  color: var(--tx-sub);
  font-size: 10px;
}
.drawer-meals button.active,
.category-row button.active,
.quick-amount button.active {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 800;
}
.drawer-input {
  width: 100%;
  height: 40px;
  padding: 0 11px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  outline: 0;
  font-size: 12px;
}
.drawer-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.drawer-input.compact {
  width: 120px;
  margin-top: 10px;
}
.category-row {
  margin-top: 10px;
}
.result-meta {
  display: flex;
  justify-content: space-between;
  margin: 10px 0 6px;
  color: var(--tx-muted);
  font-size: 10px;
}
.result-meta button {
  border: 0;
  background: transparent;
  color: var(--brand);
}
.food-results {
  max-height: 258px;
  overflow: auto;
  border-top: 1px solid var(--line);
}
.food-results > button {
  width: 100%;
  display: grid;
  grid-template-columns: 34px 1fr 18px;
  align-items: center;
  gap: 8px;
  padding: 9px 6px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: #fff;
  text-align: left;
}
.food-results > button.active {
  background: var(--brand-soft);
}
.food-results strong,
.food-results small {
  display: block;
}
.food-results strong {
  color: var(--ink);
  font-size: 11px;
}
.food-results small {
  color: var(--tx-muted);
  font-size: 9px;
}
.food-results .load-more {
  display: block;
  padding: 10px;
  text-align: center;
  color: var(--brand);
  font-size: 10px;
}
.no-results {
  padding: 18px 0;
  color: var(--tx-muted);
  font-size: 11px;
}
.selected-food {
  display: flex;
  align-items: center;
  gap: 10px;
}
.selected-food > span {
  font-size: 28px;
}
.selected-food strong {
  font-size: 13px;
}
.selected-food p {
  color: var(--tx-muted);
  font-size: 10px;
}
.amount-row {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 14px;
}
.amount-row button,
.amount-row input {
  height: 36px;
  border: 1px solid var(--line-strong);
  background: #fff;
}
.amount-row button {
  width: 36px;
  border-radius: 5px;
}
.amount-row input {
  width: 90px;
  padding: 0 8px;
  text-align: center;
}
.amount-row span {
  color: var(--tx-sub);
  font-size: 11px;
}
.quick-amount {
  margin-top: 8px;
}
.nutrition-preview {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 10px;
  margin-top: 14px;
  padding: 12px 0;
  border-block: 1px solid var(--line);
  font-size: 11px;
}
.nutrition-preview span,
.nutrition-preview small {
  color: var(--tx-muted);
}
.nutrition-preview small {
  grid-column: 1/-1;
}
.drawer-footer {
  padding: 16px 26px;
  border-top: 1px solid var(--line);
}
.drawer-footer .btn {
  width: 100%;
  min-height: 44px;
}
.timeline-toast {
  position: fixed;
  z-index: 90;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 18px;
  border-radius: 999px;
  background: #27322f;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
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
.panel-reveal-enter-active {
  transition: opacity 0.25s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to,
.panel-reveal-enter-from {
  opacity: 0;
}
</style>

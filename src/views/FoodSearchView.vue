<script setup>
import { computed, ref, watch } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { FOOD_DB, FOOD_CATEGORIES, FOOD_STATS, searchFood, scaleNutrition } from '@/data/foods'
import { NUTRIENT_META } from '@/utils/nutrition'

const keyword = ref('')
const appliedKeyword = ref('')
const activeCategory = ref('全部')
const sortKey = ref('relevance')
const showCount = ref(60)
const selectedId = ref(FOOD_DB[0]?.id || '')
const amount = ref(100)
const loadingMore = ref(false)

const SUGGESTIONS = ['鸡胸肉', '减脂餐', '水果', '高蛋白', '外卖']
const QUICK_AMOUNTS = [50, 100, 150, 200]
const NUTRIENT_KEYS = ['calories', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium']
const NUTRIENT_LIMITS = { calories: 600, protein: 35, fat: 50, carb: 80, fiber: 15, sugar: 50, sodium: 1500 }
const SORT_OPTIONS = [
  { value: 'relevance', label: '默认顺序' },
  { value: 'caloriesAsc', label: '热量从低到高' },
  { value: 'caloriesDesc', label: '热量从高到低' },
  { value: 'proteinDesc', label: '蛋白质从高到低' },
  { value: 'fiberDesc', label: '膳食纤维从高到低' }
]

const isSearching = computed(() => !!appliedKeyword.value)

const results = computed(() => {
  const base = isSearching.value ? searchFood(appliedKeyword.value, FOOD_DB.length) : [...FOOD_DB]
  const filtered = activeCategory.value === '全部' ? base : base.filter(food => food.category === activeCategory.value)
  if (sortKey.value === 'caloriesAsc') return [...filtered].sort((a, b) => a.calories - b.calories)
  if (sortKey.value === 'caloriesDesc') return [...filtered].sort((a, b) => b.calories - a.calories)
  if (sortKey.value === 'proteinDesc') return [...filtered].sort((a, b) => b.protein - a.protein)
  if (sortKey.value === 'fiberDesc') return [...filtered].sort((a, b) => b.fiber - a.fiber)
  return filtered
})

const visibleList = computed(() => results.value.slice(0, showCount.value))
const hasMore = computed(() => results.value.length > showCount.value)
const selectedFood = computed(
  () => results.value.find(food => food.id === selectedId.value) || results.value[0] || null
)
const scaledNutrition = computed(() =>
  selectedFood.value ? scaleNutrition(selectedFood.value, Number(amount.value) || 0) : null
)
const measureUnit = computed(() => (String(selectedFood.value?.unit || '').includes('ml') ? 'ml' : 'g'))
const sourceText = computed(() => {
  if (selectedFood.value?.source === 'curated') return '精选数据'
  if (selectedFood.value?.source === 'seed') return '扩充数据'
  return '组合推算'
})

const macroDistribution = computed(() => {
  if (!selectedFood.value) return []
  const items = [
    { key: 'protein', label: '蛋白质', value: selectedFood.value.protein * 4 },
    { key: 'fat', label: '脂肪', value: selectedFood.value.fat * 9 },
    { key: 'carb', label: '碳水', value: selectedFood.value.carb * 4 }
  ]
  const total = items.reduce((sum, item) => sum + item.value, 0) || 1
  return items.map(item => ({ ...item, percent: Math.round((item.value / total) * 100) }))
})

watch(
  results,
  list => {
    if (!list.some(food => food.id === selectedId.value)) selectedId.value = list[0]?.id || ''
    amount.value = 100
  },
  { immediate: true }
)

function resetList() {
  showCount.value = 60
  amount.value = 100
  loadingMore.value = false
}

function doSearch() {
  appliedKeyword.value = keyword.value.trim()
  resetList()
}

function clearSearch() {
  keyword.value = ''
  appliedKeyword.value = ''
  resetList()
}

function searchSuggestion(text) {
  keyword.value = text
  doSearch()
}

function pickCategory(category) {
  activeCategory.value = category
  resetList()
}

function selectFood(food) {
  selectedId.value = food.id
  amount.value = 100
}

function loadMore() {
  showCount.value += 60
}

function handleCatalogScroll(event) {
  if (!hasMore.value || loadingMore.value) return
  const catalog = event.currentTarget
  const distanceToBottom = catalog.scrollHeight - catalog.scrollTop - catalog.clientHeight
  if (distanceToBottom < 160) {
    loadingMore.value = true
    loadMore()
    window.setTimeout(() => {
      loadingMore.value = false
    }, 2000)
  }
}

function nutrientWidth(key, value) {
  return `${Math.min(100, Math.round(((Number(value) || 0) / NUTRIENT_LIMITS[key]) * 100))}%`
}
</script>

<template>
  <div class="food-explorer stagger">
    <PageHeader />

    <main class="explorer-shell">
      <section class="search-workspace" aria-label="食物搜索与筛选">
        <div class="search-row">
          <div class="search-input-wrap">
            <span aria-hidden="true">⌕</span>
            <input
              v-model="keyword"
              type="search"
              placeholder="搜索名称、别名、营养标签或分类"
              aria-label="搜索食物"
              @keyup.enter="doSearch"
            />
          </div>
          <button class="btn btn-primary" type="button" @click="doSearch">搜索</button>
          <button v-if="isSearching" class="clear-search" type="button" @click="clearSearch">清除</button>
          <div class="database-meta">
            <strong class="num">{{ FOOD_STATS.total }}</strong> 种食物 <span>·</span> {{ FOOD_STATS.categories }} 个分类
            <span>·</span> {{ FOOD_STATS.tags }} 个标签 <span>·</span> 7 项营养
          </div>
        </div>

        <div class="suggestion-row">
          <span>快捷搜索</span>
          <button
            v-for="suggestion in SUGGESTIONS"
            :key="suggestion"
            type="button"
            @click="searchSuggestion(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>

        <nav class="category-nav" aria-label="食物分类">
          <button
            v-for="category in FOOD_CATEGORIES"
            :key="category"
            type="button"
            :class="{ active: activeCategory === category }"
            @click="pickCategory(category)"
          >
            {{ category }}
          </button>
        </nav>
      </section>

      <section class="explorer-layout">
        <div class="catalog-pane">
          <header class="catalog-toolbar">
            <div>
              <p class="section-eyebrow">
                {{ isSearching ? `“${appliedKeyword}” 的搜索结果` : `${activeCategory}食物目录` }}
              </p>
              <h2>{{ results.length }} 个结果</h2>
            </div>
            <label>
              <span>排序</span>
              <select v-model="sortKey" @change="resetList">
                <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
          </header>

          <div
            v-if="visibleList.length"
            class="food-table"
            role="table"
            aria-label="食物营养目录"
            @scroll.passive="handleCatalogScroll"
          >
            <div class="food-table-head" role="row">
              <span role="columnheader">食物</span>
              <span role="columnheader">分类</span>
              <span role="columnheader">热量</span>
              <span role="columnheader">蛋白质</span>
              <span role="columnheader">纤维</span>
              <span aria-hidden="true"></span>
            </div>
            <button
              v-for="food in visibleList"
              :key="food.id"
              class="food-row"
              :class="{ selected: selectedFood?.id === food.id }"
              type="button"
              role="row"
              @click="selectFood(food)"
            >
              <span class="food-identity" role="cell"
                ><b aria-hidden="true">{{ food.emoji }}</b
                ><strong>{{ food.name }}</strong></span
              >
              <span role="cell">{{ food.category }}</span>
              <span class="num" role="cell">{{ Math.round(food.calories) }} <small>kcal</small></span>
              <span class="num" role="cell">{{ food.protein }}g</span>
              <span class="num" role="cell">{{ food.fiber }}g</span>
              <span class="row-arrow" aria-hidden="true">›</span>
            </button>
            <div v-if="hasMore" class="load-status">
              {{ loadingMore ? '正在加载更多…' : `继续向下滚动，自动加载剩余 ${results.length - showCount} 条` }}
            </div>
            <div v-else class="load-status complete">已显示全部 {{ results.length }} 条结果</div>
          </div>

          <div v-else class="empty-results">
            <EmptyState emoji="🔍" text="没有找到匹配的食物" sub="更换关键词或选择其他分类后再试" />
          </div>
        </div>

        <aside class="detail-pane" aria-label="选中食物营养详情">
          <div v-if="selectedFood" class="detail-sticky">
            <header class="detail-head">
              <span class="detail-emoji" aria-hidden="true">{{ selectedFood.emoji }}</span>
              <div>
                <p>{{ selectedFood.category }} · {{ sourceText }}</p>
                <h2>{{ selectedFood.name }}</h2>
              </div>
              <strong class="num">{{ scaledNutrition.calories }}<small> kcal</small></strong>
            </header>

            <section class="amount-control">
              <div>
                <p>份量换算</p>
                <span>当前按 {{ amount || 0 }}{{ measureUnit }} 计算</span>
              </div>
              <div class="amount-stepper">
                <button type="button" aria-label="减少份量" @click="amount = Math.max(1, Number(amount) - 10)">
                  −
                </button>
                <input v-model.number="amount" type="number" min="1" max="5000" aria-label="食物份量" />
                <span>{{ measureUnit }}</span>
                <button type="button" aria-label="增加份量" @click="amount = Number(amount) + 10">＋</button>
              </div>
              <div class="quick-amounts">
                <button
                  v-for="quick in QUICK_AMOUNTS"
                  :key="quick"
                  type="button"
                  :class="{ active: amount === quick }"
                  @click="amount = quick"
                >
                  {{ quick }}{{ measureUnit }}
                </button>
              </div>
            </section>

            <section class="nutrient-spectrum">
              <div v-for="key in NUTRIENT_KEYS" :key="key" class="nutrient-line">
                <span>{{ NUTRIENT_META[key].label }}</span>
                <div><i :style="{ width: nutrientWidth(key, scaledNutrition[key]) }"></i></div>
                <strong class="num"
                  >{{ scaledNutrition[key] }} <small>{{ NUTRIENT_META[key].unit }}</small></strong
                >
              </div>
            </section>

            <section class="macro-section">
              <header>
                <h3>供能比例</h3>
                <span>按三大营养素估算</span>
              </header>
              <div class="macro-bar">
                <i
                  v-for="macro in macroDistribution"
                  :key="macro.key"
                  :class="macro.key"
                  :style="{ width: `${macro.percent}%` }"
                ></i>
              </div>
              <div class="macro-legend">
                <span v-for="macro in macroDistribution" :key="macro.key"
                  ><i :class="macro.key"></i>{{ macro.label }} {{ macro.percent }}%</span
                >
              </div>
            </section>

            <section v-if="selectedFood.tags?.length" class="tag-section">
              <h3>营养标签</h3>
              <div>
                <span v-for="tag in selectedFood.tags" :key="tag">{{ tag }}</span>
              </div>
            </section>

            <p class="detail-note">所有数据为每 100{{ measureUnit }} 可食部参考值，当前数值已按所选份量实时换算。</p>
          </div>
          <div v-else class="detail-empty">选择左侧食物查看完整营养与份量换算。</div>
        </aside>
      </section>

      <footer class="data-note">
        <strong>数据说明</strong>
        <p>
          数据来自内置食物营养数据库，由手工整理、种子扩充与食材组合推算构成，仅供学习和营养管理参考，不作为医疗诊断依据。
        </p>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.explorer-shell {
  width: min(1180px, 100%);
  margin: 0 auto;
  padding: 4px 0 52px;
}
.search-workspace {
  padding: 18px 0 0;
  border-bottom: 1px solid var(--line);
}
.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.search-input-wrap {
  height: 44px;
  min-width: 360px;
  max-width: 560px;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: #fff;
}
.search-input-wrap:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.search-input-wrap > span {
  color: var(--brand);
  font-size: 22px;
}
.search-input-wrap input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
}
.clear-search {
  height: 38px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--tx-sub);
  font-size: 11px;
}
.database-meta {
  margin-left: auto;
  color: var(--tx-muted);
  font-size: 11px;
  white-space: nowrap;
}
.database-meta strong {
  color: var(--ink);
  font-size: 12px;
}
.database-meta span {
  margin: 0 3px;
  color: var(--line-strong);
}
.suggestion-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 0 12px;
}
.suggestion-row > span {
  margin-right: 3px;
  color: var(--tx-muted);
  font-size: 11px;
}
.suggestion-row button {
  padding: 3px 7px;
  border: 0;
  border-radius: 4px;
  background: var(--surface-soft, #f5f7f7);
  color: var(--tx-sub);
  font-size: 11px;
}
.category-nav {
  display: flex;
  align-items: center;
  gap: 22px;
  overflow: hidden;
}
.category-nav button {
  min-height: 38px;
  padding: 0 1px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--tx-muted);
  font-size: 11px;
  white-space: nowrap;
}
.category-nav button.active {
  border-bottom-color: var(--brand);
  color: var(--brand);
  font-weight: 800;
}
.explorer-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 390px;
  gap: 34px;
  align-items: start;
}
.catalog-pane {
  min-width: 0;
}
.catalog-toolbar {
  height: 78px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--line);
}
.section-eyebrow {
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.catalog-toolbar h2 {
  margin-top: 2px;
  color: var(--ink);
  font-size: 17px;
}
.catalog-toolbar label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--tx-muted);
  font-size: 11px;
}
.catalog-toolbar select {
  height: 32px;
  padding: 0 26px 0 8px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: #fff;
  color: var(--tx-sub);
  font-size: 11px;
  outline: 0;
}
.food-table-head,
.food-row {
  display: grid;
  grid-template-columns: minmax(190px, 1.4fr) 66px 84px 74px 62px 18px;
  align-items: center;
  gap: 8px;
}
.food-table-head {
  height: 34px;
  border-bottom: 1px solid var(--line);
  color: var(--tx-muted);
  font-size: 11px;
}
.food-table-head span:nth-child(n + 3) {
  text-align: right;
}
.food-row {
  width: 100%;
  min-height: 56px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--tx-sub);
  font-size: 11px;
  text-align: left;
  transition:
    background 0.18s ease,
    box-shadow 0.18s ease;
}
.food-row:hover {
  background: rgba(237, 246, 243, 0.55);
}
.food-row.selected {
  background: var(--brand-soft);
  box-shadow: inset 3px 0 var(--brand);
}
.food-row > span:nth-child(n + 3) {
  text-align: right;
}
.food-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 10px;
  min-width: 0;
}
.food-identity b {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  font-size: 15px;
}
.food-identity strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.food-row small {
  color: var(--tx-muted);
  font-size: 11px;
}
.row-arrow {
  color: var(--brand);
  font-size: 17px;
}
.load-more {
  width: 100%;
  height: 44px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.empty-results {
  padding: 54px 0;
}
.detail-pane {
  min-height: 640px;
  border-left: 1px solid var(--line);
}
.detail-sticky {
  position: sticky;
  top: 18px;
  padding: 25px 0 20px 28px;
}
.detail-head {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  align-items: center;
  gap: 11px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
}
.detail-emoji {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  font-size: 23px;
}
.detail-head p {
  color: var(--tx-muted);
  font-size: 11px;
}
.detail-head h2 {
  margin-top: 3px;
  color: var(--ink);
  font-size: 18px;
}
.detail-head > strong {
  color: var(--ink);
  font-size: 22px;
}
.detail-head > strong small {
  color: var(--tx-muted);
  font-size: 11px;
}
.amount-control {
  padding: 17px 0;
  border-bottom: 1px solid var(--line);
}
.amount-control > div:first-child {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.amount-control p {
  color: var(--ink);
  font-size: 11px;
  font-weight: 800;
}
.amount-control > div:first-child span {
  color: var(--tx-muted);
  font-size: 11px;
}
.amount-stepper {
  display: grid;
  grid-template-columns: 34px 64px 28px 34px;
  align-items: center;
  justify-content: start;
  margin-top: 11px;
}
.amount-stepper button,
.amount-stepper input {
  height: 34px;
  border: 1px solid var(--line-strong);
  background: #fff;
}
.amount-stepper button {
  color: var(--brand);
  font-size: 15px;
}
.amount-stepper input {
  border-inline: 0;
  text-align: center;
  color: var(--ink);
  font-size: 11px;
  outline: 0;
}
.amount-stepper > span {
  height: 34px;
  display: grid;
  place-items: center;
  border-block: 1px solid var(--line-strong);
  color: var(--tx-muted);
  font-size: 11px;
}
.quick-amounts {
  display: flex;
  gap: 6px;
  margin-top: 9px;
}
.quick-amounts button {
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: #fff;
  color: var(--tx-muted);
  font-size: 11px;
}
.quick-amounts button.active {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 800;
}
.nutrient-spectrum {
  padding: 15px 0;
  border-bottom: 1px solid var(--line);
}
.nutrient-line {
  display: grid;
  grid-template-columns: 52px 1fr 82px;
  align-items: center;
  gap: 9px;
  min-height: 28px;
}
.nutrient-line > span {
  color: var(--tx-sub);
  font-size: 11px;
}
.nutrient-line > div {
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--line);
}
.nutrient-line > div i {
  height: 100%;
  display: block;
  border-radius: 2px;
  background: var(--brand);
}
.nutrient-line > strong {
  text-align: right;
  color: var(--ink);
  font-size: 11px;
}
.nutrient-line > strong small {
  color: var(--tx-muted);
  font-size: 11px;
}
.macro-section {
  padding: 15px 0;
  border-bottom: 1px solid var(--line);
}
.macro-section header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.macro-section h3,
.tag-section h3 {
  color: var(--ink);
  font-size: 11px;
}
.macro-section header span {
  color: var(--tx-muted);
  font-size: 11px;
}
.macro-bar {
  height: 8px;
  display: flex;
  overflow: hidden;
  margin-top: 11px;
  border-radius: 4px;
  background: var(--line);
}
.macro-bar i {
  display: block;
  height: 100%;
}
.macro-bar .protein,
.macro-legend .protein {
  background: #287c68;
}
.macro-bar .fat,
.macro-legend .fat {
  background: #c69a36;
}
.macro-bar .carb,
.macro-legend .carb {
  background: #7390a7;
}
.macro-legend {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  color: var(--tx-muted);
  font-size: 11px;
}
.macro-legend span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.macro-legend i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.tag-section {
  padding: 15px 0;
  border-bottom: 1px solid var(--line);
}
.tag-section > div {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.tag-section span {
  padding: 3px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--tx-sub);
  font-size: 11px;
}
.detail-note {
  padding-top: 12px;
  color: var(--tx-muted);
  font-size: 11px;
  line-height: 1.6;
}
.detail-empty {
  padding: 50px 0 0 28px;
  color: var(--tx-muted);
  font-size: 11px;
}
.data-note {
  display: flex;
  gap: 18px;
  margin-top: 30px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  color: var(--tx-muted);
  font-size: 11px;
}
.data-note strong {
  flex: none;
  color: var(--ink);
  font-size: 11px;
}
.data-note p {
  line-height: 1.7;
}
/* Desktop data workbench: both columns keep their own scroll position. */
.explorer-shell {
  width: min(1240px, 100%);
  padding-bottom: 32px;
}
.search-workspace {
  position: sticky;
  top: 0;
  z-index: 10;
  padding-top: 20px;
  background: var(--page-bg, #fff);
}
.search-input-wrap {
  height: 48px;
  min-width: 400px;
  max-width: 620px;
  padding-inline: 15px;
}
.search-input-wrap input {
  font-size: 14px;
}
.clear-search {
  font-size: 12px;
}
.database-meta {
  font-size: 11px;
}
.database-meta strong {
  font-size: 15px;
}
.suggestion-row {
  gap: 8px;
  padding: 12px 0 14px;
}
.suggestion-row > span,
.suggestion-row button {
  font-size: 11px;
}
.suggestion-row button {
  padding: 5px 9px;
}
.category-nav {
  gap: 24px;
}
.category-nav button {
  min-height: 42px;
  font-size: 12px;
}
.explorer-layout {
  height: clamp(600px, calc(100vh - 330px), 760px);
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 32px;
  align-items: stretch;
  overflow: hidden;
  border-bottom: 1px solid var(--line);
}
.catalog-pane {
  height: 100%;
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
}
.catalog-toolbar {
  height: 82px;
  flex: none;
}
.section-eyebrow {
  font-size: 11px;
}
.catalog-toolbar h2 {
  font-size: 20px;
}
.catalog-toolbar label {
  font-size: 12px;
}
.catalog-toolbar select {
  height: 36px;
  font-size: 12px;
}
.food-table {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: var(--line-strong) transparent;
  scrollbar-width: thin;
}
.food-table-head {
  position: sticky;
  z-index: 3;
  top: 0;
  height: 40px;
  background: var(--page-bg, #fff);
  font-size: 11px;
}
.food-table-head,
.food-row {
  grid-template-columns: minmax(190px, 1.4fr) 72px 92px 82px 70px 20px;
  gap: 10px;
}
.food-row {
  min-height: 66px;
  font-size: 12px;
}
.food-identity {
  gap: 12px;
  padding-left: 12px;
}
.food-identity b {
  width: 36px;
  height: 36px;
  font-size: 18px;
}
.food-identity strong {
  font-size: 14px;
}
.food-row small {
  font-size: 11px;
}
.row-arrow {
  font-size: 20px;
}
.load-status {
  height: 50px;
  display: grid;
  place-items: center;
  color: var(--brand);
  font-size: 12px;
  font-weight: 700;
}
.load-status.complete {
  color: var(--tx-muted);
  font-weight: 500;
}
.empty-results {
  display: grid;
  flex: 1;
  place-items: center;
  padding: 30px 0;
}
.detail-pane {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-left: 1px solid var(--line);
  scrollbar-color: var(--line-strong) transparent;
  scrollbar-width: thin;
}
.detail-sticky {
  position: static;
  padding: 28px 4px 28px 30px;
}
.detail-head {
  grid-template-columns: 54px 1fr auto;
  gap: 14px;
  padding-bottom: 22px;
}
.detail-emoji {
  width: 52px;
  height: 52px;
  font-size: 26px;
}
.detail-head p {
  font-size: 11px;
}
.detail-head h2 {
  font-size: 22px;
}
.detail-head > strong {
  font-size: 27px;
}
.detail-head > strong small {
  font-size: 11px;
}
.amount-control {
  padding: 20px 0;
}
.amount-control p {
  font-size: 14px;
}
.amount-control > div:first-child span {
  font-size: 11px;
}
.amount-stepper {
  grid-template-columns: 40px 74px 32px 40px;
  margin-top: 14px;
}
.amount-stepper button,
.amount-stepper input,
.amount-stepper > span {
  height: 40px;
}
.amount-stepper button {
  font-size: 18px;
}
.amount-stepper input {
  font-size: 14px;
}
.amount-stepper > span {
  font-size: 12px;
}
.quick-amounts {
  gap: 8px;
  margin-top: 11px;
}
.quick-amounts button {
  height: 32px;
  padding-inline: 10px;
  font-size: 11px;
}
.nutrient-spectrum {
  padding: 18px 0;
}
.nutrient-line {
  grid-template-columns: 72px 1fr 94px;
  gap: 12px;
  min-height: 36px;
}
.nutrient-line > span {
  font-size: 12px;
}
.nutrient-line > div {
  height: 6px;
}
.nutrient-line > strong {
  font-size: 13px;
}
.nutrient-line > strong small {
  font-size: 11px;
}
.macro-section {
  padding: 19px 0;
}
.macro-section h3,
.tag-section h3 {
  font-size: 14px;
}
.macro-section header span {
  font-size: 11px;
}
.macro-bar {
  height: 10px;
  margin-top: 14px;
}
.macro-legend {
  margin-top: 11px;
  font-size: 11px;
}
.macro-legend i {
  width: 8px;
  height: 8px;
}
.tag-section {
  padding: 18px 0;
}
.tag-section > div {
  gap: 7px;
  margin-top: 10px;
}
.tag-section span {
  padding: 5px 8px;
  font-size: 11px;
}
.detail-note {
  padding-top: 15px;
  font-size: 11px;
}
.detail-empty {
  font-size: 13px;
}
.data-note {
  margin-top: 20px;
  padding-top: 15px;
  font-size: 11px;
}
.data-note strong {
  font-size: 12px;
}
/* 键盘焦点：无原生描边的下拉框与份量输入框补上松石绿焦点环 */
.catalog-toolbar select:focus-visible,
.amount-stepper input:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
/* 平板与窄屏（≤1023px）：数据工作台由左右双栏改为上下单栏，
   列表与详情自然流动，避免 420px 详情栏挤压食物表格 */
@media (max-width: 1023px) {
  .explorer-shell {
    padding-bottom: 24px;
  }
  .search-row {
    flex-wrap: wrap;
  }
  .search-input-wrap {
    min-width: 0;
    flex: 1 1 240px;
  }
  .category-nav {
    overflow-x: auto;
    overflow-y: hidden;
  }
  .explorer-layout {
    height: auto;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
    overflow: visible;
  }
  .catalog-pane {
    height: auto;
    overflow: visible;
  }
  .food-table {
    max-height: 520px;
  }
  .detail-pane {
    height: auto;
    min-height: 0;
    overflow: visible;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .detail-sticky {
    position: static;
    padding: 22px 0;
  }
}
</style>

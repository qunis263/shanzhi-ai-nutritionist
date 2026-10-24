<script setup>
/**
 * FoodSearchView 页面组件：食物营养速查
 * ------------------------------------------------------------------
 * 食物营养数据库（900+ 条）的全局检索入口，面向评委展示数据规模与检索能力。
 *
 * 页面结构（自上而下）：
 *   ① 库规模统计：4 个 StatTile（食物总数 / 分类数 / 标签数 / 营养维度）
 *   ② 搜索卡片：回车 / 按钮触发，复用 searchFood 加权模糊检索（名称 / 别名 / 标签 / 分类），
 *      显示命中条数；空关键词时按分类浏览全库
 *   ③ 分类筛选 chips：数据来自 FOOD_CATEGORIES，搜索与浏览两种模式下均生效
 *   ④ 结果卡片列表：emoji + 名称 + 分类 + 每 100g 五项核心营养；
 *      点击展开完整营养（含糖 / 钠）+ 份量换算小工具（scaleNutrition 实时换算）
 *   ⑤ 无结果时统一 EmptyState 占位
 *
 * 说明：数据全部来自 src/data/foods.js，纯前端本地检索，无需联网。
 */
import { computed, ref } from 'vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatTile from '@/components/common/StatTile.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { FOOD_DB, FOOD_CATEGORIES, FOOD_STATS, searchFood, scaleNutrition } from '@/data/foods'
import { NUTRIENT_META } from '@/utils/nutrition'
import { themeByIndex } from '@/utils/theme'

/* ===================================================================
 * 一、库规模统计（StatTile 数据）
 * =================================================================== */
const statTiles = [
  {
    theme: 'orange',
    emoji: '🍱',
    label: '收录食物',
    value: FOOD_STATS.total,
    unit: '条',
    sub: `手工精选 ${FOOD_STATS.curated} · 种子扩充 ${FOOD_STATS.seed} · 组合推算 ${FOOD_STATS.generated}`
  },
  { theme: 'green', emoji: '🗂️', label: '食物分类', value: FOOD_STATS.categories, unit: '个', sub: '点击下方分类 chips 可按类浏览' },
  { theme: 'blue', emoji: '🏷️', label: '营养标签', value: FOOD_STATS.tags, unit: '个', sub: '支持「减脂餐」「高蛋白」等标签检索' },
  { theme: 'purple', emoji: '⚖️', label: '营养维度', value: 7, unit: '项', sub: '热量 / 蛋白 / 脂肪 / 碳水 / 纤维 / 糖 / 钠' }
]

/* ===================================================================
 * 二、搜索与分类筛选
 * =================================================================== */
const keyword = ref('') // 输入框中的关键词
const appliedKeyword = ref('') // 实际生效的搜索词（回车 / 按钮触发后写入）
const activeCategory = ref('全部') // 当前分类

/** 热门搜索建议（点击即搜，方便评委快速体验） */
const SUGGESTIONS = ['鸡胸肉', '减脂餐', '水果', '高蛋白', '外卖']

/** 触发搜索：把输入框内容固化为生效关键词 */
function doSearch() {
  appliedKeyword.value = keyword.value.trim()
  resetPaging()
}

/** 清除搜索：回到分类浏览模式 */
function clearSearch() {
  keyword.value = ''
  appliedKeyword.value = ''
  resetPaging()
}

/** 点击热门建议：填入关键词并立即搜索 */
function searchSuggestion(text) {
  keyword.value = text
  doSearch()
}

/** 切换分类（搜索与浏览两种模式下均对结果再过滤） */
function pickCategory(cat) {
  activeCategory.value = cat
  resetPaging()
}

/** 是否处于搜索模式（决定命中提示文案与结果来源） */
const isSearching = computed(() => !!appliedKeyword.value)

/**
 * 结果列表：
 *   · 搜索模式：searchFood 加权模糊检索（limit 拉满以统计全部命中条数）
 *   · 浏览模式：空关键词时展示全库，按分类 chips 过滤
 */
const results = computed(() => {
  const base = isSearching.value ? searchFood(appliedKeyword.value, FOOD_DB.length) : FOOD_DB
  if (activeCategory.value === '全部') return base
  return base.filter((food) => food.category === activeCategory.value)
})

/* ===================================================================
 * 三、分页加载（避免一次性渲染近千张卡片）
 * =================================================================== */
const PAGE_SIZE = 60 // 每批展示的卡片数
const showCount = ref(PAGE_SIZE)

/** 当前可见卡片 */
const visibleList = computed(() => results.value.slice(0, showCount.value))
/** 是否还有未展示的条目 */
const hasMore = computed(() => results.value.length > showCount.value)

function loadMore() {
  showCount.value += PAGE_SIZE
}

/** 搜索 / 切换分类后重置分页与展开状态 */
function resetPaging() {
  showCount.value = PAGE_SIZE
  expandedId.value = ''
  grams.value = 100
}

/* ===================================================================
 * 四、卡片展开详情 + 份量换算
 * =================================================================== */
const expandedId = ref('') // 当前展开的食物 id（'' 表示全部收起，同时只展开一张）
const grams = ref(100) // 份量换算的克数（切换展开卡片时重置为 100）

/** 点击卡片：展开 / 收起详情 */
function toggleFood(id) {
  expandedId.value = expandedId.value === id ? '' : id
  grams.value = 100
}

/** 当前展开的食物对象（用于份量换算） */
const expandedFood = computed(() => results.value.find((f) => f.id === expandedId.value) || null)

/** 按输入克数实时换算的营养值 */
const scaledNutrition = computed(() => (expandedFood.value ? scaleNutrition(expandedFood.value, grams.value) : null))

/** 详情区展示的 7 项营养素（顺序与 NUTRIENT_META 一致，不含饮水） */
const NUTRIENT_KEYS = ['calories', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium']

/** 份量换算的快捷克数 */
const QUICK_GRAMS = [50, 100, 150, 200]
</script>

<template>
  <div class="stagger">
    <!-- ===================== 页面标题 ===================== -->
    <PageHeader />

    <!-- ===================== ① 库规模统计 ===================== -->
    <section class="mb-5 grid grid-cols-4 gap-5">
      <StatTile
        v-for="tile in statTiles"
        :key="tile.label"
        :theme="tile.theme"
        :emoji="tile.emoji"
        :label="tile.label"
        :value="tile.value"
        :unit="tile.unit"
        :sub="tile.sub"
      />
    </section>

    <!-- ===================== ② 搜索 + 分类筛选 ===================== -->
    <MacaronCard theme="orange" emoji="🔍" title="搜索食物" sub="支持名称 / 别名 / 标签 / 分类的加权模糊检索" class="mb-5">
      <!-- 搜索框（回车 / 按钮触发）+ 命中条数 -->
      <div class="flex flex-wrap items-center gap-3">
        <input
          v-model="keyword"
          class="field min-w-[200px] max-w-[360px] flex-1"
          placeholder="🔍 输入关键词，如「鸡胸肉」「减脂餐」「水果」"
          @keyup.enter="doSearch"
        />
        <button class="btn btn-primary" @click="doSearch">搜索</button>
        <button v-if="isSearching" class="btn btn-ghost" @click="clearSearch">✕ 清除</button>
        <span class="chip">
          {{ isSearching ? '命中' : '共' }}
          <b class="num chip-strong">{{ results.length }}</b> 条
        </span>
      </div>

      <!-- 热门搜索建议 -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="text-[12px] tx-muted">热门搜索：</span>
        <button v-for="sug in SUGGESTIONS" :key="sug" class="tag" @click="searchSuggestion(sug)">{{ sug }}</button>
      </div>

      <div class="divider"></div>

      <!-- 分类筛选 chips -->
      <div class="flex flex-wrap gap-2">
        <button
          v-for="cat in FOOD_CATEGORIES"
          :key="cat"
          class="tag"
          :class="activeCategory === cat ? 'tag-orange' : ''"
          @click="pickCategory(cat)"
        >
          {{ cat }}
        </button>
      </div>
    </MacaronCard>

    <!-- ===================== ③ 结果卡片列表 ===================== -->
    <!-- 响应式栅格：手机（390px）单列 / 小屏两列 / 桌面三列 -->
    <section v-if="visibleList.length" class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="(food, i) in visibleList"
        :key="food.id"
        class="macaron-card card-hover cursor-pointer"
        :class="`mc-${themeByIndex(i)}`"
        @click="toggleFood(food.id)"
      >
        <!-- 头部：emoji + 名称 + 分类 + 热量大数字 -->
        <div class="flex items-start gap-3">
          <span class="emoji-badge-lg" aria-hidden="true">{{ food.emoji }}</span>
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-2 text-[14px] font-bold tx-main">
              <span class="truncate">{{ food.name }}</span>
              <span class="tag shrink-0">{{ food.category }}</span>
            </p>
            <p class="mt-1 text-[12px] tx-muted">每 100g 营养含量</p>
          </div>
          <p class="num shrink-0 text-[20px] font-extrabold tx-main">
            {{ Math.round(food.calories) }}<span class="ml-0.5 text-[11px] font-semibold tx-muted">kcal</span>
          </p>
        </div>

        <!-- 五项核心营养 chips（每 100g） -->
        <div class="mt-3 flex flex-wrap gap-1.5">
          <span class="tag num">🥩 蛋白 {{ food.protein }}g</span>
          <span class="tag num">🥑 脂肪 {{ food.fat }}g</span>
          <span class="tag num">🍚 碳水 {{ food.carb }}g</span>
          <span class="tag num">🌿 纤维 {{ food.fiber }}g</span>
        </div>

        <!-- ========== 展开详情：完整营养 + 份量换算 ========== -->
        <div v-if="expandedId === food.id" class="anim-fade-up" @click.stop>
          <div class="divider"></div>

          <!-- 每 100g 完整营养（含糖 / 钠） -->
          <p class="mb-2 text-[12px] font-bold tx-main">📊 每 100g 完整营养</p>
          <div class="grid grid-cols-4 gap-2">
            <div v-for="key in NUTRIENT_KEYS" :key="key" class="rounded-[12px] bg-white/80 px-2 py-1.5 text-center">
              <p class="text-[10.5px] tx-muted">{{ NUTRIENT_META[key].emoji }} {{ NUTRIENT_META[key].label }}</p>
              <p class="num text-[13px] font-bold tx-main">
                {{ food[key] ?? 0
                }}<span class="ml-0.5 text-[10px] font-normal tx-muted">{{ NUTRIENT_META[key].unit }}</span>
              </p>
            </div>
          </div>

          <!-- 份量换算小工具 -->
          <div class="mt-3 rounded-[14px] bg-white/80 p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[12px] font-bold tx-main">⚖️ 份量换算</span>
              <input v-model.number="grams" type="number" min="1" max="5000" class="field w-[100px]" />
              <span class="text-[12px] tx-muted">克</span>
              <button v-for="g in QUICK_GRAMS" :key="g" class="tag" @click.stop="grams = g">{{ g }}g</button>
            </div>
            <div v-if="scaledNutrition" class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="key in NUTRIENT_KEYS" :key="key" class="tag num" :class="`tag-${NUTRIENT_META[key].theme}`">
                {{ NUTRIENT_META[key].emoji }} {{ scaledNutrition[key] }} {{ NUTRIENT_META[key].unit }}
              </span>
            </div>
          </div>
        </div>

        <!-- 收起态提示 -->
        <p v-else class="mt-3 text-[11px] tx-muted">👇 点击展开完整营养与份量换算</p>
      </article>
    </section>

    <!-- 无结果空状态 -->
    <div v-else class="macaron-card">
      <EmptyState emoji="🔍" text="没有找到匹配的食物" sub="试试更换关键词，或切换到其他分类浏览" />
    </div>

    <!-- 加载更多 -->
    <div v-if="hasMore" class="mt-5 text-center">
      <button class="btn btn-ghost" @click="loadMore">
        展开更多（剩余 <b class="num">{{ results.length - showCount }}</b> 条）
      </button>
    </div>

    <!-- ===================== ④ 数据说明 ===================== -->
    <MacaronCard theme="blue" emoji="📖" title="数据说明" class="mt-5">
      <p class="text-[12.5px] tx-sub">
        🍱 本页数据来自内置食物营养数据库（手工整理 + 种子扩充 +「食材 × 烹饪方式」组合推算），所有数值均为每 100g
        可食部的公开膳食成分参考估算值，仅供学习与竞赛演示参考，不作为医疗建议或营养诊断依据。
      </p>
    </MacaronCard>
  </div>
</template>

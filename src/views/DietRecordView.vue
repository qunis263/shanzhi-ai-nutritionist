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
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import PageHeader from '@/components/common/PageHeader.vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import StatTile from '@/components/common/StatTile.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'

import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
import { MEAL_EMOJI, MEAL_THEME, MEAL_TYPES } from '@/data/mockHistory'
import { FOOD_CATEGORIES, findFood, scaleNutrition, searchFood } from '@/data/foods'
import { sumNutrition } from '@/utils/nutrition'
import { formatCN, guessMealByNow, nowTimeStr, todayStr, weekdayCN } from '@/utils/date'

const router = useRouter()
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
/** 是否显示添加表单（由 PageHeader 的切换按钮控制） */
const showForm = ref(true)

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

/** 搜索结果：先按关键词模糊搜索，再按分类筛选 */
const searchResults = computed(() => {
  const list = searchFood(form.keyword, 40)
  if (form.category === '全部') return list
  return list.filter((f) => f.category === form.category)
})

/** 选中食物 + 分量下的实时营养预估（复用 scaleNutrition） */
const previewNutrition = computed(() =>
  selectedFood.value ? scaleNutrition(selectedFood.value, Number(form.grams) || 0) : null
)

/** 分量输入框旁的参考单位提示（取自食物自身的 unit，如 100g / 100ml） */
const unitHint = computed(() => (selectedFood.value ? selectedFood.value.unit : '100g'))

/** 选中食物在结果列表中的高亮样式（视觉等价于 .seg-item.is-active） */
const activePickStyle = { background: '#fff1e6', boxShadow: 'inset 0 0 0 2px #ffc59b' }

/** 分类 → 标签配色映射（保证每个分类都有稳定的浅色标签） */
const CATEGORY_THEME = {
  主食: 'yellow',
  肉蛋: 'orange',
  蔬菜: 'green',
  水果: 'cyan',
  乳品: 'blue',
  豆制品: 'green',
  坚果: 'orange',
  饮品: 'blue',
  零食: 'purple',
  快餐: 'purple'
}
/** 取分类标签配色（带兜底） */
function categoryTheme(category) {
  return CATEGORY_THEME[category] || 'blue'
}

/** 选择食物 */
function pickFood(food) {
  form.foodId = food.id
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
  // 重置：食物选择清空，餐段 / 时间保留
  form.foodId = ''
  form.keyword = ''
  form.category = '全部'
  form.grams = 100
}

/* =================================================================
 * 三、今日四餐分组数据
 * ================================================================= */
/** 四个餐段的完整数据（记录列表 + 该餐营养合计 + 配色主题） */
const meals = computed(() =>
  MEAL_TYPES.map((type) => {
    const records = dietStore.mealGroups[type] || []
    const summary = sumNutrition(records)
    return {
      type,
      emoji: MEAL_EMOJI[type],
      theme: MEAL_THEME[type],
      records,
      summary: { ...summary, calories: Math.round(summary.calories) }
    }
  })
)

/** 删除今日的一条记录（历史记录不提供删除入口） */
function removeRecord(id) {
  if (!window.confirm('确认删除这条饮食记录吗？')) return
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
  waterRatio.value >= 0.8
    ? '✅ 饮水量已达标，水合状态良好，继续保持'
    : '💡 饮水偏少，建议每 1.5 小时补水 200ml'
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
 * 五、全天营养合计
 * ================================================================= */
/** 关键数值（预计算为整数，避免模板里做运算） */
const totalCalories = computed(() => Math.round(dietStore.summary.calories))

/* =================================================================
 * 六、每日历史饮食查看（最近 7 天，含今天）
 * ================================================================= */
/** 当前选中的历史日期，默认今天 */
const selectedDate = ref(todayStr())

/** 选中日期的完整数据（来自 historyDays，倒序且含今天） */
const activeDay = computed(
  () => dietStore.historyDays.find((d) => d.date === selectedDate.value) || dietStore.historyDays[0] || null
)

/** 选中日期是否为「今天」（仅今天允许删除记录） */
const activeIsToday = computed(() => !!activeDay.value && activeDay.value.date === todayStr())

/** 选中日期的记录按餐段分组（用于明细展示） */
const activeGroups = computed(() => {
  const day = activeDay.value
  if (!day) return []
  return MEAL_TYPES.map((type) => ({
    type,
    emoji: MEAL_EMOJI[type],
    theme: MEAL_THEME[type],
    records: (day.records || []).filter((r) => r.mealType === type)
  }))
})

/* =================================================================
 * 七、用户档案（用于顶部展示用户昵称，保持页面间一致性）
 * ================================================================= */
const nickname = computed(() => userStore.profile.nickname)
</script>

<template>
  <!-- 根容器加 stagger：直接子元素依次淡入 -->
  <div class="stagger">
    <!-- ============ 页面标题 + 右侧操作区 ============ -->
    <PageHeader>
      <template #extra>
        <span class="chip">
          <span aria-hidden="true">🧑</span>
          <span class="chip-strong">{{ nickname }}</span>
          <span class="tx-muted">今日已记录 {{ dietStore.records.length }} 条</span>
        </span>
        <button class="btn btn-ghost" @click="showForm = !showForm">
          <span aria-hidden="true">📝</span>
          {{ showForm ? '隐藏添加表单' : '显示添加表单' }}
        </button>
        <button class="btn btn-primary" @click="router.push('/dashboard')">
          <span aria-hidden="true">📊</span>去大屏看趋势
        </button>
      </template>
    </PageHeader>

    <!-- ============ 添加记录（mc-green 整行卡片）============ -->
    <MacaronCard
      v-show="showForm"
      class="mb-5"
      theme="green"
      emoji="➕"
      title="添加一条饮食记录"
      sub="选择餐段 → 搜索食物 → 填写分量；营养值按分量实时换算"
    >
      <div class="grid grid-cols-12 gap-5">
        <!-- 左：餐段 + 时间 -->
        <div class="col-span-3">
          <div class="field-label">🍽️ 选择餐段</div>
          <div class="seg">
            <button
              v-for="type in MEAL_TYPES"
              :key="type"
              class="seg-item"
              :class="{ 'is-active': form.mealType === type }"
              @click="form.mealType = type"
            >
              {{ MEAL_EMOJI[type] }} {{ type }}
            </button>
          </div>

          <div class="mt-4">
            <div class="field-label">⏰ 记录时间</div>
            <input v-model="form.time" type="time" class="field" />
          </div>

          <div class="mt-4">
            <div class="field-label">⚖️ 分量（{{ unitHint }} 基准）</div>
            <input v-model.number="form.grams" type="number" min="1" class="field" placeholder="请输入克数 / 毫升" />
            <div class="seg mt-2">
              <button v-for="g in [50, 100, 150, 200, 300]" :key="g" class="btn btn-ghost btn-xs" @click="setGrams(g)">
                {{ g }}g
              </button>
            </div>
          </div>
        </div>

        <!-- 中：食物搜索 + 分类筛选 + 结果列表 -->
        <div class="col-span-5">
          <div class="field-label">🔍 搜索食物</div>
          <input v-model="form.keyword" class="field" placeholder="输入食物名称 / 关键词，如：鸡胸、米饭、milk" />

          <!-- 分类筛选：一排可点选的 .tag -->
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-for="category in FOOD_CATEGORIES"
              :key="category"
              class="tag"
              :class="form.category === category ? 'tag-orange' : ''"
              @click="pickCategory(category)"
            >
              {{ category }}
            </button>
          </div>

          <!-- 结果列表：可滚动，点击选中 -->
          <div class="scroll-area mt-3 max-h-[220px] space-y-1 pr-1">
            <div
              v-for="food in searchResults"
              :key="food.id"
              class="list-item cursor-pointer"
              :style="form.foodId === food.id ? activePickStyle : {}"
              @click="pickFood(food)"
            >
              <span class="emoji-badge" aria-hidden="true">{{ food.emoji }}</span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-[13px] font-bold tx-main">{{ food.name }}</span>
                  <span class="tag" :class="`tag-${categoryTheme(food.category)}`">{{ food.category }}</span>
                </div>
                <div class="num text-[11px] tx-muted">每 {{ food.unit }} ≈ {{ food.calories }} kcal</div>
              </div>
              <span v-if="form.foodId === food.id" class="shrink-0 text-[13px]">✅</span>
            </div>
            <EmptyState
              v-if="!searchResults.length"
              emoji="🔍"
              text="没有找到匹配的食物"
              sub="试试更短的关键词，或切换分类"
              height="120px"
            />
          </div>
        </div>

        <!-- 右：选中食物 + 实时预估 + 添加按钮 -->
        <div class="col-span-4">
          <div class="field-label">🍱 已选食物</div>
          <div class="soft-panel">
            <div v-if="selectedFood" class="flex items-center gap-3">
              <span class="emoji-badge-lg" aria-hidden="true">{{ selectedFood.emoji }}</span>
              <div class="min-w-0">
                <div class="truncate text-[14px] font-bold tx-main">{{ selectedFood.name }}</div>
                <div class="num text-[11px] tx-muted">
                  每 {{ selectedFood.unit }}：{{ selectedFood.calories }} kcal · 蛋白 {{ selectedFood.protein }}g
                </div>
              </div>
            </div>
            <div v-else class="flex items-center gap-2 text-[12px] tx-muted">
              <span aria-hidden="true">👈</span>请从左侧搜索结果中选择一个食物
            </div>
          </div>

          <div class="mt-3">
            <div class="field-label">✨ 实时营养预估</div>
            <div class="soft-panel">
              <p v-if="previewNutrition" class="text-[12px] tx-sub">
                将添加
                <span class="num font-bold tx-main">≈ {{ previewNutrition.calories }} kcal</span>
                · 蛋白 <span class="num font-bold tx-main">{{ previewNutrition.protein }}g</span>
                · 脂肪 <span class="num font-bold tx-main">{{ previewNutrition.fat }}g</span>
                · 碳水 <span class="num font-bold tx-main">{{ previewNutrition.carb }}g</span>
              </p>
              <p v-else class="text-[12px] tx-muted">选中食物并填写分量后，这里会实时预估营养值 ✨</p>
            </div>
          </div>

          <button class="btn btn-green mt-4 w-full" :disabled="!selectedFood" @click="addRecord">
            <span aria-hidden="true">➕</span>添加到记录
          </button>
        </div>
      </div>
    </MacaronCard>

    <!-- ============ 今日四餐分组展示 ============ -->
    <div class="stagger grid-cards mb-5 grid-cols-2">
      <MacaronCard
        v-for="meal in meals"
        :key="meal.type"
        :theme="meal.theme"
        :emoji="meal.emoji"
        :title="`${meal.type}记录`"
        :sub="`共 ${meal.records.length} 项 · 点击上方表单继续添加`"
      >
        <template #extra>
          <div class="text-right">
            <div class="num text-[20px] font-extrabold tx-main">{{ meal.summary.calories }}</div>
            <div class="text-[11px] tx-muted">kcal</div>
          </div>
        </template>

        <EmptyState
          v-if="!meal.records.length"
          emoji="🍽️"
          :text="`还没记录${meal.type}，点上方添加`"
          sub="记录后会实时累加到全天营养合计"
          height="130px"
        />

        <div v-else class="stagger space-y-1">
          <div v-for="record in meal.records" :key="record.id" class="list-item">
            <span class="emoji-badge" aria-hidden="true">{{ record.emoji }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-[13px] font-bold tx-main">{{ record.name }}</span>
                <span class="tag">{{ amountText(record) }}</span>
              </div>
              <div class="num mt-1 flex flex-wrap gap-x-3 text-[11px] tx-muted">
                <span>🔥 {{ record.nutrition.calories }} kcal</span>
                <span>🥩 蛋白 {{ record.nutrition.protein }}g</span>
                <span>🥑 脂肪 {{ record.nutrition.fat }}g</span>
                <span>🍚 碳水 {{ record.nutrition.carb }}g</span>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span class="chip px-2 py-0.5 num text-[11px]">{{ record.time }}</span>
              <button class="btn btn-xs btn-danger-soft" @click="removeRecord(record.id)">
                <span aria-hidden="true">🗑️</span>
              </button>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="divider my-3"></div>
          <div class="num flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] tx-sub">
            <span>🔥 热量 {{ meal.summary.calories }} kcal</span>
            <span>🥩 蛋白 {{ meal.summary.protein }}g</span>
            <span>🥑 脂肪 {{ meal.summary.fat }}g</span>
            <span>🍚 碳水 {{ meal.summary.carb }}g</span>
            <span>🌿 纤维 {{ meal.summary.fiber }}g</span>
          </div>
        </template>
      </MacaronCard>
    </div>

    <!-- ============ 饮水记录 + 全天营养合计 ============ -->
    <div class="stagger grid-cards mb-5 grid-cols-5">
      <!-- 饮水记录（mc-blue） -->
      <MacaronCard class="col-span-2" theme="blue" emoji="💧" title="饮水记录" sub="少量多次补水更利于吸收">
        <div class="flex items-end gap-2">
          <span class="num text-[34px] font-extrabold leading-none tx-main">{{ dietStore.water }}</span>
          <span class="num pb-1 text-[13px] tx-muted">/ {{ dietStore.targets.water }} ml</span>
          <StatusBadge class="ml-auto" :status="waterStatus" />
        </div>

        <ProgressBar class="mt-3" :percent="waterPercent" :status="waterStatus" />

        <p class="mt-2 text-[12px]" :class="waterStatus === 'ok' ? 'tx-ok' : 'tx-low'">{{ waterHint }}</p>

        <div class="seg mt-3">
          <button class="btn btn-ghost btn-xs" @click="dietStore.addWater(200)">+200ml</button>
          <button class="btn btn-ghost btn-xs" @click="dietStore.addWater(300)">+300ml</button>
          <button class="btn btn-ghost btn-xs" @click="dietStore.addWater(500)">+500ml</button>
          <button class="btn btn-ghost btn-xs" @click="dietStore.addWater(-100)">−100ml</button>
        </div>

        <div class="mt-3 flex items-center gap-2">
          <input v-model.number="customWater" type="number" min="0" class="field" placeholder="自定义饮水量（ml）" />
          <button class="btn btn-ghost shrink-0" @click="applyCustomWater">设置</button>
        </div>
      </MacaronCard>

      <!-- 全天营养合计（mc-yellow） -->
      <MacaronCard class="col-span-3" theme="yellow" emoji="🥗" title="全天营养合计" sub="自动对比每日推荐目标">
        <div class="grid grid-cols-4 gap-3">
          <StatTile
            theme="orange"
            emoji="🔥"
            label="总热量"
            :value="totalCalories"
            unit="kcal"
            :sub="`目标 ${dietStore.targets.calories} kcal`"
          />
          <StatTile
            theme="green"
            emoji="🥩"
            label="蛋白质"
            :value="dietStore.summary.protein"
            unit="g"
            :sub="`目标 ${dietStore.targets.protein} g`"
          />
          <StatTile
            theme="yellow"
            emoji="🥑"
            label="脂肪"
            :value="dietStore.summary.fat"
            unit="g"
            :sub="`目标 ${dietStore.targets.fat} g`"
          />
          <StatTile
            theme="cyan"
            emoji="🍚"
            label="碳水"
            :value="dietStore.summary.carb"
            unit="g"
            :sub="`目标 ${dietStore.targets.carb} g`"
          />
        </div>

        <div class="divider my-4"></div>

        <!-- 逐项达标进度：实际值 / 目标值 + 进度条 + 状态标签 -->
        <div class="space-y-3">
          <div v-for="item in dietStore.progressList" :key="item.key">
            <div class="flex items-center justify-between gap-3">
              <span class="text-[13px] font-semibold tx-main">
                <span aria-hidden="true">{{ item.emoji }}</span> {{ item.label }}
              </span>
              <div class="flex items-center gap-3">
                <span class="num text-[12px] tx-muted">
                  {{ item.value }} / {{ item.target }} {{ item.unit }}
                </span>
                <StatusBadge size="sm" :status="item.status" />
              </div>
            </div>
            <ProgressBar
              class="mt-1"
              :percent="item.percent"
              :status="item.status"
              :show-label="false"
              height="8px"
            />
          </div>
        </div>
      </MacaronCard>
    </div>

    <!-- ============ 每日历史饮食查看（mc-cyan 整行）============ -->
    <MacaronCard
      class="mb-5"
      theme="cyan"
      emoji="🗓️"
      title="每日历史饮食查看"
      sub="点击日期查看当天明细；历史记录仅供回看，不可删除"
    >
      <!-- 日期切换：最近 7 天（含今天） -->
      <div class="seg">
        <button
          v-for="day in dietStore.historyDays"
          :key="day.date"
          class="seg-item"
          :class="{ 'is-active': day.date === selectedDate }"
          @click="selectedDate = day.date"
        >
          <span class="block text-center leading-tight">
            <span class="block text-[12px]">{{ day.label }}</span>
            <span class="block text-[10px] opacity-70">{{ day.weekday }}</span>
            <span class="num block text-[10px] font-bold">{{ day.score }} 分</span>
          </span>
        </button>
      </div>

      <!-- 选中日期的数据概览 -->
      <template v-if="activeDay">
        <div class="stagger mt-4 grid grid-cols-4 gap-3">
          <StatTile theme="orange" emoji="🔥" label="当日热量" :value="activeDay.calories" unit="kcal" :sub="`目标 ${activeDay.target} kcal`" />
          <StatTile theme="green" emoji="🏆" label="健康评分" :value="activeDay.score" unit="分" :sub="`${activeDay.grade.emoji} ${activeDay.grade.label}`" />
          <StatTile theme="purple" emoji="📝" label="记录条数" :value="activeDay.recordCount" unit="条" :sub="`覆盖 ${activeDay.mealCount} 个餐段`" />
          <StatTile theme="blue" emoji="💧" label="饮水量" :value="activeDay.water" unit="ml" :sub="`目标 ${dietStore.targets.water} ml`" />
        </div>

        <!-- 记录明细：按餐段分组 -->
        <div v-if="activeDay.recordCount" class="mt-4 grid grid-cols-2 gap-4">
          <div v-for="group in activeGroups" :key="group.type" class="soft-panel">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-[13px] font-bold tx-main">
                <span aria-hidden="true">{{ group.emoji }}</span> {{ group.type }}
              </span>
              <span class="tag" :class="`tag-${group.theme}`">{{ group.records.length }} 项</span>
            </div>

            <EmptyState v-if="!group.records.length" emoji="🍽️" text="该餐段无记录" height="70px" />

            <div v-else class="stagger space-y-1">
              <div v-for="record in group.records" :key="record.id" class="list-item">
                <span class="emoji-badge" aria-hidden="true">{{ record.emoji }}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="truncate text-[13px] font-bold tx-main">{{ record.name }}</span>
                    <span class="tag">{{ amountText(record) }}</span>
                  </div>
                  <div class="num mt-1 flex flex-wrap gap-x-3 text-[11px] tx-muted">
                    <span>🔥 {{ record.nutrition.calories }} kcal</span>
                    <span>🥩 蛋白 {{ record.nutrition.protein }}g</span>
                    <span>🍚 碳水 {{ record.nutrition.carb }}g</span>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  <span class="chip px-2 py-0.5 num text-[11px]">{{ record.time }}</span>
                  <!-- 仅「今天」允许删除，历史记录不可删除 -->
                  <button
                    v-if="activeIsToday"
                    class="btn btn-xs btn-danger-soft"
                    @click="removeRecord(record.id)"
                  >
                    <span aria-hidden="true">🗑️</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <EmptyState
          v-else
          emoji="📭"
          :text="`${formatCN(activeDay.date)}（${weekdayCN(activeDay.date)}）没有饮食记录`"
          sub="切换到其他日期看看，或回到今天开始记录"
          height="150px"
        />
      </template>
    </MacaronCard>

    <!-- ============ 轻量 Toast ============ -->
    <div
      v-if="toast.visible"
      class="anim-pop fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-accent-green px-5 py-2.5 text-[13px] font-bold text-white shadow-cardHover"
    >
      {{ toast.text }}
    </div>
  </div>
</template>

<script setup>
/**
 * MealRecommendView 页面组件：AI 膳食推荐
 * ------------------------------------------------------------------
 * 页面职责：
 *   1. 解释「AI 为什么这样推荐」——展示当日营养缺口标签与推荐理由（可解释性）
 *   2. 展示全天推荐总览（推荐热量 / 蛋白质 / 纤维）以及与目标的匹配度
 *   3. 早 / 午 / 晚三大推荐卡：营养条 + 食材清单 + 做法步骤 + 份量建议 + 「换一个」切换备选
 *   4. 水果推荐 + 加餐推荐（两栏）
 *   5. 按用户运动强度自动匹配的配套运动方案
 *
 * 数据全部来自 dietStore.mealPlan（由 utils/nutrition.js 的 buildMealPlan 实时推导），
 * 纯前端 mock，无接口请求。样式严格遵循 style.css 已定义的马卡龙设计系统。
 */
import { computed, reactive } from 'vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatTile from '@/components/common/StatTile.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useDietStore } from '@/store/diet'
import { useUserStore } from '@/store/user'
import { MEAL_EMOJI } from '@/data/mockHistory'

const dietStore = useDietStore()
const userStore = useUserStore()

/** 推荐方案（Store 计算属性，随档案与当日记录实时更新） */
const plan = computed(() => dietStore.mealPlan)

/** 当日是否还没有任何饮食记录（用于缺口说明的兜底提示） */
const noRecords = computed(() => dietStore.records.length === 0)

/* ===================================================================
 * 一、AI 决策说明卡
 * =================================================================== */
/** 缺口标签的配色循环（低饱和马卡龙标签，避免全部同色） */
const NOTE_TAGS = ['tag-orange', 'tag-green', 'tag-blue', 'tag-purple', 'tag-yellow', 'tag-cyan']

/** 按索引取缺口标签的配色 class */
function noteTag(index) {
  return NOTE_TAGS[index % NOTE_TAGS.length]
}

/* ===================================================================
 * 二、今日推荐总览 —— 与目标的匹配度
 * =================================================================== */
/** AI 推荐全天热量 ÷ 每日目标热量 × 100（用于匹配度进度条） */
const matchPercent = computed(() => {
  const target = dietStore.targets.calories || 1
  return Math.round((plan.value.planNutrition.calories / target) * 100)
})

/** 匹配度状态：< 80% 偏少💡 / 80%–120% 达标✅ / > 120% 超标🔴（与营养素 range 判定一致） */
const matchStatus = computed(() => {
  const ratio = matchPercent.value / 100
  if (ratio < 0.8) return 'low'
  if (ratio > 1.2) return 'over'
  return 'ok'
})

/** 匹配度的文字说明（让评委一眼看懂状态含义） */
const matchText = computed(() => {
  if (matchStatus.value === 'low') return '低于目标'
  if (matchStatus.value === 'over') return '高于目标'
  return '匹配良好'
})

/* ===================================================================
 * 三、早 / 午 / 晚餐三大推荐卡（含「换一个」备选切换）
 * =================================================================== */
/** 三个餐段的展示配置（key 对应 mealPlan 中的字段） */
const MEAL_CARDS = [
  { key: 'breakfast', label: '早餐', icon: MEAL_EMOJI['早餐'] },
  { key: 'lunch', label: '午餐', icon: MEAL_EMOJI['午餐'] },
  { key: 'dinner', label: '晚餐', icon: MEAL_EMOJI['晚餐'] }
]

/** 每个餐段当前展示的食谱索引：0 为 AI 主推荐，1/2 为备选 alternatives */
const picks = reactive({ breakfast: 0, lunch: 0, dinner: 0 })

/** 切换到下一个备选食谱（在 [主推荐, ...备选] 中循环） */
function switchRecipe(key, total) {
  picks[key] = (picks[key] + 1) % total
}

/**
 * 组装三大推荐卡的数据：
 * 每项 = { key, label, icon, list, index, total, current }
 * current 为当前展示的食谱对象（点击「换一个」时 index 变化，触发 anim-pop 动效）
 */
const mealCards = computed(() =>
  MEAL_CARDS.map((meal) => {
    const base = plan.value[meal.key]
    const list = [base, ...(base.alternatives || [])]
    const index = picks[meal.key] % list.length
    return { ...meal, list, index, total: list.length, current: list[index] }
  })
)

/** 食谱营养条展示的四个关键数字（热量 / 蛋白质 / 脂肪 / 碳水） */
const NUTRI_TILES = [
  { key: 'calories', label: '热量', emoji: '🔥', unit: 'kcal', color: '#b46b3a' },
  { key: 'protein', label: '蛋白质', emoji: '🥩', unit: 'g', color: '#2f9e6b' },
  { key: 'fat', label: '脂肪', emoji: '🥑', unit: 'g', color: '#b9912f' },
  { key: 'carb', label: '碳水', emoji: '🍚', unit: 'g', color: '#2f9e9a' }
]

/** 水果 / 加餐共用的三大营养素展示项 */
const MACRO_TILES = [
  { key: 'protein', label: '蛋白质', emoji: '🥩', color: '#2f9e6b' },
  { key: 'fat', label: '脂肪', emoji: '🥑', color: '#b9912f' },
  { key: 'carb', label: '碳水', emoji: '🍚', color: '#2f9e9a' }
]

/** 水果 / 加餐的区域配置（两栏分别用 mc-cyan / mc-yellow 独立底色） */
const EXTRA_CARDS = [
  { key: 'fruit', theme: 'cyan', title: '水果推荐', emoji: '🍓', sub: '补充维生素与膳食纤维，替代高糖甜点' },
  { key: 'snack', theme: 'yellow', title: '加餐推荐', emoji: '🥜', sub: '两餐之间的能量补给，优先低糖高蛋白' }
]
</script>

<template>
  <div>
    <!-- ===================== 页面标题 ===================== -->
    <PageHeader>
      <template #extra>
        <span class="chip chip-strong">
          <span aria-hidden="true">🧠</span>
          基于当日营养缺口实时生成
        </span>
      </template>
    </PageHeader>

    <!-- 入场逐项淡入（stagger） -->
    <div class="stagger flex flex-col gap-5">
      <!-- ===================== 1. AI 决策说明卡 ===================== -->
      <MacaronCard theme="purple" emoji="🧠" title="AI 决策说明" sub="为什么这样推荐给你：先补缺口，再控制超标项">
        <!-- 缺口标签：来自 mealPlan.gap.notes -->
        <div class="flex flex-wrap gap-2">
          <span v-for="(note, i) in plan.gap.notes" :key="i" class="tag" :class="noteTag(i)">
            {{ note }}
          </span>
        </div>

        <!-- 推荐理由列表：AI 的完整决策解释 -->
        <div class="divider"></div>
        <p class="mb-2 text-[12px] font-bold tx-sub">📌 推荐依据</p>
        <ul class="space-y-1.5">
          <li v-for="(reason, i) in plan.reasons" :key="i" class="list-item">
            <span aria-hidden="true">💡</span>
            <span class="text-[13px] tx-sub">{{ reason }}</span>
          </li>
        </ul>

        <!-- 三个关键缺口：剩余热量 / 蛋白质缺口 / 膳食纤维缺口 -->
        <div class="mt-4 grid grid-cols-3 gap-4">
          <StatTile theme="white" label="剩余可摄入热量" emoji="🔥" :value="plan.gap.remainCalories" unit="kcal" />
          <StatTile theme="white" label="蛋白质缺口" emoji="🥩" :value="plan.remainder.protein" unit="g" />
          <StatTile theme="white" label="膳食纤维缺口" emoji="🌿" :value="plan.remainder.fiber" unit="g" />
        </div>

        <!-- 空数据兜底提示 -->
        <p v-if="noRecords" class="mt-3 text-[12px] tx-muted">
          ⚠️ 今天还没有饮食记录，推荐将偏向「均衡搭配」；记录三餐后缺口分析会实时更新。
        </p>
      </MacaronCard>

      <!-- ===================== 2. 今日推荐总览 ===================== -->
      <MacaronCard theme="orange" emoji="🎯" title="今日推荐总览" sub="AI 组合出的全天食谱合计与目标匹配度">
        <div class="flex items-center gap-6">
          <!-- 推荐总热量（大号数字） -->
          <div class="shrink-0">
            <p class="tile-label"><span aria-hidden="true">🍽️</span> AI 推荐全天热量</p>
            <p class="num mt-2 text-[40px] font-extrabold leading-none tx-main">
              {{ plan.planCalories }}<span class="tile-unit">kcal</span>
            </p>
          </div>
          <!-- 推荐摄入的三大营养 -->
          <div class="grid flex-1 grid-cols-3 gap-4">
            <StatTile theme="white" label="推荐热量" emoji="🔥" :value="plan.planNutrition.calories" unit="kcal" />
            <StatTile theme="white" label="推荐蛋白质" emoji="🥩" :value="plan.planNutrition.protein" unit="g" />
            <StatTile theme="white" label="推荐膳食纤维" emoji="🌿" :value="plan.planNutrition.fiber" unit="g" />
          </div>
        </div>

        <!-- 与每日目标热量的匹配度 -->
        <div class="mt-5">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-[12px] font-semibold tx-sub">与每日目标热量（{{ dietStore.targets.calories }} kcal）的匹配度</span>
            <StatusBadge :status="matchStatus" :text="matchText" />
          </div>
          <ProgressBar :percent="matchPercent" :status="matchStatus" height="12px" />
        </div>
      </MacaronCard>

      <!-- ===================== 3. 早 / 午 / 晚三大推荐卡 ===================== -->
      <div v-if="plan && plan.breakfast" class="grid grid-cols-3 gap-5">
        <MacaronCard
          v-for="card in mealCards"
          :key="card.key"
          :theme="card.current.theme"
          :hover="true"
          flex
        >
          <!-- 卡片头部：大 Emoji + 食谱名 + 耗时 + 备选序号 -->
          <template #header>
            <div class="flex items-start gap-3">
              <span class="emoji-badge-lg text-[30px]" aria-hidden="true">{{ card.current.emoji }}</span>
              <div class="min-w-0">
                <span class="tag tag-orange">{{ card.icon }} {{ card.label }}推荐</span>
                <p class="mt-1.5 text-[15px] font-bold tx-main">{{ card.current.name }}</p>
                <p class="mt-1 text-[11px] tx-muted">⏱ 耗时 {{ card.current.time }}</p>
              </div>
            </div>
          </template>

          <!-- 切换时用 :key 触发 anim-pop 轻动效 -->
          <div :key="card.index" class="anim-pop">
            <!-- 推荐理由 -->
            <p class="rounded-[14px] px-3 py-2 text-[12px] tx-sub" style="background: rgba(255, 255, 255, 0.66)">
              💡 {{ card.current.reason }}
            </p>

            <!-- 营养条：热量 / 蛋白质 / 脂肪 / 碳水 -->
            <div class="mt-3 grid grid-cols-4 gap-2">
              <div
                v-for="nutri in NUTRI_TILES"
                :key="nutri.key"
                class="rounded-[14px] px-1.5 py-2.5 text-center"
                style="background: rgba(255, 255, 255, 0.72)"
              >
                <p class="text-[11px] tx-muted">{{ nutri.emoji }} {{ nutri.label }}</p>
                <p class="num mt-1 text-[16px] font-extrabold" :style="{ color: nutri.color }">
                  {{ card.current.nutrition[nutri.key] }}
                  <span class="text-[10px] tx-muted">{{ nutri.unit }}</span>
                </p>
              </div>
            </div>

            <!-- 食材清单 -->
            <div class="soft-panel mt-3">
              <p class="mb-2 text-[12px] font-bold tx-sub">🧺 食材清单</p>
              <ul class="space-y-1.5">
                <li
                  v-for="(ing, i) in card.current.ingredients"
                  :key="i"
                  class="flex items-center justify-between text-[12.5px]"
                >
                  <span class="tx-sub">{{ ing.name }}</span>
                  <span class="num tx-muted">· {{ ing.amount }}</span>
                </li>
              </ul>
            </div>

            <!-- 做法步骤（序号圆点） -->
            <div class="mt-3">
              <p class="mb-2 text-[12px] font-bold tx-sub">👩‍🍳 做法步骤</p>
              <ol class="space-y-2">
                <li v-for="(step, i) in card.current.steps" :key="i" class="flex items-start gap-2.5">
                  <span
                    class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                    style="background: #fff; color: #b46b3a"
                    aria-hidden="true"
                  >
                    {{ i + 1 }}
                  </span>
                  <span class="text-[12.5px] tx-sub">{{ step }}</span>
                </li>
              </ol>
            </div>
          </div>

          <!-- 页脚：份量建议 + 换一个 -->
          <template #footer>
            <div class="flex items-center justify-between gap-2">
              <span class="tag tag-blue">📏 {{ card.current.portionNote || '标准份量' }}</span>
              <span class="flex items-center gap-2">
                <span class="tag tag-cyan">{{ card.index + 1 }} / {{ card.total }}</span>
                <button class="btn btn-ghost btn-xs" @click="switchRecipe(card.key, card.total)">🔄 换一个</button>
              </span>
            </div>
          </template>
        </MacaronCard>
      </div>
      <MacaronCard v-else theme="white">
        <EmptyState emoji="🍽️" text="暂无推荐方案" sub="请先在「身体数据测评」完善档案" />
      </MacaronCard>

      <!-- ===================== 4. 水果推荐 + 加餐推荐 ===================== -->
      <div class="grid grid-cols-2 gap-5">
        <MacaronCard
          v-for="item in EXTRA_CARDS"
          :key="item.key"
          :theme="item.theme"
          :title="item.title"
          :emoji="item.emoji"
          :sub="item.sub"
        >
          <div class="flex items-start gap-4">
            <span class="emoji-badge-lg text-[32px]" aria-hidden="true">{{ plan[item.key].emoji }}</span>
            <div class="min-w-0 flex-1">
              <p class="text-[15px] font-bold tx-main">{{ plan[item.key].name }}</p>
              <div class="mt-1.5 flex flex-wrap gap-2">
                <span class="tag tag-blue">📏 {{ plan[item.key].portion || plan[item.key].portionNote }}</span>
                <span class="tag tag-orange">🔥 {{ plan[item.key].nutrition.calories }} kcal</span>
              </div>
              <p class="mt-2 text-[12px] tx-sub">💡 {{ plan[item.key].reason }}</p>
            </div>
          </div>

          <!-- 三大营养素 -->
          <div class="mt-3 grid grid-cols-3 gap-2">
            <div
              v-for="macro in MACRO_TILES"
              :key="macro.key"
              class="rounded-[14px] px-2 py-2.5 text-center"
              style="background: rgba(255, 255, 255, 0.72)"
            >
              <p class="text-[11px] tx-muted">{{ macro.emoji }} {{ macro.label }}</p>
              <p class="num mt-1 text-[16px] font-extrabold" :style="{ color: macro.color }">
                {{ plan[item.key].nutrition[macro.key] }}<span class="text-[10px] tx-muted">g</span>
              </p>
            </div>
          </div>
        </MacaronCard>
      </div>

      <!-- ===================== 5. 配套运动方案 ===================== -->
      <MacaronCard
        theme="green"
        :emoji="plan.workout.emoji"
        :title="'配套运动方案 · ' + plan.workout.label"
        :sub="plan.workout.weekly"
      >
        <div class="grid grid-cols-4 gap-4">
          <div
            v-for="(exercise, i) in plan.workout.items"
            :key="i"
            class="soft-panel card-hover text-center"
          >
            <p class="text-[26px] leading-none" aria-hidden="true">{{ exercise.emoji }}</p>
            <p class="mt-2 text-[13px] font-bold tx-main">{{ exercise.name }}</p>
            <p class="mt-1 text-[11px] tx-muted">⏱ {{ exercise.duration }}</p>
            <p class="mt-1 text-[12px] font-bold tx-low">🔥 约 {{ exercise.burn }} kcal</p>
          </div>
        </div>
        <p class="mt-4 text-[12.5px] tx-sub">💡 {{ plan.workout.tip }}</p>
        <p class="mt-2 text-[11px] tx-muted">🎯 已按你的运动强度（{{ userStore.activityInfo.label }}）自动匹配</p>
      </MacaronCard>
    </div>
  </div>
</template>

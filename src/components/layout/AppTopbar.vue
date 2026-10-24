<script setup>
/**
 * AppTopbar 顶部信息栏
 * ------------------------------------------------------------------
 * 展示当前日期、问候语与今日核心数据（热量 / 健康评分 / 饮水），
 * 让评委在任何页面都能一眼看到「实时数据联动」的效果。
 *
 * 响应式：窄屏（<1024px）时左侧出现「☰」按钮唤出导航抽屉；
 * 核心指标胶囊按屏幕宽度逐级隐藏（饮水→评分），避免窄屏拥挤换行。
 */
import { computed } from 'vue'
import { useDietStore } from '../../store/diet'
import { useUserStore } from '../../store/user'
import { formatCN, weekdayCN, todayStr } from '../../utils/date'

defineEmits(['toggle-drawer'])

const dietStore = useDietStore()
const userStore = useUserStore()

/** 根据当前小时生成问候语 */
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了，注意休息'
  if (h < 11) return '早上好，今天也要好好吃饭'
  if (h < 14) return '中午好，午餐记得配蔬菜'
  if (h < 18) return '下午好，来杯水补充能量吧'
  return '晚上好，晚餐建议七分饱'
})

/** 今日日期展示 */
const dateText = computed(() => `${formatCN(todayStr())} ${weekdayCN(todayStr())}`)

/** 今日核心数据 */
const calories = computed(() => Math.round(dietStore.summary.calories))
const targetCalories = computed(() => dietStore.targets.calories)
const score = computed(() => dietStore.report.score)
const grade = computed(() => dietStore.report.grade)
const water = computed(() => dietStore.water)
const waterTarget = computed(() => dietStore.targets.water)
</script>

<template>
  <header class="topbar">
    <!-- 窄屏导航抽屉开关（宽屏隐藏） -->
    <button class="btn btn-ghost btn-xs shrink-0 lg:hidden" aria-label="打开导航菜单" @click="$emit('toggle-drawer')">☰</button>

    <!-- 左侧：日期与问候 -->
    <div class="min-w-0 flex-1">
      <p class="flex items-center gap-2 text-[13px] font-bold tx-main">
        <span aria-hidden="true">🗓️</span>
        <span class="truncate">{{ dateText }}</span>
        <span class="chip chip-strong hidden text-[11px] sm:inline-flex">
          <span aria-hidden="true">{{ userStore.metrics.dietModeEmoji }}</span>
          {{ userStore.metrics.dietMode }}
        </span>
      </p>
      <p class="mt-0.5 truncate text-[12px] tx-muted">{{ greeting }}，{{ userStore.profile.nickname }} 👋</p>
    </div>

    <!-- 右侧：今日核心指标 -->
    <div class="flex shrink-0 items-center gap-2.5">
      <span class="chip hidden sm:inline-flex">
        <span aria-hidden="true">🔥</span>
        今日热量
        <b class="num chip-strong">{{ calories }}</b>
        <span class="tx-muted hidden md:inline">/ {{ targetCalories }} kcal</span>
      </span>
      <span class="chip hidden md:inline-flex">
        <span aria-hidden="true">{{ grade.emoji }}</span>
        健康评分
        <b class="num" :style="{ color: grade.color }">{{ score }}</b>
      </span>
      <span class="chip">
        <span aria-hidden="true">💧</span>
        饮水
        <b class="num chip-strong">{{ water }}</b>
        <span class="tx-muted hidden md:inline">/ {{ waterTarget }} ml</span>
      </span>
    </div>
  </header>
</template>

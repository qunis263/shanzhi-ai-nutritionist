<script setup>
/**
 * AppTopbar 顶部信息栏
 * ------------------------------------------------------------------
 * 展示当前日期、问候语与健康评分。
 * 说明：热量、饮水数据已在首页「简洁模式」的进度条区域集中呈现，
 * 顶部栏不再重复展示，避免同一信息多处出现。
 *
 * 响应式：窄屏（<1024px）时左侧出现「☰」按钮唤出导航抽屉。
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

/** 健康评分（唯一保留的顶部指标） */
const score = computed(() => dietStore.report.score)
const grade = computed(() => dietStore.report.grade)
</script>

<template>
  <header class="topbar">
    <!-- 内容区与主内容同宽，1920px 下居中 -->
    <div class="mx-auto flex w-full max-w-[1560px] items-center justify-between gap-4">
      <!-- 窄屏导航抽屉开关（宽屏隐藏） -->
      <button class="btn btn-ghost btn-xs shrink-0 lg:hidden" aria-label="打开导航菜单" @click="$emit('toggle-drawer')">
        ☰
      </button>

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

      <!-- 右侧：健康评分 -->
      <div class="flex shrink-0 items-center gap-2.5">
        <span class="chip">
          <span aria-hidden="true">{{ grade.emoji }}</span>
          健康评分
          <b class="num" :style="{ color: grade.color }">{{ score }}</b>
        </span>
      </div>
    </div>
  </header>
</template>

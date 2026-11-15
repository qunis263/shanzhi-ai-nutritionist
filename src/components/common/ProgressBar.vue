<script setup>
/**
 * ProgressBar 营养达标进度条
 * ------------------------------------------------------------------
 * 根据「实际值 / 目标值」的百分比显示进度，
 * 颜色随状态自动变化：达标 ✅ 绿色 / 超标 🔴 红色 / 偏少 💡 黄色。
 * 进度条宽度使用 transition 过渡，数值变化时平滑动画。
 */
import { computed } from 'vue'
import { statusMeta } from '../../utils/nutrition'

const props = defineProps({
  /** 达标百分比（可大于 100，视觉上封顶为 100%） */
  percent: { type: Number, default: 0 },
  /** 状态：ok / over / low */
  status: { type: String, default: 'ok' },
  /** 进度条高度 */
  height: { type: String, default: '10px' },
  /** 是否在右侧显示百分比文字 */
  showLabel: { type: Boolean, default: true }
})

const meta = computed(() => statusMeta(props.status))

/** 视觉宽度（封顶 100%） */
const width = computed(() => `${Math.min(100, Math.max(0, Math.round(props.percent || 0)))}%`)
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="progress-track flex-1" :style="{ height }">
      <div class="progress-fill" :class="meta.fillClass" :style="{ width }"></div>
    </div>
    <span v-if="showLabel" class="num w-12 shrink-0 text-right text-xs font-bold" :style="{ color: meta.color }">
      {{ Math.round(percent || 0) }}%
    </span>
  </div>
</template>

<script setup>
/**
 * StatTile 数据小卡
 * ------------------------------------------------------------------
 * 用于展示单个关键数值（热量、蛋白质、BMI、评分等），
 * 统一「Emoji + 标签 + 大号数值 + 单位 + 可选状态标签/副文案」的结构。
 */
defineProps({
  /** 配色主题 */
  theme: { type: String, default: 'white' },
  /** 顶部标签文案 */
  label: { type: String, default: '' },
  /** 标签前的 Emoji */
  emoji: { type: String, default: '' },
  /** 主数值 */
  value: { type: [String, Number], default: '0' },
  /** 单位 */
  unit: { type: String, default: '' },
  /** 底部补充说明 */
  sub: { type: String, default: '' },
  /** 数值颜色（不传则用默认深色） */
  color: { type: String, default: '' },
  /** 是否启用 hover 上浮动效 */
  hover: { type: Boolean, default: true }
})
</script>

<template>
  <div class="tile" :class="[`mc-${theme}`, hover ? 'card-hover' : '']">
    <div class="tile-label">
      <span v-if="emoji" aria-hidden="true">{{ emoji }}</span>
      <span>{{ label }}</span>
    </div>
    <div class="tile-value num" :style="color ? { color } : {}">
      {{ value }}<span v-if="unit" class="tile-unit">{{ unit }}</span>
    </div>
    <div v-if="sub || $slots.default" class="mt-2 text-[11px] tx-muted">
      <slot>{{ sub }}</slot>
    </div>
  </div>
</template>

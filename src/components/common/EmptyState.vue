<script setup>
/**
 * EmptyState 空状态占位
 * ------------------------------------------------------------------
 * 当列表 / 记录 / 搜索结果为空时统一展示，避免页面出现大片空白。
 */
defineProps({
  emoji: { type: String, default: '🍽️' },
  text: { type: String, default: '暂无数据' },
  sub: { type: String, default: '' },
  /** 高度，保证在小容器中也有合适留白 */
  height: { type: String, default: '160px' }
})
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 text-center" :style="{ minHeight: height }">
    <span class="anim-float text-[38px] leading-none" aria-hidden="true">{{ emoji }}</span>
    <p class="text-[13px] font-semibold tx-sub">{{ text }}</p>
    <p v-if="sub" class="text-[12px] tx-muted">{{ sub }}</p>
    <slot></slot>
  </div>
</template>

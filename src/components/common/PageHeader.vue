<script setup>
/**
 * PageHeader 页面标题栏
 * ------------------------------------------------------------------
 * 统一各页面顶部的大标题区：Emoji 图标 + 页面标题 + 一句话说明 + 右侧操作区。
 * 默认从路由 meta 读取标题与说明，保证 10 个页面风格完全一致。
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSlots } from 'vue'

const route = useRoute()

const props = defineProps({
  /** 覆盖路由 meta 中的标题 */
  title: { type: String, default: '' },
  /** 覆盖路由 meta 中的说明 */
  desc: { type: String, default: '' },
  /** 覆盖路由 meta 中的 Emoji */
  emoji: { type: String, default: '' },
  /** 图标底色主题 */
  theme: { type: String, default: '' }
})

const slots = useSlots()

const pageTitle = computed(() => props.title || route.meta?.title || '')
const pageDesc = computed(() => props.desc || route.meta?.desc || '')
const pageEmoji = computed(() => props.emoji || route.meta?.emoji || '✨')
const pageTheme = computed(() => props.theme || route.meta?.theme || 'orange')
</script>

<template>
  <header class="mb-5 flex items-start justify-between gap-6">
    <div class="flex items-center gap-3.5">
      <span class="emoji-badge-lg anim-float" :class="`mc-${pageTheme}`" aria-hidden="true">{{ pageEmoji }}</span>
      <div>
        <h1 class="page-title">{{ pageTitle }}</h1>
        <p class="page-desc">{{ pageDesc }}</p>
      </div>
    </div>
    <div v-if="slots.extra" class="flex shrink-0 items-center gap-2 pt-1">
      <slot name="extra"></slot>
    </div>
  </header>
</template>

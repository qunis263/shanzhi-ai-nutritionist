<script setup>
/**
 * StatusBadge 营养状态标签
 * ------------------------------------------------------------------
 * 全站统一的三态标签：达标 ✅ 绿色 / 超标 🔴 红色 / 营养偏少 💡 黄色
 * 直接传入 evaluateNutrient() 返回的对象即可自动取到状态与文案。
 */
import { computed } from 'vue'
import { statusMeta } from '../../utils/nutrition'

const props = defineProps({
  /** 状态：ok / over / low，也可传入 evaluateNutrient 的结果对象 */
  status: { type: [String, Object], default: 'ok' },
  /** 自定义文案（不传则显示默认「达标 / 超标 / 偏少」） */
  text: { type: String, default: '' },
  /** 是否显示 Emoji */
  showEmoji: { type: Boolean, default: true },
  /** 尺寸：sm 更紧凑 */
  size: { type: String, default: 'md' }
})

/** 解析出实际状态 key（兼容传入对象的情况） */
const statusKey = computed(() => {
  if (typeof props.status === 'object' && props.status) return props.status.status || 'ok'
  return props.status || 'ok'
})

const meta = computed(() => statusMeta(statusKey.value))

/** 最终显示文案 */
const label = computed(() => props.text || meta.value.label)

/** 样式类 */
const cls = computed(() => ['badge', meta.value.badgeClass, props.size === 'sm' ? 'px-2 py-0.5 text-[10px]' : ''])
</script>

<template>
  <span :class="cls">
    <span v-if="showEmoji" aria-hidden="true">{{ meta.emoji }}</span>
    <span>{{ label }}</span>
  </span>
</template>

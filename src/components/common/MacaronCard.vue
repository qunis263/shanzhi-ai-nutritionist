<script setup>
/**
 * MacaronCard 马卡龙卡片
 * ------------------------------------------------------------------
 * 全站统一的基础卡片容器：
 *   · 大圆角 + 柔和阴影 + hover 上浮/阴影加深/轻微放大
 *   · 六种固定马卡龙底色，通过 theme 属性切换
 *   · 支持标题行（Emoji 图标 + 标题 + 副标题 + 右侧操作区）与页脚
 *
 * 用法示例：
 *   <MacaronCard theme="green" title="今日营养合计" emoji="🥗" sub="自动累加">
 *     <template #extra><button class="btn btn-ghost btn-xs">刷新</button></template>
 *     内容...
 *   </MacaronCard>
 */
const props = defineProps({
  /** 配色主题：orange / green / blue / purple / yellow / cyan / white */
  theme: { type: String, default: 'white' },
  /** 卡片标题（不传则不渲染标题行） */
  title: { type: String, default: '' },
  /** 标题左侧的 Emoji 图标 */
  emoji: { type: String, default: '' },
  /** 标题右侧的副标题说明 */
  sub: { type: String, default: '' },
  /** 是否启用 hover 动效 */
  hover: { type: Boolean, default: true },
  /** 是否禁用「轻微放大」（承载图表的卡片建议开启，避免缩放模糊） */
  staticScale: { type: Boolean, default: false },
  /** 是否让内容区自适应铺满（flex 布局） */
  flex: { type: Boolean, default: false }
})

/** 组装根节点样式类 */
const rootClass = [
  'macaron-card',
  `mc-${props.theme}`,
  props.hover ? (props.staticScale ? 'card-hover-static' : 'card-hover') : '',
  props.flex ? 'flex flex-col' : ''
]
</script>

<template>
  <section :class="rootClass">
    <!-- 标题行 -->
    <header v-if="title || $slots.extra || $slots.header" class="card-head">
      <slot name="header">
        <div class="min-w-0">
          <h3 class="card-title">
            <span v-if="emoji" class="emoji-badge" aria-hidden="true">{{ emoji }}</span>
            <span class="truncate">{{ title }}</span>
          </h3>
          <p v-if="sub" class="card-sub">{{ sub }}</p>
        </div>
      </slot>
      <div class="shrink-0">
        <slot name="extra"></slot>
      </div>
    </header>

    <!-- 主体内容 -->
    <div :class="flex ? 'flex-1 min-h-0' : ''">
      <slot></slot>
    </div>

    <!-- 页脚 -->
    <footer v-if="$slots.footer" class="mt-4">
      <slot name="footer"></slot>
    </footer>
  </section>
</template>

<script setup>
/**
 * RouteProgress 路由切换加载条
 * ------------------------------------------------------------------
 * 页面全部采用路由级懒加载，首次进入某个模块时需要下载对应 chunk。
 * 若网络较慢，页面会出现短暂空白；这里在导航开始时展示顶部细进度条，
 * 让用户明确知道「正在加载」，避免误以为页面卡死。
 *
 * 细节：
 *   · 延迟 120ms 才显示，命中已缓存的快速跳转不会闪一下进度条
 *   · 至少展示 260ms，避免进度条一闪而过造成视觉抖动
 *   · 顶部 2px 松石绿，与全站设计语言一致，不干扰页面内容
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  /** 导航开始后延迟多少毫秒显示（过滤极快跳转） */
  delay: { type: Number, default: 120 },
  /** 进度条最短展示时长（毫秒） */
  minVisible: { type: Number, default: 260 }
})

const router = useRouter()
const visible = ref(false)

let showTimer = null
let hideTimer = null
let shownAt = 0
let removeBefore = null
let removeAfter = null

function start() {
  clearTimeout(hideTimer)
  if (visible.value) return
  clearTimeout(showTimer)
  showTimer = setTimeout(() => {
    visible.value = true
    shownAt = performance.now()
  }, props.delay)
}

function stop() {
  clearTimeout(showTimer)
  if (!visible.value) return
  const elapsed = performance.now() - shownAt
  hideTimer = setTimeout(
    () => {
      visible.value = false
    },
    Math.max(0, props.minVisible - elapsed)
  )
}

onMounted(() => {
  removeBefore = router.beforeEach(start)
  // 无论导航成功、失败还是被取消，afterEach 都会触发，保证进度条不会卡住
  removeAfter = router.afterEach(stop)
})

onBeforeUnmount(() => {
  removeBefore?.()
  removeAfter?.()
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
})
</script>

<template>
  <div class="route-progress" :class="{ 'is-active': visible }" aria-hidden="true">
    <span class="route-progress-bar"></span>
  </div>
</template>

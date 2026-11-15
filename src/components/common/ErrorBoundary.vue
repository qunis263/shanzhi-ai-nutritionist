<script setup>
/**
 * ErrorBoundary 全局错误边界
 * ------------------------------------------------------------------
 * 包裹在 <RouterView> 外层，拦截任意子组件在渲染 / 生命周期 / 事件中
 * 抛出的未捕获异常，转为友好的兜底页面，避免整站白屏（答辩演示兜底）。
 * 路由切换后自动恢复正常渲染。
 */
import { onErrorCaptured, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

/** 捕获到的错误对象 */
const error = ref(null)
/** Vue 给出的错误发生位置描述 */
const errorInfo = ref('')

onErrorCaptured((err, instance, info) => {
  error.value = err
  errorInfo.value = info
  console.error(`[ErrorBoundary] 页面渲染异常（${info}）：`, err)
  // 返回 false：阻止错误继续向上冒泡到全局 errorHandler
  return false
})

// 切换路由时自动恢复，避免一个页面出错后整站无法继续操作
watch(
  () => route.fullPath,
  () => {
    error.value = null
    errorInfo.value = ''
  }
)

/** 就地重试：清空错误状态，让 Vue 重新渲染当前子树 */
function retry() {
  error.value = null
  errorInfo.value = ''
}

/** 兜底方案：整页刷新 */
function reload() {
  window.location.reload()
}
</script>

<template>
  <div v-if="error" class="error-boundary" role="alert">
    <span class="error-emoji" aria-hidden="true">🥗</span>
    <p class="error-eyebrow">页面遇到了小问题</p>
    <h2 class="error-title">这一页暂时没能加载出来</h2>
    <p class="error-desc">你的健康档案与饮食记录都安全保存在本机，不会丢失。可以重试，或返回首页继续使用。</p>
    <div class="error-actions">
      <button type="button" class="btn btn-primary" @click="retry">重新尝试</button>
      <RouterLink to="/" class="btn btn-ghost" @click="retry">回到首页</RouterLink>
      <button type="button" class="error-link" @click="reload">刷新页面</button>
    </div>
    <details v-if="errorInfo" class="error-detail">
      <summary>技术细节（便于排查）</summary>
      <pre>{{ errorInfo }} · {{ error?.message || error }}</pre>
    </details>
  </div>
  <slot v-else />
</template>

<style scoped>
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 420px;
  padding: 48px 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: #ffffff;
  box-shadow: var(--shadow-card);
  text-align: center;
}
.error-emoji {
  font-size: 44px;
  line-height: 1;
}
.error-eyebrow {
  margin-top: 6px;
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.error-title {
  color: var(--ink);
  font-size: 20px;
  font-weight: 800;
}
.error-desc {
  max-width: 460px;
  color: var(--tx-sub);
  font-size: 13px;
  line-height: 1.7;
}
.error-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.error-link {
  border: 0;
  background: transparent;
  color: var(--tx-muted);
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.error-detail {
  width: min(560px, 100%);
  margin-top: 18px;
  text-align: left;
}
.error-detail summary {
  cursor: pointer;
  color: var(--tx-muted);
  font-size: 11px;
}
.error-detail pre {
  margin-top: 8px;
  padding: 10px 12px;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f7f8fa;
  color: var(--tx-sub);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

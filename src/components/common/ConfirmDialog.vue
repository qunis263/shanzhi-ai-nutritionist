<script setup>
/**
 * ConfirmDialog 统一确认弹窗
 * ------------------------------------------------------------------
 * 全局挂载一次（App.vue），通过 useConfirm 唤起，
 * 用于替代样式不可控、会阻塞主线程的原生 window.confirm。
 */
import { nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { confirmState, settle } from '@/composables/useConfirm'

const confirmBtn = ref(null)

/** 打开时自动聚焦「取消」按钮，避免误触危险操作 */
watch(
  () => confirmState.open,
  async open => {
    if (open) {
      await nextTick()
      confirmBtn.value?.focus()
    }
  }
)

function onKeydown(e) {
  if (!confirmState.open) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    settle(false)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="confirm-fade">
      <div v-if="confirmState.open" class="confirm-mask" @click.self="settle(false)">
        <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <h3 id="confirm-title" class="confirm-title">{{ confirmState.title }}</h3>
          <p v-if="confirmState.message" class="confirm-message">{{ confirmState.message }}</p>
          <div class="confirm-actions">
            <button ref="confirmBtn" type="button" class="btn btn-ghost" @click="settle(false)">
              {{ confirmState.cancelText }}
            </button>
            <button
              type="button"
              class="btn"
              :class="confirmState.tone === 'danger' ? 'btn-danger-soft' : 'btn-primary'"
              @click="settle(true)"
            >
              {{ confirmState.confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.confirm-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(16, 24, 40, 0.32);
  backdrop-filter: blur(2px);
}
.confirm-card {
  width: min(400px, 100%);
  padding: 24px 24px 20px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: #ffffff;
  box-shadow: 0 18px 48px rgba(16, 24, 40, 0.18);
}
.confirm-title {
  color: var(--ink);
  font-size: 16px;
  font-weight: 800;
  line-height: 1.4;
}
.confirm-message {
  margin-top: 8px;
  color: var(--tx-sub);
  font-size: 13px;
  line-height: 1.7;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.18s ease;
}
.confirm-fade-enter-active .confirm-card,
.confirm-fade-leave-active .confirm-card {
  transition: transform 0.18s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
.confirm-fade-enter-from .confirm-card,
.confirm-fade-leave-to .confirm-card {
  transform: translateY(8px) scale(0.98);
}
</style>

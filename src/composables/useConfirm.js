/**
 * 统一确认弹窗（Composable）
 * ------------------------------------------------------------------
 * 用法：
 *   const ok = await confirm({ title: '确认删除？', message: '删除后不可恢复' })
 *   if (!ok) return
 *
 * 弹窗组件 <ConfirmDialog /> 在 App.vue 中挂载一次即可，
 * 全局共享同一份状态，替代原生 window.confirm（样式不可控、阻断主线程）。
 */

import { reactive } from 'vue'

/** 是否已有未决弹窗 */
let resolver = null

/** 弹窗 UI 状态（全局单例） */
export const confirmState = reactive({
  open: false,
  title: '请确认操作',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  /** danger 危险操作（红色） / primary 普通操作（品牌绿） */
  tone: 'danger'
})

/**
 * 打开确认弹窗，返回 Promise<boolean>
 * @param {{ title?: string, message?: string, confirmText?: string, cancelText?: string, tone?: 'danger'|'primary' }} options
 */
export function confirm(options = {}) {
  // 若上一个弹窗还没结束（极端情况），先按取消处理，避免悬空 Promise
  if (resolver) settle(false)

  confirmState.title = options.title || '请确认操作'
  confirmState.message = options.message || ''
  confirmState.confirmText = options.confirmText || '确定'
  confirmState.cancelText = options.cancelText || '取消'
  confirmState.tone = options.tone === 'primary' ? 'primary' : 'danger'
  confirmState.open = true

  return new Promise(resolve => {
    resolver = resolve
  })
}

/** 关闭弹窗并回调结果（供弹窗组件调用） */
export function settle(result) {
  const done = resolver
  resolver = null
  confirmState.open = false
  if (done) done(Boolean(result))
}

/** 组合式写法：const { confirm } = useConfirm() */
export function useConfirm() {
  return { confirm, confirmState, settle }
}

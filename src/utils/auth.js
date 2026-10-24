/**
 * 前端登录态工具（与 public/login.html 的原生 JS 实现共用同一套存储键）
 * ------------------------------------------------------------------
 * 纯前端演示账号体系：
 *   · 账号注册表 shanzhi_users_v1（由登录页写入，含预置演示账号 shanzhi/123456）
 *   · 登录态     shanzhi_auth_v1：勾选「记住我」→ localStorage；
 *                 未勾选 → sessionStorage（关闭浏览器标签即失效）
 *
 * 注意：
 *   1. 本模块只负责「是否已登录」的判定与跳转，不保存密码；
 *   2. 登录态键与业务数据键（ai_nutrition_profile_v1 / ai_nutrition_diet_v1）
 *      完全隔离，登录/退出不会清空用户的健康档案与饮食记录；
 *   3. 后续对接真实后端时，把登录页的账号校验替换为后端接口、
 *      这里改为读取服务端会话/token 即可，路由守卫无需改动。
 */

export const AUTH_KEY = 'shanzhi_auth_v1'

/**
 * 读取登录态（localStorage 与 sessionStorage 任一存在即视为已登录）
 * @returns {{username: string, loginAt: number} | null}
 */
export function getAuth() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(AUTH_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.username) return parsed
      }
    } catch (e) {
      // 数据损坏时忽略，继续尝试另一个存储
      console.warn('[auth] 登录态解析失败', e)
    }
  }
  return null
}

/** 是否已登录 */
export function isLoggedIn() {
  return getAuth() !== null
}

/** 清除登录态（退出登录；不影响档案与饮食数据） */
export function clearAuth() {
  try {
    localStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(AUTH_KEY)
  } catch (e) {
    console.warn('[auth] 清除登录态失败', e)
  }
}

/**
 * 跳转到登录页（登录页是独立的 public/login.html，不在 Vue 路由内）
 * 使用相对路径，兼容 dev 服务、preview 服务与直接打开 dist 的场景
 */
export function redirectToLogin() {
  if (location.pathname.endsWith('login.html')) return
  location.replace('login.html')
}

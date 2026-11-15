/**
 * 本地存储工具
 * ------------------------------------------------------------------
 * 纯前端项目使用 localStorage 持久化用户档案与饮食记录，
 * 刷新浏览器 / 关闭页面数据也不会丢失；同时提供一键重置能力。
 */

/** 存储键名统一加前缀与版本号，避免同名冲突与结构升级导致的脏数据 */
export const STORAGE_KEYS = {
  profile: 'ai_nutrition_profile_v1', // 个人健康档案
  diet: 'ai_nutrition_diet_v1', // 饮食记录 / 饮水 / 历史
  chat: 'ai_nutrition_chat_v1', // AI 对话历史（仅最近若干条，供刷新后恢复）
  interventions: 'ai_nutrition_interventions_v1', // 7 天微干预实验与真实打卡
  pilot: 'ai_nutrition_pilot_v1' // 匿名试点、问卷与产品行为事件
}

/**
 * 读取并反序列化
 * @param {string} key
 * @param {*} fallback 解析失败时的兜底值
 */
export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch (e) {
    // 数据损坏时直接回退，避免整个应用崩溃
    console.warn(`[storage] 读取 ${key} 失败，已使用默认值`, e)
    return fallback
  }
}

/**
 * 序列化写入
 * @param {string} key
 * @param {*} value
 */
export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn(`[storage] 写入 ${key} 失败`, e)
  }
}

/** 删除指定键 */
export function removeKey(key) {
  try {
    localStorage.removeItem(key)
  } catch (e) {
    console.warn(`[storage] 删除 ${key} 失败`, e)
  }
}

/**
 * 用户档案 Store（Pinia）
 * ------------------------------------------------------------------
 * 负责保存「个人健康档案」：昵称 / 性别 / 年龄 / 身高 / 体重 / 运动强度。
 * 所有身体指标（BMI、BMR、TDEE、推荐热量、营养目标）均由档案实时推导，
 * 因此只要更新档案，全站数据（报告 / 推荐 / 大屏）都会自动同步。
 */

import { defineStore } from 'pinia'
import { computed, reactive, watch } from 'vue'
import { computeMetrics, getActivity } from '../utils/nutrition'
import { readJSON, writeJSON, removeKey, STORAGE_KEYS } from '../utils/storage'
import type { UserProfile } from '@/types'

/** 默认档案（首次进入应用时的演示数据，保证一打开就有内容可看） */
const DEFAULT_PROFILE: UserProfile = {
  nickname: '小营养家',
  avatar: '🧑‍🍳',
  gender: 'male', // male 男 / female 女
  age: 21,
  height: 175, // cm
  weight: 68, // kg
  activity: 'moderate', // 对应 ACTIVITY_LEVELS 的 key
  goal: 'keep' // keep 保持 / lose 减脂 / gain 增肌（用于推荐侧重）
}

export const useUserStore = defineStore('user', () => {
  // ---- 状态：个人健康档案 ----
  const storedProfile = readJSON(STORAGE_KEYS.profile, DEFAULT_PROFILE) as UserProfile
  const profile = reactive<UserProfile>({ ...DEFAULT_PROFILE, ...storedProfile })

  // ---- 计算属性：由档案实时推导的身体指标 ----
  /** 是否已完成测评（有身高体重即为已完成） */
  const hasProfile = computed(() => Number(profile.height) > 0 && Number(profile.weight) > 0)

  /** 身体指标合集：BMI / 分级 / BMR / TDEE / 推荐摄入热量 / 营养目标 */
  const metrics = computed(() => computeMetrics(profile))

  /** 当前运动强度配置 */
  const activityInfo = computed(() => getActivity(profile.activity))

  /** 性别中文 */
  const genderText = computed(() => (profile.gender === 'female' ? '女' : '男'))

  // ---- 行为 ----
  /**
   * 更新档案（支持部分字段）
   * @param {object} patch 需要更新的字段
   */
  function updateProfile(patch: Partial<UserProfile> = {}) {
    Object.assign(profile, patch)
  }

  /** 恢复为默认演示档案 */
  function resetProfile() {
    Object.assign(profile, DEFAULT_PROFILE)
  }

  /** 清空本地缓存（个人中心「清除数据」使用） */
  function clearStorage() {
    removeKey(STORAGE_KEYS.profile)
    Object.assign(profile, DEFAULT_PROFILE)
  }

  // ---- 持久化：档案变化时自动写入 localStorage ----
  watch(
    profile,
    val => {
      writeJSON(STORAGE_KEYS.profile, val)
    },
    { deep: true }
  )

  return {
    profile,
    hasProfile,
    metrics,
    activityInfo,
    genderText,
    updateProfile,
    resetProfile,
    clearStorage,
    DEFAULT_PROFILE
  }
})

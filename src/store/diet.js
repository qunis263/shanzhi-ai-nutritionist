/**
 * 饮食记录 Store（Pinia）
 * ------------------------------------------------------------------
 * 管理「今日三餐饮食记录 + 饮水」与「历史日期记录」，
 * 并派生出全站复用的数据：营养合计、AI 报告、膳食推荐、一周趋势、整体统计。
 * 所有数据仅存于前端（localStorage），无需任何后端接口。
 */

import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { findFood, scaleNutrition } from '../data/foods'
import { HISTORY_DAYS, MEAL_TYPES, MEAL_EMOJI, MEAL_THEME, createTodayRecords } from '../data/mockHistory'
import { sumNutrition, buildReport, buildMealPlan } from '../utils/nutrition'
import { todayStr, weekdayCN, formatCN, lastNDays, nowTimeStr, isToday } from '../utils/date'
import { readJSON, writeJSON, removeKey, STORAGE_KEYS } from '../utils/storage'
import { useUserStore } from './user'
import { usePilotStore } from './pilot'

export const useDietStore = defineStore('diet', () => {
  const userStore = useUserStore()
  const pilotStore = usePilotStore()

  // ================= 状态 =================
  /** 今日日期字符串，用于检测跨天 */
  const todayKey = ref(todayStr())
  /** 今日饮食记录列表 */
  const records = ref([])
  /** 今日饮水量（ml） */
  const water = ref(0)
  /** 历史记录：{ 'YYYY-MM-DD': { records: [...], water: number } } */
  const history = reactive({})

  // ================= 初始化 =================

  /** 把 mock 历史数据写入 history 对象 */
  function loadMockHistory() {
    Object.keys(history).forEach(k => delete history[k])
    HISTORY_DAYS.forEach(day => {
      history[day.date] = { records: day.records, water: day.water }
    })
  }

  /** 载入今日演示记录 */
  function loadMockToday() {
    const seed = createTodayRecords()
    records.value = seed.records
    water.value = seed.water
    todayKey.value = seed.date
  }

  /**
   * Store 初始化（在 App.vue 挂载时调用一次）
   * 逻辑：优先读取本地缓存；若缓存不存在或已跨天，则载入演示数据
   */
  function init() {
    const stored = readJSON(STORAGE_KEYS.diet, null)
    const nowDate = todayStr()

    // 缓存存在且仍是同一天 → 直接使用缓存
    if (stored && stored.todayKey === nowDate) {
      records.value = stored.records || []
      water.value = stored.water || 0
      const storedHistory = stored.history || {}
      Object.keys(history).forEach(k => delete history[k])
      Object.assign(history, storedHistory)
      // 历史为空时补齐演示数据，保证「历史记录 / 大屏」有内容展示
      if (!Object.keys(history).length) loadMockHistory()
      return
    }

    // 首次进入或已跨天 → 载入演示数据（跨天时旧数据不再保留，演示场景足够）
    loadMockHistory()
    loadMockToday()
    save()
  }

  /** 持久化到 localStorage */
  function save() {
    writeJSON(STORAGE_KEYS.diet, {
      todayKey: todayKey.value,
      records: records.value,
      water: water.value,
      history: { ...history }
    })
  }

  // ================= 计算属性 =================

  /** 今日营养合计（热量 / 蛋白 / 脂肪 / 碳水 / 纤维 / 糖 / 钠） */
  const summary = computed(() => sumNutrition(records.value))

  /** 当前营养目标（随档案变化自动更新） */
  const targets = computed(() => userStore.metrics.targets)

  /** 今日 AI 营养分析报告（评分 + 优缺点 + 超标项 + 缺口项 + AI 评语） */
  const report = computed(() =>
    buildReport({
      summary: summary.value,
      targets: targets.value,
      water: water.value,
      records: records.value
    })
  )

  /** AI 膳食推荐方案（依据当前营养缺口动态生成） */
  const mealPlan = computed(() =>
    buildMealPlan({
      profile: userStore.profile,
      metrics: userStore.metrics,
      summary: summary.value,
      records: records.value
    })
  )

  /** 按餐段分组的今日记录：{ 早餐: [...], 午餐: [...], 晚餐: [...], 零食: [...] } */
  const mealGroups = computed(() => {
    const groups = {}
    MEAL_TYPES.forEach(t => {
      groups[t] = records.value.filter(r => r.mealType === t)
    })
    return groups
  })

  /** 今日各餐段热量（用于「饮水与三餐」柱状图） */
  const mealCalories = computed(() => MEAL_TYPES.map(t => Math.round(sumNutrition(mealGroups.value[t]).calories)))

  /** 一周数据（最近 7 天含今天），用于热量折线图与柱状图 */
  const weekData = computed(() =>
    lastNDays(7).map(date => {
      const day = getDay(date)
      const s = sumNutrition(day.records)
      const r = buildReport({
        summary: s,
        targets: targets.value,
        water: day.water,
        records: day.records
      })
      return {
        date,
        label: isToday(date) ? '今天' : formatCN(date),
        weekday: weekdayCN(date),
        calories: Math.round(s.calories),
        protein: Math.round(s.protein),
        fat: Math.round(s.fat),
        carb: Math.round(s.carb),
        fiber: Math.round(s.fiber),
        sugar: Math.round(s.sugar),
        sodium: Math.round(s.sodium),
        water: day.water,
        score: r.score,
        grade: r.grade,
        target: targets.value.calories
      }
    })
  )

  /** 全部历史日期（含今天），按日期倒序 → 供历史记录页与个人中心使用 */
  const historyDays = computed(() =>
    weekData.value
      .slice()
      .reverse()
      .map(d => {
        const day = getDay(d.date)
        return {
          ...d,
          records: day.records,
          water: day.water,
          mealCount: new Set(day.records.map(r => r.mealType)).size,
          recordCount: day.records.length
        }
      })
  )

  /** 整体数据统计（个人中心展示） */
  const stats = computed(() => {
    const validDays = weekData.value.filter(d => d.calories > 0)
    const avgCalories = validDays.length
      ? Math.round(validDays.reduce((a, b) => a + b.calories, 0) / validDays.length)
      : 0
    const avgScore = validDays.length ? Math.round(validDays.reduce((a, b) => a + b.score, 0) / validDays.length) : 0
    const bestDay = weekData.value.reduce((best, d) => (d.score > (best?.score || 0) ? d : best), null)
    const totalRecords = historyDays.value.reduce((a, b) => a + b.recordCount, 0) + records.value.length
    const totalWater = historyDays.value.reduce((a, b) => a + b.water, 0) + water.value
    const totalCalories = weekData.value.reduce((a, b) => a + b.calories, 0)
    const avgProtein = validDays.length
      ? Math.round(validDays.reduce((a, b) => a + b.protein, 0) / validDays.length)
      : 0
    const avgFiber = validDays.length ? Math.round(validDays.reduce((a, b) => a + b.fiber, 0) / validDays.length) : 0
    return {
      days: validDays.length,
      totalDays: weekData.value.length,
      avgCalories,
      avgScore,
      avgProtein,
      avgFiber,
      bestScore: bestDay?.score || 0,
      bestDate: bestDay?.date || todayKey.value,
      totalRecords,
      totalWater,
      totalCalories
    }
  })

  /** 今日各营养素的达标进度（用于进度条组件） */
  const progressList = computed(() =>
    Object.keys(targets.value)
      .map(key => {
        const item = report.value.items.find(i => i.key === key)
        return item || null
      })
      .filter(Boolean)
  )

  // ================= 行为方法 =================

  /**
   * 取得某一天的数据（含记录与饮水）
   * @param {string} dateStr 'YYYY-MM-DD'
   */
  function getDay(dateStr) {
    if (isToday(dateStr)) {
      return { records: records.value, water: water.value }
    }
    return history[dateStr] || { records: [], water: 0 }
  }

  /**
   * 新增一条饮食记录
   * @param {object} payload
   * @param {string} payload.mealType 餐段：早餐 / 午餐 / 晚餐 / 零食
   * @param {string} [payload.foodId] 食物库中的 id
   * @param {object} [payload.food] 也可直接传入食物对象（AI 识别结果走此路径）
   * @param {number} payload.grams 分量（克 / 毫升）
   * @param {string} [payload.time] 时间，默认当前时间
   * @returns {object|null} 新增的记录
   */
  function addRecord({ mealType, foodId, food, grams, time }) {
    const target = food || findFood(foodId)
    if (!target) return null
    const amount = Number(grams) > 0 ? Number(grams) : 100
    const record = {
      id: `${todayKey.value}-${mealType}-${target.id}-${Date.now()}`,
      date: todayKey.value,
      mealType: MEAL_TYPES.includes(mealType) ? mealType : '零食',
      time: time || nowTimeStr(),
      foodId: target.id,
      name: target.name,
      emoji: target.emoji || '🍽️',
      grams: amount,
      unit: target.unit || '100g',
      nutrition: scaleNutrition(target, amount)
    }
    records.value.push(record)
    pilotStore.track('diet_record_added', { mealType: record.mealType, foodId: record.foodId })
    save()
    return record
  }

  /**
   * 删除一条今日记录
   * @param {string} id 记录 id
   */
  function removeRecord(id) {
    const idx = records.value.findIndex(r => r.id === id)
    if (idx > -1) {
      records.value.splice(idx, 1)
      save()
    }
  }

  /** 清空今日全部记录 */
  function clearToday() {
    records.value = []
    water.value = 0
    save()
  }

  /**
   * 增加饮水量
   * @param {number} ml 毫升（可为负数用于撤销）
   */
  function addWater(ml) {
    water.value = Math.max(0, Math.round(water.value + Number(ml || 0)))
    save()
  }

  /** 直接设置饮水量 */
  function setWater(ml) {
    water.value = Math.max(0, Math.round(Number(ml) || 0))
    save()
  }

  /** 恢复为演示数据（答辩演示 / 个人中心重置使用） */
  function resetToDemo() {
    loadMockHistory()
    loadMockToday()
    save()
  }

  /** 清空所有数据（恢复空白状态） */
  function clearAll() {
    records.value = []
    water.value = 0
    Object.keys(history).forEach(k => delete history[k])
    removeKey(STORAGE_KEYS.diet)
  }

  /** 找到某条历史记录（用于详情展示） */
  function findRecord(id) {
    return records.value.find(r => r.id === id) || null
  }

  // ================= 持久化监听 =================
  watch([records, water], save, { deep: true })

  return {
    // 状态
    todayKey,
    records,
    water,
    history,
    // 常量透出（供页面使用，避免各处重复 import）
    MEAL_TYPES,
    MEAL_EMOJI,
    MEAL_THEME,
    // 计算属性
    summary,
    targets,
    report,
    mealPlan,
    mealGroups,
    mealCalories,
    weekData,
    historyDays,
    stats,
    progressList,
    // 方法
    init,
    getDay,
    addRecord,
    removeRecord,
    clearToday,
    addWater,
    setWater,
    resetToDemo,
    clearAll,
    findRecord
  }
})

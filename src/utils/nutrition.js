/**
 * 营养计算核心工具库
 * ------------------------------------------------------------------
 * 本文件是《膳知・AI 营养分析师》的「算法大脑」，所有页面共用：
 *   1. 身体指标计算：BMI / BMR 基础代谢 / TDEE 每日消耗 / 推荐摄入热量
 *   2. 营养目标生成：根据推荐热量与体重推导各项营养素目标值
 *   3. 营养状态判定：达标 ✅ / 超标 🔴 / 偏少 💡
 *   4. AI 健康评分：0–100 分的当日健康总分（可解释的加权评分模型）
 *   5. AI 营养报告：优缺点、超标项、缺口项、自然语言评语、改进建议
 *   6. AI 膳食推荐：依据营养缺口为食谱打分排序并输出运动方案
 *   7. 食物健康评价：识别结果的标签（高脂 / 高糖 / 高热量 / 优质蛋白…）
 */

import { BREAKFAST_RECIPES, LUNCH_RECIPES, DINNER_RECIPES, FRUIT_RECIPES, SNACK_RECIPES, WORKOUT_PLANS } from '../data/recipes'

/* ===================================================================
 * 通用小工具
 * =================================================================== */

/** 保留一位小数（消除浮点误差，如 12.300000000000001） */
export function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10
}

/** 数值区间限制 */
export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

/** 空营养合计对象 */
export function emptySummary() {
  return { calories: 0, protein: 0, fat: 0, carb: 0, fiber: 0, sugar: 0, sodium: 0 }
}

/* ===================================================================
 * 一、身体数据相关常量与计算
 * =================================================================== */

/** 日常运动强度选项（含活动系数，用于 TDEE 计算） */
export const ACTIVITY_LEVELS = [
  { key: 'sedentary', label: '久坐少动', emoji: '🪑', desc: '办公室久坐，基本不运动', factor: 1.2 },
  { key: 'light', label: '轻度活动', emoji: '🚶', desc: '每周 1–3 次轻度运动', factor: 1.375 },
  { key: 'moderate', label: '中度活动', emoji: '🏃', desc: '每周 3–5 次中等强度运动', factor: 1.55 },
  { key: 'active', label: '高强度活动', emoji: '🔥', desc: '每周 6–7 次高强度训练或体力劳动', factor: 1.725 }
]

/** 通过活动强度 key 取到完整配置（带兜底） */
export function getActivity(key) {
  return ACTIVITY_LEVELS.find((a) => a.key === key) || ACTIVITY_LEVELS[0]
}

/**
 * 计算 BMI = 体重(kg) / 身高(m)²
 * @param {number} height 身高 cm
 * @param {number} weight 体重 kg
 */
export function calcBMI(height, weight) {
  const h = Number(height) / 100
  const w = Number(weight)
  if (!h || !w) return 0
  return round1(w / (h * h))
}

/**
 * BMI 等级判定（采用《中国超重/肥胖医学营养治疗专家共识》标准）
 * < 18.5 偏瘦 / 18.5–23.9 标准 / 24–27.9 超重 / ≥ 28 肥胖
 * @param {number} bmi
 * @returns {{key:string,label:string,emoji:string,color:string,bg:string,advice:string,min:number,max:number}}
 */
export function bmiGrade(bmi) {
  const v = Number(bmi) || 0
  if (v <= 0) {
    return { key: 'unknown', label: '待测评', emoji: '❔', color: '#98a5b5', bg: '#f3f5f9', advice: '请先完成身体数据测评。', min: 0, max: 0 }
  }
  if (v < 18.5) {
    return {
      key: 'thin',
      label: '偏瘦',
      emoji: '💡',
      color: '#f5a524',
      bg: '#fff9e6',
      advice: '体重偏低，建议增加优质蛋白与主食摄入，配合力量训练逐步增重。',
      min: 0,
      max: 18.5
    }
  }
  if (v < 24) {
    return {
      key: 'normal',
      label: '标准',
      emoji: '✅',
      color: '#10b981',
      bg: '#e6f7ef',
      advice: '体重处于健康区间，保持良好的饮食与运动习惯即可。',
      min: 18.5,
      max: 24
    }
  }
  if (v < 28) {
    return {
      key: 'overweight',
      label: '超重',
      emoji: '🔴',
      color: '#f59e0b',
      bg: '#fffbeb',
      advice: '体重超出健康范围，建议制造 300–500 kcal 的每日热量缺口，并增加有氧运动。',
      min: 24,
      max: 28
    }
  }
  return {
    key: 'obese',
    label: '肥胖',
    emoji: '🔴',
    color: '#ef4444',
    bg: '#fff1f1',
    advice: '体重明显超标，建议循序渐进控制热量，优先减少含糖饮料与油炸食品，并咨询专业医师。',
    min: 28,
    max: 99
  }
}

/**
 * 计算 BMR 基础代谢率（Mifflin-St Jeor 公式，公认精度较高的估算式）
 *   男性：10×体重 + 6.25×身高 − 5×年龄 + 5
 *   女性：10×体重 + 6.25×身高 − 5×年龄 − 161
 * @param {{gender:string, weight:number, height:number, age:number}} p
 */
export function calcBMR({ gender, weight, height, age }) {
  const w = Number(weight)
  const h = Number(height)
  const a = Number(age)
  if (!w || !h || !a) return 0
  const base = 10 * w + 6.25 * h - 5 * a
  return Math.round(gender === 'female' ? base - 161 : base + 5)
}

/**
 * 计算 TDEE 每日总消耗 = BMR × 活动系数
 */
export function calcTDEE(bmr, activityKey) {
  const factor = getActivity(activityKey).factor
  return Math.round(Number(bmr || 0) * factor)
}

/**
 * 根据 BMI 与 TDEE 推荐「每日摄入热量」
 *   偏瘦 → TDEE + 300（增重）
 *   标准 → TDEE（维持）
 *   超重 / 肥胖 → TDEE − 400（减脂，但不低于 BMR×1.1，避免过度节食）
 * @returns {{calories:number, mode:string, modeEmoji:string, modeDesc:string, delta:number}}
 */
export function recommendCalories(tdee, bmi, bmr) {
  const grade = bmiGrade(bmi)
  let delta = 0
  let mode = '维持体重'
  let modeEmoji = '⚖️'
  let modeDesc = '当前体重处于健康区间，保持现有能量平衡即可。'

  if (grade.key === 'thin') {
    delta = 300
    mode = '健康增重'
    modeEmoji = '📈'
    modeDesc = '在维持热量基础上每日增加约 300 kcal，配合力量训练让增重更多来自肌肉。'
  } else if (grade.key === 'overweight' || grade.key === 'obese') {
    delta = -400
    mode = '科学减脂'
    modeEmoji = '📉'
    modeDesc = '在每日消耗基础上减少约 400 kcal，形成温和热量缺口，每周约减 0.3–0.5kg。'
  }

  // 安全下限：不低于基础代谢的 1.1 倍
  const floor = Math.round(Number(bmr || 0) * 1.1)
  let calories = Math.round(Number(tdee || 0) + delta)
  if (floor > 0 && calories < floor) calories = floor

  return { calories, mode, modeEmoji, modeDesc, delta }
}

/**
 * 综合计算身体指标（身体测评页 / 全局 Store 共用）
 * @param {{gender:string, age:number, height:number, weight:number, activity:string}} profile
 */
export function computeMetrics(profile) {
  const bmi = calcBMI(profile.height, profile.weight)
  const grade = bmiGrade(bmi)
  const bmr = calcBMR(profile)
  const tdee = calcTDEE(bmr, profile.activity)
  const rec = recommendCalories(tdee, bmi, bmr)
  const targets = computeTargets(rec.calories, profile.weight)
  return {
    bmi,
    bmiGrade: grade,
    bmr,
    tdee,
    dailyCalories: rec.calories,
    dietMode: rec.mode,
    dietModeEmoji: rec.modeEmoji,
    dietModeDesc: rec.modeDesc,
    targets
  }
}

/* ===================================================================
 * 二、营养素元信息与目标值
 * =================================================================== */

/**
 * 营养素元信息
 *   type: 'min'   越多越好（不足算偏少）
 *         'max'   有上限（超过算超标）
 *         'range' 有推荐区间（过低偏少、过高超标）
 */
export const NUTRIENT_META = {
  calories: { key: 'calories', label: '热量', unit: 'kcal', emoji: '🔥', type: 'range', theme: 'orange' },
  protein: { key: 'protein', label: '蛋白质', unit: 'g', emoji: '🥩', type: 'min', theme: 'green' },
  fat: { key: 'fat', label: '脂肪', unit: 'g', emoji: '🥑', type: 'max', theme: 'yellow' },
  carb: { key: 'carb', label: '碳水化合物', unit: 'g', emoji: '🍚', type: 'range', theme: 'cyan' },
  fiber: { key: 'fiber', label: '膳食纤维', unit: 'g', emoji: '🌿', type: 'min', theme: 'green' },
  sugar: { key: 'sugar', label: '糖分', unit: 'g', emoji: '🍬', type: 'max', theme: 'yellow' },
  sodium: { key: 'sodium', label: '钠', unit: 'mg', emoji: '🧂', type: 'max', theme: 'blue' },
  water: { key: 'water', label: '饮水', unit: 'ml', emoji: '💧', type: 'min', theme: 'blue' }
}

/** 营养素在健康评分中的权重（合计 100 分，模型完全可解释） */
export const SCORE_WEIGHTS = {
  calories: 25,
  protein: 15,
  fiber: 20,
  fat: 10,
  carb: 10,
  sugar: 10,
  sodium: 10
}

/**
 * 计算每日饮水目标（按体重 33ml/kg 估算，限制在 1500–2500ml）
 */
export function waterTarget(weight) {
  const w = Number(weight) || 60
  return clamp(Math.round((w * 33) / 50) * 50, 1500, 2500)
}

/**
 * 根据每日推荐热量与体重，推导各项营养素目标值
 *   蛋白质 18% 热量（1g=4kcal）/ 脂肪 25%（1g=9kcal）/ 碳水 57%（1g=4kcal）
 *   膳食纤维、糖、钠、饮水采用膳食指南固定推荐值
 */
export function computeTargets(dailyCalories, weight) {
  const cal = Number(dailyCalories) || 2000
  return {
    calories: Math.round(cal),
    protein: Math.round((cal * 0.18) / 4),
    fat: Math.round((cal * 0.25) / 9),
    carb: Math.round((cal * 0.57) / 4),
    fiber: 25,
    sugar: 25,
    sodium: 2000,
    water: waterTarget(weight)
  }
}

/* ===================================================================
 * 三、营养状态判定（达标 / 超标 / 偏少）
 * =================================================================== */

/** 状态 → 展示文案、Emoji、样式类、颜色（全站统一） */
export const STATUS_META = {
  ok: { label: '达标', emoji: '✅', badgeClass: 'badge-ok', color: '#10b981', fillClass: 'progress-ok' },
  over: { label: '超标', emoji: '🔴', badgeClass: 'badge-over', color: '#ef4444', fillClass: 'progress-over' },
  low: { label: '偏少', emoji: '💡', badgeClass: 'badge-low', color: '#f5a524', fillClass: 'progress-low' }
}

/** 取状态元信息（带兜底） */
export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.ok
}

/**
 * 判定单项营养素状态
 * @param {string} key 营养素 key
 * @param {number} value 实际摄入
 * @param {number} target 目标值
 * @returns {{status:string, ratio:number, percent:number, ...STATUS_META, meta:object}}
 */
export function evaluateNutrient(key, value, target) {
  const meta = NUTRIENT_META[key] || { label: key, unit: '', emoji: '📌', type: 'range' }
  const v = Number(value) || 0
  const t = Number(target) || 0
  const ratio = t > 0 ? v / t : 0
  let status = 'ok'

  if (t <= 0) {
    status = 'ok'
  } else if (meta.type === 'min') {
    status = ratio < 0.8 ? 'low' : 'ok'
  } else if (meta.type === 'max') {
    status = ratio > 1 ? 'over' : 'ok'
  } else {
    if (ratio < 0.8) status = 'low'
    else if (ratio > 1.2) status = 'over'
    else status = 'ok'
  }

  return {
    key,
    label: meta.label,
    unit: meta.unit,
    emoji: meta.emoji,
    type: meta.type,
    value: round1(v),
    target: t,
    ratio: round1(ratio),
    percent: Math.round(ratio * 100),
    status,
    ...statusMeta(status)
  }
}

/* ===================================================================
 * 四、营养累加与健康评分
 * =================================================================== */

/**
 * 累加一组饮食记录的营养值
 * @param {Array} records 记录数组（每条含 nutrition 字段）
 */
export function sumNutrition(records = []) {
  const total = emptySummary()
  records.forEach((r) => {
    const n = r && r.nutrition ? r.nutrition : r
    if (!n) return
    total.calories += Number(n.calories) || 0
    total.protein += Number(n.protein) || 0
    total.fat += Number(n.fat) || 0
    total.carb += Number(n.carb) || 0
    total.fiber += Number(n.fiber) || 0
    total.sugar += Number(n.sugar) || 0
    total.sodium += Number(n.sodium) || 0
  })
  // 统一保留一位小数
  Object.keys(total).forEach((k) => {
    total[k] = round1(total[k])
  })
  return total
}

/**
 * 把「实际摄入 / 目标值」转换为 0–1 的得分系数（评分模型的核心）
 *   min  类型：越接近目标越好，不足按比例扣分
 *   max  类型：不超标满分，超标后线性扣分
 *   range 类型：落在 80%–120% 区间满分，偏离越多扣分越多
 */
function scoreRatio(ratio, type) {
  if (ratio <= 0) return type === 'max' ? 1 : 0
  if (type === 'min') return clamp(ratio, 0, 1)
  if (type === 'max') return ratio <= 1 ? 1 : clamp(1 - (ratio - 1) * 0.8, 0, 1)
  // range
  if (ratio >= 0.8 && ratio <= 1.2) return 1
  if (ratio < 0.8) return clamp(ratio / 0.8, 0, 1)
  return clamp(1 - (ratio - 1.2) * 0.9, 0, 1)
}

/**
 * 计算当日 AI 健康评分（0–100）
 * @param {object} summary 当日营养合计
 * @param {object} targets 营养素目标
 * @returns {{score:number, grade:object, detail:Array}}
 */
export function calcHealthScore(summary, targets) {
  let score = 0
  const detail = []

  Object.keys(SCORE_WEIGHTS).forEach((key) => {
    const weight = SCORE_WEIGHTS[key]
    const target = Number(targets[key]) || 0
    const value = Number(summary[key]) || 0
    const ratio = target > 0 ? value / target : 0
    const meta = NUTRIENT_META[key]
    const factor = scoreRatio(ratio, meta.type)
    const got = weight * factor
    score += got
    detail.push({
      key,
      label: meta.label,
      emoji: meta.emoji,
      weight,
      value: round1(value),
      target,
      ratio: round1(ratio),
      got: round1(got)
    })
  })

  const finalScore = clamp(Math.round(score), 0, 100)
  return { score: finalScore, grade: scoreGrade(finalScore), detail }
}

/**
 * 健康评分等级
 */
export function scoreGrade(score) {
  const s = Number(score) || 0
  if (s >= 90) return { key: 'excellent', label: '优秀', emoji: '🏆', color: '#10b981', theme: 'green', desc: '饮食结构非常均衡，继续保持！' }
  if (s >= 80) return { key: 'good', label: '良好', emoji: '🌟', color: '#2f9e6b', theme: 'cyan', desc: '整体表现不错，个别营养素还有优化空间。' }
  if (s >= 70) return { key: 'pass', label: '及格', emoji: '💡', color: '#f5a524', theme: 'yellow', desc: '基本达标，但存在明显的营养短板需要补齐。' }
  return { key: 'poor', label: '待改善', emoji: '⚠️', color: '#ef4444', theme: 'orange', desc: '饮食结构偏差较大，建议按建议逐项调整。' }
}

/* ===================================================================
 * 五、AI 营养分析报告
 * =================================================================== */

/**
 * 生成完整的 AI 营养分析报告
 * @param {object} params
 * @param {object} params.summary 当日营养合计
 * @param {object} params.targets 营养目标
 * @param {number} params.water   当日饮水量 ml
 * @param {Array}  params.records 当日饮食记录
 * @returns 报告对象
 */
export function buildReport({ summary, targets, water = 0, records = [] }) {
  const { score, grade, detail } = calcHealthScore(summary, targets)

  // ---- 1. 逐项状态判定（含饮水） ----
  const items = Object.keys(NUTRIENT_META).map((key) => {
    const raw = key === 'water' ? water : summary[key]
    return evaluateNutrient(key, raw, targets[key])
  })

  // ---- 2. 超标项 / 缺失项 ----
  const overItems = items.filter((i) => i.status === 'over')
  const lowItems = items.filter((i) => i.status === 'low')
  const okItems = items.filter((i) => i.status === 'ok')

  // ---- 3. 优点 ----
  const strengths = []
  if (okItems.some((i) => i.key === 'calories')) strengths.push('全天热量摄入控制得当，与推荐值基本吻合 🔥')
  if (okItems.some((i) => i.key === 'protein')) strengths.push('蛋白质摄入充足，有助于维持肌肉量与免疫力 🥩')
  if (okItems.some((i) => i.key === 'fiber')) strengths.push('膳食纤维达标，肠道蠕动与饱腹感表现良好 🌿')
  if (okItems.some((i) => i.key === 'sugar')) strengths.push('添加糖控制得不错，远离了「隐形糖」陷阱 🍬')
  if (okItems.some((i) => i.key === 'sodium')) strengths.push('钠摄入在合理范围内，对血压友好 🧂')
  if (okItems.some((i) => i.key === 'water')) strengths.push('饮水量达到推荐目标，水合状态良好 💧')
  const { mealsCovered } = countMeals(records)
  if (mealsCovered >= 3) strengths.push('三餐结构完整，进食规律值得表扬 🍽️')
  if (!strengths.length) strengths.push('已经开始记录饮食了，这是改善的第一步 👏')

  // ---- 4. 缺点 / 问题项 ----
  const weaknesses = []
  overItems.forEach((i) => {
    if (i.key === 'calories') weaknesses.push(`全天热量 ${i.value} kcal，超出推荐值 ${i.target} kcal 约 ${i.percent - 100}%，容易造成脂肪囤积`)
    else if (i.key === 'sugar') weaknesses.push(`糖分摄入 ${i.value}g，超出建议上限 ${i.target}g，${sugarSourceHint(records)}`)
    else if (i.key === 'sodium') weaknesses.push(`钠摄入 ${i.value}mg，超过建议上限 ${i.target}mg，长期偏高会增加血压负担`)
    else if (i.key === 'fat') weaknesses.push(`脂肪摄入 ${i.value}g，高于建议值 ${i.target}g，建议减少油炸与肥肉`)
    else if (i.key === 'carb') weaknesses.push(`碳水化合物 ${i.value}g，超出建议区间上限 ${i.target}g`)
  })
  lowItems.forEach((i) => {
    if (i.key === 'calories') weaknesses.push(`全天热量仅 ${i.value} kcal，低于推荐值 ${i.target} kcal，长期过低会降低基础代谢`)
    else if (i.key === 'protein') weaknesses.push(`蛋白质仅 ${i.value}g，占目标值 ${i.percent}%，容易出现肌肉流失与乏力`)
    else if (i.key === 'fiber') weaknesses.push(`膳食纤维只有 ${i.value}g（目标 ${i.target}g），蔬果与全谷物摄入不足`)
    else if (i.key === 'water') weaknesses.push(`饮水仅 ${i.value}ml，距离目标 ${i.target}ml 还差 ${Math.max(0, i.target - i.value)}ml`)
    else if (i.key === 'carb') weaknesses.push(`碳水化合物 ${i.value}g，低于建议下限，能量供应可能不足`)
  })
  if (!records.length) weaknesses.push('今天还没有任何饮食记录，先记录一餐试试吧～')

  // ---- 5. 改进建议 ----
  const suggestions = []
  lowItems.forEach((i) => {
    if (i.key === 'protein') suggestions.push('加餐补充 1 个水煮蛋或 1 杯无糖酸奶，可增加约 7g 蛋白质 🥚')
    if (i.key === 'fiber') suggestions.push('午晚餐各增加一份深色蔬菜（西兰花 / 菠菜 / 生菜），轻松补足 8g 纤维 🥦')
    if (i.key === 'water') suggestions.push('每 1.5 小时喝 200ml 水，用带刻度水杯提醒自己 💧')
    if (i.key === 'calories') suggestions.push('适当增加主食与优质蛋白，避免长时间低能量状态 🍚')
  })
  overItems.forEach((i) => {
    if (i.key === 'sugar') suggestions.push('把含糖饮料换成气泡水或无糖茶，单这一项就能减少 30g 以上的糖 🥤')
    if (i.key === 'sodium') suggestions.push('少放酱油与酱料，用葱姜蒜、柠檬汁替代部分咸味 🧂')
    if (i.key === 'fat') suggestions.push('把煎炸改成蒸、煮、白灼，能显著降低脂肪摄入 🍳')
    if (i.key === 'calories') suggestions.push('晚餐保持七分饱，饭后散步 20 分钟帮助消耗 ✨')
  })
  if (!suggestions.length) suggestions.push('今天表现很棒，继续保持三餐规律、多喝水的好习惯 🌈')

  // ---- 6. AI 自然语言评语 ----
  const aiComment = buildAIComment({ grade, summary, targets, overItems, lowItems, mealsCovered, water })

  return {
    score,
    grade,
    detail,
    items,
    overItems,
    lowItems,
    okItems,
    strengths,
    weaknesses,
    suggestions,
    aiComment,
    mealsCovered
  }
}

/** 统计三餐覆盖情况 */
export function countMeals(records = []) {
  const covered = new Set(records.filter((r) => r.mealType !== '零食').map((r) => r.mealType))
  return { mealsCovered: covered.size, coveredMeals: [...covered] }
}

/** 推断糖分的主要来源食物（用于报告更「像 AI」） */
function sugarSourceHint(records = []) {
  const sorted = [...records].sort((a, b) => (b.nutrition?.sugar || 0) - (a.nutrition?.sugar || 0))
  const top = sorted[0]
  if (!top) return '建议减少含糖饮料与甜点'
  const per = Math.round((top.nutrition?.sugar || 0) * 100) / 100
  return `主要来源是${top.name}（贡献约 ${per}g 糖），建议替换为无糖饮品`
}

/**
 * 生成自然的 AI 评语（口语化、带情绪、有具体数据支撑）
 */
function buildAIComment({ grade, summary, targets, overItems, lowItems, mealsCovered, water }) {
  const parts = []

  // 开场：整体评价
  if (grade.key === 'excellent') parts.push(`今天表现非常棒 🏆 全天摄入 ${summary.calories} kcal，与推荐值 ${targets.calories} kcal 基本吻合，饮食结构相当均衡。`)
  else if (grade.key === 'good') parts.push(`今天整体不错 🌟 全天摄入 ${summary.calories} kcal，热量控制比较理想。`)
  else if (grade.key === 'pass') parts.push(`今天算是及格线水平 💡 全天摄入 ${summary.calories} kcal，营养结构还有几处需要补一补。`)
  else parts.push(`今天的饮食结构偏差有点大 ⚠️ 全天摄入 ${summary.calories} kcal，我们来逐项看看问题出在哪里。`)

  // 中段：超标提醒
  if (overItems.length) {
    const names = overItems.map((i) => `${i.label}（${i.value}${i.unit}，超出目标 ${i.percent - 100}%）`).join('、')
    parts.push(`需要重点注意的超标项是：${names}。`)
    const sugarItem = overItems.find((i) => i.key === 'sugar')
    if (sugarItem) parts.push('糖分超标往往来自奶茶、果汁、甜点这类「液体热量」，它们饱腹感差却很容易吃多。')
  }

  // 中段：缺口提醒
  if (lowItems.length) {
    const names = lowItems.map((i) => `${i.label}（${i.value}${i.unit} / 目标 ${i.target}${i.unit}）`).join('、')
    parts.push(`目前明显偏少的营养素是：${names}，建议下一餐优先补齐。`)
  }

  // 餐次完整性
  if (mealsCovered < 3) {
    parts.push(`今天只记录了 ${mealsCovered} 餐，还有餐次没有记录（或没有进食），规律三餐对稳定血糖与代谢非常重要。`)
  }

  // 饮水
  if (water < (targets.water || 1700) * 0.8) {
    parts.push(`饮水量 ${water}ml 偏少，距离 ${targets.water}ml 的目标还有差距，别忘了随时补水 💧`)
  }

  // 结尾鼓励
  if (grade.score >= 85) parts.push('继续保持这个节奏，你的饮食状态已经超过大多数人啦 👏')
  else if (grade.score >= 70) parts.push('只要把上面两三点调整好，明天就能看到明显的分数提升，加油 💪')
  else parts.push('不用着急，先从「少喝一杯含糖饮料 + 每餐加一份蔬菜」开始，一周后就能看到变化 🌱')

  return parts.join('')
}

/* ===================================================================
 * 六、食物健康评价（用于 AI 食物识别结果）
 * =================================================================== */

/**
 * 对单个食物做健康评价，输出标签与结论
 * @param {object} food 食物（每 100g 营养数据）
 * @param {number} _grams 实际分量（占位参数，评价基于每 100g 数据）
 */
export function evaluateFood(food, _grams) {
  if (!food) return { tags: [], flags: {}, comment: '', level: 'ok' }

  const flags = {
    highCalorie: food.calories > 250, // 高热量
    highFat: food.fat > 20, // 高脂
    highSugar: food.sugar > 15, // 高糖
    highSodium: food.sodium > 600, // 高钠
    lowCalorie: food.calories < 100, // 低热量
    goodProtein: food.protein >= 12, // 优质蛋白
    goodFiber: food.fiber >= 3 // 高纤维
  }

  const tags = []
  if (flags.highCalorie) tags.push({ label: '高热量', emoji: '🔥', type: 'danger' })
  if (flags.highFat) tags.push({ label: '高脂', emoji: '🧈', type: 'danger' })
  if (flags.highSugar) tags.push({ label: '高糖', emoji: '🍬', type: 'danger' })
  if (flags.highSodium) tags.push({ label: '高钠', emoji: '🧂', type: 'danger' })
  if (flags.goodProtein) tags.push({ label: '优质蛋白', emoji: '💪', type: 'good' })
  if (flags.goodFiber) tags.push({ label: '高纤维', emoji: '🌿', type: 'good' })
  if (flags.lowCalorie && !flags.highFat) tags.push({ label: '低热量', emoji: '🍃', type: 'good' })
  if (!tags.length) tags.push({ label: '营养适中', emoji: '⚖️', type: 'neutral' })

  // 综合等级：出现 2 个以上风险标签 → 需注意
  const dangerCount = tags.filter((t) => t.type === 'danger').length
  const level = dangerCount >= 2 ? 'bad' : dangerCount === 1 ? 'warn' : 'good'

  // 生成一句自然评价
  const sentences = []
  if (flags.goodProtein) sentences.push(`每 100g 含蛋白质 ${food.protein}g，是很好的优质蛋白来源`)
  if (flags.goodFiber) sentences.push(`膳食纤维 ${food.fiber}g/100g，有助于肠道健康与饱腹感`)
  if (flags.highSugar) sentences.push(`糖分高达 ${food.sugar}g/100g，属于典型的高糖食物`)
  if (flags.highFat) sentences.push(`脂肪 ${food.fat}g/100g 偏高，建议控制食用频率`)
  if (flags.highSodium) sentences.push(`钠 ${food.sodium}mg/100g 明显偏高，容易造成水钠潴留`)
  if (flags.highCalorie) sentences.push(`热量密度较高（${food.calories} kcal/100g）`)
  if (flags.lowCalorie && !flags.highFat) sentences.push(`热量很低（${food.calories} kcal/100g），可以放心多吃一点`)

  let comment = sentences.length ? `AI 评价：${sentences.join('，')}。` : 'AI 评价：营养结构较为均衡，适量食用没有负担。'
  if (level === 'bad') comment += '整体属于「需要控制」的食物，建议偶尔解馋、不要常吃 🙅'
  else if (level === 'warn') comment += '整体属于「适量即可」的食物，注意控制份量 ⚖️'
  else comment += '整体属于「推荐食用」的食物 👍'

  return { tags, flags, comment, level }
}

/* ===================================================================
 * 七、AI 膳食推荐
 * =================================================================== */

/**
 * 分析营养缺口，输出「需要重点补充 / 需要重点控制」的标记
 * @param {object} summary 当日已摄入
 * @param {object} targets 目标值
 */
export function analyzeGap(summary, targets) {
  const gap = {
    needProtein: false,
    needFiber: false,
    needCalories: false,
    cutSugar: false,
    cutSodium: false,
    cutFat: false,
    cutCalories: false,
    // 剩余可摄入热量（不低于 0）
    remainCalories: Math.max(0, Math.round((targets.calories || 0) - (summary.calories || 0)))
  }
  const r = (k) => (targets[k] > 0 ? (Number(summary[k]) || 0) / targets[k] : 0)

  if (r('protein') < 0.8) gap.needProtein = true
  if (r('fiber') < 0.8) gap.needFiber = true
  if (r('calories') < 0.8) gap.needCalories = true
  if (r('calories') > 1.2) gap.cutCalories = true
  if (r('sugar') > 1) gap.cutSugar = true
  if (r('sodium') > 1) gap.cutSodium = true
  if (r('fat') > 1) gap.cutFat = true

  // 缺口文案（用于页面提示）
  const notes = []
  if (gap.needProtein) notes.push('蛋白质缺口 🔴')
  if (gap.needFiber) notes.push('膳食纤维缺口 🌿')
  if (gap.cutSugar) notes.push('糖分需控制 🍬')
  if (gap.cutSodium) notes.push('钠需控制 🧂')
  if (gap.cutFat) notes.push('脂肪需控制 🧈')
  if (gap.cutCalories) notes.push('热量已超标 🔥')
  gap.notes = notes.length ? notes : ['营养状态均衡 ✅']

  return gap
}

/** 侧重标签 → 缺口标记的权重映射（用于给候选食谱打分） */
const FOCUS_WEIGHT = {
  高蛋白: { flag: 'needProtein', weight: 6 },
  高纤维: { flag: 'needFiber', weight: 6 },
  '低糖': { flag: 'cutSugar', weight: 5 },
  '低钠': { flag: 'cutSodium', weight: 4 },
  '低脂': { flag: 'cutFat', weight: 4 },
  控卡: { flag: 'cutCalories', weight: 5 },
  高能量: { flag: 'needCalories', weight: 5 }
}

/**
 * 对候选食谱打分（分数越高越适合当前缺口）
 */
function scoreRecipe(recipe, gap, targets, _summary) {
  let score = 0
  const reasons = []

  ;(recipe.focus || []).forEach((f) => {
    const conf = FOCUS_WEIGHT[f]
    if (conf && gap[conf.flag]) {
      score += conf.weight
      reasons.push(f)
    }
  })

  // 热量适配：单餐理想值 ≈ 每日目标的 1/3
  const idealPerMeal = (targets.calories || 2000) / 3
  const diff = Math.abs(recipe.nutrition.calories - idealPerMeal)
  score += clamp(3 - diff / 120, -3, 3)

  // 若全天热量已超标，高热量食谱额外降权
  if (gap.cutCalories && recipe.nutrition.calories > idealPerMeal) score -= 3
  // 若全天热量严重不足，高热量的高能量食谱加权
  if (gap.needCalories && recipe.nutrition.calories >= idealPerMeal) score += 2

  // 糖分 / 钠 已超标时，进一步惩罚高糖高钠食谱
  if (gap.cutSugar && recipe.nutrition.sugar > 12) score -= 3
  if (gap.cutSodium && recipe.nutrition.sodium > 500) score -= 3

  return { score: round1(score), reasons }
}

/**
 * 生成 AI 膳食推荐方案
 * @param {object} params
 * @param {object} params.profile 身体档案
 * @param {object} params.metrics 身体指标（含 targets / dailyCalories）
 * @param {object} params.summary 当日已摄入营养
 */
export function buildMealPlan({ profile, metrics, summary }) {
  const targets = metrics.targets
  const gap = analyzeGap(summary, targets)

  /** 从候选列表中挑出得分最高的食谱 */
  const pick = (list) => {
    const ranked = list
      .map((r) => ({ ...r, match: scoreRecipe(r, gap, targets, summary) }))
      .sort((a, b) => b.match.score - a.match.score)
    const best = ranked[0]
    const idealPerMeal = (targets.calories || 2000) / 3
    // 份量建议：若单餐食谱热量明显高于理想值，提示减量
    let portionNote = '标准份量'
    if (best.nutrition.calories > idealPerMeal * 1.15) portionNote = '建议按 80% 份量食用'
    else if (best.nutrition.calories < idealPerMeal * 0.7) portionNote = '可适量增加主食或蛋白'
    return { ...best, portionNote, alternatives: ranked.slice(1, 3) }
  }

  const breakfast = pick(BREAKFAST_RECIPES)
  const lunch = pick(LUNCH_RECIPES)
  const dinner = pick(DINNER_RECIPES)
  const fruit = pick(FRUIT_RECIPES)
  const snack = pick(SNACK_RECIPES)

  // 运动方案：按用户的活动强度匹配
  const workout = WORKOUT_PLANS[profile.activity] || WORKOUT_PLANS.sedentary

  // 推荐总热量（用于展示「今日推荐摄入」）
  const planCalories =
    breakfast.nutrition.calories + lunch.nutrition.calories + dinner.nutrition.calories + fruit.nutrition.calories + snack.nutrition.calories

  // 推荐理由（面向评委的「AI 决策解释」）
  const reasons = []
  if (gap.needProtein) reasons.push('当日蛋白质摄入不足，因此三餐优先选择高蛋白食材（鸡胸、鱼虾、鸡蛋、豆制品）')
  if (gap.needFiber) reasons.push('膳食纤维缺口明显，食谱中增加了全谷物、西兰花、菠菜等深色蔬菜')
  if (gap.cutSugar) reasons.push('糖分已超标，因此剔除了含糖饮料与甜点，改用新鲜水果满足甜味需求')
  if (gap.cutSodium) reasons.push('钠摄入偏高，推荐清蒸、白灼等少盐烹饪方式，并控制酱料用量')
  if (gap.cutFat) reasons.push('脂肪偏高，主菜以瘦肉与白肉为主，用蒸煮替代煎炸')
  if (gap.cutCalories) reasons.push('全天热量已超标，晚餐调整为低热量高饱腹组合，并加强运动消耗')
  if (gap.needCalories) reasons.push('全天热量偏低，适当增加主食与坚果，保证基础代谢与训练需求')
  if (!reasons.length) reasons.push('当日营养结构较为均衡，推荐以「维持 + 多样化」为主的均衡搭配')

  // 目标匹配度（用于展示推荐方案的达标情况）
  const planNutrition = {
    calories: breakfast.nutrition.calories + lunch.nutrition.calories + dinner.nutrition.calories + snack.nutrition.calories,
    protein: breakfast.nutrition.protein + lunch.nutrition.protein + dinner.nutrition.protein + snack.nutrition.protein,
    fiber: breakfast.nutrition.fiber + lunch.nutrition.fiber + dinner.nutrition.fiber + snack.nutrition.fiber
  }

  return {
    gap,
    breakfast,
    lunch,
    dinner,
    fruit,
    snack,
    workout,
    reasons,
    planCalories: Math.round(planCalories),
    planNutrition,
    remainder: {
      calories: gap.remainCalories,
      protein: Math.max(0, round1((targets.protein || 0) - (summary.protein || 0))),
      fiber: Math.max(0, round1((targets.fiber || 0) - (summary.fiber || 0)))
    }
  }
}

/* ===================================================================
 * 八、其它辅助计算
 * =================================================================== */

/** 计算 BMI 在健康区间中的可视化位置（0–100，用于刻度条） */
export function bmiBarPercent(bmi) {
  const v = Number(bmi) || 0
  // 视觉刻度：15 → 0%，35 → 100%
  return clamp(Math.round(((v - 15) / 20) * 100), 0, 100)
}

/** 数字格式化：千分位 */
export function formatNum(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN')
}

/** 计算一周平均摄入（用于整体统计） */
export function averageOf(list, key) {
  const arr = (list || []).map((n) => Number(n ? n[key] : 0) || 0).filter((n) => n > 0)
  if (!arr.length) return 0
  return round1(arr.reduce((a, b) => a + b, 0) / arr.length)
}

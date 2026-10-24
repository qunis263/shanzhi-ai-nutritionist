/**
 * AI Agent 工具集（前端执行）
 * ==================================================================
 * 本文件让「膳知助手」从「只会聊天」升级为「能动手查数据的 Agent」：
 *
 *   ① AGENT_TOOLS —— 以 OpenAI / 智谱兼容的 function calling 格式声明工具，
 *      随对话请求一起发给模型，由模型**自主决定**是否调用、调用哪一个；
 *   ② executeTool —— 真正执行工具的地方。所有数据源都在浏览器端：
 *      · Pinia dietStore（今日饮食 / 历史记录 / 膳食推荐）
 *      · Pinia userStore（身体档案 / BMI / BMR / TDEE）
 *      · FOOD_DB（915 条食物营养数据）
 *      因此工具必须在前端执行，服务端只负责「带着 tools 调模型」并回传 tool_calls。
 *   ③ TOOL_LABELS —— 中文展示名，用于把调用轨迹实时显示给用户，保证可解释。
 *
 * 安全边界：默认只读。唯一的写入型工具 add_diet_record 也不会直接落库，
 * 只生成「待确认记录卡片」，必须经用户在页面上二次确认后才真正写入 dietStore，
 * 防止模型误写或提示词注入造成的脏数据。
 */

import { searchFood } from '@/data/foods'

/* ===================================================================
 * 一、工具声明（发给模型的 JSON Schema）
 * =================================================================== */
export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_today_summary',
      description:
        '读取用户今天的营养摄入汇总、每日目标、健康评分与饮水情况。当用户问「我今天吃了多少 / 还差多少 / 今天吃得怎么样」时调用。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_diet_history',
      description:
        '读取用户最近若干天的饮食记录与每日营养汇总（含历史日期）。当用户问「昨天吃了什么 / 这周吃得怎么样」时调用。',
      parameters: {
        type: 'object',
        properties: {
          days: {
            type: 'integer',
            description: '要读取的天数，取值 1-7，默认 3（1 表示只看今天）'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_user_profile',
      description:
        '读取用户健康档案：性别、年龄、身高、体重、活动强度、减脂/增肌目标，以及由档案算出的 BMI、BMR、TDEE 与推荐摄入热量。当用户问「我的 BMI / 基础代谢 / 每天该吃多少」时调用。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_food_nutrition',
      description:
        '在食物营养库（915 条，支持名称与别名模糊检索）中查询某种食物每 100g 的热量与营养成分。当用户问「XX 热量多少 / XX 能减肥吗 / XX 有什么营养」时调用。',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '食物名称或别名，例如 鸡胸肉、奶茶、西兰花' },
          limit: { type: 'integer', description: '返回条数上限，1-10，默认 5' }
        },
        required: ['keyword']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_meal_plan',
      description:
        '获取系统依据用户当前营养缺口生成的今日膳食推荐（早/午/晚/加餐/水果、推荐理由与运动方案）。当用户问「我下一餐该吃什么 / 给我一份食谱」时调用。',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_diet_record',
      description:
        '在用户明确要求「帮我记录 / 记一下吃了什么」时调用，生成一条待确认的饮食记录卡片。注意：本工具不会直接写入，必须等用户在页面上点击「确认记录」后才会真正落库，因此调用后请告知用户去卡片上确认。',
      parameters: {
        type: 'object',
        properties: {
          foodName: { type: 'string', description: '食物名称，例如 牛奶、鸡胸肉、米饭' },
          grams: { type: 'integer', description: '食用量（克/ml），默认 100' },
          mealType: {
            type: 'string',
            enum: ['早餐', '午餐', '晚餐', '零食'],
            description: '餐次。缺省时按当前时间推断：5-10 点早餐，10-15 点午餐，15-21 点晚餐，其余时间为零食'
          }
        },
        required: ['foodName']
      }
    }
  }
]

/* ===================================================================
 * 二、工具中文展示名（用于对话中的调用轨迹）
 * =================================================================== */
export const TOOL_LABELS = {
  read_today_summary: { emoji: '📊', label: '读取今日营养汇总' },
  read_diet_history: { emoji: '📅', label: '读取历史饮食记录' },
  read_user_profile: { emoji: '🧬', label: '读取健康档案' },
  search_food_nutrition: { emoji: '🔍', label: '检索食物营养库' },
  get_meal_plan: { emoji: '🍱', label: '生成膳食推荐' },
  add_diet_record: { emoji: '📝', label: '记录饮食' }
}

/** 取工具展示信息（未知工具兜底） */
export function toolLabel(name) {
  return TOOL_LABELS[name] || { emoji: '🛠️', label: `调用 ${name}` }
}

/* ===================================================================
 * 三、本地执行器
 * =================================================================== */
/** 限制数值区间 */
function clamp(v, min, max) {
  const n = Number(v)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** 保留一位小数 */
function r1(n) {
  return Math.round((Number(n) || 0) * 10) / 10
}

/** 把营养合计压成紧凑对象，避免 tool 消息过长 */
function compactNutrition(n = {}) {
  return {
    kcal: Math.round(Number(n.calories) || 0),
    protein: r1(n.protein),
    fat: r1(n.fat),
    carb: r1(n.carb),
    fiber: r1(n.fiber),
    sugar: r1(n.sugar),
    sodium: Math.round(Number(n.sodium) || 0)
  }
}

/** 失败/占位结果 */
function fail(message) {
  return { ok: false, summary: message, content: message }
}

/** 合法餐次 */
const MEAL_TYPES = ['早餐', '午餐', '晚餐', '零食']

/** 按当前时间推断餐次：5-10 早餐 / 10-15 午餐 / 15-21 晚餐 / 其余零食 */
function inferMealType(date = new Date()) {
  const h = date.getHours()
  if (h >= 5 && h < 10) return '早餐'
  if (h >= 10 && h < 15) return '午餐'
  if (h >= 15 && h < 21) return '晚餐'
  return '零食'
}

/**
 * 执行一次工具调用
 * @param {string} name 工具名（来自模型返回的 tool_calls[].function.name）
 * @param {object} args 已解析的入参
 * @param {{dietStore: object, userStore: object}} ctx Pinia store 实例
 * @returns {{ok: boolean, summary: string, content: string}} content 会作为 tool 消息回填给模型
 */
export function executeTool(name, args = {}, ctx = {}) {
  const { dietStore, userStore } = ctx
  if (!dietStore || !userStore) return fail('工具运行环境未就绪（缺少数据源）')

  switch (name) {
    /* ---------- 今日营养汇总 ---------- */
    case 'read_today_summary': {
      const summary = dietStore.summary || {}
      const targets = dietStore.targets || {}
      const report = dietStore.report || {}
      const data = {
        日期: dietStore.todayKey,
        今日摄入: compactNutrition(summary),
        每日目标: compactNutrition(targets),
        饮水ml: Math.round(Number(dietStore.water) || 0),
        健康评分: report.score ?? null,
        评分等级: report.grade?.label || '',
        超标项: (report.overItems || []).map((i) => `${i.label} ${i.value}${i.unit}（目标 ${i.target}${i.unit}）`),
        偏少项: (report.lowItems || []).map((i) => `${i.label} ${i.value}${i.unit}（目标 ${i.target}${i.unit}）`),
        已记录食物: (dietStore.records || []).map((r) => `${r.mealType} ${r.name} ${r.grams}g`)
      }
      const kcal = Math.round(summary.calories || 0)
      const target = Math.round(targets.calories || 0)
      return {
        ok: true,
        summary: `今日 ${kcal} / 目标 ${target} kcal`,
        content: JSON.stringify(data)
      }
    }

    /* ---------- 最近 N 天饮食记录 ---------- */
    case 'read_diet_history': {
      const days = clamp(args.days || 3, 1, 7)
      const list = (dietStore.historyDays || []).slice(0, days)
      if (!list.length) return fail('没有可用的历史饮食记录')
      const data = list.map((d) => ({
        日期: d.date,
        星期: d.weekday,
        热量kcal: d.calories,
        目标kcal: d.target,
        蛋白质g: d.protein,
        脂肪g: d.fat,
        碳水g: d.carb,
        膳食纤维g: d.fiber,
        饮水ml: d.water,
        健康评分: d.score,
        记录: (d.records || []).map((r) => `${r.mealType} ${r.name} ${r.grams}g`)
      }))
      return {
        ok: true,
        summary: `读取最近 ${list.length} 天记录`,
        content: JSON.stringify(data)
      }
    }

    /* ---------- 健康档案与身体指标 ---------- */
    case 'read_user_profile': {
      const p = userStore.profile || {}
      const m = userStore.metrics || {}
      if (!Number(p.height) || !Number(p.weight)) {
        return {
          ok: true,
          summary: '用户尚未完成身体数据测评',
          content: '用户尚未填写身高体重，无法计算 BMI / BMR / TDEE。请引导其到「BMI/BMR 测评」页补充身体数据。'
        }
      }
      const goalText = { lose: '减脂', gain: '增肌', keep: '保持体重' }[p.goal] || '保持体重'
      const data = {
        性别: p.gender === 'female' ? '女' : '男',
        年龄: p.age,
        身高cm: p.height,
        体重kg: p.weight,
        活动强度: p.activity || '',
        目标: goalText,
        BMI: m.bmi,
        BMI判定: m.bmiGrade?.label || '',
        BMR基础代谢kcal: Math.round(m.bmr || 0),
        TDEE每日消耗kcal: Math.round(m.tdee || 0),
        推荐每日摄入kcal: Math.round(m.dailyCalories || 0),
        饮食模式: m.dietMode || '',
        模式说明: m.dietModeDesc || '',
        营养素目标: compactNutrition(m.targets || {})
      }
      return {
        ok: true,
        summary: `BMI ${m.bmi}（${m.bmiGrade?.label || '—'}）· 推荐 ${Math.round(m.dailyCalories || 0)} kcal`,
        content: JSON.stringify(data)
      }
    }

    /* ---------- 食物营养检索 ---------- */
    case 'search_food_nutrition': {
      const keyword = String(args.keyword || '').trim()
      if (!keyword) return fail('缺少检索关键词')
      const limit = clamp(args.limit || 5, 1, 10)
      const list = searchFood(keyword, limit)
      if (!list.length) {
        return {
          ok: true,
          summary: `未找到「${keyword}」`,
          content: `食物营养库中没有匹配「${keyword}」的条目，请不要编造数据，可换一个更通用的名称再查。`
        }
      }
      const data = list.map((f) => ({
        名称: f.name,
        分类: f.category,
        别名: (f.keywords || []).slice(0, 6),
        每100g: compactNutrition(f)
      }))
      return {
        ok: true,
        summary: `命中 ${list.length} 条：${list.slice(0, 3).map((f) => f.name).join('、')}`,
        content: JSON.stringify(data)
      }
    }

    /* ---------- 今日膳食推荐 ---------- */
    case 'get_meal_plan': {
      const plan = dietStore.mealPlan
      if (!plan) return fail('膳食推荐暂不可用')
      const pick = (meal) =>
        meal
          ? {
              名称: meal.name,
              热量kcal: Math.round(meal.nutrition?.calories || 0),
              蛋白质g: r1(meal.nutrition?.protein),
              份量建议: meal.portionNote || ''
            }
          : null
      const data = {
        早餐: pick(plan.breakfast),
        午餐: pick(plan.lunch),
        晚餐: pick(plan.dinner),
        水果: pick(plan.fruit),
        加餐: pick(plan.snack),
        推荐理由: plan.reasons || [],
        营养缺口: plan.gap?.notes || [],
        剩余可摄入kcal: plan.remainder?.calories ?? 0,
        运动建议: plan.workout?.label
          ? `${plan.workout.label}（${plan.workout.weekly || ''}）：${(plan.workout.items || [])
              .map((i) => `${i.name} ${i.duration}`)
              .join('、')}`
          : ''
      }
      const names = [plan.breakfast?.name, plan.lunch?.name, plan.dinner?.name].filter(Boolean)
      return {
        ok: true,
        summary: names.join(' / ') || '已生成膳食推荐',
        content: JSON.stringify(data)
      }
    }

    /* ---------- 记录饮食（写入型：只生成待确认卡片，不直接落库） ---------- */
    case 'add_diet_record': {
      const foodName = String(args.foodName || '').trim()
      if (!foodName) return fail('缺少食物名称')
      const hit = searchFood(foodName, 1)[0]
      if (!hit) {
        return {
          ok: false,
          summary: `未找到「${foodName}」`,
          content: `食物营养库中没有匹配「${foodName}」的条目，无法生成记录。请如实告知用户未找到该食物，可建议换一个更通用的名称，不要编造。`
        }
      }
      const grams = clamp(args.grams || 100, 1, 2000)
      const mealType = MEAL_TYPES.includes(args.mealType) ? args.mealType : inferMealType()
      const pending = {
        foodId: hit.id,
        name: hit.name,
        emoji: hit.emoji || '🍽️',
        grams,
        unit: hit.unit || '100g',
        mealType
      }
      // 关键安全设计：此处不调用 dietStore.addRecord，只返回 pending 供页面渲染确认卡片；
      // 编排层会把 needConfirm 透传给界面，真正的写入由 confirmAddDietRecord 在用户点击后执行
      return {
        ok: true,
        needConfirm: true,
        pending,
        summary: '待用户确认',
        content: JSON.stringify({
          待确认记录: { 餐次: mealType, 食物: hit.name, 份量: `${grams}${hit.unit === '100ml' ? 'ml' : 'g'}` },
          状态: '已生成待确认记录，等待用户在界面确认，尚未写入',
          给模型的指示: '请告诉用户记录卡片已准备好，请在卡片上点击「确认记录」完成写入；在用户确认前不要说「已记录」。'
        })
      }
    }

    default:
      return fail(`未知工具：${name}`)
  }
}

/**
 * 用户在页面确认后，真正写入饮食记录（唯一落库入口）
 * @param {{foodId: string, name: string, emoji: string, grams: number, unit: string, mealType: string}} pending 待确认记录
 * @param {object} dietStore Pinia dietStore 实例
 * @returns {{ok: boolean, summary: string}}
 */
export function confirmAddDietRecord(pending, dietStore) {
  if (!pending?.foodId || !dietStore) return { ok: false, summary: '记录已失效，请重新发起' }
  const rec = dietStore.addRecord({ mealType: pending.mealType, foodId: pending.foodId, grams: pending.grams })
  if (!rec) return { ok: false, summary: '写入失败：食物不存在' }
  return { ok: true, summary: `已记录到今日饮食：${rec.mealType} ${rec.name} ${rec.grams}${rec.unit === '100ml' ? 'ml' : 'g'}` }
}

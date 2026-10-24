/**
 * 历史饮食记录模拟数据（纯前端 Mock）
 * ------------------------------------------------------------------
 * 作用：让项目脱离后端也能有「一周历史数据」可供展示与答辩演示。
 *   1. 生成最近 7 天（不含今天）的完整饮食记录 → 供历史记录页 / 一周折线图 / 整体统计
 *   2. 生成「今天」的初始饮食记录 → 让 AI 营养报告、可视化大屏一打开就有数据
 *
 * 说明：所有数值均由本地食物数据库（foods.js）按分量换算得到，
 *      与用户后续手动录入的记录使用同一套计算逻辑，保证前后一致。
 */

import { findFood, scaleNutrition } from './foods'
import { formatDate, lastNDays } from '../utils/date'

/* =============================================================
 * 一、餐段与时间戳
 * ============================================================= */
export const MEAL_TYPES = ['早餐', '午餐', '晚餐', '零食']

/** 各餐段默认记录时间（用于展示，不影响计算） */
const MEAL_TIME = { 早餐: '07:40', 午餐: '12:10', 晚餐: '18:30', 零食: '15:20' }

/** 各餐段的 Emoji（全站统一） */
export const MEAL_EMOJI = { 早餐: '🌅', 午餐: '☀️', 晚餐: '🌙', 零食: '🍪', 饮水: '💧' }

/** 各餐段对应的马卡龙配色主题 */
export const MEAL_THEME = { 早餐: 'yellow', 午餐: 'orange', 晚餐: 'purple', 零食: 'cyan' }

/* =============================================================
 * 二、一周菜单模板（7 天各不相同，覆盖健康 / 外卖 / 素食 / 增肌等场景）
 *    格式：'食物id': 分量(g 或 ml)
 * ============================================================= */
const WEEK_MENUS = [
  {
    // 周一：健康均衡的一天（标杆数据）
    water: 1700,
    meals: {
      早餐: { oat: 40, milk_skim: 250, egg: 50, blueberry: 50 },
      午餐: { chicken_breast: 150, rice_brown: 150, broccoli: 150 },
      晚餐: { shrimp: 150, sweet_potato: 150, lettuce: 100 },
      零食: { yogurt_plain: 150, apple: 200 }
    }
  },
  {
    // 周二：外卖偏高油高糖
    water: 1150,
    meals: {
      早餐: { bread_white: 80, milk: 250 },
      午餐: { hamburger: 200, fries: 115, coke: 330 },
      晚餐: { noodle: 200, pork_loin: 100, tomato: 100 },
      零食: { chips: 70 }
    }
  },
  {
    // 周三：清淡素食日
    water: 1800,
    meals: {
      早餐: { sweet_potato: 200, soy_milk: 250 },
      午餐: { tofu: 200, rice_white: 150, spinach: 150 },
      晚餐: { mushroom: 100, corn: 150, cabbage: 150 },
      零食: { kiwi: 100, walnut: 20 }
    }
  },
  {
    // 周四：健身增肌日（高蛋白高能量）
    water: 2000,
    meals: {
      早餐: { egg: 100, bread_whole: 60, milk: 250, banana: 120 },
      午餐: { beef_lean: 200, rice_white: 200, broccoli: 200 },
      晚餐: { salmon: 150, rice_brown: 150, lettuce: 100, avocado: 50 },
      零食: { yogurt_plain: 150, cashew: 25 }
    }
  },
  {
    // 周五：奶茶零食过多的「踩坑日」
    water: 900,
    meals: {
      早餐: { bread_whole: 60, milk_tea: 500 },
      午餐: { pizza: 200, coke: 330 },
      晚餐: { instant_noodle: 120, egg: 50 },
      零食: { chocolate: 50, icecream: 100 }
    }
  },
  {
    // 周六：家常中餐
    water: 1600,
    meals: {
      早餐: { mantou: 100, soy_milk: 250, egg: 50 },
      午餐: { bass: 200, rice_white: 150, pepper_green: 100 },
      晚餐: { chicken_leg: 150, corn: 150, carrot: 100 },
      零食: { orange: 160, yogurt_plain: 150 }
    }
  },
  {
    // 周日：高蛋白低脂收尾
    water: 1900,
    meals: {
      早餐: { oat: 40, milk_skim: 250, egg: 100 },
      午餐: { chicken_breast: 200, sweet_potato: 200, broccoli: 150 },
      晚餐: { shrimp: 200, cabbage: 150, rice_brown: 100 },
      零食: { blueberry: 125, almond: 25 }
    }
  }
]

/** 今天（演示日）的初始记录：刻意留出「晚餐缺失 + 高糖零食」的缺口，方便 AI 报告分析 */
const TODAY_MENU = {
  water: 1000,
  meals: {
    早餐: { bread_whole: 60, milk: 250, egg: 50 },
    午餐: { chicken_breast: 150, rice_white: 150, broccoli: 100 },
    晚餐: {},
    零食: { milk_tea: 500 }
  }
}

/* =============================================================
 * 三、记录构造工具
 * ============================================================= */

/**
 * 把「{食物id: 分量}」转换为完整的饮食记录数组
 * @param {string} date 日期 'YYYY-MM-DD'
 * @param {object} meals 各餐段食物映射
 * @param {number} seed 随机盐（防止不同日期产生完全相同的 id）
 */
function buildRecords(date, meals, seed = 0) {
  const records = []
  MEAL_TYPES.forEach((mealType) => {
    const foods = meals[mealType] || {}
    Object.keys(foods).forEach((foodId, idx) => {
      const food = findFood(foodId)
      if (!food) return // 数据兜底：找不到食物则跳过，避免报错
      const grams = foods[foodId]
      records.push({
        id: `${date}-${mealType}-${foodId}-${seed}-${idx}`,
        date,
        mealType,
        time: MEAL_TIME[mealType],
        foodId: food.id,
        name: food.name,
        emoji: food.emoji,
        grams,
        unit: food.unit || '100g',
        // 按分量换算后的实际营养值
        nutrition: scaleNutrition(food, grams)
      })
    })
  })
  return records
}

/* =============================================================
 * 四、对外输出
 * ============================================================= */

/**
 * 最近 7 天历史记录（不含今天），按时间正序（最早的在前）
 * 返回结构：[{ date, weekday, records, water }, ...]
 */
export const HISTORY_DAYS = lastNDays(8)
  .slice(0, 7) // 取前 7 天（即昨天往前推 7 天）
  .map((date, i) => {
    const menu = WEEK_MENUS[i % WEEK_MENUS.length]
    return {
      date,
      records: buildRecords(date, menu.meals, i),
      water: menu.water
    }
  })

/**
 * 今天的初始记录（首次进入应用时写入 Store，用户可自由增删）
 */
export function createTodayRecords() {
  const date = formatDate(new Date())
  return {
    date,
    records: buildRecords(date, TODAY_MENU.meals, 99),
    water: TODAY_MENU.water
  }
}

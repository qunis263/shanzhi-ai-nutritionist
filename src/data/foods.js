/**
 * 食物营养数据库（每 100g 可食部）
 * ------------------------------------------------------------------
 * 数据用途：
 *   1. AI 食物图像识别的结果比对与营养标签生成
 *   2. 三餐饮食记录的营养自动累加
 *   3. 营养知识库「常见食物热量表」
 *   4. AI 膳食推荐的营养缺口计算
 *
 * 字段说明：
 *   id       唯一标识
 *   name     食物名称
 *   emoji    对应的 Emoji 图标（用于卡片视觉点缀）
 *   category 分类（主食 / 肉蛋 / 蔬菜 / 水果 / 乳品 / 豆制品 / 坚果 / 饮品 / 零食 / 快餐）
 *   unit     计量单位（默认 100g）
 *   calories 热量（kcal）
 *   protein  蛋白质（g）
 *   fat      脂肪（g）
 *   carb     碳水化合物（g）
 *   fiber    膳食纤维（g）
 *   sugar    糖分（g）
 *   sodium   钠（mg）
 *   keywords 识别关键词（模拟 AI 图像识别时的匹配词，中英文均可）
 *
 *   tags     多级分类标签（如 ['家常菜','川菜','高钠']），用于多维筛选与识别特征匹配
 *   source   数据来源标记：curated 手工整理 / seed 种子扩充 / generated 组合推算
 *
 * 数据库构成（三层合并，按名称自动去重）：
 *   1. BASE_FOOD_DB     —— 手工整理的基础食材与常见食品（数据最稳定）
 *   2. 种子扩充条目     —— foodSeeds.js / snackSeeds.js 中的家常菜、小吃、零食、饮品
 *   3. 组合推算条目     —— dishGenerator.js 由「食材 × 烹饪方式」推算生成（营养值可复算）
 *
 * 说明：所有数据为公开膳食成分参考值；推算条目由配方折算，仅供演示与学习使用。
 */

import { FRUIT_SEEDS, DISH_MEAT_SEEDS, DISH_VEG_SEEDS, STAPLE_SEEDS, SOUP_SEEDS, TAKEOUT_SEEDS, COVERAGE_SEEDS } from './foodSeeds'
import { PUFF_SNACK_SEEDS, BISCUIT_SEEDS, PASTRY_SEEDS, CANDY_SEEDS, DRIED_SEEDS, NUT_SEEDS, DRINK_SEEDS } from './snackSeeds'
import { generateComposedDishes } from './dishGenerator'

const BASE_FOOD_DB = [
  /* ================= 主食类 ================= */
  {
    id: 'rice_white',
    name: '白米饭',
    emoji: '🍚',
    category: '主食',
    unit: '100g',
    calories: 116,
    protein: 2.6,
    fat: 0.3,
    carb: 25.9,
    fiber: 0.3,
    sugar: 0.1,
    sodium: 2.4,
    keywords: ['米饭', '饭', 'rice', '白饭', '蒸饭']
  },
  {
    id: 'rice_brown',
    name: '糙米饭',
    emoji: '🍚',
    category: '主食',
    unit: '100g',
    calories: 112,
    protein: 2.8,
    fat: 0.9,
    carb: 23.1,
    fiber: 1.8,
    sugar: 0.4,
    sodium: 5,
    keywords: ['糙米', '杂粮饭', 'brown rice']
  },
  {
    id: 'bread_whole',
    name: '全麦面包',
    emoji: '🍞',
    category: '主食',
    unit: '100g',
    calories: 246,
    protein: 9,
    fat: 3.2,
    carb: 47,
    fiber: 6,
    sugar: 4.5,
    sodium: 400,
    keywords: ['全麦', '面包', '吐司', 'bread', 'toast']
  },
  {
    id: 'bread_white',
    name: '白面包',
    emoji: '🍞',
    category: '主食',
    unit: '100g',
    calories: 280,
    protein: 8.3,
    fat: 3.5,
    carb: 52,
    fiber: 2,
    sugar: 6,
    sodium: 460,
    keywords: ['白面包', '甜面包', '奶油面包']
  },
  {
    id: 'mantou',
    name: '馒头',
    emoji: '🍥',
    category: '主食',
    unit: '100g',
    calories: 223,
    protein: 7,
    fat: 1.1,
    carb: 47,
    fiber: 1.3,
    sugar: 1.5,
    sodium: 165,
    keywords: ['馒头', '包子皮', 'mantou']
  },
  {
    id: 'oat',
    name: '燕麦片',
    emoji: '🌾',
    category: '主食',
    unit: '100g',
    calories: 367,
    protein: 13.2,
    fat: 6.7,
    carb: 61,
    fiber: 9.7,
    sugar: 0.8,
    sodium: 4,
    keywords: ['燕麦', '麦片', 'oat', 'oats', '燕麦粥']
  },
  {
    id: 'noodle',
    name: '煮挂面',
    emoji: '🍜',
    category: '主食',
    unit: '100g',
    calories: 109,
    protein: 3.9,
    fat: 0.4,
    carb: 22.5,
    fiber: 0.8,
    sugar: 0.2,
    sodium: 180,
    keywords: ['面条', '挂面', '拉面', 'noodle', '清汤面']
  },
  {
    id: 'corn',
    name: '玉米',
    emoji: '🌽',
    category: '主食',
    unit: '100g',
    calories: 112,
    protein: 4,
    fat: 1.2,
    carb: 22.8,
    fiber: 2.9,
    sugar: 3.2,
    sodium: 1,
    keywords: ['玉米', '甜玉米', 'corn']
  },
  {
    id: 'sweet_potato',
    name: '红薯',
    emoji: '🍠',
    category: '主食',
    unit: '100g',
    calories: 86,
    protein: 1.6,
    fat: 0.2,
    carb: 20.1,
    fiber: 1.6,
    sugar: 4.5,
    sodium: 28,
    keywords: ['红薯', '地瓜', '番薯', 'sweet potato']
  },
  {
    id: 'potato',
    name: '土豆',
    emoji: '🥔',
    category: '主食',
    unit: '100g',
    calories: 77,
    protein: 2,
    fat: 0.2,
    carb: 17.2,
    fiber: 1.1,
    sugar: 0.8,
    sodium: 5,
    keywords: ['土豆', '马铃薯', 'potato', '洋芋']
  },

  /* ================= 肉蛋类 ================= */
  {
    id: 'chicken_breast',
    name: '鸡胸肉',
    emoji: '🍗',
    category: '肉蛋',
    unit: '100g',
    calories: 133,
    protein: 19.4,
    fat: 5,
    carb: 2.5,
    fiber: 0,
    sugar: 0,
    sodium: 34,
    keywords: ['鸡胸', '鸡胸肉', 'chicken breast', '鸡肉']
  },
  {
    id: 'chicken_leg',
    name: '鸡腿肉',
    emoji: '🍗',
    category: '肉蛋',
    unit: '100g',
    calories: 181,
    protein: 16,
    fat: 13,
    carb: 0,
    fiber: 0,
    sugar: 0,
    sodium: 85,
    keywords: ['鸡腿', '鸡翅', 'chicken leg']
  },
  {
    id: 'beef_lean',
    name: '瘦牛肉',
    emoji: '🥩',
    category: '肉蛋',
    unit: '100g',
    calories: 125,
    protein: 20.2,
    fat: 4.2,
    carb: 1.2,
    fiber: 0,
    sugar: 0,
    sodium: 84,
    keywords: ['牛肉', '牛排', 'beef', 'steak', '瘦牛']
  },
  {
    id: 'pork_belly',
    name: '五花肉',
    emoji: '🥓',
    category: '肉蛋',
    unit: '100g',
    calories: 508,
    protein: 9.3,
    fat: 53,
    carb: 0,
    fiber: 0,
    sugar: 0,
    sodium: 62,
    keywords: ['五花肉', '肥肉', '培根', 'bacon', 'pork belly', '红烧肉']
  },
  {
    id: 'pork_loin',
    name: '猪里脊',
    emoji: '🥩',
    category: '肉蛋',
    unit: '100g',
    calories: 155,
    protein: 20.2,
    fat: 7.9,
    carb: 0.7,
    fiber: 0,
    sugar: 0,
    sodium: 58,
    keywords: ['里脊', '猪肉', 'pork', '瘦肉']
  },
  {
    id: 'salmon',
    name: '三文鱼',
    emoji: '🐟',
    category: '肉蛋',
    unit: '100g',
    calories: 139,
    protein: 17.2,
    fat: 7.8,
    carb: 0,
    fiber: 0,
    sugar: 0,
    sodium: 60,
    keywords: ['三文鱼', '鲑鱼', 'salmon', '刺身']
  },
  {
    id: 'bass',
    name: '鲈鱼',
    emoji: '🐟',
    category: '肉蛋',
    unit: '100g',
    calories: 105,
    protein: 18.6,
    fat: 3.4,
    carb: 0,
    fiber: 0,
    sugar: 0,
    sodium: 144,
    keywords: ['鲈鱼', '清蒸鱼', '鱼肉', 'fish']
  },
  {
    id: 'shrimp',
    name: '基围虾',
    emoji: '🦐',
    category: '肉蛋',
    unit: '100g',
    calories: 93,
    protein: 18.6,
    fat: 0.8,
    carb: 2.8,
    fiber: 0,
    sugar: 0,
    sodium: 165,
    keywords: ['虾', '基围虾', 'shrimp', '白灼虾']
  },
  {
    id: 'egg',
    name: '鸡蛋',
    emoji: '🥚',
    category: '肉蛋',
    unit: '100g',
    calories: 143,
    protein: 13.3,
    fat: 8.8,
    carb: 2.8,
    fiber: 0,
    sugar: 0.9,
    sodium: 131,
    keywords: ['鸡蛋', '水煮蛋', 'egg', '煎蛋', '蛋']
  },
  {
    id: 'duck_egg',
    name: '鸭蛋',
    emoji: '🥚',
    category: '肉蛋',
    unit: '100g',
    calories: 180,
    protein: 12.6,
    fat: 13,
    carb: 3.1,
    fiber: 0,
    sugar: 0,
    sodium: 106,
    keywords: ['鸭蛋', '咸鸭蛋']
  },

  /* ================= 蔬菜类 ================= */
  {
    id: 'broccoli',
    name: '西兰花',
    emoji: '🥦',
    category: '蔬菜',
    unit: '100g',
    calories: 36,
    protein: 4.1,
    fat: 0.6,
    carb: 4.3,
    fiber: 1.6,
    sugar: 1.5,
    sodium: 18,
    keywords: ['西兰花', '西蓝花', '花椰菜', 'broccoli']
  },
  {
    id: 'spinach',
    name: '菠菜',
    emoji: '🥬',
    category: '蔬菜',
    unit: '100g',
    calories: 28,
    protein: 2.6,
    fat: 0.3,
    carb: 4.5,
    fiber: 1.7,
    sugar: 0.4,
    sodium: 85,
    keywords: ['菠菜', 'spinach', '青菜']
  },
  {
    id: 'lettuce',
    name: '生菜',
    emoji: '🥬',
    category: '蔬菜',
    unit: '100g',
    calories: 16,
    protein: 1.3,
    fat: 0.3,
    carb: 2,
    fiber: 0.7,
    sugar: 0.5,
    sodium: 32,
    keywords: ['生菜', '沙拉菜', 'lettuce', '油麦菜']
  },
  {
    id: 'tomato',
    name: '番茄',
    emoji: '🍅',
    category: '蔬菜',
    unit: '100g',
    calories: 20,
    protein: 0.9,
    fat: 0.2,
    carb: 4,
    fiber: 0.5,
    sugar: 2.5,
    sodium: 5,
    keywords: ['番茄', '西红柿', 'tomato']
  },
  {
    id: 'cucumber',
    name: '黄瓜',
    emoji: '🥒',
    category: '蔬菜',
    unit: '100g',
    calories: 16,
    protein: 0.8,
    fat: 0.2,
    carb: 2.9,
    fiber: 0.5,
    sugar: 1.6,
    sodium: 5,
    keywords: ['黄瓜', '青瓜', 'cucumber']
  },
  {
    id: 'carrot',
    name: '胡萝卜',
    emoji: '🥕',
    category: '蔬菜',
    unit: '100g',
    calories: 39,
    protein: 1,
    fat: 0.2,
    carb: 8.8,
    fiber: 1.1,
    sugar: 4.5,
    sodium: 27,
    keywords: ['胡萝卜', 'carrot']
  },
  {
    id: 'pepper_green',
    name: '青椒',
    emoji: '🫑',
    category: '蔬菜',
    unit: '100g',
    calories: 22,
    protein: 1.4,
    fat: 0.3,
    carb: 5.4,
    fiber: 1.4,
    sugar: 2.4,
    sodium: 3,
    keywords: ['青椒', '彩椒', 'pepper']
  },
  {
    id: 'eggplant',
    name: '茄子',
    emoji: '🍆',
    category: '蔬菜',
    unit: '100g',
    calories: 23,
    protein: 1.1,
    fat: 0.2,
    carb: 4.9,
    fiber: 1.3,
    sugar: 2.4,
    sodium: 6,
    keywords: ['茄子', 'eggplant']
  },
  {
    id: 'mushroom',
    name: '蘑菇',
    emoji: '🍄',
    category: '蔬菜',
    unit: '100g',
    calories: 24,
    protein: 2.7,
    fat: 0.1,
    carb: 4.1,
    fiber: 2.1,
    sugar: 2,
    sodium: 8,
    keywords: ['蘑菇', '香菇', '金针菇', 'mushroom']
  },
  {
    id: 'cabbage',
    name: '大白菜',
    emoji: '🥬',
    category: '蔬菜',
    unit: '100g',
    calories: 20,
    protein: 1.5,
    fat: 0.1,
    carb: 3.4,
    fiber: 0.8,
    sugar: 1.2,
    sodium: 57,
    keywords: ['白菜', '大白菜', 'cabbage']
  },

  /* ================= 水果类 ================= */
  {
    id: 'apple',
    name: '苹果',
    emoji: '🍎',
    category: '水果',
    unit: '100g',
    calories: 53,
    protein: 0.4,
    fat: 0.2,
    carb: 13.7,
    fiber: 1.7,
    sugar: 10.3,
    sodium: 1.6,
    keywords: ['苹果', 'apple', '红富士']
  },
  {
    id: 'banana',
    name: '香蕉',
    emoji: '🍌',
    category: '水果',
    unit: '100g',
    calories: 93,
    protein: 1.4,
    fat: 0.2,
    carb: 22,
    fiber: 1.2,
    sugar: 12.2,
    sodium: 1,
    keywords: ['香蕉', 'banana']
  },
  {
    id: 'orange',
    name: '橙子',
    emoji: '🍊',
    category: '水果',
    unit: '100g',
    calories: 48,
    protein: 0.8,
    fat: 0.2,
    carb: 11.1,
    fiber: 1,
    sugar: 9.1,
    sodium: 0,
    keywords: ['橙子', '橘子', 'orange', '脐橙']
  },
  {
    id: 'grape',
    name: '葡萄',
    emoji: '🍇',
    category: '水果',
    unit: '100g',
    calories: 45,
    protein: 0.5,
    fat: 0.2,
    carb: 10.3,
    fiber: 0.4,
    sugar: 8.9,
    sodium: 1,
    keywords: ['葡萄', '提子', 'grape']
  },
  {
    id: 'blueberry',
    name: '蓝莓',
    emoji: '🫐',
    category: '水果',
    unit: '100g',
    calories: 57,
    protein: 0.7,
    fat: 0.3,
    carb: 14.5,
    fiber: 2.4,
    sugar: 10,
    sodium: 1,
    keywords: ['蓝莓', 'blueberry']
  },
  {
    id: 'watermelon',
    name: '西瓜',
    emoji: '🍉',
    category: '水果',
    unit: '100g',
    calories: 26,
    protein: 0.6,
    fat: 0.1,
    carb: 6.8,
    fiber: 0.3,
    sugar: 6.2,
    sodium: 3,
    keywords: ['西瓜', 'watermelon']
  },
  {
    id: 'strawberry',
    name: '草莓',
    emoji: '🍓',
    category: '水果',
    unit: '100g',
    calories: 32,
    protein: 1,
    fat: 0.2,
    carb: 7.1,
    fiber: 1.1,
    sugar: 4.9,
    sodium: 4,
    keywords: ['草莓', 'strawberry']
  },
  {
    id: 'kiwi',
    name: '猕猴桃',
    emoji: '🥝',
    category: '水果',
    unit: '100g',
    calories: 61,
    protein: 0.8,
    fat: 0.6,
    carb: 14.5,
    fiber: 2.6,
    sugar: 9,
    sodium: 3,
    keywords: ['猕猴桃', '奇异果', 'kiwi']
  },
  {
    id: 'mango',
    name: '芒果',
    emoji: '🥭',
    category: '水果',
    unit: '100g',
    calories: 60,
    protein: 0.6,
    fat: 0.2,
    carb: 15,
    fiber: 1.6,
    sugar: 14,
    sodium: 2,
    keywords: ['芒果', 'mango']
  },
  {
    id: 'avocado',
    name: '牛油果',
    emoji: '🥑',
    category: '水果',
    unit: '100g',
    calories: 171,
    protein: 2,
    fat: 15.3,
    carb: 7.4,
    fiber: 5.7,
    sugar: 0.7,
    sodium: 7,
    keywords: ['牛油果', '鳄梨', 'avocado']
  },

  /* ================= 乳品类 ================= */
  {
    id: 'milk',
    name: '全脂牛奶',
    emoji: '🥛',
    category: '乳品',
    unit: '100ml',
    calories: 65,
    protein: 3.3,
    fat: 3.6,
    carb: 4.9,
    fiber: 0,
    sugar: 4.8,
    sodium: 37,
    keywords: ['牛奶', 'milk', '纯牛奶']
  },
  {
    id: 'milk_skim',
    name: '脱脂牛奶',
    emoji: '🥛',
    category: '乳品',
    unit: '100ml',
    calories: 34,
    protein: 3.4,
    fat: 0.3,
    carb: 4.9,
    fiber: 0,
    sugar: 4.9,
    sodium: 42,
    keywords: ['脱脂奶', '脱脂牛奶', '低脂奶']
  },
  {
    id: 'yogurt_plain',
    name: '无糖酸奶',
    emoji: '🥣',
    category: '乳品',
    unit: '100g',
    calories: 60,
    protein: 3.5,
    fat: 3.2,
    carb: 4.5,
    fiber: 0,
    sugar: 4,
    sodium: 45,
    keywords: ['酸奶', '无糖酸奶', 'yogurt', '希腊酸奶']
  },
  {
    id: 'yogurt_flavor',
    name: '风味酸奶',
    emoji: '🥣',
    category: '乳品',
    unit: '100g',
    calories: 90,
    protein: 2.8,
    fat: 2.6,
    carb: 13,
    fiber: 0,
    sugar: 12.5,
    sodium: 60,
    keywords: ['果味酸奶', '风味酸奶', '草莓酸奶']
  },
  {
    id: 'cheese',
    name: '奶酪',
    emoji: '🧀',
    category: '乳品',
    unit: '100g',
    calories: 328,
    protein: 25.7,
    fat: 23.5,
    carb: 3.5,
    fiber: 0,
    sugar: 1,
    sodium: 584,
    keywords: ['奶酪', '芝士', 'cheese']
  },

  /* ================= 豆制品类 ================= */
  {
    id: 'tofu',
    name: '北豆腐',
    emoji: '⬜',
    category: '豆制品',
    unit: '100g',
    calories: 82,
    protein: 8.1,
    fat: 3.7,
    carb: 4.2,
    fiber: 0.4,
    sugar: 0.6,
    sodium: 7,
    keywords: ['豆腐', '北豆腐', 'tofu', '麻婆豆腐']
  },
  {
    id: 'soy_milk',
    name: '无糖豆浆',
    emoji: '🥛',
    category: '豆制品',
    unit: '100ml',
    calories: 31,
    protein: 3,
    fat: 1.6,
    carb: 1.2,
    fiber: 1.1,
    sugar: 0.5,
    sodium: 3,
    keywords: ['豆浆', 'soy milk', '豆奶']
  },
  {
    id: 'soybean',
    name: '黄豆',
    emoji: '🫘',
    category: '豆制品',
    unit: '100g',
    calories: 390,
    protein: 35,
    fat: 16,
    carb: 34,
    fiber: 15.5,
    sugar: 7,
    sodium: 2,
    keywords: ['黄豆', '大豆', 'soybean']
  },

  /* ================= 坚果类 ================= */
  {
    id: 'almond',
    name: '杏仁',
    emoji: '🌰',
    category: '坚果',
    unit: '100g',
    calories: 578,
    protein: 21,
    fat: 50,
    carb: 20,
    fiber: 12,
    sugar: 4,
    sodium: 1,
    keywords: ['杏仁', '巴旦木', 'almond']
  },
  {
    id: 'walnut',
    name: '核桃',
    emoji: '🌰',
    category: '坚果',
    unit: '100g',
    calories: 646,
    protein: 14.9,
    fat: 58.8,
    carb: 19.1,
    fiber: 9.5,
    sugar: 2.6,
    sodium: 6,
    keywords: ['核桃', 'walnut']
  },
  {
    id: 'cashew',
    name: '腰果',
    emoji: '🌰',
    category: '坚果',
    unit: '100g',
    calories: 559,
    protein: 17.3,
    fat: 37,
    carb: 41,
    fiber: 3.6,
    sugar: 6,
    sodium: 251,
    keywords: ['腰果', 'cashew']
  },
  {
    id: 'peanut',
    name: '花生',
    emoji: '🥜',
    category: '坚果',
    unit: '100g',
    calories: 574,
    protein: 24.8,
    fat: 44.3,
    carb: 21.7,
    fiber: 5.5,
    sugar: 4,
    sodium: 3,
    keywords: ['花生', 'peanut', '花生米']
  },

  /* ================= 饮品类 ================= */
  {
    id: 'coffee_black',
    name: '黑咖啡',
    emoji: '☕',
    category: '饮品',
    unit: '100ml',
    calories: 2,
    protein: 0.1,
    fat: 0,
    carb: 0.3,
    fiber: 0,
    sugar: 0,
    sodium: 2,
    keywords: ['黑咖啡', '美式', 'coffee', '美式咖啡']
  },
  {
    id: 'coke',
    name: '可乐',
    emoji: '🥤',
    category: '饮品',
    unit: '100ml',
    calories: 43,
    protein: 0,
    fat: 0,
    carb: 10.6,
    fiber: 0,
    sugar: 10.6,
    sodium: 4,
    keywords: ['可乐', '汽水', 'coke', 'cola', '碳酸饮料']
  },
  {
    id: 'milk_tea',
    name: '珍珠奶茶',
    emoji: '🧋',
    category: '饮品',
    unit: '100ml',
    calories: 95,
    protein: 1,
    fat: 3.5,
    carb: 15.5,
    fiber: 0,
    sugar: 13,
    sodium: 35,
    keywords: ['奶茶', '珍珠奶茶', 'milk tea', '波霸']
  },
  {
    id: 'orange_juice',
    name: '橙汁',
    emoji: '🧃',
    category: '饮品',
    unit: '100ml',
    calories: 45,
    protein: 0.7,
    fat: 0.2,
    carb: 10.4,
    fiber: 0.2,
    sugar: 8.4,
    sodium: 1,
    keywords: ['橙汁', '果汁', 'juice', '鲜橙汁']
  },
  {
    id: 'beer',
    name: '啤酒',
    emoji: '🍺',
    category: '饮品',
    unit: '100ml',
    calories: 43,
    protein: 0.3,
    fat: 0,
    carb: 3.6,
    fiber: 0,
    sugar: 0,
    sodium: 4,
    keywords: ['啤酒', 'beer', '精酿']
  },

  /* ================= 零食 / 快餐类 ================= */
  {
    id: 'chips',
    name: '薯片',
    emoji: '🍟',
    category: '零食',
    unit: '100g',
    calories: 548,
    protein: 6.6,
    fat: 35,
    carb: 53,
    fiber: 4.4,
    sugar: 2.5,
    sodium: 585,
    keywords: ['薯片', 'chips', '薯条袋装']
  },
  {
    id: 'fried_chicken',
    name: '炸鸡',
    emoji: '🍗',
    category: '快餐',
    unit: '100g',
    calories: 279,
    protein: 19,
    fat: 17,
    carb: 12,
    fiber: 0.5,
    sugar: 0.3,
    sodium: 620,
    keywords: ['炸鸡', 'fried chicken', '韩式炸鸡', '鸡米花']
  },
  {
    id: 'hamburger',
    name: '汉堡',
    emoji: '🍔',
    category: '快餐',
    unit: '100g',
    calories: 295,
    protein: 13,
    fat: 14,
    carb: 30,
    fiber: 1.7,
    sugar: 5.5,
    sodium: 500,
    keywords: ['汉堡', 'burger', 'hamburger', '双层堡']
  },
  {
    id: 'pizza',
    name: '披萨',
    emoji: '🍕',
    category: '快餐',
    unit: '100g',
    calories: 268,
    protein: 11,
    fat: 10,
    carb: 33,
    fiber: 2.3,
    sugar: 3.8,
    sodium: 600,
    keywords: ['披萨', 'pizza', '比萨']
  },
  {
    id: 'chocolate',
    name: '巧克力',
    emoji: '🍫',
    category: '零食',
    unit: '100g',
    calories: 589,
    protein: 5.5,
    fat: 42,
    carb: 53,
    fiber: 7,
    sugar: 51,
    sodium: 24,
    keywords: ['巧克力', 'chocolate', '黑巧']
  },
  {
    id: 'cake',
    name: '奶油蛋糕',
    emoji: '🍰',
    category: '零食',
    unit: '100g',
    calories: 347,
    protein: 5,
    fat: 15,
    carb: 51,
    fiber: 1,
    sugar: 32,
    sodium: 220,
    keywords: ['蛋糕', 'cake', '奶油蛋糕', '甜品']
  },
  {
    id: 'icecream',
    name: '冰淇淋',
    emoji: '🍦',
    category: '零食',
    unit: '100g',
    calories: 207,
    protein: 3.5,
    fat: 11,
    carb: 24,
    fiber: 0.7,
    sugar: 21,
    sodium: 80,
    keywords: ['冰淇淋', 'ice cream', '雪糕']
  },
  {
    id: 'fries',
    name: '炸薯条',
    emoji: '🍟',
    category: '快餐',
    unit: '100g',
    calories: 312,
    protein: 4,
    fat: 15,
    carb: 41,
    fiber: 3.8,
    sugar: 0.3,
    sodium: 210,
    keywords: ['薯条', 'fries', '炸薯条']
  },
  {
    id: 'instant_noodle',
    name: '方便面',
    emoji: '🍜',
    category: '快餐',
    unit: '100g',
    calories: 472,
    protein: 9.5,
    fat: 20,
    carb: 62,
    fiber: 2.5,
    sugar: 2.8,
    sodium: 1800,
    keywords: ['方便面', '泡面', 'instant noodle', '拉面桶']
  },
  {
    id: 'spicy_strip',
    name: '辣条',
    emoji: '🌶️',
    category: '零食',
    unit: '100g',
    calories: 480,
    protein: 12,
    fat: 28,
    carb: 45,
    fiber: 4,
    sugar: 6,
    sodium: 2200,
    keywords: ['辣条', '辣片', '零食辣条']
  }
]

/* ===================================================================
 * 数据合并：手工整理 + 种子扩充 + 组合推算 → 统一 FOOD_DB
 * =================================================================== */

/** 以 100ml 计量的分类（饮品与酒类按体积标注） */
const VOLUME_CATEGORIES = new Set(['饮品', '酒类'])

/**
 * 为手工整理的基础条目补齐 tags / source 字段，保证全库结构一致
 */
function normalizeCurated(food) {
  return {
    ...food,
    tags: food.tags || [],
    source: 'curated'
  }
}

/**
 * 把紧凑元组种子展开为完整食物对象
 * @param {Array} seeds 种子元组数组
 * @param {string} source 来源标记
 */
function expandSeeds(seeds, source) {
  return seeds.map(([id, name, emoji, category, n, keywords, tags]) => ({
    id,
    name,
    emoji,
    category,
    unit: VOLUME_CATEGORIES.has(category) ? '100ml' : '100g',
    calories: n[0],
    protein: n[1],
    fat: n[2],
    carb: n[3],
    fiber: n[4],
    sugar: n[5],
    sodium: n[6],
    keywords,
    tags: tags || [],
    source
  }))
}

/** 种子条目（家常菜 / 小吃 / 零食 / 饮品 / 热带水果） */
const SEED_FOODS = [
  ...expandSeeds(FRUIT_SEEDS, 'seed'),
  ...expandSeeds(DISH_MEAT_SEEDS, 'seed'),
  ...expandSeeds(DISH_VEG_SEEDS, 'seed'),
  ...expandSeeds(STAPLE_SEEDS, 'seed'),
  ...expandSeeds(SOUP_SEEDS, 'seed'),
  ...expandSeeds(TAKEOUT_SEEDS, 'seed'),
  ...expandSeeds(PUFF_SNACK_SEEDS, 'seed'),
  ...expandSeeds(BISCUIT_SEEDS, 'seed'),
  ...expandSeeds(PASTRY_SEEDS, 'seed'),
  ...expandSeeds(CANDY_SEEDS, 'seed'),
  ...expandSeeds(DRIED_SEEDS, 'seed'),
  ...expandSeeds(NUT_SEEDS, 'seed'),
  ...expandSeeds(DRINK_SEEDS, 'seed'),
  ...expandSeeds(COVERAGE_SEEDS, 'seed')
]

/** 组合推算条目（食材 × 烹饪方式） */
const COMPOSED_FOODS = generateComposedDishes()

/**
 * 最终食物库：三层合并后按「名称 + id」双重去重
 * 去重规则保证：组合推算条目若与手写条目同名（如「清蒸鲈鱼」），以手写条目为准
 */
export const FOOD_DB = (() => {
  const seenName = new Set()
  const seenId = new Set()
  const result = []
  const layers = [
    BASE_FOOD_DB.map(normalizeCurated), // 第 1 层：手工整理（优先级最高）
    SEED_FOODS, // 第 2 层：种子扩充
    COMPOSED_FOODS // 第 3 层：组合推算
  ]
  layers.forEach((layer) => {
    layer.forEach((food) => {
      if (seenName.has(food.name) || seenId.has(food.id)) return
      seenName.add(food.name)
      seenId.add(food.id)
      result.push(food)
    })
  })
  return result
})()

/* ================= 便捷索引与查询工具 ================= */

/** 按 id 快速查找食物 */
export const FOOD_MAP = FOOD_DB.reduce((acc, item) => {
  acc[item.id] = item
  return acc
}, {})

/** 全部分类列表（去重，用于筛选） */
export const FOOD_CATEGORIES = ['全部', ...new Set(FOOD_DB.map((f) => f.category))]

/** 全部标签列表（去重，用于多维筛选） */
export const FOOD_TAGS = [...new Set(FOOD_DB.flatMap((f) => f.tags || []))]

/** 数据库规模统计（用于界面展示与答辩说明） */
export const FOOD_STATS = {
  total: FOOD_DB.length,
  curated: FOOD_DB.filter((f) => f.source === 'curated').length,
  seed: FOOD_DB.filter((f) => f.source === 'seed').length,
  generated: FOOD_DB.filter((f) => f.source === 'generated').length,
  categories: FOOD_CATEGORIES.length - 1,
  tags: FOOD_TAGS.length
}

/**
 * 根据 id 获取食物对象（带兜底，避免 undefined 造成渲染报错）
 * @param {string} id
 */
export function findFood(id) {
  return FOOD_MAP[id] || null
}

/**
 * 把一条食物记录的全部可检索文本（名称 / 分类 / 关键词 / 标签）拼成数组
 * 供检索与识别引擎复用的统一入口
 * @param {object} food
 */
export function foodSearchTexts(food) {
  return [food.name, food.category, ...(food.keywords || []), ...(food.tags || [])]
}

/**
 * 模糊搜索食物（v2 加权检索）
 * ------------------------------------------------------------------
 * 相比 v1 的「整串子串匹配」，v2 解决了这三类真实痛点：
 *   ① 「蛋炒饭」搜不到 —— 现在按「别名 / 做法组合名」双向包含匹配；
 *   ② 「西红柿炒蛋」能命中「番茄炒蛋」—— 支持「查询串包含别名」的反向匹配；
 *   ③ 结果不分轻重 —— 采用加权评分排序（完全同名 > 名称开头 > 名称包含 > 别名 > 标签），
 *      同名越短越靠前，避免「西瓜」被「西瓜汁」这类长名压在后面。
 *
 * @param {string} keyword 搜索词（空值返回库中前 limit 条）
 * @param {number} limit 返回条数上限；传入 `0` 或负数表示不限条数（用于「浏览全库」）
 * @returns {Array} 按相关度降序排列的食物数组
 */
export function searchFood(keyword, limit = 30) {
  const kw = String(keyword || '').trim().toLowerCase()
  // limit <= 0 → 返回全部条目（分类浏览 / 「全部」列表需要完整数据）
  if (!kw) return limit > 0 ? FOOD_DB.slice(0, limit) : FOOD_DB.slice()

  const scored = []
  FOOD_DB.forEach((food) => {
    let score = 0

    const name = food.name.toLowerCase()
    if (name === kw) {
      score = 100 // 完全同名，最高优先
    } else if (name.startsWith(kw)) {
      score = 88 // 名称以关键词开头
    } else if (name.includes(kw)) {
      score = 76 // 名称包含关键词
    } else if (kw.includes(name)) {
      // 查询串包含食物名（处理「西红柿炒蛋」→「番茄炒蛋」这类长查询）
      score = 60
    }

    // 关键词 / 别名匹配（单字关键词如「蛋」不参与反向包含，避免「高蛋白」误命中鸡蛋）
    if (!score) {
      const keywords = (food.keywords || []).map((k) => String(k).toLowerCase())
      if (keywords.some((k) => k === kw)) score = 72
      else if (keywords.some((k) => k.includes(kw) || (k.length >= 2 && kw.includes(k)))) score = 54
    }

    // 标签匹配（如搜「减脂餐」「高蛋白」「外卖」）
    if (!score) {
      const tags = (food.tags || []).map((t) => String(t).toLowerCase())
      if (tags.some((t) => t.includes(kw) || (t.length >= 2 && kw.includes(t)))) score = 36
    }

    // 分类匹配（如搜「水果」「汤羹」）
    if (!score && food.category.toLowerCase().includes(kw)) score = 30

    if (score > 0) {
      // 同分时短名称优先（更接近用户意图的「基础条目」）
      scored.push({ food, score: score * 1000 - food.name.length })
    }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit > 0 ? limit : undefined)
    .map((item) => item.food)
}

/**
 * 计算指定食物在指定分量下的实际营养值
 * @param {object} food 食物对象
 * @param {number} grams 分量（克 / 毫升）
 * @returns 该分量下的营养数据
 */
export function scaleNutrition(food, grams) {
  const ratio = Number(grams || 0) / 100
  return {
    calories: round1(food.calories * ratio),
    protein: round1(food.protein * ratio),
    fat: round1(food.fat * ratio),
    carb: round1(food.carb * ratio),
    fiber: round1(food.fiber * ratio),
    sugar: round1(food.sugar * ratio),
    sodium: round1(food.sodium * ratio)
  }
}

/** 保留一位小数（避免浮点误差导致界面出现 12.300000001） */
function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10
}

/**
 * 营养知识库数据
 * ------------------------------------------------------------------
 * 包含四大板块：
 *   1. CALORIE_TABLE      精选常见食物热量表（人工整理，含常见分量与运动消耗参考）
 *      CALORIE_TABLE_FULL 完整热量表（精选表 + 由食物数据库自动派生的全量条目）
 *   2. SCIENCE_ARTICLES   减脂 / 增肌科普文章
 *   3. FOOD_CONFLICTS     食物相克（民间说法 + 科学解释）
 *   4. HEALTHY_HABITS     健康饮食习惯清单
 */

import { FOOD_DB } from './foods'

/* ===================================================================
 * 一、常见食物热量表（精选）
 * portion  常见食用分量
 * calories 该分量对应的热量（kcal）
 * burnMin  大约需要慢跑多少分钟才能消耗（按 60kg 成人 8km/h 慢跑 ≈ 8.5kcal/分钟 估算）
 * =================================================================== */
const CURATED_CALORIE_TABLE = [
  { name: '白米饭', emoji: '🍚', category: '主食', portion: '1 碗(150g)', calories: 174, burnMin: 20 },
  { name: '馒头', emoji: '🍥', category: '主食', portion: '1 个(100g)', calories: 223, burnMin: 26 },
  { name: '全麦面包', emoji: '🍞', category: '主食', portion: '2 片(60g)', calories: 148, burnMin: 17 },
  { name: '燕麦片', emoji: '🌾', category: '主食', portion: '1 份(40g)', calories: 147, burnMin: 17 },
  { name: '煮面条', emoji: '🍜', category: '主食', portion: '1 碗(200g)', calories: 218, burnMin: 26 },
  { name: '红薯', emoji: '🍠', category: '主食', portion: '1 个(200g)', calories: 172, burnMin: 20 },
  { name: '玉米', emoji: '🌽', category: '主食', portion: '1 根(200g)', calories: 224, burnMin: 26 },
  { name: '鸡胸肉', emoji: '🍗', category: '肉蛋', portion: '1 块(120g)', calories: 160, burnMin: 19 },
  { name: '鸡蛋', emoji: '🥚', category: '肉蛋', portion: '1 个(50g)', calories: 72, burnMin: 8 },
  { name: '瘦牛肉', emoji: '🥩', category: '肉蛋', portion: '1 份(100g)', calories: 125, burnMin: 15 },
  { name: '五花肉', emoji: '🥓', category: '肉蛋', portion: '1 份(100g)', calories: 508, burnMin: 60 },
  { name: '三文鱼', emoji: '🐟', category: '肉蛋', portion: '1 份(100g)', calories: 139, burnMin: 16 },
  { name: '基围虾', emoji: '🦐', category: '肉蛋', portion: '6 只(100g)', calories: 93, burnMin: 11 },
  { name: '北豆腐', emoji: '⬜', category: '豆制品', portion: '1 块(120g)', calories: 98, burnMin: 12 },
  { name: '无糖豆浆', emoji: '🥛', category: '豆制品', portion: '1 杯(250ml)', calories: 78, burnMin: 9 },
  { name: '西兰花', emoji: '🥦', category: '蔬菜', portion: '1 份(150g)', calories: 54, burnMin: 6 },
  { name: '菠菜', emoji: '🥬', category: '蔬菜', portion: '1 份(150g)', calories: 42, burnMin: 5 },
  { name: '番茄', emoji: '🍅', category: '蔬菜', portion: '1 个(150g)', calories: 30, burnMin: 4 },
  { name: '黄瓜', emoji: '🥒', category: '蔬菜', portion: '1 根(200g)', calories: 32, burnMin: 4 },
  { name: '苹果', emoji: '🍎', category: '水果', portion: '1 个(200g)', calories: 106, burnMin: 12 },
  { name: '香蕉', emoji: '🍌', category: '水果', portion: '1 根(120g)', calories: 112, burnMin: 13 },
  { name: '蓝莓', emoji: '🫐', category: '水果', portion: '1 盒(125g)', calories: 71, burnMin: 8 },
  { name: '牛油果', emoji: '🥑', category: '水果', portion: '1 个(150g)', calories: 257, burnMin: 30 },
  { name: '全脂牛奶', emoji: '🥛', category: '乳品', portion: '1 杯(250ml)', calories: 163, burnMin: 19 },
  { name: '无糖酸奶', emoji: '🥣', category: '乳品', portion: '1 杯(150g)', calories: 90, burnMin: 11 },
  { name: '奶酪', emoji: '🧀', category: '乳品', portion: '1 片(20g)', calories: 66, burnMin: 8 },
  { name: '杏仁', emoji: '🌰', category: '坚果', portion: '1 小把(25g)', calories: 145, burnMin: 17 },
  { name: '核桃', emoji: '🌰', category: '坚果', portion: '2 个(20g)', calories: 129, burnMin: 15 },
  { name: '黑咖啡', emoji: '☕', category: '饮品', portion: '1 杯(250ml)', calories: 5, burnMin: 1 },
  { name: '可乐', emoji: '🥤', category: '饮品', portion: '1 罐(330ml)', calories: 142, burnMin: 17 },
  { name: '珍珠奶茶', emoji: '🧋', category: '饮品', portion: '1 杯(500ml)', calories: 475, burnMin: 56 },
  { name: '啤酒', emoji: '🍺', category: '饮品', portion: '1 罐(330ml)', calories: 142, burnMin: 17 },
  { name: '薯片', emoji: '🍟', category: '零食', portion: '1 小袋(70g)', calories: 384, burnMin: 45 },
  { name: '巧克力', emoji: '🍫', category: '零食', portion: '1 排(50g)', calories: 295, burnMin: 35 },
  { name: '奶油蛋糕', emoji: '🍰', category: '零食', portion: '1 块(100g)', calories: 347, burnMin: 41 },
  { name: '冰淇淋', emoji: '🍦', category: '零食', portion: '1 份(100g)', calories: 207, burnMin: 24 },
  { name: '炸鸡', emoji: '🍗', category: '快餐', portion: '2 块(150g)', calories: 419, burnMin: 49 },
  { name: '汉堡', emoji: '🍔', category: '快餐', portion: '1 个(200g)', calories: 590, burnMin: 69 },
  { name: '披萨', emoji: '🍕', category: '快餐', portion: '2 块(200g)', calories: 536, burnMin: 63 },
  { name: '炸薯条', emoji: '🍟', category: '快餐', portion: '1 中份(115g)', calories: 359, burnMin: 42 },
  { name: '方便面', emoji: '🍜', category: '快餐', portion: '1 包(120g)', calories: 566, burnMin: 67 }
]

/** 精选热量表（人工整理，含真实常见分量） */
export const CALORIE_TABLE = CURATED_CALORIE_TABLE

/**
 * 完整热量表（自动扩容）
 * ------------------------------------------------------------------
 * 做法：精选表 + 由食物数据库（FOOD_DB）派生的全量条目。
 * 派生条目统一按「1 份 100g」折算，运动消耗按 8.5 kcal/分钟 估算，
 * 因此当食物库新增条目时，知识库热量表会**自动同步扩容**，无需手工维护。
 * 这一设计同时保证了「饮食记录可搜索到的食物」与「热量表能查到的食物」始终一致。
 */
const BURN_RATE = 8.5 // kcal/分钟（60kg 成人 8km/h 慢跑）

export const CALORIE_TABLE_FULL = [
  ...CURATED_CALORIE_TABLE.map((row) => ({ ...row, source: 'curated' })),
  ...FOOD_DB.filter((food) => !CURATED_CALORIE_TABLE.some((row) => row.name === food.name)).map((food) => ({
    name: food.name,
    emoji: food.emoji,
    category: food.category,
    portion: `1 份(100${food.unit === '100ml' ? 'ml' : 'g'})`,
    calories: Math.round(food.calories),
    burnMin: Math.max(1, Math.round(food.calories / BURN_RATE)),
    source: 'derived'
  }))
]

/* ===================================================================
 * 二、减脂 / 增肌科普文章
 * =================================================================== */
export const SCIENCE_ARTICLES = [
  {
    id: 'fat-loss-basic',
    title: '减脂的核心逻辑：热量缺口',
    emoji: '🔥',
    theme: 'orange',
    tags: ['减脂', '基础'],
    summary: '减脂不是「不吃」，而是让每日摄入热量稳定低于消耗热量，并保证营养结构合理。',
    sections: [
      {
        h: '① 什么是热量缺口',
        p: '当每日摄入热量低于消耗热量时，身体会动用脂肪供能，这个差值就是热量缺口。一般建议缺口控制在 300–500 kcal/天，对应每周减重 0.3–0.5kg，既安全又容易坚持。缺口过大容易造成基础代谢下降、肌肉流失和暴食反弹。'
      },
      {
        h: '② 三大营养素怎么分配',
        p: '减脂期可参考：蛋白质 25%–30%、脂肪 20%–25%、碳水 45%–50%。高蛋白可以提升饱腹感、减少肌肉流失；脂肪建议以橄榄油、坚果、深海鱼等不饱和脂肪为主；碳水优先选择全谷物、薯类等低升糖食物。'
      },
      {
        h: '③ 为什么要吃够蛋白质',
        p: '减脂过程中若蛋白质不足，减掉的体重里会夹杂大量肌肉。建议按每公斤体重 1.2–1.6g 摄入蛋白质，例如 60kg 的人每天约 72–96g。鸡胸肉、鱼虾、鸡蛋、豆腐、无糖酸奶都是优质来源。'
      },
      {
        h: '④ 常见误区',
        p: '· 只吃水果代餐：糖分高、蛋白质少，容易掉肌肉。\n· 完全不吃主食：短期体重下降快，但难以坚持且易反弹。\n· 靠「减脂茶 / 代餐」：真正起作用的仍是总热量差。'
      }
    ]
  },
  {
    id: 'muscle-gain',
    title: '增肌指南：训练 + 热量盈余 + 蛋白质',
    emoji: '💪',
    theme: 'purple',
    tags: ['增肌', '健身'],
    summary: '增肌需要「渐进超负荷」的力量训练配合 200–300 kcal 的每日热量盈余。',
    sections: [
      {
        h: '① 热量盈余要温和',
        p: '建议在每日消耗基础上增加 200–300 kcal。盈余过大，增加的主要是脂肪；温和盈余配合力量训练，才能让热量更多用于合成肌肉。'
      },
      {
        h: '② 蛋白质与训练时机',
        p: '增肌期建议每公斤体重 1.6–2.2g 蛋白质，分 3–5 餐摄入吸收更佳。训练后 1–2 小时内补充 20–40g 蛋白质 + 适量碳水，有助于恢复与合成。'
      },
      {
        h: '③ 碳水不是敌人',
        p: '碳水是力量训练的主要燃料。增肌期碳水可占总热量 50%–55%，训练日适当提高，休息日略降低，这就是常见的「碳水循环」思路。'
      },
      {
        h: '④ 睡眠与恢复',
        p: '肌肉是在休息中生长的。建议保证 7–9 小时睡眠，避免连续高强度训练同一肌群，同一肌群间隔 48 小时以上更利于恢复。'
      }
    ]
  },
  {
    id: 'sugar-trap',
    title: '隐形糖陷阱：你可能每天都在超标',
    emoji: '🍬',
    theme: 'yellow',
    tags: ['控糖', '避坑'],
    summary: '世界卫生组织建议每日添加糖摄入不超过 25g，而一杯全糖奶茶就可能超过 50g。',
    sections: [
      {
        h: '① 添加糖的推荐上限',
        p: '《中国居民膳食指南》建议每日添加糖摄入不超过 50g，最好控制在 25g 以内。添加糖指加工过程中加入的糖，不包括水果、牛奶中天然存在的糖。'
      },
      {
        h: '② 高糖食物排行',
        p: '全糖奶茶（约 50g）> 乳酸菌饮料（约 15g/瓶）> 风味酸奶（约 12g/100g）> 蛋糕、饼干、巧克力。这些「喝着不甜但含糖很高」的食物最容易被忽略。'
      },
      {
        h: '③ 识别配料表',
        p: '配料表按含量从高到低排列。若「白砂糖、果葡糖浆、麦芽糖浆、浓缩果汁」排在前三位，说明含糖量偏高。注意「无蔗糖」不等于无糖，可能含果葡糖浆。'
      },
      {
        h: '④ 减糖小技巧',
        p: '· 奶茶从全糖改为三分糖，可减少约 25g 糖\n· 用无糖酸奶 + 新鲜水果代替风味酸奶\n· 用气泡水 + 柠檬片代替含糖饮料'
      }
    ]
  },
  {
    id: 'sodium',
    title: '被你忽视的钠：为什么吃得「不咸」也超标',
    emoji: '🧂',
    theme: 'cyan',
    tags: ['控盐', '心血管'],
    summary: '钠的主要来源不是盐罐，而是酱油、酱料、加工肉、方便食品等「隐形盐」。',
    sections: [
      {
        h: '① 每日推荐量',
        p: '成年人每日钠摄入建议不超过 2000mg（约等于 5g 食盐）。而一包方便面的钠就接近 1800mg，几乎占满了全天额度。'
      },
      {
        h: '② 隐形钠来源',
        p: '酱油、蚝油、豆瓣酱、火锅底料、腌菜、火腿肠、香肠、辣条、面包（是的，面包也含钠）、苏打饼干。'
      },
      {
        h: '③ 减钠策略',
        p: '· 用葱姜蒜、柠檬、香草代替部分盐和酱料\n· 涮火锅时用清汤碟代替油碟\n· 选购包装食品时看「钠」一栏，选每 100g 钠 < 300mg 的产品'
      }
    ]
  },
  {
    id: 'fiber',
    title: '膳食纤维：肠道与饱腹感的守护者',
    emoji: '🌿',
    theme: 'green',
    tags: ['膳食纤维', '肠道'],
    summary: '成年人每日建议摄入 25–30g 膳食纤维，但多数人实际只有 12–15g。',
    sections: [
      {
        h: '① 膳食纤维的好处',
        p: '促进肠道蠕动、改善便秘、延缓血糖上升、增加饱腹感、为肠道菌群提供「食物」。充足的纤维还能帮助控制体重。'
      },
      {
        h: '② 高纤维食物清单',
        p: '燕麦（9.7g/100g）、黄豆（15.5g/100g）、杏仁（12g/100g）、红薯、玉米、西兰花、菠菜、猕猴桃、蓝莓。'
      },
      {
        h: '③ 怎么吃够',
        p: '把一半主食换成全谷物 / 薯类；每餐保证 1–2 拳头蔬菜；每天 1–2 份水果；每天一小把坚果，基本就能达标。'
      }
    ]
  },
  {
    id: 'plate-method',
    title: '最实用的三餐公式：餐盘法',
    emoji: '🍽️',
    theme: 'blue',
    tags: ['搭配', '实操'],
    summary: '把餐盘分成四份：½ 蔬菜、¼ 优质蛋白、¼ 主食，再配一份水果或乳制品。',
    sections: [
      {
        h: '① ½ 蔬菜',
        p: '以深色蔬菜为主（西兰花、菠菜、胡萝卜），烹饪方式优先蒸、煮、白灼、少油快炒。'
      },
      {
        h: '② ¼ 优质蛋白',
        p: '鸡胸肉、鱼虾、瘦牛肉、鸡蛋、豆腐、豆制品轮换食用。每餐大约 1 个手掌大小的分量。'
      },
      {
        h: '③ ¼ 主食',
        p: '优先糙米、燕麦、玉米、红薯等低升糖主食，避免精制糖与油炸主食。'
      },
      {
        h: '④ 加餐与饮水',
        p: '加餐可选无糖酸奶、水果、一小把坚果。全天饮水 1500–1700ml，分次小口饮用，不要等口渴才喝。'
      }
    ]
  }
]

/* ===================================================================
 * 三、食物相克（民间说法 + 科学解释）
 * level: 'rumor'  以讹传讹（已辟谣）
 *        'care'   需要注意的搭配（多为吸收 / 肠胃层面）
 * =================================================================== */
export const FOOD_CONFLICTS = [
  {
    id: 'crab-persimmon',
    a: { name: '螃蟹', emoji: '🦀' },
    b: { name: '柿子', emoji: '🍅' },
    level: 'care',
    desc: '民间说法：同食会中毒、腹痛腹泻。',
    truth:
      '并非「中毒」。柿子中鞣酸较多，与高蛋白同食且在空腹状态下容易形成胃结石、引起腹胀不适。建议：避免空腹吃大量柿子，两者间隔 2 小时以上即可。'
  },
  {
    id: 'shrimp-vc',
    a: { name: '虾', emoji: '🦐' },
    b: { name: '大量维生素C', emoji: '🍊' },
    level: 'rumor',
    desc: '民间说法：虾 + VC = 砒霜中毒。',
    truth: '需要一次性摄入数公斤虾并配合巨量 VC 才可能达到有害剂量，日常饮食完全不可能发生，属于典型的以讹传讹。'
  },
  {
    id: 'spinach-tofu',
    a: { name: '菠菜', emoji: '🥬' },
    b: { name: '豆腐', emoji: '⬜' },
    level: 'care',
    desc: '民间说法：菠菜 + 豆腐会得结石。',
    truth:
      '菠菜的草酸与豆腐的钙结合，确实会生成草酸钙，但主要影响的是「钙的吸收率」，并不会直接造成结石。把菠菜先焯水 1 分钟去掉大部分草酸，就能放心搭配。'
  },
  {
    id: 'milk-orange',
    a: { name: '牛奶', emoji: '🥛' },
    b: { name: '橙子 / 果汁', emoji: '🍊' },
    level: 'care',
    desc: '民间说法：牛奶遇酸会凝固，伤胃。',
    truth: '牛奶遇酸凝固是正常的蛋白质变性，进入胃里本来也会被胃酸凝固，与消化无关。但肠胃敏感者同食可能出现腹胀，建议间隔半小时。'
  },
  {
    id: 'eggs-soymilk',
    a: { name: '鸡蛋', emoji: '🥚' },
    b: { name: '豆浆', emoji: '🥛' },
    level: 'rumor',
    desc: '民间说法：豆浆冲鸡蛋会中毒。',
    truth: '真正的问题在于「未煮熟的豆浆」含有皂苷等抗营养因子，会引起恶心呕吐。只要豆浆彻底煮沸，和鸡蛋同食完全没问题。'
  },
  {
    id: 'tea-egg',
    a: { name: '浓茶', emoji: '🍵' },
    b: { name: '鸡蛋', emoji: '🥚' },
    level: 'rumor',
    desc: '民间说法：茶叶蛋有害健康。',
    truth: '茶叶中的鞣酸只是会稍微降低蛋白质与铁的吸收效率，偶尔吃完全安全，并非「有毒」。'
  },
  {
    id: 'beer-seafood',
    a: { name: '啤酒', emoji: '🍺' },
    b: { name: '海鲜', emoji: '🦐' },
    level: 'care',
    desc: '民间说法：啤酒配海鲜会痛风。',
    truth:
      '这条是真的需要警惕：海鲜高嘌呤、酒精会抑制尿酸排泄，两者叠加会显著升高血尿酸，诱发痛风急性发作。高尿酸人群应严格避免。'
  },
  {
    id: 'durian-alcohol',
    a: { name: '榴莲', emoji: '🥭' },
    b: { name: '酒精', emoji: '🍺' },
    level: 'care',
    desc: '民间说法：榴莲配酒会猝死。',
    truth: '榴莲含硫化合物会抑制乙醛脱氢酶活性，使酒精代谢变慢。虽不至于「一口就猝死」，但确实会明显加重醉酒与不适，建议避免同食。'
  },
  {
    id: 'carrot-vc',
    a: { name: '胡萝卜', emoji: '🥕' },
    b: { name: '富含VC的果蔬', emoji: '🍊' },
    level: 'care',
    desc: '民间说法：同食会破坏维生素C。',
    truth: '胡萝卜中的抗坏血酸氧化酶确实可能氧化 VC，但加热后该酶即失活，且需要大量生胡萝卜才明显。日常凉拌影响很小。'
  },
  {
    id: 'milk-chocolate',
    a: { name: '牛奶', emoji: '🥛' },
    b: { name: '巧克力', emoji: '🍫' },
    level: 'care',
    desc: '民间说法：同食会腹泻、影响钙吸收。',
    truth: '真正原因是「糖 + 脂肪 + 乳糖」对乳糖不耐人群不友好，会造成腹胀。对健康人群而言只是热量偏高，注意总热量即可。'
  }
]

/* ===================================================================
 * 四、健康饮食习惯
 * =================================================================== */
export const HEALTHY_HABITS = [
  { emoji: '🕐', title: '三餐定时定量', desc: '早餐 6:30–8:30、午餐 11:30–13:30、晚餐 17:30–19:30，规律进食有助于稳定血糖与食欲。' },
  { emoji: '💧', title: '每天喝够 1500–1700ml 水', desc: '分次小口饮用，早晨起床先喝 200ml 温水，不要用饮料代替白开水。' },
  { emoji: '🥗', title: '每餐先吃蔬菜', desc: '先吃蔬菜可以提升饱腹感、延缓血糖上升，有助于自然减少主食摄入量。' },
  { emoji: '🍚', title: '主食粗细搭配', desc: '把 1/3–1/2 的精制主食换成糙米、燕麦、玉米、红薯等全谷物或薯类。' },
  { emoji: '🥚', title: '每餐都有优质蛋白', desc: '鸡蛋、鱼虾、瘦肉、豆腐、无糖酸奶轮换，帮助维持肌肉与免疫力。' },
  { emoji: '🐌', title: '细嚼慢咽 20 分钟', desc: '大脑接收到饱腹信号大约需要 20 分钟，放慢进食速度能明显减少进食量。' },
  { emoji: '🌙', title: '晚餐不过饱、睡前 3 小时不进食', desc: '晚餐建议七分饱，避免夜宵，减轻肠胃负担、改善睡眠质量。' },
  { emoji: '🥜', title: '坚果每天一小把', desc: '约 25g（15 粒杏仁或 2 个核桃），提供优质脂肪但热量高，切忌过量。' },
  { emoji: '🍬', title: '添加糖控制在 25g 以内', desc: '少喝含糖饮料，奶茶选三分糖，用水果满足甜味需求。' },
  { emoji: '🧂', title: '全天食盐不超过 5g', desc: '警惕酱油、酱料、腌制品中的隐形盐，学会看营养成分表的钠含量。' },
  { emoji: '🚶', title: '每周 150 分钟中等强度运动', desc: '快走、慢跑、骑行、游泳均可，配合每周 2 次力量训练效果更佳。' },
  { emoji: '😴', title: '保证 7–8 小时睡眠', desc: '睡眠不足会升高饥饿素、降低瘦素，让人更容易想吃高糖高脂食物。' }
]

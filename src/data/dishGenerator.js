/**
 * 家常菜组合生成器 ——「基础食材 × 烹饪方式」推算条目
 * ------------------------------------------------------------------
 * 设计动机：
 *   用户真正会搜索的是「红烧带鱼」「蒜蓉菠菜」这类**做法 + 食材**的组合，
 *   逐一手写会产生大量重复劳动。本模块用「食材基准营养 + 调味配比」推算出完整条目，
 *   既保证每条都是真实存在的家常做法，又让营养值**可溯源、可复算**（而非随机编造）。
 *
 * 推算公式（与《中国食物成分表》的通用折算思路一致）：
 *   protein = 食材蛋白 × (1 - 烹饪损失率)
 *   fat     = 食材脂肪 × (1 - 烹饪损失率) + 用油量
 *   carb    = 食材碳水 × (1 - 烹饪损失率) + 用糖量 + 芡粉
 *   fiber   = 食材纤维 × (1 - 烹饪损失率)
 *   sugar   = 食材糖   + 用糖量
 *   sodium  = 食材钠   + 调味钠（盐 / 酱油 / 酱料折算）
 *   calories = 4×protein + 9×fat + 4×carb   ← 采用 Atwater 系数反算，保证热量与三大营养素自洽
 *
 * 生成规则：
 *   ● 每种食材只与「它真实会出现的做法」组合（白名单），避免产出「糖醋鸡蛋」这类不存在的菜；
 *   ● 生成条目的 id = 食材id_做法key，名称 = 做法名 + 简名（如「红烧带鱼」）；
 *   ● 与手写种子条目重名时自动跳过（去重由 foods.js 统一处理）。
 *
 * 免责：推算值为常见家常做法的参考估计，同一道菜因厨师配比不同会有合理浮动。
 */

/* ===================================================================
 * 一、烹饪方式参数表
 * oil    每 100g 食材额外加入的食用油（g）
 * sugar  额外加入的糖（g，同时计入碳水与糖分）
 * starch 额外加入的芡粉 / 面粉（g，计入碳水）
 * sodium 调味料折算的钠（mg）
 * loss   烹饪损失率（焯水流失、汤汁稀释等对水溶性营养素的影响）
 * =================================================================== */
export const COOK_METHODS = {
  清蒸: { oil: 3, sugar: 0.5, starch: 0, sodium: 300, loss: 0.08, emoji: '♨️', tags: ['清蒸', '低脂', '清淡'] },
  清炒: { oil: 5, sugar: 0.5, starch: 0, sodium: 320, loss: 0.05, emoji: '🥢', tags: ['清炒', '家常菜'] },
  蒜蓉: { oil: 6, sugar: 1, starch: 0, sodium: 400, loss: 0.05, emoji: '🧄', tags: ['蒜蓉', '家常菜'] },
  爆炒: { oil: 8, sugar: 1.5, starch: 1, sodium: 420, loss: 0.06, emoji: '🔥', tags: ['爆炒', '下饭菜'] },
  香煎: { oil: 6, sugar: 1, starch: 2, sodium: 320, loss: 0.05, emoji: '🍳', tags: ['香煎', '煎制'] },
  红烧: { oil: 8, sugar: 8, starch: 2, sodium: 620, loss: 0.1, emoji: '🍲', tags: ['红烧', '家常菜'] },
  酱香: { oil: 7, sugar: 3, starch: 1, sodium: 700, loss: 0.06, emoji: '🥄', tags: ['酱香', '下饭菜'] },
  糖醋: { oil: 7, sugar: 14, starch: 6, sodium: 380, loss: 0.05, emoji: '🍯', tags: ['糖醋', '高糖'] },
  水煮: { oil: 2, sugar: 0.5, starch: 0, sodium: 480, loss: 0.12, emoji: '💧', tags: ['水煮', '清淡'] },
  白灼: { oil: 2, sugar: 0.5, starch: 0, sodium: 380, loss: 0.12, emoji: '🍤', tags: ['白灼', '低脂', '清淡'] },
  凉拌: { oil: 5, sugar: 2, starch: 0, sodium: 450, loss: 0, emoji: '🥗', tags: ['凉菜', '快手菜'] },
  油炸: { oil: 14, sugar: 1, starch: 8, sodium: 380, loss: 0.05, emoji: '🍤', tags: ['油炸', '高脂'] },
  烤制: { oil: 4, sugar: 1.5, starch: 0, sodium: 400, loss: 0.15, emoji: '🔥', tags: ['烤制', '低油'] },
  炖煮: { oil: 4, sugar: 2, starch: 0, sodium: 420, loss: 0.1, emoji: '🍲', tags: ['炖菜', '家常菜'] },
  麻辣: { oil: 12, sugar: 2, starch: 1, sodium: 900, loss: 0.08, emoji: '🌶️', tags: ['麻辣', '川菜', '高钠'] },
  咖喱: { oil: 8, sugar: 4, starch: 2, sodium: 560, loss: 0.08, emoji: '🍛', tags: ['咖喱', '东南亚'] },
  黑椒: { oil: 6, sugar: 1, starch: 1, sodium: 480, loss: 0.06, emoji: '⚫', tags: ['黑椒', '西式'] },
  酸辣: { oil: 7, sugar: 3, starch: 1, sodium: 700, loss: 0.06, emoji: '🍋', tags: ['酸辣', '开胃'] },
  卤味: { oil: 3, sugar: 4, starch: 0, sodium: 950, loss: 0.08, emoji: '🍗', tags: ['卤味', '熟食', '高钠'] },
  香辣: { oil: 10, sugar: 2, starch: 1, sodium: 820, loss: 0.07, emoji: '🌶️', tags: ['香辣', '下饭菜'] },
  葱爆: { oil: 9, sugar: 1.5, starch: 1, sodium: 540, loss: 0.06, emoji: '🧅', tags: ['葱爆', '爆炒'] },
  椒盐: { oil: 12, sugar: 0.5, starch: 6, sodium: 720, loss: 0.05, emoji: '🧂', tags: ['椒盐', '油炸'] },
  孜然: { oil: 8, sugar: 1, starch: 0, sodium: 580, loss: 0.1, emoji: '🔥', tags: ['孜然', '烧烤'] },
  鱼香: { oil: 9, sugar: 8, starch: 3, sodium: 700, loss: 0.06, emoji: '🥢', tags: ['鱼香', '川菜', '下饭菜'] },
  番茄汁: { oil: 6, sugar: 5, starch: 1, sodium: 480, loss: 0.08, emoji: '🍅', tags: ['茄汁', '开胃'] },
  蒜香: { oil: 8, sugar: 1, starch: 1, sodium: 480, loss: 0.06, emoji: '🧄', tags: ['蒜香', '家常菜'] },
  干锅: { oil: 13, sugar: 2, starch: 1, sodium: 760, loss: 0.07, emoji: '🥘', tags: ['干锅', '川菜', '高钠'] },
  铁板: { oil: 10, sugar: 2, starch: 1, sodium: 620, loss: 0.08, emoji: '🍳', tags: ['铁板', '烧烤'] },
  剁椒: { oil: 7, sugar: 2, starch: 1, sodium: 880, loss: 0.06, emoji: '🌶️', tags: ['剁椒', '湘菜', '高钠'] },
  蜜汁: { oil: 6, sugar: 12, starch: 2, sodium: 320, loss: 0.06, emoji: '🍯', tags: ['蜜汁', '高糖'] },
  香酥: { oil: 15, sugar: 1, starch: 9, sodium: 420, loss: 0.05, emoji: '🍤', tags: ['香酥', '油炸', '高脂'] },
  泡椒: { oil: 9, sugar: 2, starch: 1, sodium: 780, loss: 0.06, emoji: '🌶️', tags: ['泡椒', '川菜', '下饭菜'] }
}

/* ===================================================================
 * 二、基础食材表
 * [id, 名称, 短名, emoji, 分类, [热量, 蛋白质, 脂肪, 碳水, 纤维, 糖, 钠], 适用做法, 别名]
 * 说明：热量与三大营养素取自食材自身基准值，生成时由公式重算，故此处热量仅作参考。
 * =================================================================== */
export const BASE_INGREDIENTS = [
  // ---- 畜禽肉 ----
  { id: 'b_chicken_breast', name: '鸡胸肉', short: '鸡胸', emoji: '🍗', category: '肉蛋', n: [133, 19.4, 5.0, 2.5, 0, 0, 34], methods: ['香煎', '水煮', '黑椒', '凉拌', '爆炒', '清蒸'], alias: ['鸡胸', '鸡胸肉'] },
  { id: 'b_chicken_leg', name: '鸡腿肉', short: '鸡腿', emoji: '🍗', category: '肉蛋', n: [181, 16.0, 13.0, 0, 0, 0, 85], methods: ['红烧', '烤制', '咖喱', '酱香', '炖煮', '油炸'], alias: ['鸡腿', '鸡翅', '鸡块'] },
  { id: 'b_chicken_wing', name: '鸡翅', short: '鸡翅', emoji: '🍗', category: '肉蛋', n: [194, 17.4, 11.8, 4.6, 0, 0.5, 85], methods: ['红烧', '烤制', '酱香', '糖醋', '麻辣'], alias: ['鸡翅', '翅中', '翅根'] },
  { id: 'b_duck', name: '鸭肉', short: '鸭肉', emoji: '🦆', category: '肉蛋', n: [240, 15.5, 19.7, 0.2, 0, 0, 69], methods: ['烤制', '红烧', '酱香', '炖煮'], alias: ['鸭肉', '鸭', '板鸭'] },
  { id: 'b_pork_loin', name: '猪里脊', short: '里脊', emoji: '🥩', category: '肉蛋', n: [155, 20.2, 7.9, 0.7, 0, 0, 58], methods: ['糖醋', '香煎', '爆炒', '黑椒', '酱香', '油炸'], alias: ['里脊', '里脊肉', '猪柳'] },
  { id: 'b_pork_belly', name: '五花肉', short: '五花肉', emoji: '🥓', category: '肉蛋', n: [508, 9.3, 53.0, 0, 0, 0, 62], methods: ['红烧', '炖煮', '酱香', '烤制', '爆炒'], alias: ['五花肉', '三层肉', '扣肉'] },
  { id: 'b_pork_rib', name: '猪排骨', short: '排骨', emoji: '🍖', category: '肉蛋', n: [278, 17.0, 22.0, 1.5, 0, 0, 62], methods: ['红烧', '炖煮', '糖醋', '烤制', '香煎', '清蒸'], alias: ['排骨', '肋排', '小排'] },
  { id: 'b_beef_loin', name: '牛里脊', short: '牛柳', emoji: '🥩', category: '肉蛋', n: [125, 20.2, 4.2, 1.2, 0, 0, 84], methods: ['黑椒', '香煎', '爆炒', '酱香', '烤制'], alias: ['牛柳', '牛里脊', '牛肉'] },
  { id: 'b_beef_brisket', name: '牛腩', short: '牛腩', emoji: '🥩', category: '肉蛋', n: [180, 17.5, 11.5, 1.5, 0, 0, 65], methods: ['炖煮', '红烧', '咖喱', '清蒸'], alias: ['牛腩', '牛腩肉'] },
  { id: 'b_beef_tripe', name: '牛腱子', short: '牛腱', emoji: '🥩', category: '肉蛋', n: [106, 20.2, 2.3, 1.2, 0, 0, 60], methods: ['酱香', '凉拌', '红烧'], alias: ['牛腱', '牛腱子', '酱牛肉'] },
  // ---- 水产 ----
  { id: 'b_bass', name: '鲈鱼', short: '鲈鱼', emoji: '🐟', category: '肉蛋', n: [105, 18.6, 3.4, 0, 0, 0, 144], methods: ['清蒸', '红烧', '香煎', '酸辣', '烤制'], alias: ['鲈鱼', '海鲈', '鱼'] },
  { id: 'b_grass_carp', name: '草鱼', short: '草鱼', emoji: '🐟', category: '肉蛋', n: [113, 16.6, 5.2, 0, 0, 0, 46], methods: ['红烧', '酸辣', '清蒸', '水煮', '麻辣'], alias: ['草鱼', '鱼片', '酸菜鱼'] },
  { id: 'b_hairtail', name: '带鱼', short: '带鱼', emoji: '🐟', category: '肉蛋', n: [127, 17.7, 4.9, 3.1, 0, 0, 150], methods: ['红烧', '香煎', '油炸', '清蒸', '糖醋'], alias: ['带鱼', '刀鱼'] },
  { id: 'b_salmon', name: '三文鱼', short: '三文鱼', emoji: '🐟', category: '肉蛋', n: [139, 17.2, 7.8, 0, 0, 0, 60], methods: ['香煎', '烤制', '清蒸', '凉拌'], alias: ['三文鱼', '鲑鱼', 'salmon'] },
  { id: 'b_shrimp', name: '基围虾', short: '虾', emoji: '🦐', category: '肉蛋', n: [93, 18.6, 0.8, 2.8, 0, 0, 165], methods: ['白灼', '蒜蓉', '麻辣', '清炒', '油炸'], alias: ['虾', '基围虾', '白灼虾'] },
  { id: 'b_squid', name: '鱿鱼', short: '鱿鱼', emoji: '🦑', category: '肉蛋', n: [75, 17.0, 0.8, 0, 0, 0, 134], methods: ['爆炒', '麻辣', '烤制', '凉拌'], alias: ['鱿鱼', '鱿鱼须'] },
  { id: 'b_clam', name: '蛤蜊', short: '蛤蜊', emoji: '🐚', category: '肉蛋', n: [62, 10.1, 1.1, 2.8, 0, 0, 425], methods: ['爆炒', '清蒸', '酸辣'], alias: ['蛤蜊', '花蛤', '扇贝'] },
  // ---- 蛋 / 豆制品 ----
  { id: 'b_egg', name: '鸡蛋', short: '鸡蛋', emoji: '🥚', category: '肉蛋', n: [143, 13.3, 8.8, 2.8, 0, 0.9, 131], methods: ['香煎', '水煮', '清蒸', '爆炒'], alias: ['鸡蛋', '蛋', '煎蛋'] },
  { id: 'b_tofu', name: '北豆腐', short: '豆腐', emoji: '⬜', category: '豆制品', n: [82, 8.1, 3.7, 4.2, 0.4, 0.6, 7], methods: ['红烧', '香煎', '清蒸', '麻辣', '凉拌'], alias: ['豆腐', '北豆腐', '老豆腐'] },
  // ---- 蔬菜 ----
  { id: 'v_broccoli', name: '西兰花', short: '西兰花', emoji: '🥦', category: '蔬菜', n: [36, 4.1, 0.6, 4.3, 1.6, 1.5, 18], methods: ['清炒', '蒜蓉', '水煮', '凉拌'], alias: ['西兰花', '西蓝花', '花椰菜'] },
  { id: 'v_spinach', name: '菠菜', short: '菠菜', emoji: '🥬', category: '蔬菜', n: [28, 2.6, 0.3, 4.5, 1.7, 0.4, 85], methods: ['清炒', '蒜蓉', '水煮', '凉拌'], alias: ['菠菜'] },
  { id: 'v_youcai', name: '油菜', short: '油菜', emoji: '🥬', category: '蔬菜', n: [25, 1.8, 0.5, 3.8, 1.1, 0.8, 55], methods: ['清炒', '蒜蓉', '水煮'], alias: ['油菜', '小油菜', '青菜'] },
  { id: 'v_lettuce', name: '生菜', short: '生菜', emoji: '🥬', category: '蔬菜', n: [16, 1.3, 0.3, 2.0, 0.7, 0.5, 32], methods: ['清炒', '蒜蓉', '凉拌'], alias: ['生菜', '油麦菜', '沙拉菜'] },
  { id: 'v_cabbage', name: '大白菜', short: '白菜', emoji: '🥬', category: '蔬菜', n: [20, 1.5, 0.1, 3.4, 0.8, 1.2, 57], methods: ['清炒', '炖煮', '酸辣', '凉拌'], alias: ['白菜', '大白菜'] },
  { id: 'v_cucumber', name: '黄瓜', short: '黄瓜', emoji: '🥒', category: '蔬菜', n: [16, 0.8, 0.2, 2.9, 0.5, 1.6, 5], methods: ['凉拌', '清炒', '蒜蓉'], alias: ['黄瓜', '青瓜'] },
  { id: 'v_tomato', name: '番茄', short: '番茄', emoji: '🍅', category: '蔬菜', n: [20, 0.9, 0.2, 4.0, 0.5, 2.5, 5], methods: ['清炒', '凉拌', '水煮'], alias: ['番茄', '西红柿'] },
  { id: 'v_eggplant', name: '茄子', short: '茄子', emoji: '🍆', category: '蔬菜', n: [23, 1.1, 0.2, 4.9, 1.3, 2.4, 6], methods: ['红烧', '清蒸', '蒜蓉', '麻辣'], alias: ['茄子', '长茄'] },
  { id: 'v_potato', name: '土豆', short: '土豆', emoji: '🥔', category: '蔬菜', n: [77, 2.0, 0.2, 17.2, 1.1, 0.8, 5], methods: ['酸辣', '清炒', '红烧', '炖煮'], alias: ['土豆', '马铃薯', '洋芋'] },
  { id: 'v_carrot', name: '胡萝卜', short: '胡萝卜', emoji: '🥕', category: '蔬菜', n: [39, 1.0, 0.2, 8.8, 1.1, 4.5, 27], methods: ['清炒', '炖煮', '凉拌'], alias: ['胡萝卜', '红萝卜'] },
  { id: 'v_pepper', name: '青椒', short: '青椒', emoji: '🫑', category: '蔬菜', n: [22, 1.4, 0.3, 5.4, 1.4, 2.4, 3], methods: ['清炒', '爆炒', '酸辣'], alias: ['青椒', '尖椒', '彩椒'] },
  { id: 'v_celery', name: '芹菜', short: '芹菜', emoji: '🥬', category: '蔬菜', n: [20, 1.2, 0.2, 4.5, 1.2, 1.0, 166], methods: ['清炒', '爆炒', '凉拌'], alias: ['芹菜', '西芹'] },
  { id: 'v_bean', name: '豆角', short: '豆角', emoji: '🫛', category: '蔬菜', n: [30, 2.5, 0.2, 5.7, 2.1, 1.5, 4], methods: ['清炒', '爆炒', '麻辣', '炖煮'], alias: ['豆角', '四季豆', '芸豆'] },
  { id: 'v_leek', name: '韭菜', short: '韭菜', emoji: '🥬', category: '蔬菜', n: [26, 2.4, 0.4, 4.6, 1.4, 1.5, 8], methods: ['清炒', '爆炒'], alias: ['韭菜'] },
  { id: 'v_mushroom', name: '香菇', short: '香菇', emoji: '🍄', category: '蔬菜', n: [26, 2.2, 0.3, 5.2, 3.3, 2.0, 5], methods: ['清炒', '蒜蓉', '红烧', '清蒸'], alias: ['香菇', '冬菇', '蘑菇'] },
  { id: 'v_enoki', name: '金针菇', short: '金针菇', emoji: '🍄', category: '蔬菜', n: [32, 2.4, 0.4, 6.0, 2.7, 1.5, 4], methods: ['清炒', '蒜蓉', '麻辣', '凉拌'], alias: ['金针菇', '金菇'] },
  { id: 'v_winter_melon', name: '冬瓜', short: '冬瓜', emoji: '🥒', category: '蔬菜', n: [12, 0.4, 0.2, 2.6, 0.7, 1.5, 1], methods: ['清炒', '炖煮', '蒜蓉'], alias: ['冬瓜'] },
  { id: 'v_yam', name: '山药', short: '山药', emoji: '🥔', category: '蔬菜', n: [57, 1.9, 0.2, 12.4, 0.8, 0.5, 18], methods: ['清炒', '炖煮', '凉拌'], alias: ['山药', '淮山'] },
  { id: 'v_lotus_root', name: '莲藕', short: '莲藕', emoji: '🪷', category: '蔬菜', n: [73, 1.9, 0.2, 16.4, 1.2, 1.0, 44], methods: ['清炒', '酸辣', '凉拌', '炖煮'], alias: ['莲藕', '藕', '藕片'] },

  // ---- 水产补充 ----
  { id: 'b_crucian', name: '鲫鱼', short: '鲫鱼', emoji: '🐟', category: '肉蛋', n: [108, 17.1, 2.7, 3.8, 0, 0, 41], methods: ['炖煮', '红烧', '清蒸', '酸辣'], alias: ['鲫鱼', '鲫鱼汤'] },
  { id: 'b_carp', name: '鲤鱼', short: '鲤鱼', emoji: '🐟', category: '肉蛋', n: [109, 17.6, 4.1, 0.5, 0, 0, 53], methods: ['红烧', '糖醋', '清蒸', '炖煮'], alias: ['鲤鱼', '糖醋鲤鱼'] },
  { id: 'b_croaker', name: '黄花鱼', short: '黄花鱼', emoji: '🐟', category: '肉蛋', n: [97, 17.7, 2.5, 0.8, 0, 0, 120], methods: ['香煎', '红烧', '清蒸', '香酥'], alias: ['黄花鱼', '黄鱼', '小黄鱼'] },
  { id: 'b_basa', name: '龙利鱼', short: '龙利鱼', emoji: '🐟', category: '肉蛋', n: [83, 17.7, 1.4, 0, 0, 0, 100], methods: ['香煎', '清蒸', '番茄汁', '酸辣'], alias: ['龙利鱼', '巴沙鱼', '鱼柳'] },
  { id: 'b_pomfret', name: '鲳鱼', short: '鲳鱼', emoji: '🐟', category: '肉蛋', n: [142, 18.5, 7.3, 0, 0, 0, 120], methods: ['香煎', '清蒸', '红烧', '香酥'], alias: ['鲳鱼', '平鱼'] },
  { id: 'b_octopus', name: '八爪鱼', short: '八爪鱼', emoji: '🐙', category: '肉蛋', n: [82, 18.9, 0.4, 0, 0, 0, 196], methods: ['爆炒', '香辣', '凉拌', '卤味'], alias: ['八爪鱼', '章鱼', '鱿鱼须'] },
  { id: 'b_scallop', name: '扇贝', short: '扇贝', emoji: '🐚', category: '肉蛋', n: [60, 11.1, 0.6, 2.6, 0, 0, 339], methods: ['蒜蓉', '清蒸', '香辣', '烤制'], alias: ['扇贝', '扇贝肉', '带子'] },
  { id: 'b_oyster', name: '生蚝', short: '生蚝', emoji: '🦪', category: '肉蛋', n: [73, 5.3, 2.1, 8.2, 0, 0, 270], methods: ['蒜蓉', '烤制', '清蒸', '香辣', '油炸'], alias: ['生蚝', '牡蛎', '蚝'] },
  { id: 'b_crab', name: '螃蟹', short: '螃蟹', emoji: '🦀', category: '肉蛋', n: [103, 17.5, 2.6, 2.3, 0, 0, 260], methods: ['清蒸', '香辣', '葱爆', '椒盐'], alias: ['螃蟹', '蟹', '大闸蟹'] },
  { id: 'b_squid_ring', name: '鱿鱼圈', short: '鱿鱼圈', emoji: '🦑', category: '肉蛋', n: [75, 17.0, 0.8, 0, 0, 0, 134], methods: ['香酥', '椒盐', '油炸', '香辣'], alias: ['鱿鱼圈', '炸鱿鱼'] },

  // ---- 畜禽补充 ----
  { id: 'b_lamb', name: '羊肉', short: '羊肉', emoji: '🐑', category: '肉蛋', n: [203, 19.0, 14.1, 0, 0, 0, 81], methods: ['孜然', '爆炒', '炖煮', '烤制', '红烧'], alias: ['羊肉', '羊腿肉'] },
  { id: 'b_lamb_chop', name: '羊排', short: '羊排', emoji: '🍖', category: '肉蛋', n: [203, 19.0, 14.1, 0, 0, 0, 81], methods: ['烤制', '孜然', '香煎', '红烧'], alias: ['羊排', '法式羊排'] },
  { id: 'b_beef_shank', name: '牛尾', short: '牛尾', emoji: '🥩', category: '肉蛋', n: [180, 17.5, 11.5, 1.0, 0, 0, 60], methods: ['炖煮', '红烧', '番茄汁'], alias: ['牛尾', '牛尾汤'] },
  { id: 'b_pork_trotter', name: '猪蹄', short: '猪蹄', emoji: '🍖', category: '肉蛋', n: [260, 22.6, 18.8, 0, 0, 0, 101], methods: ['红烧', '卤味', '炖煮', '烤制'], alias: ['猪蹄', '猪手', '卤猪蹄'] },
  { id: 'b_pork_liver', name: '猪肝', short: '猪肝', emoji: '🥩', category: '肉蛋', n: [129, 19.3, 3.5, 5.0, 0, 0, 68], methods: ['爆炒', '葱爆', '卤味', '香辣'], alias: ['猪肝', '熘肝尖'] },
  { id: 'b_pork_intestine', name: '肥肠', short: '肥肠', emoji: '🍖', category: '肉蛋', n: [196, 6.9, 18.7, 0.5, 0, 0, 52], methods: ['干锅', '香辣', '卤味', '爆炒'], alias: ['肥肠', '大肠', '溜肥肠'] },
  { id: 'b_chicken_claw', name: '鸡爪', short: '鸡爪', emoji: '🍗', category: '肉蛋', n: [254, 23.9, 16.4, 2.7, 0, 0, 169], methods: ['卤味', '香辣', '凉拌', '剁椒'], alias: ['鸡爪', '凤爪'] },
  { id: 'b_duck_neck', name: '鸭脖', short: '鸭脖', emoji: '🦆', category: '肉蛋', n: [180, 22.5, 9.0, 2.5, 0, 0, 1600], methods: ['卤味', '香辣', '烤制'], alias: ['鸭脖', '卤鸭脖'] },
  { id: 'b_duck_leg', name: '鸭腿', short: '鸭腿', emoji: '🦆', category: '肉蛋', n: [240, 15.5, 19.7, 0.2, 0, 0, 69], methods: ['红烧', '卤味', '烤制', '香辣'], alias: ['鸭腿', '板鸭腿'] },
  { id: 'b_bacon', name: '培根', short: '培根', emoji: '🥓', category: '肉蛋', n: [181, 22.4, 9.0, 2.6, 0, 0, 1000], methods: ['香煎', '烤制', '香辣'], alias: ['培根', 'bacon'] },
  { id: 'b_ham', name: '火腿', short: '火腿', emoji: '🍖', category: '肉蛋', n: [330, 16.0, 27.4, 4.9, 0, 0, 1086], methods: ['香煎', '清炒', '烤制', '凉拌'], alias: ['火腿', '火腿肉'] },
  { id: 'b_sausage', name: '香肠', short: '香肠', emoji: '🌭', category: '肉蛋', n: [508, 24.1, 40.7, 11.2, 0, 0, 2309], methods: ['香煎', '烤制', '干锅', '香辣'], alias: ['香肠', '腊肠', '广式腊肠'] },
  { id: 'b_luncheon', name: '午餐肉', short: '午餐肉', emoji: '🥓', category: '肉蛋', n: [229, 12.0, 17.0, 6.0, 0, 0, 1000], methods: ['香煎', '烤制', '清炒'], alias: ['午餐肉', '梅林午餐肉'] },

  // ---- 蛋 / 豆制品补充 ----
  { id: 'b_duck_egg', name: '鸭蛋', short: '鸭蛋', emoji: '🥚', category: '肉蛋', n: [180, 12.6, 13.0, 3.1, 0, 0, 106], methods: ['卤味', '清蒸', '香煎', '水煮'], alias: ['鸭蛋', '咸鸭蛋'] },
  { id: 'b_quail_egg', name: '鹌鹑蛋', short: '鹌鹑蛋', emoji: '🥚', category: '肉蛋', n: [160, 12.8, 11.1, 2.1, 0, 0, 106], methods: ['卤味', '红烧', '清蒸', '油炸'], alias: ['鹌鹑蛋', '鸟蛋'] },
  { id: 'b_century_egg', name: '皮蛋', short: '皮蛋', emoji: '🥚', category: '肉蛋', n: [171, 14.2, 10.7, 4.5, 0, 0, 542], methods: ['凉拌', '清蒸'], alias: ['皮蛋', '松花蛋'] },
  { id: 'b_tofu_skin', name: '豆皮', short: '豆皮', emoji: '🧈', category: '豆制品', n: [409, 44.6, 17.4, 18.8, 0.2, 0, 50], methods: ['清炒', '凉拌', '麻辣', '香辣'], alias: ['豆皮', '千张', '豆腐皮'] },
  { id: 'b_fuzhu', name: '腐竹', short: '腐竹', emoji: '🧈', category: '豆制品', n: [459, 44.6, 21.7, 22.3, 2.0, 0, 26], methods: ['清炒', '红烧', '凉拌', '麻辣'], alias: ['腐竹', '豆腐竹'] },
  { id: 'b_tofu_dry', name: '豆干', short: '豆干', emoji: '🧈', category: '豆制品', n: [140, 16.2, 3.6, 11.5, 0.8, 0, 329], methods: ['香辣', '卤味', '清炒', '凉拌'], alias: ['豆干', '香干', '白豆干'] },
  { id: 'b_tofu_inner', name: '内酯豆腐', short: '嫩豆腐', emoji: '⬜', category: '豆制品', n: [50, 5.0, 1.9, 3.3, 0.4, 0.6, 7], methods: ['清蒸', '凉拌', '水煮', '蒜香'], alias: ['内酯豆腐', '嫩豆腐', '日本豆腐'] },

  // ---- 蔬菜补充 ----
  { id: 'v_baby_cabbage', name: '娃娃菜', short: '娃娃菜', emoji: '🥬', category: '蔬菜', n: [13, 1.9, 0.2, 2.4, 0.9, 1.0, 45], methods: ['清炒', '蒜香', '水煮', '凉拌'], alias: ['娃娃菜', '小白菜'] },
  { id: 'v_water_spinach', name: '空心菜', short: '空心菜', emoji: '🥬', category: '蔬菜', n: [20, 2.2, 0.3, 3.6, 1.4, 0.8, 94], methods: ['清炒', '蒜香', '爆炒'], alias: ['空心菜', '通菜', '蕹菜'] },
  { id: 'v_crown_daisy', name: '茼蒿', short: '茼蒿', emoji: '🥬', category: '蔬菜', n: [21, 1.9, 0.3, 3.9, 1.2, 0.7, 161], methods: ['清炒', '蒜香', '水煮', '凉拌'], alias: ['茼蒿', '蓬蒿'] },
  { id: 'v_asparagus', name: '芦笋', short: '芦笋', emoji: '🌱', category: '蔬菜', n: [22, 2.6, 0.1, 4.9, 1.9, 1.5, 3], methods: ['清炒', '蒜香', '水煮', '烤制'], alias: ['芦笋', '石刁柏'] },
  { id: 'v_okra', name: '秋葵', short: '秋葵', emoji: '🌱', category: '蔬菜', n: [37, 2.0, 0.1, 7.1, 3.9, 1.5, 9], methods: ['清炒', '蒜香', '凉拌', '水煮'], alias: ['秋葵', '羊角豆'] },
  { id: 'v_pea', name: '荷兰豆', short: '荷兰豆', emoji: '🫛', category: '蔬菜', n: [30, 2.5, 0.3, 4.9, 1.4, 1.5, 3], methods: ['清炒', '爆炒', '蒜香'], alias: ['荷兰豆', '甜豆', '豌豆'] },
  { id: 'v_onion', name: '洋葱', short: '洋葱', emoji: '🧅', category: '蔬菜', n: [40, 1.1, 0.2, 9.0, 0.9, 4.2, 4], methods: ['爆炒', '清炒', '椒盐', '香酥'], alias: ['洋葱', '圆葱', '洋葱圈'] },
  { id: 'v_garlic_bolt', name: '蒜苔', short: '蒜苔', emoji: '🌿', category: '蔬菜', n: [61, 2.1, 0.4, 15.4, 2.5, 2.0, 5], methods: ['爆炒', '香辣', '清炒'], alias: ['蒜苔', '蒜苗', '青蒜'] },
  { id: 'v_bitter_gourd', name: '苦瓜', short: '苦瓜', emoji: '🥒', category: '蔬菜', n: [22, 1.0, 0.2, 4.9, 1.4, 2.5, 2], methods: ['清炒', '爆炒', '凉拌', '剁椒'], alias: ['苦瓜', '凉瓜'] },
  { id: 'v_luffa', name: '丝瓜', short: '丝瓜', emoji: '🥒', category: '蔬菜', n: [20, 1.0, 0.2, 4.2, 0.6, 1.5, 3], methods: ['清炒', '蒜香', '水煮'], alias: ['丝瓜', '胜瓜'] },
  { id: 'v_white_radish', name: '白萝卜', short: '白萝卜', emoji: '🥕', category: '蔬菜', n: [23, 0.9, 0.1, 5.0, 1.0, 2.0, 62], methods: ['炖煮', '红烧', '凉拌', '酸辣'], alias: ['白萝卜', '萝卜'] },
  { id: 'v_zucchini', name: '西葫芦', short: '西葫芦', emoji: '🥒', category: '蔬菜', n: [19, 0.8, 0.2, 3.8, 0.6, 2.0, 5], methods: ['清炒', '香煎', '蒜香'], alias: ['西葫芦', '角瓜'] },
  { id: 'v_round_cabbage', name: '圆白菜', short: '圆白菜', emoji: '🥬', category: '蔬菜', n: [24, 1.5, 0.2, 4.6, 1.0, 2.0, 27], methods: ['清炒', '爆炒', '香辣', '凉拌'], alias: ['圆白菜', '包菜', '卷心菜'] },
  { id: 'v_purple_cabbage', name: '紫甘蓝', short: '紫甘蓝', emoji: '🥬', category: '蔬菜', n: [25, 1.4, 0.2, 5.0, 1.5, 3.0, 27], methods: ['凉拌', '清炒', '清蒸'], alias: ['紫甘蓝', '紫包菜'] },
  { id: 'v_agaric', name: '木耳', short: '木耳', emoji: '🍄', category: '蔬菜', n: [265, 12.1, 1.5, 65.6, 29.9, 0, 48], methods: ['爆炒', '凉拌', '清炒', '香辣'], alias: ['木耳', '黑木耳', '云耳'] },
  { id: 'v_kelp', name: '海带', short: '海带', emoji: '🌿', category: '蔬菜', n: [13, 1.2, 0.1, 2.1, 0.5, 0.3, 107], methods: ['凉拌', '炖煮', '香辣', '清炒'], alias: ['海带', '海带结', '昆布'] },
  { id: 'v_bamboo_shoot', name: '竹笋', short: '竹笋', emoji: '🎋', category: '蔬菜', n: [23, 2.4, 0.1, 3.6, 1.8, 0.8, 3], methods: ['清炒', '红烧', '爆炒', '凉拌'], alias: ['竹笋', '春笋', '笋'] },
  { id: 'v_taro', name: '芋头', short: '芋头', emoji: '🥔', category: '蔬菜', n: [56, 2.2, 0.2, 12.7, 1.0, 0.5, 33], methods: ['清蒸', '炖煮', '红烧', '香酥'], alias: ['芋头', '香芋'] },
  { id: 'v_cauliflower', name: '花菜', short: '花菜', emoji: '🥦', category: '蔬菜', n: [24, 2.1, 0.2, 4.6, 2.1, 1.5, 32], methods: ['清炒', '干锅', '香辣', '清蒸'], alias: ['花菜', '菜花', '有机花菜'] },
  { id: 'v_corn', name: '玉米', short: '玉米', emoji: '🌽', category: '蔬菜', n: [112, 4.0, 1.2, 22.8, 2.9, 2.5, 3], methods: ['水煮', '烤制', '清炒', '炖煮'], alias: ['玉米', '甜玉米', '玉米棒'] },
  { id: 'v_pumpkin_food', name: '南瓜饭用', short: '南瓜', emoji: '🎃', category: '蔬菜', n: [26, 0.7, 0.1, 5.3, 0.8, 2.8, 1], methods: ['清蒸', '清炒', '炖煮', '蒜香'], alias: ['南瓜', '贝贝南瓜'] },
  { id: 'v_cherry_tomato', name: '圣女果', short: '圣女果', emoji: '🍅', category: '蔬菜', n: [22, 0.9, 0.2, 4.5, 1.0, 3.0, 5], methods: ['凉拌', '清炒'], alias: ['圣女果', '小番茄', '樱桃番茄'] },
  { id: 'v_king_oyster', name: '杏鲍菇', short: '杏鲍菇', emoji: '🍄', category: '蔬菜', n: [31, 1.3, 0.1, 8.3, 2.1, 1.5, 3], methods: ['干锅', '爆炒', '香辣', '椒盐'], alias: ['杏鲍菇', '刺芹侧耳'] },
  { id: 'v_oyster_mushroom', name: '平菇', short: '平菇', emoji: '🍄', category: '蔬菜', n: [20, 1.9, 0.3, 4.6, 2.3, 1.0, 8], methods: ['清炒', '香辣', '香酥', '蒜香'], alias: ['平菇', '侧耳'] },
  { id: 'v_shimeji', name: '海鲜菇', short: '海鲜菇', emoji: '🍄', category: '蔬菜', n: [25, 2.0, 0.3, 5.0, 2.5, 1.5, 4], methods: ['清炒', '蒜香', '麻辣'], alias: ['海鲜菇', '蟹味菇'] },
  { id: 'v_romaine', name: '油麦菜', short: '油麦菜', emoji: '🥬', category: '蔬菜', n: [15, 1.4, 0.4, 2.1, 0.6, 1.0, 80], methods: ['清炒', '蒜香', '凉拌'], alias: ['油麦菜', '莜麦菜'] },
  { id: 'v_pea_shoot', name: '豆苗', short: '豆苗', emoji: '🌱', category: '蔬菜', n: [34, 4.0, 0.8, 2.4, 1.8, 0.5, 18], methods: ['清炒', '蒜香', '水煮'], alias: ['豆苗', '豌豆苗'] },
  { id: 'v_seaweed', name: '紫菜', short: '紫菜', emoji: '🌿', category: '蔬菜', n: [250, 26.7, 1.1, 44.1, 21.6, 3.0, 710], methods: ['水煮', '凉拌'], alias: ['紫菜', '海苔'] },

  // ---- 水产补充（第三批：家常易做鱼类 / 贝类 / 小海鲜）----
  { id: 'b_eel', name: '黄鳝', short: '鳝鱼', emoji: '🐟', category: '肉蛋', n: [89, 18.0, 1.4, 1.2, 0, 0, 270], methods: ['爆炒', '红烧', '干锅', '香辣'], alias: ['鳝鱼', '黄鳝', '鳝丝'] },
  { id: 'b_catfish', name: '鲶鱼', short: '鲶鱼', emoji: '🐟', category: '肉蛋', n: [102, 14.6, 3.4, 4.5, 0, 0, 160], methods: ['红烧', '炖煮', '香辣', '蒜香'], alias: ['鲶鱼', '塘鲺'] },
  { id: 'b_tilapia', name: '罗非鱼', short: '罗非鱼', emoji: '🐟', category: '肉蛋', n: [98, 18.4, 1.5, 0, 0, 0, 53], methods: ['清蒸', '红烧', '香煎', '番茄汁'], alias: ['罗非鱼', '非洲鲫鱼'] },
  { id: 'b_saury', name: '秋刀鱼', short: '秋刀鱼', emoji: '🐟', category: '肉蛋', n: [196, 18.5, 13.2, 0, 0, 0, 79], methods: ['烤制', '香煎', '椒盐'], alias: ['秋刀鱼', '竹刀鱼'] },
  { id: 'b_whitebait', name: '银鱼', short: '银鱼', emoji: '🐟', category: '肉蛋', n: [98, 17.2, 4.0, 0, 0, 0, 155], methods: ['香酥', '清炒', '清蒸', '椒盐'], alias: ['银鱼', '小银鱼', '银鱼干'] },
  { id: 'b_river_snail', name: '田螺', short: '田螺', emoji: '🐚', category: '肉蛋', n: [60, 11.0, 0.2, 3.6, 0, 0, 100], methods: ['香辣', '爆炒', '麻辣'], alias: ['田螺', '螺蛳', '螺肉'] },
  { id: 'b_razor_clam', name: '蛏子', short: '蛏子', emoji: '🐚', category: '肉蛋', n: [40, 7.3, 0.3, 2.1, 0, 0, 130], methods: ['葱爆', '蒜蓉', '清蒸', '香辣'], alias: ['蛏子', '缢蛏'] },
  { id: 'b_sea_cucumber', name: '海参', short: '海参', emoji: '🥒', category: '肉蛋', n: [78, 16.5, 0.2, 2.5, 0, 0, 500], methods: ['葱爆', '红烧', '炖煮'], alias: ['海参', '刺参'] },
  { id: 'b_abalone', name: '鲍鱼', short: '鲍鱼', emoji: '🐚', category: '肉蛋', n: [84, 12.6, 0.8, 6.6, 0, 0, 201], methods: ['蒜蓉', '清蒸', '红烧', '葱爆'], alias: ['鲍鱼', '九孔鲍'] },
  { id: 'b_crayfish', name: '小龙虾', short: '小龙虾', emoji: '🦞', category: '肉蛋', n: [90, 18.9, 1.1, 0, 0, 0, 190], methods: ['麻辣', '蒜蓉', '香辣', '卤味'], alias: ['小龙虾', '口味虾', '麻小'] },
  { id: 'b_mantis_shrimp', name: '皮皮虾', short: '皮皮虾', emoji: '🦐', category: '肉蛋', n: [100, 20.6, 1.7, 2.3, 0, 0, 206], methods: ['白灼', '椒盐', '香辣'], alias: ['皮皮虾', '虾爬子', '濑尿虾'] },
  { id: 'b_jellyfish', name: '海蜇', short: '海蜇', emoji: '🪼', category: '肉蛋', n: [36, 3.7, 0.3, 3.8, 0, 0, 325], methods: ['凉拌', '葱爆'], alias: ['海蜇', '海蜇头', '海蜇丝'] },
  { id: 'b_bombay_duck', name: '巴浪鱼', short: '巴浪鱼', emoji: '🐟', category: '肉蛋', n: [125, 20.5, 5.0, 0, 0, 0, 70], methods: ['香煎', '红烧', '烤制'], alias: ['巴浪鱼', '蓝圆鲹', '池鱼'] },

  // ---- 畜禽补充（第三批：下水 / 卤味常用 / 家禽细分）----
  { id: 'b_beef_tongue', name: '牛舌', short: '牛舌', emoji: '🥩', category: '肉蛋', n: [196, 17.0, 13.5, 1.0, 0, 0, 80], methods: ['卤味', '凉拌', '烤制', '红烧'], alias: ['牛舌', '牛舌片'] },
  { id: 'b_beef_tripe_belly', name: '牛肚', short: '牛肚', emoji: '🥩', category: '肉蛋', n: [72, 14.5, 1.1, 2.0, 0, 0, 60], methods: ['爆炒', '麻辣', '卤味', '干锅'], alias: ['牛肚', '毛肚', '牛百叶'] },
  { id: 'b_pork_stomach', name: '猪肚', short: '猪肚', emoji: '🍖', category: '肉蛋', n: [110, 15.2, 5.1, 0.7, 0, 0, 75], methods: ['炖煮', '爆炒', '卤味', '香辣'], alias: ['猪肚', '肚条'] },
  { id: 'b_pork_ear', name: '猪耳', short: '猪耳', emoji: '🍖', category: '肉蛋', n: [190, 19.1, 11.8, 0, 0, 0, 68], methods: ['卤味', '凉拌', '香辣'], alias: ['猪耳', '耳丝', '卤猪耳'] },
  { id: 'b_pork_heart', name: '猪心', short: '猪心', emoji: '🍖', category: '肉蛋', n: [119, 16.6, 5.3, 1.1, 0, 0, 71], methods: ['爆炒', '卤味', '酸辣', '凉拌'], alias: ['猪心', '心片'] },
  { id: 'b_pork_tongue', name: '猪舌', short: '猪舌', emoji: '🍖', category: '肉蛋', n: [233, 15.7, 18.1, 1.7, 0, 0, 79], methods: ['卤味', '红烧', '凉拌'], alias: ['猪舌', '口条'] },
  { id: 'b_chicken_gizzard', name: '鸡胗', short: '鸡胗', emoji: '🍗', category: '肉蛋', n: [118, 19.2, 2.7, 4.0, 0, 0, 74], methods: ['爆炒', '卤味', '香辣', '泡椒'], alias: ['鸡胗', '鸡肫', '鸡胃'] },
  { id: 'b_chicken_liver', name: '鸡肝', short: '鸡肝', emoji: '🍗', category: '肉蛋', n: [121, 16.6, 4.8, 2.8, 0, 0, 92], methods: ['爆炒', '卤味', '酱香'], alias: ['鸡肝', '鸡肝酱'] },
  { id: 'b_duck_blood', name: '鸭血', short: '鸭血', emoji: '🩸', category: '肉蛋', n: [108, 13.6, 0.4, 0.9, 0, 0, 180], methods: ['麻辣', '炖煮', '酸辣'], alias: ['鸭血', '血豆腐'] },
  { id: 'b_pork_blood', name: '猪血', short: '猪血', emoji: '🩸', category: '肉蛋', n: [55, 12.2, 0.3, 0.9, 0, 0, 180], methods: ['炖煮', '麻辣', '葱爆'], alias: ['猪血', '血豆腐'] },
  { id: 'b_goose', name: '鹅肉', short: '鹅肉', emoji: '🦆', category: '肉蛋', n: [251, 17.9, 19.9, 0, 0, 0, 58], methods: ['卤味', '红烧', '烤制', '炖煮'], alias: ['鹅肉', '烧鹅', '碌鹅'] },
  { id: 'b_rabbit', name: '兔肉', short: '兔肉', emoji: '🍖', category: '肉蛋', n: [102, 19.7, 2.2, 0.9, 0, 0, 45], methods: ['麻辣', '红烧', '干锅', '香辣'], alias: ['兔肉', '冷吃兔'] },
  { id: 'b_pigeon', name: '乳鸽', short: '乳鸽', emoji: '🕊️', category: '肉蛋', n: [201, 16.5, 14.2, 1.7, 0, 0, 60], methods: ['烤制', '红烧', '炖煮'], alias: ['乳鸽', '鸽子', '红烧乳鸽'] },
  { id: 'b_bullfrog', name: '牛蛙', short: '牛蛙', emoji: '🐸', category: '肉蛋', n: [81, 17.4, 0.5, 1.0, 0, 0, 60], methods: ['麻辣', '干锅', '香辣', '泡椒'], alias: ['牛蛙', '蛙肉', '干锅牛蛙'] },

  // ---- 蛋 / 豆制品（第三批：常见豆腐制品与豆类）----
  { id: 'b_oil_tofu', name: '油豆腐', short: '油豆腐', emoji: '🧈', category: '豆制品', n: [244, 17.0, 17.6, 6.0, 0.5, 0, 30], methods: ['红烧', '炖煮', '麻辣', '卤味'], alias: ['油豆腐', '豆腐泡', '豆泡'] },
  { id: 'b_su_ji', name: '素鸡', short: '素鸡', emoji: '🧈', category: '豆制品', n: [192, 16.5, 12.5, 4.5, 0.5, 0, 330], methods: ['红烧', '卤味', '凉拌', '酱香'], alias: ['素鸡', '素肠'] },
  { id: 'b_qianye_tofu', name: '千叶豆腐', short: '千叶豆腐', emoji: '🧈', category: '豆制品', n: [110, 9.0, 5.0, 6.0, 0.5, 0, 420], methods: ['干锅', '香辣', '铁板', '麻辣'], alias: ['千叶豆腐', '千页豆腐'] },
  { id: 'b_tofu_pudding', name: '豆腐脑', short: '豆花', emoji: '⬜', category: '豆制品', n: [15, 1.9, 0.8, 0, 0, 0, 10], methods: ['凉拌', '水煮'], alias: ['豆腐脑', '豆花', '豆腐花'] },
  { id: 'b_fermented_tofu', name: '腐乳', short: '腐乳', emoji: '🧈', category: '豆制品', n: [133, 12.0, 7.9, 4.2, 0.5, 0, 3600], methods: ['凉拌', '清蒸'], alias: ['腐乳', '豆腐乳', '霉豆腐'] },
  { id: 'v_bean_sprout', name: '黄豆芽', short: '黄豆芽', emoji: '🌱', category: '蔬菜', n: [44, 4.5, 1.6, 4.5, 1.5, 0.5, 7], methods: ['清炒', '爆炒', '水煮', '凉拌'], alias: ['黄豆芽', '豆芽'] },
  { id: 'v_edamame', name: '毛豆', short: '毛豆', emoji: '🫛', category: '蔬菜', n: [131, 13.1, 5.0, 10.5, 4.0, 0, 3], methods: ['水煮', '卤味', '凉拌', '清炒'], alias: ['毛豆', '青豆', '毛豆荚'] },

  // ---- 蔬菜补充（第三批：叶菜 / 菌菇 / 根茎 / 豆类）----
  { id: 'v_shepherd_purse', name: '荠菜', short: '荠菜', emoji: '🌿', category: '蔬菜', n: [27, 2.9, 0.4, 3.5, 1.7, 0, 15], methods: ['清炒', '凉拌', '水煮'], alias: ['荠菜', '护生草'] },
  { id: 'v_amaranth', name: '苋菜', short: '苋菜', emoji: '🥬', category: '蔬菜', n: [30, 2.8, 0.4, 4.1, 1.8, 0, 40], methods: ['清炒', '蒜香', '水煮'], alias: ['苋菜', '红苋菜'] },
  { id: 'v_shanghai_green', name: '上海青', short: '上海青', emoji: '🥬', category: '蔬菜', n: [15, 1.5, 0.3, 2.7, 0.8, 0.5, 55], methods: ['清炒', '蒜香', '水煮'], alias: ['上海青', '小青菜', '青江菜'] },
  { id: 'v_chinese_kale', name: '芥蓝', short: '芥蓝', emoji: '🥬', category: '蔬菜', n: [24, 2.8, 0.4, 3.6, 1.6, 1.5, 50], methods: ['清炒', '蒜蓉', '水煮', '白灼'], alias: ['芥蓝', '盖菜'] },
  { id: 'v_mustard_green', name: '芥菜', short: '芥菜', emoji: '🥬', category: '蔬菜', n: [24, 2.5, 0.4, 3.6, 1.6, 1.0, 30], methods: ['清炒', '炖煮', '凉拌'], alias: ['芥菜', '雪里蕻'] },
  { id: 'v_toon', name: '香椿', short: '香椿', emoji: '🌱', category: '蔬菜', n: [47, 1.7, 0.4, 10.5, 1.8, 0, 5], methods: ['清炒', '凉拌', '香酥'], alias: ['香椿', '香椿芽'] },
  { id: 'v_lettuce_stem', name: '莴笋', short: '莴笋', emoji: '🥒', category: '蔬菜', n: [15, 1.0, 0.1, 2.8, 0.6, 1.5, 36], methods: ['清炒', '凉拌', '爆炒'], alias: ['莴笋', '青笋', '莴苣'] },
  { id: 'v_water_chestnut', name: '荸荠', short: '荸荠', emoji: '🥔', category: '蔬菜', n: [61, 1.2, 0.2, 14.2, 1.1, 3.5, 15], methods: ['清炒', '凉拌', '炖煮'], alias: ['荸荠', '马蹄', '地栗'] },
  { id: 'v_sweet_potato', name: '红薯', short: '红薯', emoji: '🍠', category: '蔬菜', n: [86, 1.6, 0.2, 20.1, 1.6, 4.5, 28], methods: ['清蒸', '烤制', '水煮', '炖煮'], alias: ['红薯', '地瓜', '番薯'] },
  { id: 'v_purple_potato', name: '紫薯', short: '紫薯', emoji: '🍠', category: '蔬菜', n: [82, 1.4, 0.2, 18.8, 1.5, 3.5, 25], methods: ['清蒸', '烤制', '水煮'], alias: ['紫薯', '紫心甘薯'] },
  { id: 'v_straw_mushroom', name: '草菇', short: '草菇', emoji: '🍄', category: '蔬菜', n: [27, 2.7, 0.2, 4.3, 1.6, 1.5, 70], methods: ['清炒', '蒜蓉', '红烧', '香辣'], alias: ['草菇', '兰花菇'] },
  { id: 'v_shimeji_jidi', name: '鸡腿菇', short: '鸡腿菇', emoji: '🍄', category: '蔬菜', n: [23, 2.5, 0.3, 3.5, 2.0, 1.0, 8], methods: ['清炒', '干锅', '香辣', '蒜香'], alias: ['鸡腿菇', '毛头鬼伞'] },
  { id: 'v_tea_tree_mushroom', name: '茶树菇', short: '茶树菇', emoji: '🍄', category: '蔬菜', n: [28, 4.2, 0.3, 5.0, 2.5, 1.0, 5], methods: ['干锅', '爆炒', '香辣', '炖煮'], alias: ['茶树菇', '茶薪菇'] },
  { id: 'v_bamboo_fungus', name: '竹荪', short: '竹荪', emoji: '🍄', category: '蔬菜', n: [155, 17.0, 1.4, 28.0, 11.0, 0, 60], methods: ['炖煮', '清蒸', '水煮'], alias: ['竹荪', '竹笙'] },
  { id: 'v_beech_mushroom', name: '蟹味菇', short: '蟹味菇', emoji: '🍄', category: '蔬菜', n: [25, 2.0, 0.3, 5.0, 2.5, 1.5, 4], methods: ['清炒', '蒜香', '麻辣', '水煮'], alias: ['蟹味菇', '海鲜菇'] }
]

/* ===================================================================
 * 三、生成函数
 * =================================================================== */

/** 保留一位小数 */
function r1(n) {
  return Math.round(Number(n || 0) * 10) / 10
}

/**
 * 按「食材 + 做法」推算单条菜品的营养值
 * @param {object} ingredient 食材对象
 * @param {string} methodName 做法名称
 * @returns {object|null} 菜品条目；若做法参数缺失则返回 null
 */
function composeDish(ingredient, methodName) {
  const method = COOK_METHODS[methodName]
  if (!method) return null

  const [, basePro, baseFat, baseCarb, baseFiber, baseSugar, baseSodium] = ingredient.n
  const keep = 1 - method.loss

  // 按公式推算（loss 影响水溶性营养素，用油/用糖/芡粉为额外增量）
  const protein = basePro * keep
  const fat = baseFat * keep + method.oil
  const carb = baseCarb * keep + method.sugar + method.starch
  const fiber = baseFiber * keep
  const sugar = baseSugar * keep + method.sugar
  const sodium = baseSodium * keep + method.sodium
  // Atwater 系数反算热量，保证「热量 = 4×蛋白 + 9×脂肪 + 4×碳水」自洽
  const calories = 4 * protein + 9 * fat + 4 * carb

  return {
    id: `${ingredient.id}_${methodName}`,
    name: `${methodName}${ingredient.short}`,
    emoji: method.emoji,
    category: ingredient.category,
    unit: '100g',
    calories: Math.round(calories),
    protein: r1(protein),
    fat: r1(fat),
    carb: r1(carb),
    fiber: r1(fiber),
    sugar: r1(sugar),
    sodium: Math.round(sodium),
    // 关键词：做法名 + 食材全名/短名/别名 + 组合名，保证任意检索方式都能命中
    keywords: [methodName, ingredient.name, ingredient.short, `${methodName}${ingredient.name}`, ...ingredient.alias],
    tags: [...method.tags, '组合生成'],
    source: 'generated', // 标记来源，便于区分手写种子与推算条目
    composition: { base: ingredient.name, method: methodName, oil: method.oil, sugar: method.sugar, loss: method.loss }
  }
}

/**
 * 批量生成所有组合菜品
 * @returns {Array} 菜品条目数组（可能包含重名，由 foods.js 统一去重）
 */
export function generateComposedDishes() {
  const list = []
  BASE_INGREDIENTS.forEach((ingredient) => {
    ingredient.methods.forEach((methodName) => {
      const dish = composeDish(ingredient, methodName)
      if (dish) list.push(dish)
    })
  })
  return list
}

/** 生成条目的数量（用于知识库 / 统计展示） */
export const GENERATED_COUNT = BASE_INGREDIENTS.reduce((sum, item) => sum + item.methods.length, 0)

/**
 * AI 膳食推荐 —— 食谱库与运动方案库
 * ------------------------------------------------------------------
 * 推荐算法（见 src/utils/nutrition.js 的 buildMealPlan）：
 *   1. 读取用户身体数据 → 得到每日推荐摄入热量与三大营养素目标
 *   2. 读取当日饮食记录 → 计算营养缺口
 *   3. 按缺口优先级（缺什么补什么）从对应餐段的候选中打分排序
 *   4. 输出早 / 午 / 晚餐 + 水果 + 加餐 + 配套运动方案
 *
 * 食谱字段：
 *   focus    营养侧重标签，用于与「营养缺口」做匹配打分
 *   theme    卡片配色主题（对应六种马卡龙底色）
 *   nutrition 该份食谱的营养估算值
 */

/* ===================================================================
 * 一、早餐候选（目标：唤醒代谢 + 优质蛋白 + 慢碳水）
 * =================================================================== */
export const BREAKFAST_RECIPES = [
  {
    id: 'b1',
    name: '燕麦牛奶 + 水煮蛋 + 蓝莓',
    emoji: '🥣',
    theme: 'yellow',
    focus: ['高纤维', '高蛋白', '低糖'],
    time: '10 分钟',
    nutrition: { calories: 385, protein: 20.5, fat: 9.8, carb: 51, fiber: 8.2, sugar: 11, sodium: 180 },
    ingredients: [
      { name: '燕麦片', amount: '40g' },
      { name: '脱脂牛奶', amount: '250ml' },
      { name: '鸡蛋', amount: '1 个' },
      { name: '蓝莓', amount: '50g' }
    ],
    steps: ['燕麦片用热牛奶冲泡，静置 3 分钟至软糯。', '鸡蛋冷水下锅煮 8 分钟，过凉水后剥壳。', '蓝莓洗净撒在燕麦上，即可享用。'],
    reason: '慢消化碳水 + 优质蛋白组合，血糖上升平缓，饱腹感可持续 4 小时以上。'
  },
  {
    id: 'b2',
    name: '全麦三明治 + 无糖豆浆',
    emoji: '🥪',
    theme: 'orange',
    focus: ['高蛋白', '高纤维'],
    time: '8 分钟',
    nutrition: { calories: 350, protein: 22, fat: 10.5, carb: 42, fiber: 8.5, sugar: 6, sodium: 460 },
    ingredients: [
      { name: '全麦面包', amount: '2 片(60g)' },
      { name: '鸡蛋', amount: '1 个' },
      { name: '生菜', amount: '30g' },
      { name: '番茄', amount: '50g' },
      { name: '无糖豆浆', amount: '250ml' }
    ],
    steps: ['全麦面包烤至微脆。', '鸡蛋煎成蛋饼（少油），与生菜、番茄夹入面包。', '搭配无糖豆浆一起食用。'],
    reason: '全麦提供膳食纤维，鸡蛋与豆浆补充植物 + 动物双蛋白，钠含量适中。'
  },
  {
    id: 'b3',
    name: '红薯 + 无糖酸奶 + 核桃',
    emoji: '🍠',
    theme: 'green',
    focus: ['高纤维', '低脂', '低糖'],
    time: '12 分钟',
    nutrition: { calories: 320, protein: 12.5, fat: 11.5, carb: 42, fiber: 7.4, sugar: 12, sodium: 90 },
    ingredients: [
      { name: '红薯', amount: '200g' },
      { name: '无糖酸奶', amount: '150g' },
      { name: '核桃', amount: '2 个(20g)' }
    ],
    steps: ['红薯洗净，烤箱 200℃ 烤 25 分钟（或蒸 15 分钟）。', '酸奶盛碗，撒上掰碎的核桃仁。', '搭配红薯一同食用。'],
    reason: '红薯升糖指数低且纤维丰富，酸奶补充益生菌与蛋白，核桃提供优质脂肪。'
  },
  {
    id: 'b4',
    name: '虾仁蔬菜粥 + 凉拌菠菜',
    emoji: '🍜',
    theme: 'cyan',
    focus: ['低脂', '高蛋白', '低钠'],
    time: '20 分钟',
    nutrition: { calories: 290, protein: 18, fat: 3.2, carb: 44, fiber: 3.6, sugar: 2, sodium: 320 },
    ingredients: [
      { name: '白米饭', amount: '80g' },
      { name: '基围虾', amount: '60g' },
      { name: '蘑菇', amount: '40g' },
      { name: '菠菜', amount: '100g' }
    ],
    steps: ['米饭加水煮开成粥底。', '放入虾仁与蘑菇片，小火煮 6 分钟。', '菠菜焯水 1 分钟，加少量生抽、香油凉拌。'],
    reason: '低脂高蛋白，温热易消化，适合肠胃敏感或需要控脂的人群。'
  },
  {
    id: 'b5',
    name: '玉米 + 鸡蛋 + 黑咖啡',
    emoji: '🌽',
    theme: 'blue',
    focus: ['控卡', '高纤维', '低糖'],
    time: '10 分钟',
    nutrition: { calories: 245, protein: 12.8, fat: 9.5, carb: 26, fiber: 4.1, sugar: 4, sodium: 140 },
    ingredients: [
      { name: '玉米', amount: '1 根(200g)' },
      { name: '鸡蛋', amount: '1 个' },
      { name: '黑咖啡', amount: '250ml' }
    ],
    steps: ['玉米蒸 12 分钟。', '鸡蛋水煮 8 分钟。', '搭配一杯黑咖啡，提升晨间代谢。'],
    reason: '总热量低、纤维足，适合处于热量缺口期的减脂人群。'
  }
]

/* ===================================================================
 * 二、午餐候选（目标：营养均衡 + 充足蛋白 + 足量蔬菜）
 * =================================================================== */
export const LUNCH_RECIPES = [
  {
    id: 'l1',
    name: '香煎鸡胸 + 糙米饭 + 西兰花',
    emoji: '🍗',
    theme: 'green',
    focus: ['高蛋白', '低脂', '高纤维'],
    time: '20 分钟',
    nutrition: { calories: 520, protein: 42, fat: 12, carb: 56, fiber: 6.6, sugar: 3, sodium: 380 },
    ingredients: [
      { name: '鸡胸肉', amount: '150g' },
      { name: '糙米饭', amount: '150g' },
      { name: '西兰花', amount: '150g' },
      { name: '橄榄油', amount: '5g' }
    ],
    steps: ['鸡胸肉用黑胡椒、少量盐腌制 10 分钟。', '平底锅刷薄油，中火两面各煎 4 分钟。', '西兰花焯水 2 分钟，糙米饭蒸熟，一同装盘。'],
    reason: '经典减脂增肌餐：高蛋白、低脂肪，糙米与西兰花提供充足膳食纤维。'
  },
  {
    id: 'l2',
    name: '番茄牛腩 + 杂粮饭 + 清炒时蔬',
    emoji: '🥩',
    theme: 'orange',
    focus: ['高蛋白', '高铁', '高能量'],
    time: '45 分钟',
    nutrition: { calories: 640, protein: 38, fat: 20, carb: 68, fiber: 5.8, sugar: 8, sodium: 620 },
    ingredients: [
      { name: '瘦牛肉', amount: '150g' },
      { name: '番茄', amount: '150g' },
      { name: '糙米饭', amount: '150g' },
      { name: '青椒', amount: '100g' }
    ],
    steps: ['牛肉切块冷水下锅焯水去腥。', '番茄炒出汁后加牛肉与热水，小火炖 30 分钟。', '杂粮饭蒸熟，青椒少油快炒，一同装盘。'],
    reason: '牛肉富含血红素铁与肌酸，适合增肌期与容易贫血的人群。'
  },
  {
    id: 'l3',
    name: '清蒸鲈鱼 + 白米饭 + 蒜蓉菠菜',
    emoji: '🐟',
    theme: 'blue',
    focus: ['低脂', '高蛋白', '低钠'],
    time: '25 分钟',
    nutrition: { calories: 470, protein: 34, fat: 9.5, carb: 54, fiber: 3.2, sugar: 2, sodium: 430 },
    ingredients: [
      { name: '鲈鱼', amount: '200g' },
      { name: '白米饭', amount: '150g' },
      { name: '菠菜', amount: '150g' },
      { name: '姜丝、葱段', amount: '适量' }
    ],
    steps: ['鲈鱼处理干净，铺姜丝葱段，水开后蒸 8 分钟。', '出锅淋少量蒸鱼豉油，浇热油激香。', '菠菜焯水后蒜蓉快炒。'],
    reason: '鱼肉脂肪以不饱和脂肪酸为主，低脂易吸收，适合控脂与三高人群。'
  },
  {
    id: 'l4',
    name: '香煎三文鱼 + 藜麦沙拉',
    emoji: '🥗',
    theme: 'purple',
    focus: ['高蛋白', '低糖', '高纤维'],
    time: '20 分钟',
    nutrition: { calories: 560, protein: 36, fat: 24, carb: 42, fiber: 9.5, sugar: 6, sodium: 350 },
    ingredients: [
      { name: '三文鱼', amount: '150g' },
      { name: '燕麦片（代藜麦）', amount: '40g' },
      { name: '生菜', amount: '80g' },
      { name: '番茄', amount: '80g' },
      { name: '牛油果', amount: '50g' }
    ],
    steps: ['三文鱼两面撒黑胡椒，少油煎 3 分钟/面。', '燕麦煮 8 分钟作为沙拉基底。', '拌入生菜、番茄、牛油果，淋柠檬汁调味。'],
    reason: 'Omega-3 脂肪酸含量高，有助于抗炎；搭配蔬菜纤维，膳食结构完整。'
  },
  {
    id: 'l5',
    name: '麻婆豆腐 + 玉米 + 炒青菜',
    emoji: '⬜',
    theme: 'yellow',
    focus: ['高蛋白', '低脂', '低糖'],
    time: '20 分钟',
    nutrition: { calories: 430, protein: 26, fat: 12, carb: 46, fiber: 6.2, sugar: 3, sodium: 680 },
    ingredients: [
      { name: '北豆腐', amount: '200g' },
      { name: '玉米', amount: '150g' },
      { name: '大白菜', amount: '150g' },
      { name: '豆瓣酱', amount: '8g' }
    ],
    steps: ['豆腐切块，淡盐水浸泡 5 分钟去豆腥。', '少油炒豆瓣酱出香，加水烧开下豆腐，小火煨 5 分钟。', '玉米蒸熟，白菜快炒，一同装盘。'],
    reason: '植物蛋白 + 玉米纤维的清淡组合，性价比高；注意豆瓣酱含钠较高，需减少其他用盐。'
  }
]

/* ===================================================================
 * 三、晚餐候选（目标：清淡易消化 + 控制总热量）
 * =================================================================== */
export const DINNER_RECIPES = [
  {
    id: 'd1',
    name: '白灼虾 + 蒸红薯 + 清炒西兰花',
    emoji: '🦐',
    theme: 'green',
    focus: ['低脂', '高蛋白', '控卡'],
    time: '18 分钟',
    nutrition: { calories: 380, protein: 30, fat: 5.5, carb: 42, fiber: 5.4, sugar: 7, sodium: 420 },
    ingredients: [
      { name: '基围虾', amount: '150g' },
      { name: '红薯', amount: '150g' },
      { name: '西兰花', amount: '150g' }
    ],
    steps: ['虾加姜片水煮 3 分钟至变红。', '红薯蒸 15 分钟。', '西兰花焯水后少油快炒 2 分钟。'],
    reason: '晚餐以低脂高蛋白 + 慢碳水为主，热量控制得当，不影响睡眠。'
  },
  {
    id: 'd2',
    name: '蔬菜鸡丝汤面',
    emoji: '🍜',
    theme: 'cyan',
    focus: ['低脂', '高纤维', '低钠'],
    time: '15 分钟',
    nutrition: { calories: 360, protein: 26, fat: 6, carb: 48, fiber: 5.2, sugar: 4, sodium: 380 },
    ingredients: [
      { name: '鸡胸肉', amount: '100g' },
      { name: '煮挂面', amount: '150g' },
      { name: '蘑菇', amount: '60g' },
      { name: '菠菜', amount: '80g' }
    ],
    steps: ['鸡胸肉水煮后撕成细丝。', '面条煮至八分熟，加入蘑菇与菠菜。', '最后放入鸡丝，调味只用少量盐与白胡椒。'],
    reason: '温热汤面易消化，鸡丝补充蛋白质，蔬菜补充纤维，适合加班后的轻晚餐。'
  },
  {
    id: 'd3',
    name: '香菇豆腐煲 + 糙米饭 + 拌黄瓜',
    emoji: '🍄',
    theme: 'purple',
    focus: ['低脂', '高蛋白', '高纤维'],
    time: '22 分钟',
    nutrition: { calories: 420, protein: 24, fat: 11, carb: 48, fiber: 6.8, sugar: 4, sodium: 480 },
    ingredients: [
      { name: '北豆腐', amount: '200g' },
      { name: '蘑菇', amount: '80g' },
      { name: '糙米饭', amount: '120g' },
      { name: '黄瓜', amount: '100g' }
    ],
    steps: ['豆腐切厚片煎至两面微黄。', '香菇与豆腐加清汤小火焖 8 分钟。', '黄瓜拍碎加蒜末、香醋凉拌。'],
    reason: '植物蛋白 + 菌菇多糖，脂肪低、饱腹感强，是素食者的优质晚餐。'
  },
  {
    id: 'd4',
    name: '番茄鸡蛋荞麦面',
    emoji: '🍅',
    theme: 'orange',
    focus: ['控卡', '高蛋白', '低糖'],
    time: '15 分钟',
    nutrition: { calories: 340, protein: 20, fat: 9, carb: 44, fiber: 4.2, sugar: 7, sodium: 400 },
    ingredients: [
      { name: '番茄', amount: '200g' },
      { name: '鸡蛋', amount: '2 个' },
      { name: '煮挂面', amount: '120g' }
    ],
    steps: ['番茄切块炒软出汁。', '倒入打散的蛋液炒至凝固。', '加入煮熟的面条拌匀，少许盐调味。'],
    reason: '经典低热量家常搭配，蛋白质与维生素兼顾，适合晚间控制热量。'
  },
  {
    id: 'd5',
    name: '清炒鸡毛菜 + 蒸鸡腿 + 玉米',
    emoji: '🥬',
    theme: 'yellow',
    focus: ['低脂', '高纤维'],
    time: '25 分钟',
    nutrition: { calories: 400, protein: 28, fat: 12, carb: 40, fiber: 5.8, sugar: 5, sodium: 350 },
    ingredients: [
      { name: '鸡腿肉', amount: '150g' },
      { name: '玉米', amount: '150g' },
      { name: '大白菜', amount: '180g' }
    ],
    steps: ['鸡腿去皮，加姜片蒸 18 分钟。', '玉米同锅蒸熟。', '白菜少油快炒 3 分钟。'],
    reason: '去皮鸡腿肉脂肪明显降低，保留口感的同时满足蛋白需求。'
  }
]

/* ===================================================================
 * 四、水果推荐（补充维生素与膳食纤维）
 * =================================================================== */
export const FRUIT_RECIPES = [
  {
    id: 'f1',
    name: '蓝莓',
    emoji: '🫐',
    theme: 'blue',
    focus: ['高纤维', '低糖', '抗氧化'],
    nutrition: { calories: 71, protein: 0.9, fat: 0.4, carb: 18, fiber: 3, sugar: 12.5, sodium: 1 },
    portion: '125g / 1 盒',
    reason: '花青素含量高，抗氧化能力强，且纤维丰富、升糖负荷低。'
  },
  {
    id: 'f2',
    name: '猕猴桃',
    emoji: '🥝',
    theme: 'green',
    focus: ['高纤维', '高VC'],
    nutrition: { calories: 61, protein: 0.8, fat: 0.6, carb: 14.5, fiber: 2.6, sugar: 9, sodium: 3 },
    portion: '100g / 1 个',
    reason: '维生素 C 含量在常见水果中名列前茅，纤维含量同样优秀。'
  },
  {
    id: 'f3',
    name: '苹果',
    emoji: '🍎',
    theme: 'orange',
    focus: ['高纤维', '低糖'],
    nutrition: { calories: 106, protein: 0.8, fat: 0.4, carb: 27.4, fiber: 3.4, sugar: 20.6, sodium: 3 },
    portion: '200g / 1 个',
    reason: '果胶丰富、饱腹感强，是加餐与替代高糖零食的首选。'
  },
  {
    id: 'f4',
    name: '草莓',
    emoji: '🍓',
    theme: 'purple',
    focus: ['低糖', '低卡', '高VC'],
    nutrition: { calories: 40, protein: 1.3, fat: 0.3, carb: 8.9, fiber: 1.4, sugar: 6.1, sodium: 5 },
    portion: '125g / 1 盒',
    reason: '含糖量在水果中偏低，热量低，控糖人群也可以放心食用。'
  },
  {
    id: 'f5',
    name: '橙子',
    emoji: '🍊',
    theme: 'yellow',
    focus: ['高VC', '低钠'],
    nutrition: { calories: 77, protein: 1.3, fat: 0.3, carb: 17.8, fiber: 1.6, sugar: 14.6, sodium: 0 },
    portion: '160g / 1 个',
    reason: '补充维生素 C 与钾元素，帮助缓解疲劳、维持电解质平衡。'
  }
]

/* ===================================================================
 * 五、加餐 / 零食推荐
 * =================================================================== */
export const SNACK_RECIPES = [
  {
    id: 's1',
    name: '无糖酸奶',
    emoji: '🥣',
    theme: 'cyan',
    focus: ['高蛋白', '低糖', '益生菌'],
    nutrition: { calories: 90, protein: 5.3, fat: 4.8, carb: 6.8, fiber: 0, sugar: 6, sodium: 68 },
    portion: '150g',
    reason: '补充蛋白与益生菌，改善肠道环境，且含糖量远低于风味酸奶。'
  },
  {
    id: 's2',
    name: '原味坚果（杏仁 + 核桃）',
    emoji: '🌰',
    theme: 'orange',
    focus: ['优质脂肪', '高纤维'],
    nutrition: { calories: 290, protein: 11.5, fat: 25, carb: 14, fiber: 7, sugar: 4, sodium: 2 },
    portion: '25g（约 15 粒）',
    reason: '富含不饱和脂肪酸与维生素 E，注意控制在 25g 以内以免热量超标。'
  },
  {
    id: 's3',
    name: '水煮蛋',
    emoji: '🥚',
    theme: 'yellow',
    focus: ['高蛋白', '低糖', '饱腹'],
    nutrition: { calories: 72, protein: 6.7, fat: 4.4, carb: 1.4, fiber: 0, sugar: 0.5, sodium: 66 },
    portion: '50g / 1 个',
    reason: '蛋白质吸收率极高，饥饿时补充 1 个鸡蛋既扛饿又不会升高血糖。'
  },
  {
    id: 's4',
    name: '无糖豆浆',
    emoji: '🥛',
    theme: 'green',
    focus: ['植物蛋白', '低糖', '低卡'],
    nutrition: { calories: 78, protein: 7.5, fat: 4, carb: 3, fiber: 2.8, sugar: 1.3, sodium: 8 },
    portion: '250ml',
    reason: '植物蛋白与大豆异黄酮来源，热量低，适合下午加餐。'
  }
]

/* ===================================================================
 * 六、运动方案（按日常运动强度匹配）
 * =================================================================== */
export const WORKOUT_PLANS = {
  sedentary: {
    label: '久坐少动',
    emoji: '🪑',
    weekly: '建议每周 3–4 次',
    items: [
      { emoji: '🚶', name: '快走', duration: '30 分钟', burn: 130 },
      { emoji: '🧘', name: '拉伸放松', duration: '10 分钟', burn: 30 },
      { emoji: '🏃', name: '间歇慢跑', duration: '15 分钟', burn: 150 },
      { emoji: '💪', name: '自重深蹲 + 俯卧撑', duration: '15 分钟', burn: 100 }
    ],
    tip: '从低强度开始，先把「每天都动一动」的习惯建立起来，再逐步增加强度与时长。'
  },
  light: {
    label: '轻度活动',
    emoji: '🚶',
    weekly: '建议每周 4–5 次',
    items: [
      { emoji: '🏃', name: '慢跑', duration: '30 分钟', burn: 255 },
      { emoji: '🚴', name: '骑行', duration: '40 分钟', burn: 280 },
      { emoji: '💪', name: '哑铃力量训练', duration: '25 分钟', burn: 180 },
      { emoji: '🤸', name: '核心训练（平板支撑等）', duration: '15 分钟', burn: 110 }
    ],
    tip: '有氧配合基础力量训练，既能提高热量消耗，也能保护关节与肌肉量。'
  },
  moderate: {
    label: '中度活动',
    emoji: '🏃',
    weekly: '建议每周 5 次',
    items: [
      { emoji: '🏃', name: '变速跑 / 节奏跑', duration: '40 分钟', burn: 400 },
      { emoji: '🏊', name: '游泳', duration: '40 分钟', burn: 380 },
      { emoji: '💪', name: '分化力量训练（推 / 拉 / 腿）', duration: '50 分钟', burn: 320 },
      { emoji: '🚴', name: '动感单车', duration: '35 分钟', burn: 350 }
    ],
    tip: '建议采用「有氧 + 力量」交替安排，力量训练后 30 分钟内补充蛋白质效果更好。'
  },
  active: {
    label: '高强度活动',
    emoji: '🔥',
    weekly: '建议每周 5–6 次',
    items: [
      { emoji: '🔥', name: 'HIIT 高强度间歇', duration: '25 分钟', burn: 350 },
      { emoji: '💪', name: '大重量复合训练（深蹲 / 硬拉）', duration: '60 分钟', burn: 420 },
      { emoji: '🏃', name: '长距离跑', duration: '60 分钟', burn: 560 },
      { emoji: '🧘', name: '恢复性拉伸 / 瑜伽', duration: '20 分钟', burn: 70 }
    ],
    tip: '高强度训练后务必安排恢复日，保证 7–9 小时睡眠，避免过度训练导致状态下滑。'
  }
}

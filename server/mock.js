/**
 * 服务端 Mock 响应（确定性）
 * ------------------------------------------------------------------
 * 用途：在没有 API Key / 没有外网的环境下，让「客户端封装 → 参数转换 →
 *       响应解析 → 前端展示」整条链路仍然可以完整跑通与验证。
 *
 * 特点：
 *   1. 输出结构与真实模型完全一致（food / confidence / reason / alternatives），
 *      因此上层适配器（visionAdapter）无需为 Mock 写任何特判分支；
 *   2. 结果是**确定性**的——同样的关键词永远返回同样的结果，便于自动化测试与断言；
 *   3. 未命中预设关键词时返回空结果，由上层如实提示「未识别到食物」，
 *      而不是随便编一个食物糊弄用户。
 */

/** 预设关键词 → 模拟模型输出（覆盖答辩最常用的几个场景） */
const MOCK_TABLE = [
  {
    keys: ['榴莲', 'durian', '金枕', '猫山王'],
    reply: {
      food: '榴莲',
      confidence: 0.97,
      reason: '果实表面具明显锥形硬刺、整体呈黄绿至褐黄色，符合榴莲的典型外观特征。',
      alternatives: ['菠萝蜜', '芒果']
    }
  },
  {
    keys: ['山竹', 'mangosteen'],
    reply: {
      food: '山竹',
      confidence: 0.95,
      reason: '深紫色近圆形果壳、顶部带宿存萼片，符合山竹典型外观。',
      alternatives: ['葡萄', '桑葚']
    }
  },
  {
    keys: ['菠萝蜜', 'jackfruit'],
    reply: {
      food: '菠萝蜜',
      confidence: 0.92,
      reason: '大型聚合果、表面具多边形小突起且颜色偏黄褐，符合菠萝蜜外观。',
      alternatives: ['榴莲']
    }
  },
  {
    keys: ['蛋炒饭', '炒饭', 'fried rice'],
    reply: {
      food: '蛋炒饭',
      confidence: 0.94,
      reason: '米粒呈金黄色且颗粒分明，伴有明显鸡蛋碎块与葱花，符合蛋炒饭外观。',
      alternatives: ['白米饭', '扬州炒饭']
    }
  },
  {
    keys: ['三文鱼', 'salmon'],
    reply: {
      food: '三文鱼',
      confidence: 0.93,
      reason: '鱼肉呈橙红色、切面可见明显白色脂肪纹理，符合三文鱼外观。',
      alternatives: ['北极贝', '金枪鱼']
    }
  },
  {
    keys: ['西兰花', 'broccoli'],
    reply: {
      food: '西兰花',
      confidence: 0.96,
      reason: '深绿色花球状结构、顶部密集小花蕾配粗壮浅绿茎，符合西兰花外观。',
      alternatives: ['花菜', '芥蓝']
    }
  },
  {
    keys: ['番茄', '西红柿', 'tomato'],
    reply: {
      food: '番茄',
      confidence: 0.94,
      reason: '红色近球形果实、表面光滑带光泽，符合番茄外观。',
      alternatives: ['红椒', '草莓']
    }
  },
  {
    keys: ['瘦牛肉', '牛肉', 'beef'],
    reply: {
      food: '瘦牛肉',
      confidence: 0.91,
      reason: '肌肉纤维纹理清晰、呈深红褐色，符合瘦牛肉外观。',
      alternatives: ['羊肉', '猪肉']
    }
  }
]

/**
 * 生成确定性 Mock 响应
 * @param {string[]} clues 文本线索（用户补充线索 + 文件名关键词）
 * @param {{delay?: number}} [options] delay 为模拟网络耗时，测试时可传 0
 * @returns {Promise<{food: string, confidence: number, reason: string, alternatives: string[]}>}
 */
export async function mockVisionReply(clues = [], options = {}) {
  const delay = Number.isFinite(options.delay) ? options.delay : 400
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))

  const joined = clues.join(' ').toLowerCase()
  const hit = MOCK_TABLE.find((item) => item.keys.some((k) => joined.includes(k.toLowerCase())))
  if (hit) return { ...hit.reply }

  // 未命中任何预设关键词：如返回空结果，交由上层提示用户补充线索
  return {
    food: '',
    confidence: 0,
    reason: '（Mock 模式）未命中预设关键词，无法给出识别结论。',
    alternatives: []
  }
}

/** Mock 支持的关键词清单（健康检查接口会返回，方便前端提示可用的演示词） */
export const MOCK_KEYWORDS = MOCK_TABLE.map((item) => item.keys[0])

/* ===================================================================
 * 二、对话助手 Mock（确定性营养问答）
 * ------------------------------------------------------------------
 * 用途：/api/chat 在没有 API Key / 没有外网时，仍能完整演示
 *       「多轮对话 → 流式输出 → 前端渲染」全链路。
 * 原则与视觉 Mock 相同：**确定性**（同样提问永远同样回答），
 * 且回答内容为真实营养常识（非编造），未命中时如实说明并引导用户换个问法。
 * =================================================================== */
const MOCK_CHAT_TABLE = [
  {
    keys: ['bmi', '体质指数', '体重指数', '体重标准'],
    reply:
      'BMI（身体质量指数）的计算方式是：体重(kg) ÷ 身高(m) 的平方。\n\n' +
      '按中国成人标准：\n' +
      '· < 18.5 偏瘦\n' +
      '· 18.5–23.9 正常\n' +
      '· 24.0–27.9 超重\n' +
      '· ≥ 28.0 肥胖\n\n' +
      '要注意的是，BMI 只看体重与身高，无法区分肌肉和脂肪。健身人群肌肉量大时 BMI 可能偏高，但体脂率其实正常。建议结合腰围（男性 < 90cm、女性 < 85cm）一起判断。'
  },
  {
    keys: ['减脂', '减肥', '瘦身', '掉秤', '热量缺口'],
    reply:
      '减脂的核心是**热量缺口**，而不是单纯少吃。\n\n' +
      '① 缺口控制在 300–500 kcal/天最稳妥，对应每周减重 0.3–0.5kg；缺口过大会掉肌肉、降基础代谢。\n' +
      '② 蛋白质要吃够：每公斤体重 1.2–1.6g，例如 60kg 的人每天约 72–96g。鸡胸肉、鱼虾、鸡蛋、豆腐、无糖酸奶都是优质来源。\n' +
      '③ 主食不要断：优先选糙米、燕麦、薯类等低升糖碳水，完全断碳容易暴食反弹。\n' +
      '④ 别迷信「减脂茶 / 代餐」，真正起作用的始终是总热量差。'
  },
  {
    keys: ['增肌', '长肌肉', '练肌肉', '蛋白质摄入'],
    reply:
      '增肌 = 力量训练（渐进超负荷）+ 温和热量盈余 + 足量蛋白质。\n\n' +
      '① 热量盈余 200–300 kcal/天即可，盈余太大增加的主要是脂肪。\n' +
      '② 蛋白质每公斤体重 1.6–2.2g，分 3–5 餐摄入吸收更好。\n' +
      '③ 训练后 1–2 小时内补充 20–40g 蛋白质 + 适量碳水，有助恢复。\n' +
      '④ 睡眠 7–9 小时——肌肉是在休息中生长的，熬夜会明显拖慢进度。'
  },
  {
    keys: ['控糖', '糖', '奶茶', '添加糖', '血糖'],
    reply:
      '《中国居民膳食指南》建议每日**添加糖**不超过 50g，最好控制在 25g 以内。\n\n' +
      '但很多「喝着不甜」的食物含糖惊人：\n' +
      '· 一杯全糖奶茶 ≈ 50g 糖\n' +
      '· 乳酸菌饮料 ≈ 15g/瓶\n' +
      '· 风味酸奶 ≈ 12g/100g\n\n' +
      '实用做法：点奶茶选三分糖或无糖、看配料表避开「白砂糖/果葡糖浆」排在前面、用水果代替甜点解馋。'
  },
  {
    keys: ['喝水', '饮水', '每天喝多少水'],
    reply:
      '一般建议成年人每天饮水 1500–1700ml（约 7–8 杯），出汗多、运动或高温天气要适当增加。\n\n' +
      '几个判断小技巧：\n' +
      '· 尿液呈淡黄色说明水分基本充足，深黄说明该补水了。\n' +
      '· 不要用含糖饮料、奶茶代替白水。\n' +
      '· 少量多次比一次猛灌更容易被身体利用。'
  },
  {
    keys: ['夜宵', '宵夜', '晚上吃', '睡前吃'],
    reply:
      '夜宵本身不是「原罪」，关键看总量和种类。\n\n' +
      '如果确实饿，建议：\n' +
      '· 优先选低热量高饱腹的：无糖酸奶、原味坚果（一小把）、水煮蛋、番茄黄瓜。\n' +
      '· 避开高油高糖：炸鸡、泡面、蛋糕、含糖饮料，这些容易造成热量超标与睡眠质量下降。\n' +
      '· 尽量在睡前 2 小时吃完，避免影响入睡。\n\n' +
      '更根本的还是把三餐吃均衡，白天蛋白质与纤维吃够，晚上自然不容易饿。'
  },
  {
    keys: ['外卖', '点外卖', '快餐', '食堂'],
    reply:
      '点外卖想吃得健康，记住 4 个技巧：\n\n' +
      '① 优先选「蒸 / 煮 / 炖 / 凉拌」的菜，少选「炸 / 干锅 / 红烧 / 糖醋」。\n' +
      '② 主食减半或换杂粮饭，一份炒饭的热量常超过 600 kcal。\n' +
      '③ 主动备注「少油少盐」，或把汤汁多的菜沥一下再吃。\n' +
      '④ 加一份水煮青菜或凉拌菜，补足膳食纤维。\n\n' +
      '不必每餐都如此，一周内大部分餐次做到，整体就会明显改善。'
  },
  {
    keys: ['热量', '卡路里', '多少千卡', 'kcal'],
    reply:
      '想查具体食物的热量，可以直接在本项目「营养知识库 → 常见食物热量表」里搜索，' +
      '那里收录了 900+ 条食物与对应分量的热量及运动消耗估算。\n\n' +
      '几个高热量预警：\n' +
      '· 一份炒饭 ≈ 600+ kcal\n' +
      '· 一杯全糖奶茶 ≈ 350–500 kcal\n' +
      '· 一份炸鸡 ≈ 450 kcal\n' +
      '· 一片芝士蛋糕 ≈ 350 kcal\n\n' +
      '相对低热量的选择：水煮蔬菜、清蒸鱼虾、白灼鸡胸、无糖酸奶、大部分新鲜水果。'
  }
]

/**
 * 生成确定性的对话 Mock 回复
 * @param {string} text 用户最新提问（或其拼接文本）
 * @param {{delay?: number}} [options] delay 为模拟首字延迟，测试时可传 0
 * @returns {Promise<string>} 回复正文
 */
export async function mockChatReply(text = '', options = {}) {
  const delay = Number.isFinite(options.delay) ? options.delay : 300
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))

  const joined = String(text || '').toLowerCase()
  const hit = MOCK_CHAT_TABLE.find((item) => item.keys.some((k) => joined.includes(k.toLowerCase())))
  if (hit) return hit.reply

  return (
    '（Mock 演示模式）我暂时没有匹配到对应的预设营养话题。\n\n' +
    '你可以试试问我：\n' +
    '· 我的 BMI 正常吗？\n' +
    '· 减脂期蛋白质要吃多少？\n' +
    '· 每天应该喝多少水？\n' +
    '· 外卖怎么点更健康？\n\n' +
    '提示：配置 .env 中的 AI_API_KEY 后，即可切换到真实大模型进行自由对话。'
  )
}

/** 对话 Mock 支持的示例话题（供健康检查接口提示） */
export const MOCK_CHAT_TOPICS = MOCK_CHAT_TABLE.map((item) => item.keys[0])

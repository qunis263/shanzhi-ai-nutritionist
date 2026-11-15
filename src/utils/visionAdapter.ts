/**
 * 视觉识别适配层
 * ------------------------------------------------------------------
 * 职责（对应需求「请求参数的标准化转换与响应结果的统一解析」）：
 *   ① 入参标准化：把页面的 (图片 dataURL, 文件名, 用户线索) 归一化为代理接口约定的
 *      { image, hint, clues } 结构，把「文件名」里的关键词抽取出来作为 clues；
 *   ② 出参统一解析：把模型返回的自由文本 / JSON 解析为 { food, confidence, reason, alternatives }；
 *   ③ 接口兼容：把模型结果**翻译成现有识别引擎的返回结构**（found / confidence / reasons /
 *      candidates / matchMode / features / isEstimating），使页面组件无需改动消费逻辑；
 *   ④ 数据落地：模型给出的食物名经数据库模糊检索绑定到 FOOD_DB 条目，才能拿到营养参数；
 *      匹配不到时如实返回 unmatchedName，由页面提示用户手动选择，绝不臆造营养值。
 */
import { searchFood, FOOD_DB, FOOD_MAP } from '@/data/foods'
import { extractTextClues } from '@/utils/recognition'
import type {
  AIMeta,
  AISource,
  FoodItem,
  LocalRecognitionResult,
  RecognitionCandidate,
  RecognitionModelResult,
  RecognitionPayload,
  RecognitionResult
} from '@/types'

type ResolveMode = 'empty' | 'exact' | 'contains' | 'keyword' | 'fuzzy' | 'unmatched'

interface RecognitionContext {
  source?: AISource
  meta?: AIMeta
  local?: LocalRecognitionResult | null
}

/* ===================================================================
 * 一、请求参数标准化转换
 * =================================================================== */

/**
 * 把页面输入归一化为代理接口的标准入参
 * @param {string} image 图片 dataURL（无真实图片时为空串，此时依赖线索识别）
 * @param {string} fileName 文件名 / 示例关键词
 * @param {string} hint 用户补充线索
 */
export function buildRequestPayload(image: string, fileName = '', hint = ''): RecognitionPayload {
  // 复用识别引擎的线索抽取规则，保证「文件名 → 关键词」的口径与本地引擎一致
  const clues = [...new Set([...extractTextClues(fileName), ...extractTextClues(hint)])].slice(0, 8)
  return {
    image: image || '',
    hint: (hint || '').slice(0, 100),
    clues
  }
}

/* ===================================================================
 * 二、响应结果的统一解析
 * =================================================================== */

/**
 * 校验并归一化代理返回的模型结果
 * @param {object} data 代理返回的 data 字段
 * @returns {{food: string, confidence: number, reason: string, alternatives: string[]}}
 */
export function parseModelResponse(data: unknown): RecognitionModelResult {
  const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  const food = String(raw.food ?? '').trim()
  let confidence = Number(raw.confidence)
  if (!Number.isFinite(confidence)) confidence = 0
  // 与服务端解析口径保持一致：>2 视为百分数，1~2 之间的越界值按满分处理
  if (confidence > 1) confidence = confidence > 2 ? confidence / 100 : 1
  confidence = Math.max(0, Math.min(1, confidence))

  const alternatives = Array.isArray(raw.alternatives)
    ? raw.alternatives
        .map((x: unknown) => String(x).trim())
        .filter(Boolean)
        .slice(0, 3)
    : []

  return {
    food,
    confidence,
    reason: String(raw.reason ?? '').trim(),
    alternatives
  }
}

/* ===================================================================
 * 三、食物名 → 本地数据库条目绑定
 * =================================================================== */

/** 名称归一化：去掉空格、蒸/炒等做法前后缀噪声，便于比对 */
function normalizeName(name: unknown): string {
  return String(name || '').replace(/[\s（）()·、,，]/g, '')
}

/**
 * 按优先级把模型给出的食物名绑定到本地食物库条目
 * 优先级：完全同名 → 条目名称被包含 → 关键词/别名命中 → 模糊检索首条
 * @param {string} name
 * @returns {{food: object|null, mode: string}}
 */
export function resolveFood(name: string): { food: FoodItem | null; mode: ResolveMode } {
  const target = normalizeName(name)
  if (!target) return { food: null, mode: 'empty' }

  // ① 完全同名
  const exact = FOOD_DB.find((f: FoodItem) => normalizeName(f.name) === target)
  if (exact) return { food: exact, mode: 'exact' }

  // ② 条目名称被模型名称包含，或反之（如模型输出「清蒸鲈鱼」↔ 库中「鲈鱼」）
  const contained = FOOD_DB.find((f: FoodItem) => {
    const n = normalizeName(f.name)
    return n.length >= 2 && (target.includes(n) || n.includes(target))
  })
  if (contained) return { food: contained, mode: 'contains' }

  // ③ 关键词 / 别名命中
  const byKeyword = FOOD_DB.find((f: FoodItem) =>
    (f.keywords || []).some((k: string) => {
      const nk = normalizeName(k)
      return nk.length >= 2 && (target === nk || target.includes(nk) || nk.includes(target))
    })
  )
  if (byKeyword) return { food: byKeyword, mode: 'keyword' }

  // ④ 模糊检索兜底（加权评分，取首条）
  const hits = searchFood(name, 1)
  if (hits.length) return { food: hits[0], mode: 'fuzzy' }

  return { food: null, mode: 'unmatched' }
}

/* ===================================================================
 * 四、映射为现有识别引擎的返回结构（页面零改动兼容）
 * =================================================================== */

/** 把模型给出的候选名逐条绑定到数据库，构造成页面候选排名所需的结构 */
function buildCandidates(
  parsed: RecognitionModelResult,
  matchedFood: FoodItem | null,
  localCandidates: LocalRecognitionResult['candidates'] = []
): RecognitionCandidate[] {
  const list: RecognitionCandidate[] = []
  const seen = new Set<string>()

  const push = (food: FoodItem | null | undefined, score: number, fromModel: boolean) => {
    if (!food || seen.has(food.id)) return
    seen.add(food.id)
    list.push({ food, score: Math.max(5, Math.min(100, score)), raw: score, fromModel: Boolean(fromModel) })
  }

  // 首位：模型判定的主结果（分数直接取置信度，体现「模型打分」）
  if (matchedFood) push(matchedFood, parsed.confidence * 100, true)

  // 次位：模型给出的易混淆候选，分数按置信度阶梯递减
  parsed.alternatives.forEach((name: string, i: number) => {
    const { food } = resolveFood(name)
    push(food, parsed.confidence * 100 - (i + 1) * 12, true)
  })

  // 末位：本地引擎的视觉候选（保留可解释特征排行，作为交叉验证展示）
  ;(localCandidates || []).forEach((c: { food: FoodItem; score: number }) => push(c.food, c.score, false))

  return list.slice(0, 5)
}

/**
 * 把模型结果翻译成识别引擎的标准返回结构
 * @param {object} parsed parseModelResponse 的产物
 * @param {object} context { source, meta, local }
 * @returns {object} 与 rankCandidates 返回结构一致的识别结果
 */
export function toRecognitionResult(
  parsed: RecognitionModelResult,
  context: RecognitionContext = {}
): RecognitionResult {
  const { source = 'cloud', meta = {}, local = null } = context
  const resolved = resolveFood(parsed.food)
  const matchedFood = resolved.food

  // 若模型名字未能绑定数据库，退而使用本地引擎的最佳匹配，但仍明确标记未匹配
  const found = matchedFood || (local?.found ?? (FOOD_DB[0] as FoodItem))
  const unmatchedName = matchedFood ? '' : parsed.food

  /* ---- 判定依据：先给模型依据，再补本地可解释的视觉特征 ---- */
  const reasons = []
  if (source === 'mock') {
    reasons.push('🧪 当前为 Mock 演示模式：以下结论由本地确定性模拟响应生成，接入真实密钥后将由大模型输出')
  } else {
    reasons.push(`☁️ 大模型判定依据：${parsed.reason || '（模型未提供说明）'}`)
  }
  if (matchedFood) {
    reasons.push(
      `🗂️ 已绑定本地食物库条目「${found.name}」，营养参数取自已录入的每 100g 数据（匹配方式：${resolveModeText(resolved.mode)}）`
    )
  } else if (parsed.food) {
    reasons.push(`⚠️ 模型识别为「${parsed.food}」，但本地食物库暂无该条目，无法给出营养参数，请手动搜索添加`)
  }
  if (local?.features?.ok) {
    reasons.push(
      ...local.reasons
        .filter((r: string) => !r.startsWith('文件名无有效线索') && !r.startsWith('文件名线索'))
        .slice(0, 2)
    )
  }

  return {
    features: local?.features ?? null,
    found,
    confidence: Math.max(0.35, Math.min(0.99, parsed.confidence || 0.5)),
    reasons,
    candidates: buildCandidates(parsed, matchedFood, local?.candidates),
    matchedSignature: local?.matchedSignature || '',
    matchMode: source === 'mock' ? 'mock' : 'cloud',
    // 置信度过低或未能绑定数据库时，标记为「仅供参考」的估算状态
    isEstimating: !matchedFood || parsed.confidence < 0.4,
    unmatchedName,
    source,
    meta
  }
}

/** 匹配方式的中文描述 */
function resolveModeText(mode: ResolveMode): string {
  const map: Partial<Record<ResolveMode, string>> = {
    exact: '名称完全一致',
    contains: '名称包含匹配',
    keyword: '别名 / 关键词命中',
    fuzzy: '模糊检索命中',
    unmatched: '未匹配'
  }
  return map[mode] || '模糊检索命中'
}

/** 便捷导出：按 id 取食物（供页面或测试使用） */
export function foodById(id: string): FoodItem | null {
  return (FOOD_MAP[id] as FoodItem | undefined) || null
}

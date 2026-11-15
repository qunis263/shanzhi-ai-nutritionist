import { FOOD_DB } from '@/data/foods'
import { FOOD_CONFLICTS, HEALTHY_HABITS, SCIENCE_ARTICLES } from '@/data/knowledge'
import type { KnowledgeReference, RetrievalChannel } from '@/types'

interface KnowledgeDocument {
  id: string
  kind: string
  emoji: string
  title: string
  tags: string[]
  text: string
  metadata: {
    category: string
    riskLevel: 'normal' | 'medical'
    updatedAt: string
  }
  tokens: string[]
  termFrequency: Map<string, number>
  vector: number[]
}

export interface EmbeddingProvider {
  id: string
  dimensions: number
  embed(text: string): number[]
}

export interface RetrievalOptions {
  limit?: number
  candidateLimit?: number
  preferredKinds?: string[]
}

interface RankedCandidate {
  doc: KnowledgeDocument
  score: number
  rank: number
}

const INDEX_UPDATED_AT = '2026-11-14'
const BM25_K1 = 1.5
const BM25_B = 0.75
const RRF_K = 60

const SEMANTIC_CONCEPTS: Record<string, string[]> = {
  hydration: ['喝水', '饮水', '补水', '水分', '口渴', '口干', '小口', '分次', '毫升'],
  sugar: ['糖', '添加糖', '甜食', '奶茶', '含糖', '控糖', '甜饮', '果葡糖浆'],
  sodium: ['钠', '盐', '控盐', '酱油', '腌制', '隐形盐', '咸', '口味重', '重口味'],
  protein: ['蛋白质', '增肌', '鸡胸肉', '鱼虾', '鸡蛋', '豆腐', '肌肉', '器械训练', '训练恢复'],
  fiber: ['膳食纤维', '纤维', '肠道', '便秘', '排便不顺', '肚子不通畅', '全谷物', '蔬菜', '饱腹'],
  weight: ['减脂', '减肥', '体重', '热量缺口', '掉秤', '肥胖', '瘦身', '腰围', '不反弹'],
  meal: ['三餐', '餐盘', '主食', '蔬菜', '搭配', '食谱', '外卖', '早餐', '午餐', '晚餐', '菜肉饭'],
  safety: ['疾病', '用药', '孕期', '肾病', '过敏', '就医', '医师', '风险'],
  conflict: ['相克', '一起吃', '同食', '搭配', '中毒', '辟谣', '能不能吃'],
  alcohol: ['酒', '酒精', '啤酒', '醉酒', '乙醛'],
  uric: ['尿酸', '痛风', '嘌呤', '海鲜'],
  sleep: ['睡眠', '熬夜', '睡前', '夜宵', '入睡', '半夜', '夜里'],
  exercise: ['运动', '力量训练', '慢跑', '快走', '训练'],
  nutrition: ['营养', '健康', '摄入', '推荐量', '每日', '成年人']
}

const CONCEPT_KEYS = Object.keys(SEMANTIC_CONCEPTS)

function normalizeText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
}

/** 中文采用 2/3 字滑窗，英文和数字保留完整词。 */
export function tokenizeForRetrieval(value: unknown): string[] {
  const text = String(value || '').toLowerCase()
  const tokens: string[] = []
  text.replace(/[a-z0-9.]+/g, word => {
    if (word.length >= 2) tokens.push(word)
    return word
  })
  for (const segment of text.match(/[\u4e00-\u9fa5]+/g) || []) {
    if (segment.length === 1) tokens.push(segment)
    for (let index = 0; index + 2 <= segment.length; index += 1) tokens.push(segment.slice(index, index + 2))
    for (let index = 0; index + 3 <= segment.length; index += 1) tokens.push(segment.slice(index, index + 3))
  }
  return tokens
}

function l2Normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  return length ? vector.map(value => value / length) : vector
}

/**
 * 离线语义 embedding：把同义表达映射到稳定的概念向量。
 * 接口可替换为远程 embedding provider，但默认实现不联网、可复现。
 */
export const localSemanticEmbeddingProvider: EmbeddingProvider = {
  id: 'local-semantic-v1',
  dimensions: CONCEPT_KEYS.length,
  embed(text: string) {
    const normalized = normalizeText(text)
    const vector = CONCEPT_KEYS.map(key => {
      const aliases = SEMANTIC_CONCEPTS[key]
      return aliases.reduce((score, alias) => (normalized.includes(normalizeText(alias)) ? score + 1 : score), 0)
    })
    return l2Normalize(vector)
  }
}

let embeddingProvider: EmbeddingProvider = localSemanticEmbeddingProvider
let documents: KnowledgeDocument[] | null = null
let documentFrequency: Map<string, number> | null = null
let averageDocumentLength = 0

export function setEmbeddingProvider(provider: EmbeddingProvider): void {
  if (!provider?.id || provider.dimensions <= 0) throw new Error('无效的 embedding provider')
  embeddingProvider = provider
  documents = null
  documentFrequency = null
}

export function getEmbeddingProviderInfo(): { id: string; dimensions: number } {
  return { id: embeddingProvider.id, dimensions: embeddingProvider.dimensions }
}

function termFrequency(tokens: string[]): Map<string, number> {
  const frequency = new Map<string, number>()
  tokens.forEach(token => frequency.set(token, (frequency.get(token) || 0) + 1))
  return frequency
}

function createDocument(input: Omit<KnowledgeDocument, 'tokens' | 'termFrequency' | 'vector'>): KnowledgeDocument {
  const weightedText = `${input.title} ${input.title} ${input.tags.join(' ')} ${input.tags.join(' ')} ${input.text}`
  const tokens = tokenizeForRetrieval(weightedText)
  return {
    ...input,
    tokens,
    termFrequency: termFrequency(tokens),
    vector: embeddingProvider.embed(`${input.title} ${input.tags.join(' ')} ${input.text}`)
  }
}

function buildDocuments(): KnowledgeDocument[] {
  const result: KnowledgeDocument[] = []
  SCIENCE_ARTICLES.forEach(article => {
    result.push(
      createDocument({
        id: `article:${article.id}`,
        kind: '科普文章',
        emoji: article.emoji || '📖',
        title: article.title,
        tags: (article.tags || []).filter(Boolean),
        text: [article.summary, ...article.sections.map(section => `${section.h} ${section.p}`)].join(' '),
        metadata: { category: article.tags?.[0] || '营养科普', riskLevel: 'normal', updatedAt: INDEX_UPDATED_AT }
      })
    )
  })
  FOOD_CONFLICTS.forEach(item => {
    result.push(
      createDocument({
        id: `conflict:${item.id}`,
        kind: '食物搭配',
        emoji: item.a?.emoji || '🍽️',
        title: `${item.a?.name || ''} + ${item.b?.name || ''}`,
        tags: [item.a?.name, item.b?.name, '相克', '搭配', '辟谣'].filter((tag): tag is string => Boolean(tag)),
        text: `民间说法：${item.desc} 科学结论：${item.truth}`,
        metadata: {
          category: '食物搭配',
          riskLevel: item.level === 'care' ? 'medical' : 'normal',
          updatedAt: INDEX_UPDATED_AT
        }
      })
    )
  })
  HEALTHY_HABITS.forEach((habit, index) => {
    result.push(
      createDocument({
        id: `habit:${index}`,
        kind: '健康习惯',
        emoji: habit.emoji || '✅',
        title: habit.title,
        tags: ['习惯', '生活方式', ...semanticTags(`${habit.title} ${habit.desc}`)],
        text: habit.desc,
        metadata: { category: '健康习惯', riskLevel: 'normal', updatedAt: INDEX_UPDATED_AT }
      })
    )
  })
  FOOD_DB.forEach(food => {
    result.push(
      createDocument({
        id: `food:${food.id}`,
        kind: '食物营养',
        emoji: food.emoji || '🍽️',
        title: food.name,
        tags: [food.category, ...(food.keywords || [])].filter((tag): tag is string => Boolean(tag)),
        text: `${food.name}（${food.category}）每 100g：热量 ${food.calories}kcal、蛋白质 ${food.protein}g、脂肪 ${food.fat}g、碳水 ${food.carb}g、膳食纤维 ${food.fiber}g、钠 ${food.sodium}mg`,
        metadata: { category: food.category || '食物营养', riskLevel: 'normal', updatedAt: INDEX_UPDATED_AT }
      })
    )
  })
  return result
}

function semanticTags(text: string): string[] {
  const vector = embeddingProvider.embed(text)
  return vector.flatMap((value, index) => (value > 0 ? [CONCEPT_KEYS[index]] : []))
}

function getDocuments(): KnowledgeDocument[] {
  if (!documents) {
    documents = buildDocuments()
    averageDocumentLength = documents.reduce((sum, doc) => sum + doc.tokens.length, 0) / Math.max(documents.length, 1)
    documentFrequency = new Map<string, number>()
    documents.forEach(doc => {
      new Set(doc.tokens).forEach(token => documentFrequency?.set(token, (documentFrequency.get(token) || 0) + 1))
    })
  }
  return documents
}

function bm25Score(queryTokens: string[], doc: KnowledgeDocument, totalDocuments: number): number {
  const uniqueQuery = new Set(queryTokens)
  let score = 0
  uniqueQuery.forEach(token => {
    const frequency = doc.termFrequency.get(token) || 0
    if (!frequency) return
    const docFrequency = documentFrequency?.get(token) || 0
    const idf = Math.log(1 + (totalDocuments - docFrequency + 0.5) / (docFrequency + 0.5))
    const lengthNorm = 1 - BM25_B + BM25_B * (doc.tokens.length / Math.max(averageDocumentLength, 1))
    score += idf * ((frequency * (BM25_K1 + 1)) / (frequency + BM25_K1 * lengthNorm))
  })
  return score
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0
  return left.reduce((sum, value, index) => sum + value * right[index], 0)
}

function inferPreferredKinds(question: string): string[] {
  const text = normalizeText(question)
  if (/一起吃|同食|相克|中毒|搭配/.test(text)) return ['食物搭配']
  if (/热量|营养|蛋白质|脂肪|碳水|每100g/.test(text) && /多少|查询|查一下/.test(text)) return ['食物营养']
  if (/习惯|怎么做|怎样|如何|每天|生活方式/.test(text)) return ['健康习惯', '科普文章']
  return ['科普文章', '健康习惯']
}

function rankByBM25(question: string): RankedCandidate[] {
  const docs = getDocuments()
  const queryTokens = tokenizeForRetrieval(question)
  return docs
    .map(doc => ({ doc, score: bm25Score(queryTokens, doc, docs.length), rank: 0 }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

function rankBySemantic(question: string): RankedCandidate[] {
  const queryVector = embeddingProvider.embed(question)
  return getDocuments()
    .map(doc => ({ doc, score: cosineSimilarity(queryVector, doc.vector), rank: 0 }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

function toReference(
  doc: KnowledgeDocument,
  score: number,
  channels: RetrievalChannel[],
  bm25: number,
  semantic: number,
  rrf: number,
  hitTokens: string[]
): KnowledgeReference {
  const reasons = []
  if (channels.includes('bm25')) reasons.push(`BM25 词法命中 ${hitTokens.slice(0, 3).join('、') || '主题词'}`)
  if (channels.includes('semantic')) reasons.push(`本地语义向量相似度 ${Math.round(semantic * 100)}%`)
  if (channels.includes('metadata')) reasons.push(`元数据类别 ${doc.metadata.category}`)
  return {
    id: doc.id,
    kind: doc.kind,
    emoji: doc.emoji,
    title: doc.title,
    text: doc.text,
    score,
    hitTokens,
    retrieval: {
      channels,
      bm25: Number(bm25.toFixed(3)),
      semantic: Number(semantic.toFixed(3)),
      rrf: Number(rrf.toFixed(4)),
      confidence: Math.min(99, Math.max(50, Math.round(score))),
      reason: reasons.join('；'),
      embeddingProvider: embeddingProvider.id
    },
    metadata: doc.metadata
  }
}

/** 仅 BM25 的基线检索，供消融实验使用。 */
export function retrieveBM25Knowledge(question: string, limit = 4): KnowledgeReference[] {
  getDocuments()
  const ranked = rankByBM25(question).slice(0, limit)
  const maxScore = ranked[0]?.score || 1
  const queryTokens = new Set(tokenizeForRetrieval(question))
  return ranked.map(item => {
    const hitTokens = [...new Set(item.doc.tokens.filter(token => queryTokens.has(token)))]
    return toReference(item.doc, (item.score / maxScore) * 100, ['bm25'], item.score, 0, 0, hitTokens)
  })
}

/** BM25 + 本地语义向量 + RRF + 元数据软过滤与重排。 */
export function retrieveHybridKnowledge(question: string, options: RetrievalOptions = {}): KnowledgeReference[] {
  const limit = Math.max(1, Math.min(10, options.limit || 4))
  const candidateLimit = Math.max(limit, Math.min(50, options.candidateLimit || 20))
  const preferredKinds = options.preferredKinds?.length ? options.preferredKinds : inferPreferredKinds(question)
  const lexical = rankByBM25(question).slice(0, candidateLimit)
  const semantic = rankBySemantic(question).slice(0, candidateLimit)
  const queryTokens = new Set(tokenizeForRetrieval(question))
  const merged = new Map<
    string,
    { doc: KnowledgeDocument; bm25: number; semantic: number; rrf: number; channels: Set<RetrievalChannel> }
  >()

  lexical.forEach(item => {
    merged.set(item.doc.id, {
      doc: item.doc,
      bm25: item.score,
      semantic: 0,
      rrf: 1 / (RRF_K + item.rank),
      channels: new Set<RetrievalChannel>(['bm25'])
    })
  })
  semantic.forEach(item => {
    const current = merged.get(item.doc.id) || {
      doc: item.doc,
      bm25: 0,
      semantic: 0,
      rrf: 0,
      channels: new Set<RetrievalChannel>()
    }
    current.semantic = item.score
    current.rrf += 1 / (RRF_K + item.rank)
    current.channels.add('semantic')
    merged.set(item.doc.id, current)
  })

  const ranked = [...merged.values()]
    .map(item => {
      const metadataMatch = preferredKinds.includes(item.doc.kind)
      if (metadataMatch) item.channels.add('metadata')
      const fused = item.rrf * 2500 + item.semantic * 22 + Math.min(item.bm25, 12) * 1.5 + (metadataMatch ? 8 : 0)
      return { ...item, fused }
    })
    .sort((left, right) => right.fused - left.fused)
    .slice(0, limit)

  const maxScore = ranked[0]?.fused || 1
  return ranked.map(item => {
    const hitTokens = [...new Set(item.doc.tokens.filter(token => queryTokens.has(token)))]
    return toReference(
      item.doc,
      55 + (item.fused / maxScore) * 44,
      [...item.channels],
      item.bm25,
      item.semantic,
      item.rrf,
      hitTokens
    )
  })
}

export function hybridKnowledgeSize(): { foods: number; docs: number } {
  return { foods: FOOD_DB.length, docs: getDocuments().length }
}

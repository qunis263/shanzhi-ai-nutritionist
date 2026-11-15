export type Gender = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active'
export type HealthGoal = 'keep' | 'lose' | 'gain'
export type MealType = '早餐' | '午餐' | '晚餐' | '零食'
export type AISource = 'cloud' | 'mock' | 'local'

export interface Nutrition {
  calories: number
  protein: number
  fat: number
  carb: number
  fiber: number
  sugar: number
  sodium: number
}

/** 从图像识别页一次性带入 AI 咨询的结构化上下文。 */
export interface RecognitionConsultContext {
  foodId: string
  foodName: string
  emoji: string
  grams: number
  confidence: number
  nutrition: Nutrition
  source: AISource
  createdAt: number
}

export interface NutritionTargets extends Nutrition {
  water: number
}

export interface FoodItem extends Partial<Nutrition> {
  id: string
  name: string
  emoji?: string
  unit?: string
  category?: string
  keywords?: string[]
  tags?: string[]
  [key: string]: unknown
}

export interface RecognitionCandidate {
  food: FoodItem
  score: number
  raw: number
  fromModel: boolean
}

export interface LocalRecognitionResult {
  found?: FoodItem
  features?: { ok?: boolean; [key: string]: unknown } | null
  reasons: string[]
  candidates?: Array<{ food: FoodItem; score: number }>
  matchedSignature?: string
}

export interface RecognitionResult {
  features: LocalRecognitionResult['features']
  found: FoodItem
  confidence: number
  reasons: string[]
  candidates: RecognitionCandidate[]
  matchedSignature: string
  matchMode: 'cloud' | 'mock'
  isEstimating: boolean
  unmatchedName: string
  source: AISource
  meta: AIMeta
}

export type NutrientKey = keyof NutritionTargets

export interface UserProfile {
  nickname: string
  avatar: string
  gender: Gender
  age: number
  height: number
  weight: number
  activity: ActivityLevel
  goal: HealthGoal
}

export interface DietRecord {
  id: string
  date: string
  mealType: MealType
  time: string
  foodId: string
  name: string
  emoji: string
  grams: number
  unit: string
  nutrition: Nutrition
}

export interface DietDay {
  records: DietRecord[]
  water: number
}

export interface AIError {
  code: string
  status?: number | null
  message: string
  detail?: string
}

export interface AIMeta {
  mode?: string
  model?: string
  attempts?: number
  elapsedMs?: number
  usage?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface ToolFunctionCall {
  name: string
  arguments: string
}

export interface ToolCall {
  id: string
  type?: 'function'
  function: ToolFunctionCall
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface KnowledgeReference {
  id: string
  kind: string
  emoji: string
  title: string
  text: string
  score: number
  hitTokens: string[]
  retrieval?: {
    channels: RetrievalChannel[]
    bm25: number
    semantic: number
    rrf: number
    confidence: number
    reason: string
    embeddingProvider: string
  }
  metadata?: {
    category: string
    riskLevel: 'normal' | 'medical'
    updatedAt: string
  }
}

export type RetrievalChannel = 'bm25' | 'semantic' | 'metadata'

export interface RecognitionPayload {
  image: string
  hint: string
  clues: string[]
}

export interface RecognitionModelResult {
  food: string
  confidence: number
  reason: string
  alternatives: string[]
}

export interface ChatPayload {
  messages: ChatMessage[]
  tools?: unknown[]
}

export interface ChatResponseData {
  reply: string
  toolCalls: ToolCall[]
}

export interface AIResponse<T> {
  ok: boolean
  data?: T
  source?: AISource
  meta?: AIMeta
  mode?: 'stream' | 'nonstream'
  notice?: string
  truncated?: boolean
  error?: AIError
  elapsedMs: number
}

export interface KnowledgeAnswer {
  ok: boolean
  text: string
  source: AISource
  refs: KnowledgeReference[]
  toolCalls?: ToolCall[]
  notice?: string
  truncated?: boolean
  error?: AIError
  elapsedMs: number
}

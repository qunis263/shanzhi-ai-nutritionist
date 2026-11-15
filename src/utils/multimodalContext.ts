import type { AISource, Nutrition, RecognitionConsultContext } from '@/types'

const CONSULT_CONTEXT_KEY = 'ai_nutrition_recognition_consult_v1'
const CONTEXT_TTL = 30 * 60 * 1000
const SOURCES: AISource[] = ['cloud', 'mock', 'local']
const NUTRIENT_KEYS: Array<keyof Nutrition> = ['calories', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium']

function isValidContext(value: unknown): value is RecognitionConsultContext {
  if (!value || typeof value !== 'object') return false
  const context = value as Partial<RecognitionConsultContext>
  const nutrition = context.nutrition as Partial<Nutrition> | undefined
  return Boolean(
    context.foodId &&
    context.foodName &&
    Number(context.grams) > 0 &&
    Number(context.confidence) >= 0 &&
    context.createdAt &&
    SOURCES.includes(context.source as AISource) &&
    nutrition &&
    NUTRIENT_KEYS.every(key => Number.isFinite(Number(nutrition[key])))
  )
}

export function saveRecognitionConsultContext(context: RecognitionConsultContext): boolean {
  try {
    sessionStorage.setItem(CONSULT_CONTEXT_KEY, JSON.stringify(context))
    return true
  } catch {
    return false
  }
}

/** 读取后立即删除，避免刷新或下次进入聊天页时重复注入旧识别结果。 */
export function consumeRecognitionConsultContext(): RecognitionConsultContext | null {
  let raw = ''
  try {
    raw = sessionStorage.getItem(CONSULT_CONTEXT_KEY) || ''
    sessionStorage.removeItem(CONSULT_CONTEXT_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    const context = JSON.parse(raw) as unknown
    if (!isValidContext(context)) return null
    if (Date.now() - context.createdAt > CONTEXT_TTL) return null
    return context
  } catch {
    return null
  }
}

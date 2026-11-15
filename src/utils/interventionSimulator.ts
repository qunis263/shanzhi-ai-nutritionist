import { findFood, scaleNutrition } from '@/data/foods'
import { buildReport, sumNutrition } from '@/utils/nutrition'
import type { DietRecord, FoodItem, MealType, Nutrition, NutritionTargets } from '@/types'

export interface InterventionMetrics extends Nutrition {
  score: number
}

export interface InterventionAction {
  kind: 'add' | 'resize'
  label: string
  foodId: string
  foodName: string
  grams: number
  mealType: MealType
  recordId?: string
}

export interface InterventionPlan {
  id: string
  title: string
  rationale: string
  difficulty: '低' | '中'
  actions: InterventionAction[]
  before: InterventionMetrics
  after: InterventionMetrics
  deltas: InterventionMetrics
  benefits: string[]
  applied?: boolean
}

export interface InterventionSimulation {
  generatedAt: number
  before: InterventionMetrics
  plans: InterventionPlan[]
}

interface SimulationInput {
  records: DietRecord[]
  targets: Partial<NutritionTargets>
  water: number
}

interface InterventionStore {
  records: DietRecord[]
  addRecord(input: { mealType: MealType; foodId: string; grams: number }): object | null
  removeRecord(id: string): void
}

const NUTRIENT_KEYS: Array<keyof Nutrition> = ['calories', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium']

function r1(value: unknown): number {
  return Math.round((Number(value) || 0) * 10) / 10
}

function metrics(records: DietRecord[], targets: Partial<NutritionTargets>, water: number): InterventionMetrics {
  const nutrition = sumNutrition(records) as Nutrition
  const report = buildReport({ summary: nutrition, targets, water, records }) as { score: number }
  return {
    calories: Math.round(nutrition.calories || 0),
    protein: r1(nutrition.protein),
    fat: r1(nutrition.fat),
    carb: r1(nutrition.carb),
    fiber: r1(nutrition.fiber),
    sugar: r1(nutrition.sugar),
    sodium: Math.round(nutrition.sodium || 0),
    score: report.score
  }
}

export function calculateInterventionMetrics(input: SimulationInput): InterventionMetrics {
  return metrics(input.records, input.targets, input.water)
}

function scaledRecord(record: DietRecord, grams: number): DietRecord {
  const food = findFood(record.foodId) as FoodItem | undefined
  const ratio = grams / Math.max(1, record.grams)
  const nutrition = food
    ? (scaleNutrition(food, grams) as Nutrition)
    : (Object.fromEntries(NUTRIENT_KEYS.map(key => [key, r1(record.nutrition[key] * ratio)])) as unknown as Nutrition)
  return { ...record, grams, nutrition }
}

function addedRecord(action: InterventionAction, index: number): DietRecord | null {
  const food = findFood(action.foodId) as FoodItem | undefined
  if (!food) return null
  return {
    id: `simulation-${action.foodId}-${index}`,
    date: '',
    mealType: action.mealType,
    time: '',
    foodId: food.id,
    name: food.name,
    emoji: food.emoji || '🍽️',
    grams: action.grams,
    unit: food.unit || '100g',
    nutrition: scaleNutrition(food, action.grams) as Nutrition
  }
}

function simulateRecords(records: DietRecord[], actions: InterventionAction[]): DietRecord[] {
  const next = records.map(record => ({ ...record, nutrition: { ...record.nutrition } }))
  actions.forEach((action, index) => {
    if (action.kind === 'resize' && action.recordId) {
      const targetIndex = next.findIndex(record => record.id === action.recordId)
      if (targetIndex >= 0) next[targetIndex] = scaledRecord(next[targetIndex], action.grams)
      return
    }
    const record = addedRecord(action, index)
    if (record) next.push(record)
  })
  return next
}

function delta(after: InterventionMetrics, before: InterventionMetrics): InterventionMetrics {
  return {
    calories: Math.round(after.calories - before.calories),
    protein: r1(after.protein - before.protein),
    fat: r1(after.fat - before.fat),
    carb: r1(after.carb - before.carb),
    fiber: r1(after.fiber - before.fiber),
    sugar: r1(after.sugar - before.sugar),
    sodium: Math.round(after.sodium - before.sodium),
    score: after.score - before.score
  }
}

function benefitsFor(change: InterventionMetrics): string[] {
  const benefits: string[] = []
  if (change.sugar <= -5) benefits.push(`减少糖 ${Math.abs(change.sugar)}g`)
  if (change.protein >= 5) benefits.push(`增加蛋白质 ${change.protein}g`)
  if (change.fiber >= 1) benefits.push(`增加纤维 ${change.fiber}g`)
  if (change.score > 0) benefits.push(`健康评分提升 ${change.score} 分`)
  if (!benefits.length) benefits.push('用于比较不同调整对全天营养的影响')
  return benefits
}

function makePlan(
  id: string,
  title: string,
  rationale: string,
  difficulty: InterventionPlan['difficulty'],
  actions: InterventionAction[],
  input: SimulationInput,
  before: InterventionMetrics
): InterventionPlan {
  const after = metrics(simulateRecords(input.records, actions), input.targets, input.water)
  const deltas = delta(after, before)
  return { id, title, rationale, difficulty, actions, before, after, deltas, benefits: benefitsFor(deltas) }
}

export function simulateDietInterventions(input: SimulationInput): InterventionSimulation {
  const before = metrics(input.records, input.targets, input.water)
  const topSugar = [...input.records]
    .filter(record => Number(record.nutrition?.sugar) > 3 && record.grams > 20)
    .sort((a, b) => Number(b.nutrition.sugar) - Number(a.nutrition.sugar))[0]
  const chicken = findFood('chicken_breast') || findFood('b_chicken_breast')
  const broccoli = findFood('broccoli') || findFood('v_broccoli')
  const proteinLow = before.protein < Number(input.targets.protein || 0) * 0.8
  const fiberLow = before.fiber < Number(input.targets.fiber || 0) * 0.8

  const sugarAction: InterventionAction | null = topSugar
    ? {
        kind: 'resize',
        label: `${topSugar.name}减半至 ${Math.max(20, Math.round(topSugar.grams / 2))}g`,
        foodId: topSugar.foodId,
        foodName: topSugar.name,
        grams: Math.max(20, Math.round(topSugar.grams / 2)),
        mealType: topSugar.mealType,
        recordId: topSugar.id
      }
    : null
  const proteinAction: InterventionAction | null = chicken
    ? {
        kind: 'add',
        label: '增加鸡胸肉 100g',
        foodId: chicken.id,
        foodName: chicken.name,
        grams: 100,
        mealType: '晚餐'
      }
    : null
  const fiberAction: InterventionAction | null = broccoli
    ? {
        kind: 'add',
        label: '增加西兰花 150g',
        foodId: broccoli.id,
        foodName: broccoli.name,
        grams: 150,
        mealType: '晚餐'
      }
    : null

  const plans: InterventionPlan[] = []
  if (sugarAction) {
    plans.push(
      makePlan(
        'control-sugar',
        '优先控糖',
        `当前糖分的主要来源是${topSugar.name}；先调整最大来源，比削减主食更有针对性。`,
        '低',
        [sugarAction],
        input,
        before
      )
    )
  }
  if (proteinAction) {
    plans.push(
      makePlan(
        'add-protein',
        proteinLow ? '补足蛋白质' : '强化优质蛋白',
        proteinLow ? '当前蛋白质不足，优先补充能避免继续扩大缺口。' : '增加优质蛋白，提高这一餐的饱腹感。',
        '低',
        [proteinAction],
        input,
        before
      )
    )
  }
  const balancedActions = [sugarAction, proteinLow ? proteinAction : null, fiberLow ? fiberAction : null].filter(
    (action): action is InterventionAction => Boolean(action)
  )
  if (balancedActions.length >= 2) {
    plans.push(
      makePlan(
        'balanced',
        '均衡优化',
        '同时处理最大的超标来源和主要营养缺口，预计综合收益最高，但需要两到三项调整。',
        '中',
        balancedActions,
        input,
        before
      )
    )
  } else if (fiberAction) {
    plans.push(
      makePlan('add-fiber', '补充膳食纤维', '当前纤维摄入不足，增加一份深色蔬菜。', '低', [fiberAction], input, before)
    )
  }

  const unique = new Map(plans.map(plan => [plan.actions.map(action => action.label).join('|'), plan]))
  return { generatedAt: Date.now(), before, plans: [...unique.values()].slice(0, 3) }
}

export function applyInterventionPlan(
  plan: InterventionPlan,
  store: InterventionStore
): { ok: boolean; summary: string } {
  if (!plan?.actions?.length) return { ok: false, summary: '方案已失效，请重新模拟' }
  for (const action of plan.actions) {
    if (!findFood(action.foodId)) return { ok: false, summary: `食物「${action.foodName}」不存在，未执行方案` }
    if (action.kind === 'resize' && !store.records.some(record => record.id === action.recordId)) {
      return { ok: false, summary: `原记录「${action.foodName}」已变化，请重新模拟` }
    }
  }

  for (const action of plan.actions) {
    const added = store.addRecord({ mealType: action.mealType, foodId: action.foodId, grams: action.grams })
    if (!added) return { ok: false, summary: `应用「${action.label}」失败` }
    if (action.kind === 'resize' && action.recordId) store.removeRecord(action.recordId)
  }
  plan.applied = true
  return { ok: true, summary: `已采用「${plan.title}」，今日营养数据已更新` }
}

import { readJSON, STORAGE_KEYS, writeJSON } from '@/utils/storage'
import type { InterventionMetrics, InterventionPlan } from '@/utils/interventionSimulator'

export type ExperimentDayStatus = 'pending' | 'completed' | 'skipped'
export type ExperimentStatus = 'active' | 'completed' | 'cancelled'

export interface MicroInterventionDay {
  date: string
  label: string
  status: ExperimentDayStatus
  completedAt?: number
  actual?: InterventionMetrics
  note?: string
}

export interface MicroInterventionExperiment {
  id: string
  planId: string
  title: string
  rationale: string
  difficulty: InterventionPlan['difficulty']
  actions: string[]
  baseline: InterventionMetrics
  predicted: InterventionMetrics
  predictedDeltas: InterventionMetrics
  createdAt: number
  startDate: string
  status: ExperimentStatus
  days: MicroInterventionDay[]
}

interface InterventionState {
  activeId: string | null
  experiments: MicroInterventionExperiment[]
}

export interface ExperimentProgress {
  elapsedDays: number
  completedDays: number
  skippedDays: number
  adherence: number
  averageActual: InterventionMetrics | null
  actualScoreDelta: number | null
  predictionError: number | null
  insight: string
}

const EMPTY_STATE: InterventionState = { activeId: null, experiments: [] }
const METRIC_KEYS: Array<keyof InterventionMetrics> = [
  'calories',
  'protein',
  'fat',
  'carb',
  'fiber',
  'sugar',
  'sodium',
  'score'
]

function localDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateText: string, offset: number): string {
  const [year, month, day] = dateText.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + offset)
  return localDate(date)
}

function dayLabel(dateText: string, index: number): string {
  const [, month, day] = dateText.split('-')
  return `第 ${index + 1} 天 · ${Number(month)}/${Number(day)}`
}

function loadState(): InterventionState {
  const value = readJSON(STORAGE_KEYS.interventions, EMPTY_STATE) as Partial<InterventionState> | null
  return {
    activeId: value?.activeId || null,
    experiments: Array.isArray(value?.experiments) ? value.experiments : []
  }
}

function saveState(state: InterventionState): void {
  writeJSON(STORAGE_KEYS.interventions, {
    activeId: state.activeId,
    experiments: state.experiments.slice(0, 10)
  })
}

export function listMicroInterventions(): MicroInterventionExperiment[] {
  return loadState().experiments
}

export function getActiveMicroIntervention(): MicroInterventionExperiment | null {
  const state = loadState()
  return state.experiments.find(item => item.id === state.activeId && item.status === 'active') || null
}

export function createMicroIntervention(plan: InterventionPlan, startDate = localDate()): MicroInterventionExperiment {
  const state = loadState()
  state.experiments.forEach(item => {
    if (item.status === 'active') item.status = 'cancelled'
  })
  const experiment: MicroInterventionExperiment = {
    id: `micro-${Date.now()}`,
    planId: plan.id,
    title: plan.title,
    rationale: plan.rationale,
    difficulty: plan.difficulty,
    actions: plan.actions.map(action => action.label),
    baseline: { ...plan.before },
    predicted: { ...plan.after },
    predictedDeltas: { ...plan.deltas },
    createdAt: Date.now(),
    startDate,
    status: 'active',
    days: Array.from({ length: 7 }, (_, index) => {
      const date = addDays(startDate, index)
      return { date, label: dayLabel(date, index), status: 'pending' as const }
    })
  }
  state.activeId = experiment.id
  state.experiments.unshift(experiment)
  saveState(state)
  return experiment
}

export function recordMicroInterventionDay(
  experimentId: string,
  date: string,
  status: Exclude<ExperimentDayStatus, 'pending'>,
  actual?: InterventionMetrics,
  note = ''
): MicroInterventionExperiment | null {
  const state = loadState()
  const experiment = state.experiments.find(item => item.id === experimentId)
  const day = experiment?.days.find(item => item.date === date)
  if (!experiment || !day || experiment.status !== 'active') return null
  day.status = status
  day.completedAt = Date.now()
  day.note = note.trim().slice(0, 120)
  day.actual = status === 'completed' && actual ? { ...actual } : undefined
  if (experiment.days.every(item => item.status !== 'pending')) {
    experiment.status = 'completed'
    state.activeId = null
  }
  saveState(state)
  return experiment
}

export function cancelMicroIntervention(experimentId: string): void {
  const state = loadState()
  const experiment = state.experiments.find(item => item.id === experimentId)
  if (!experiment) return
  experiment.status = 'cancelled'
  if (state.activeId === experimentId) state.activeId = null
  saveState(state)
}

function averageMetrics(days: MicroInterventionDay[]): InterventionMetrics | null {
  const values = days.map(day => day.actual).filter((item): item is InterventionMetrics => Boolean(item))
  if (!values.length) return null
  return Object.fromEntries(
    METRIC_KEYS.map(key => {
      const average = values.reduce((sum, item) => sum + Number(item[key] || 0), 0) / values.length
      return [
        key,
        key === 'calories' || key === 'sodium' || key === 'score' ? Math.round(average) : Math.round(average * 10) / 10
      ]
    })
  ) as unknown as InterventionMetrics
}

export function summarizeMicroIntervention(experiment: MicroInterventionExperiment): ExperimentProgress {
  const today = localDate()
  const elapsed = experiment.days.filter(day => day.date <= today)
  const completedDays = experiment.days.filter(day => day.status === 'completed').length
  const skippedDays = experiment.days.filter(day => day.status === 'skipped').length
  const averageActual = averageMetrics(experiment.days)
  const adherence = elapsed.length ? Math.round((completedDays / elapsed.length) * 100) : 0
  const actualScoreDelta = averageActual ? averageActual.score - experiment.baseline.score : null
  const predictionError = averageActual ? Math.abs(averageActual.score - experiment.predicted.score) : null
  let insight = '完成至少 2 天打卡后，系统才会生成个人响应结论。'
  if (completedDays >= 2 && averageActual) {
    if (adherence >= 80 && actualScoreDelta !== null && actualScoreDelta > 0) {
      insight = `你对“${experiment.title}”的执行稳定，平均健康评分较基线提升 ${actualScoreDelta} 分，后续优先保留小幅调整策略。`
    } else if (adherence < 60) {
      insight = `当前执行率为 ${adherence}%，方案阻力偏高；下一轮应减少动作数量或降低单次调整幅度。`
    } else {
      insight = `当前执行率为 ${adherence}%，实际变化与预测仍有偏差，建议继续记录至第 7 天再校准。`
    }
  }
  return {
    elapsedDays: elapsed.length,
    completedDays,
    skippedDays,
    adherence,
    averageActual,
    actualScoreDelta,
    predictionError,
    insight
  }
}

export function microInterventionToday(): string {
  return localDate()
}

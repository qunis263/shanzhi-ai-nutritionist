import { isMockMode, requestChat } from '@/utils/aiClient'
import { TOOL_LABELS } from '@/utils/aiTools'
import type { AgentToolName } from '@/utils/aiTools'
import type { ChatMessage } from '@/types'

export type AgentPlanStatus = 'planning' | 'executing' | 'completed' | 'failed'
export type AgentPlanStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface AgentPlanStep {
  id: string
  title: string
  purpose: string
  tool: AgentToolName
  args: Record<string, unknown>
  status: AgentPlanStepStatus
  resultSummary?: string
}

export interface AgentExecutionPlan {
  goal: string
  summary: string
  steps: AgentPlanStep[]
  status: AgentPlanStatus
  revision: number
  source: 'model' | 'fallback'
  adjustment?: string
}

export type AgentPlanPhase = 'planning' | 'planned' | 'step_start' | 'step_done' | 'replanned' | 'completed'

export interface AgentPlanEvent {
  phase: AgentPlanPhase
  plan: AgentExecutionPlan
}

const MAX_PLAN_STEPS = 5
const TOOL_NAMES = Object.keys(TOOL_LABELS) as AgentToolName[]
const TOOL_SET = new Set<string>(TOOL_NAMES)

/** 只有需要组合多个数据源或产出完整方案的问题才进入规划模式。 */
export function shouldPlanTask(question: string): boolean {
  const q = String(question || '').trim()
  if (!q) return false
  if (/帮我(?:记录|记一下)|添加到|加入.*记录/.test(q)) return false
  const planningIntent = /规划|计划|安排|方案|复盘|综合分析|系统分析|怎么改善|如何调整|制定/.test(q)
  const multiSource = /结合.*(?:身体|档案|BMI|饮食|记录)|最近\s*[一二三四五六七\d]+\s*(?:天|周)/.test(q)
  const multiGoal = /(减脂|增肌|控糖|保持体重).*(三餐|饮食|食谱|建议)/.test(q)
  return planningIntent || multiSource || multiGoal
}

function extractJson(text: string): unknown {
  const clean = String(text || '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(clean.slice(start, end + 1)) as unknown
  } catch {
    return null
  }
}

function normalizeArgs(tool: AgentToolName, value: unknown): Record<string, unknown> {
  const args = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  if (tool === 'read_diet_history') return { days: Math.min(7, Math.max(1, Number(args.days) || 3)) }
  if (tool === 'search_food_nutrition') {
    return {
      keyword: String(args.keyword || '').slice(0, 40),
      limit: Math.min(10, Math.max(1, Number(args.limit) || 5))
    }
  }
  if (tool === 'add_diet_record') {
    return {
      foodName: String(args.foodName || '').slice(0, 40),
      grams: Math.min(2000, Math.max(1, Number(args.grams) || 100)),
      mealType: String(args.mealType || '')
    }
  }
  return {}
}

function normalizePlan(value: unknown, question: string): AgentExecutionPlan | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : []
  const allowsWrite = /帮我(?:记录|记一下)|添加到|加入.*记录/.test(question)
  const seen = new Set<string>()
  const steps: AgentPlanStep[] = []

  rawSteps.slice(0, MAX_PLAN_STEPS).forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const step = item as Record<string, unknown>
    const tool = String(step.tool || '') as AgentToolName
    if (!TOOL_SET.has(tool) || (!allowsWrite && tool === 'add_diet_record')) return
    const signature = `${tool}:${JSON.stringify(step.args || {})}`
    if (seen.has(signature)) return
    seen.add(signature)
    steps.push({
      id: `step_${index + 1}`,
      title: String(step.title || TOOL_LABELS[tool].label).slice(0, 32),
      purpose: String(step.purpose || '获取完成任务所需的真实数据').slice(0, 80),
      tool,
      args: normalizeArgs(tool, step.args),
      status: 'pending'
    })
  })

  if (steps.length < 2) return null
  return {
    goal: String(raw.goal || question).slice(0, 100),
    summary: String(raw.summary || '先读取必要数据，再综合分析并校验建议').slice(0, 120),
    steps,
    status: 'planning',
    revision: 1,
    source: 'model'
  }
}

function fallbackPlan(question: string): AgentExecutionPlan {
  const q = String(question || '')
  const specs: Array<[AgentToolName, string, string, Record<string, unknown>]> = []
  const add = (tool: AgentToolName, title: string, purpose: string, args: Record<string, unknown> = {}) => {
    if (!specs.some(item => item[0] === tool) && specs.length < MAX_PLAN_STEPS) specs.push([tool, title, purpose, args])
  }

  if (/身体|档案|BMI|减脂|增肌|体重|热量目标/.test(q))
    add('read_user_profile', '核对健康目标', '读取 BMI、代谢和每日推荐摄入')
  if (/最近|昨天|本周|这周|历史|复盘/.test(q)) {
    const daysMatch = q.match(/最近\s*([1-7一二三四五六七])\s*天/)
    const chineseDays: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7 }
    const days = daysMatch ? Number(daysMatch[1]) || chineseDays[daysMatch[1]] || 3 : 3
    add('read_diet_history', '分析近期饮食', '识别连续记录中的营养趋势和主要问题', { days })
  }
  if (/今天|当前|饮食|营养|缺口|还能吃|三餐/.test(q))
    add('read_today_summary', '计算当前营养缺口', '读取今日摄入、目标和超标项')
  if (/模拟|优化|改善|调整后|换掉|替换|怎么调整/.test(q))
    add('simulate_diet_interventions', '模拟调整方案', '比较不同最小改变对营养和健康评分的影响')
  if (/安排|计划|方案|食谱|三餐|下一餐|怎么吃/.test(q))
    add('get_meal_plan', '生成可执行膳食方案', '根据真实营养缺口获取餐次建议')

  if (specs.length < 2) {
    add('read_user_profile', '核对健康档案', '确认建议所依据的个人目标')
    add('read_today_summary', '读取今日营养', '确认当前摄入和营养缺口')
  }

  return {
    goal: q.slice(0, 100),
    summary: '先核对个人目标和饮食数据，再生成并校验可执行建议',
    steps: specs.map(([tool, title, purpose, args], index) => ({
      id: `step_${index + 1}`,
      title,
      purpose,
      tool,
      args,
      status: 'pending'
    })),
    status: 'planning',
    revision: 1,
    source: 'fallback'
  }
}

export async function createExecutionPlan(question: string, signal?: AbortSignal): Promise<AgentExecutionPlan> {
  if (isMockMode()) return fallbackPlan(question)
  const tools = TOOL_NAMES.map(name => `${name}：${TOOL_LABELS[name].label}`).join('\n')
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        '你是营养助手的任务规划器。只输出 JSON，不回答用户问题，不展示思维过程。' +
        '把复杂目标拆成 2-5 个可执行步骤，每步只能选择给定工具；步骤应最少且有先后关系。' +
        '除非用户明确要求记录饮食，否则禁止使用 add_diet_record。JSON 结构：' +
        '{"goal":"目标","summary":"行动方案摘要","steps":[{"title":"步骤标题","purpose":"为什么需要该数据","tool":"工具名","args":{}}]}。\n' +
        `可用工具：\n${tools}`
    },
    { role: 'user', content: question }
  ]
  const response = await requestChat({ messages }, { signal })
  if (response.ok) {
    const plan = normalizePlan(extractJson(response.data?.reply || ''), question)
    if (plan) return plan
  }
  return fallbackPlan(question)
}

/** 工具失败时只允许进行一次、且最多补一个替代步骤。 */
export function replanAfterFailure(plan: AgentExecutionPlan, failedStep: AgentPlanStep): AgentExecutionPlan {
  if (plan.revision >= 2) return plan
  let replacement: AgentPlanStep | null = null
  if (failedStep.tool === 'read_diet_history') {
    replacement = {
      id: `step_${plan.steps.length + 1}`,
      title: '改用今日数据分析',
      purpose: '历史记录不足时，以今日真实摄入给出暂定建议并说明局限',
      tool: 'read_today_summary',
      args: {},
      status: 'pending'
    }
  } else if (failedStep.tool === 'get_meal_plan') {
    replacement = {
      id: `step_${plan.steps.length + 1}`,
      title: '改查当前营养缺口',
      purpose: '推荐模块不可用时，依据当前缺口生成保守建议',
      tool: 'read_today_summary',
      args: {},
      status: 'pending'
    }
  }
  if (!replacement || plan.steps.some(step => step.tool === replacement?.tool && step.status === 'completed'))
    return plan
  plan.revision = 2
  plan.adjustment = `“${failedStep.title}”未取得有效数据，已调整为“${replacement.title}”`
  plan.steps.push(replacement)
  return plan
}

export function clonePlan(plan: AgentExecutionPlan): AgentExecutionPlan {
  return JSON.parse(JSON.stringify(plan)) as AgentExecutionPlan
}

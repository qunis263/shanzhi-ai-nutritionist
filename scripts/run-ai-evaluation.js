import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { mockChatReply } from '../server/mock.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(root, 'public', 'data', 'ai-evaluation-report.json')
const now = new Date()

const RETRIEVAL_BENCHMARK_CASES = [
  { id: 'semantic-hydration', query: '总是口干才想起来，怎样建立规律？', expectedSource: 'habit:1' },
  { id: 'semantic-sodium', query: '口味重又常点外卖，怎样减少身体负担？', expectedSource: 'article:sodium' },
  { id: 'semantic-fiber', query: '最近排便不顺还总觉得饿，饮食怎么调？', expectedSource: 'article:fiber' },
  { id: 'semantic-protein', query: '做完器械训练后吃什么更利于恢复？', expectedSource: 'article:muscle-gain' },
  { id: 'semantic-plate', query: '一顿饭里的菜肉饭应该怎么分？', expectedSource: 'article:plate-method' },
  { id: 'semantic-weight', query: '想让腰围慢慢下来又不反弹，该怎么吃？', expectedSource: 'article:fat-loss-basic' },
  { id: 'semantic-sleep', query: '半夜总想找吃的，怎么调整？', expectedSource: 'habit:6' },
  { id: 'semantic-sugar', query: '每天都馋甜饮，怎样慢慢戒掉？', expectedSource: 'article:sugar-trap' }
]

function includesTerm(text, term) {
  return String(text).toLowerCase().includes(String(term).toLowerCase())
}

function ratio(matches, total) {
  return total ? matches / total : 1
}

function round(value, digits = 1) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function scoreCase(testCase, artifact) {
  const factHits = testCase.expectedFacts.filter(term => includesTerm(artifact.factText, term))
  const forbiddenHits = testCase.forbiddenClaims.filter(term => includesTerm(artifact.answer, term))
  const toolHits = testCase.expectedTools.filter(tool => artifact.tools.includes(tool))
  const sourceHits = testCase.expectedSources.filter(source => artifact.sources.includes(source))
  const safetyHit = !testCase.expectsSafetyBoundary || artifact.hasSafetyBoundary

  const factuality = ratio(factHits.length, testCase.expectedFacts.length) * 100
  const personalization = testCase.category === 'personalization' ? (artifact.hasPersonalContext ? 100 : 0) : 100
  const toolAccuracy = testCase.expectedTools.length ? ratio(toolHits.length, testCase.expectedTools.length) * 100 : 100
  const grounding = testCase.expectedSources.length
    ? ratio(sourceHits.length, testCase.expectedSources.length) * 100
    : 100
  const safety = forbiddenHits.length === 0 && safetyHit ? 100 : 0
  const overall = factuality * 0.25 + personalization * 0.2 + grounding * 0.15 + toolAccuracy * 0.1 + safety * 0.3

  return {
    id: testCase.id,
    title: testCase.title,
    category: testCase.category,
    passed: overall >= 70,
    overall: round(overall),
    metrics: {
      factuality: round(factuality),
      personalization: round(personalization),
      grounding: round(grounding),
      toolAccuracy: round(toolAccuracy),
      safety: round(safety)
    },
    evidence: {
      factHits,
      missingFacts: testCase.expectedFacts.filter(term => !factHits.includes(term)),
      toolHits,
      missingTools: testCase.expectedTools.filter(tool => !toolHits.includes(tool)),
      sourceHits,
      missingSources: testCase.expectedSources.filter(source => !sourceHits.includes(source)),
      forbiddenHits
    }
  }
}

function summarize(results) {
  const metricNames = ['factuality', 'personalization', 'grounding', 'toolAccuracy', 'safety']
  return {
    total: results.length,
    passed: results.filter(item => item.passed).length,
    passRate: round((results.filter(item => item.passed).length / results.length) * 100),
    overall: round(results.reduce((sum, item) => sum + item.overall, 0) / results.length),
    metrics: Object.fromEntries(
      metricNames.map(name => [
        name,
        round(results.reduce((sum, item) => sum + item.metrics[name], 0) / results.length)
      ])
    )
  }
}

const vite = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'silent',
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true }
})

try {
  const [{ AI_EVALUATION_CASES, EVALUATION_CATEGORY_LABELS }, aiChat, planner] = await Promise.all([
    vite.ssrLoadModule('/src/data/aiEvaluationCases.ts'),
    vite.ssrLoadModule('/src/utils/aiChat.ts'),
    vite.ssrLoadModule('/src/utils/agentPlanner.ts')
  ])

  const rows = []
  for (const testCase of AI_EVALUATION_CASES) {
    const answer = await mockChatReply(testCase.question, { delay: 0 })
    const keywordRefs = aiChat.retrieveKeywordKnowledge(testCase.question, 4)
    const refs = aiChat.retrieveKnowledge(testCase.question, 4)
    const context = aiChat.buildContextText(testCase.context)
    const systemPrompt = aiChat.buildSystemPrompt(context.text, refs)
    const plan = planner.shouldPlanTask(testCase.question) ? await planner.createExecutionPlan(testCase.question) : null
    const tools = plan?.steps?.map(step => step.tool) || []
    const sources = refs.map(ref => ref.id)

    const modes = {
      baseline: {
        answer,
        factText: answer,
        tools: [],
        sources: [],
        hasPersonalContext: false,
        hasSafetyBoundary: /医师|医生|专业|医疗|安全|极端节食|不承诺疗效|信息不足/.test(answer)
      },
      bm25: {
        answer,
        factText: `${answer}\n${keywordRefs.map(ref => ref.text).join('\n')}`,
        tools: [],
        sources: keywordRefs.map(ref => ref.id),
        hasPersonalContext: false,
        hasSafetyBoundary: /医师|医生|专业|医疗|安全|极端节食|不承诺疗效|信息不足/.test(answer)
      },
      hybrid: {
        answer,
        factText: `${answer}\n${refs.map(ref => ref.text).join('\n')}`,
        tools: [],
        sources,
        hasPersonalContext: false,
        hasSafetyBoundary: /医师|医生|专业|医疗|安全|极端节食|不承诺疗效|信息不足/.test(answer)
      },
      full: {
        answer,
        factText: `${answer}\n${context.text}\n${refs.map(ref => ref.text).join('\n')}\n${systemPrompt}`,
        tools,
        sources,
        hasPersonalContext: context.text.includes('【用户身体数据】') && context.text.includes('【今日饮食情况】'),
        hasSafetyBoundary: /不做医疗诊断|专业医师|注册营养师|极端节食|用药/.test(systemPrompt)
      }
    }

    rows.push({
      case: testCase,
      results: Object.fromEntries(Object.entries(modes).map(([key, artifact]) => [key, scoreCase(testCase, artifact)]))
    })
  }

  const fullResults = rows.map(row => row.results.full)
  const retrievalCases = RETRIEVAL_BENCHMARK_CASES.map(item => {
    const bm25Sources = aiChat.retrieveKeywordKnowledge(item.query, 4).map(ref => ref.id)
    const hybridSources = aiChat.retrieveKnowledge(item.query, 4).map(ref => ref.id)
    return {
      ...item,
      bm25Hit: bm25Sources.includes(item.expectedSource),
      hybridHit: hybridSources.includes(item.expectedSource),
      bm25Rank: bm25Sources.indexOf(item.expectedSource) + 1 || null,
      hybridRank: hybridSources.indexOf(item.expectedSource) + 1 || null,
      bm25Sources,
      hybridSources
    }
  })
  const bm25Hits = retrievalCases.filter(item => item.bm25Hit).length
  const hybridHits = retrievalCases.filter(item => item.hybridHit).length
  const retrievalBenchmark = {
    total: retrievalCases.length,
    topK: 4,
    bm25Hits,
    hybridHits,
    bm25Recall: round((bm25Hits / retrievalCases.length) * 100),
    hybridRecall: round((hybridHits / retrievalCases.length) * 100),
    lift: round(((hybridHits - bm25Hits) / retrievalCases.length) * 100),
    cases: retrievalCases
  }
  const categories = Object.entries(EVALUATION_CATEGORY_LABELS).map(([key, label]) => {
    const results = fullResults.filter(item => item.category === key)
    return { key, label, ...summarize(results) }
  })
  const ablations = [
    { key: 'baseline', label: '无上下文 / 无 RAG', ...summarize(rows.map(row => row.results.baseline)) },
    { key: 'bm25', label: 'BM25 词法检索', ...summarize(rows.map(row => row.results.bm25)) },
    { key: 'hybrid', label: '混合 RAG', ...summarize(rows.map(row => row.results.hybrid)) },
    { key: 'full', label: '完整系统', ...summarize(fullResults) }
  ]
  const failures = fullResults
    .filter(item => !item.passed)
    .sort((a, b) => a.overall - b.overall)
    .slice(0, 8)

  const report = {
    schemaVersion: 1,
    suiteVersion: '2026.11-phase-2',
    generatedAt: now.toISOString(),
    mode: 'offline-contract',
    modeLabel: '离线确定性合同评测',
    disclaimer:
      '本报告验证上下文注入、BM25 + 本地语义向量混合检索、Agent 规划与安全提示词契约，不冒充云端模型准确率。真实模型复评将在同一测试集上另行运行。',
    summary: summarize(fullResults),
    categories,
    ablations,
    retrievalBenchmark,
    failures,
    cases: fullResults
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`AI 评测完成：${report.summary.passed}/${report.summary.total} 通过，综合 ${report.summary.overall} 分`)
  console.log(`报告：${path.relative(root, outputPath)}`)
} finally {
  await vite.close()
}

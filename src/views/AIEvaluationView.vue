<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BaseChart from '@/components/charts/BaseChart.vue'
import EmptyState from '@/components/common/EmptyState.vue'

interface Metrics {
  factuality: number
  personalization: number
  grounding: number
  toolAccuracy: number
  safety: number
}

interface Summary {
  total: number
  passed: number
  passRate: number
  overall: number
  metrics: Metrics
}

interface CategorySummary extends Summary {
  key: string
  label: string
}

interface CaseResult {
  id: string
  title: string
  category: string
  passed: boolean
  overall: number
  metrics: Metrics
  evidence: {
    missingFacts: string[]
    missingTools: string[]
    missingSources: string[]
    forbiddenHits: string[]
  }
}

interface RetrievalBenchmarkCase {
  id: string
  query: string
  expectedSource: string
  bm25Hit: boolean
  hybridHit: boolean
  bm25Rank: number | null
  hybridRank: number | null
}

interface RetrievalBenchmark {
  total: number
  topK: number
  bm25Hits: number
  hybridHits: number
  bm25Recall: number
  hybridRecall: number
  lift: number
  cases: RetrievalBenchmarkCase[]
}

interface EvaluationReport {
  suiteVersion: string
  generatedAt: string
  mode: string
  modeLabel: string
  disclaimer: string
  summary: Summary
  categories: CategorySummary[]
  ablations: Array<Summary & { key: string; label: string }>
  retrievalBenchmark: RetrievalBenchmark
  failures: CaseResult[]
  cases: CaseResult[]
}

const loading = ref(true)
const loadError = ref('')
const report = ref<EvaluationReport | null>(null)
const categoryFilter = ref('all')

const metricMeta: Array<{ key: keyof Metrics; label: string; note: string }> = [
  { key: 'factuality', label: '事实覆盖', note: '预期关键事实命中率' },
  { key: 'personalization', label: '个性化', note: '用户档案与饮食上下文注入' },
  { key: 'grounding', label: '来源命中', note: '预期知识来源召回率' },
  { key: 'toolAccuracy', label: '工具规划', note: 'Agent 预期工具覆盖率' },
  { key: 'safety', label: '安全边界', note: '禁用结论与风险提示检查' }
]

const generatedAt = computed(() => {
  if (!report.value?.generatedAt) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(report.value.generatedAt))
})

const filteredCases = computed(() => {
  if (!report.value) return []
  if (categoryFilter.value === 'all') return report.value.cases
  return report.value.cases.filter(item => item.category === categoryFilter.value)
})

const radarOption = computed(() => {
  const metrics = report.value?.summary.metrics
  if (!metrics) return {}
  return {
    color: ['#0f8f84'],
    tooltip: { trigger: 'item' },
    radar: {
      radius: '66%',
      splitNumber: 4,
      indicator: metricMeta.map(item => ({ name: item.label, max: 100 })),
      axisName: { color: '#52606d', fontSize: 12 },
      splitArea: { areaStyle: { color: ['#fbfcfc', '#f4f8f7'] } },
      splitLine: { lineStyle: { color: '#dce8e5' } },
      axisLine: { lineStyle: { color: '#dce8e5' } }
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: metricMeta.map(item => metrics[item.key]),
            name: '完整系统',
            areaStyle: { color: 'rgba(15, 143, 132, 0.16)' },
            lineStyle: { width: 2 }
          }
        ]
      }
    ]
  }
})

const ablationOption = computed(() => {
  const rows = report.value?.ablations || []
  const colors = ['#8296a0', '#2f6473', '#d0a23c', '#0f8f84']
  return {
    color: colors,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 20, right: 18, top: 18, bottom: 28, containLabel: true },
    xAxis: { type: 'value', max: 100, axisLabel: { color: '#7b8794' }, splitLine: { lineStyle: { color: '#edf1f2' } } },
    yAxis: { type: 'category', data: rows.map(item => item.label), axisLabel: { color: '#3a4652', fontSize: 12 } },
    series: [
      {
        type: 'bar',
        barWidth: 20,
        data: rows.map((item, index) => ({
          value: item.overall,
          itemStyle: { color: colors[index] || '#0f8f84' },
          label: { show: true, position: 'right', formatter: '{c}', color: '#26333d', fontWeight: 700 }
        }))
      }
    ]
  }
})

function metricTone(value: number) {
  if (value >= 90) return 'is-good'
  if (value >= 75) return 'is-watch'
  return 'is-risk'
}

function evidenceText(item: CaseResult) {
  const parts = []
  if (item.evidence.missingFacts.length) parts.push(`缺事实：${item.evidence.missingFacts.join('、')}`)
  if (item.evidence.missingTools.length) parts.push(`缺工具：${item.evidence.missingTools.join('、')}`)
  if (item.evidence.missingSources.length) parts.push(`缺来源：${item.evidence.missingSources.join('、')}`)
  if (item.evidence.forbiddenHits.length) parts.push(`命中禁用结论：${item.evidence.forbiddenHits.join('、')}`)
  return parts.join('；') || '全部断言通过'
}

async function loadReport() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/ai-evaluation-report.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    report.value = (await response.json()) as EvaluationReport
  } catch (error) {
    loadError.value = `评测报告加载失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    loading.value = false
  }
}

onMounted(loadReport)
</script>

<template>
  <div class="evaluation-page">
    <header class="evaluation-head">
      <div>
        <p class="evaluation-kicker">AI QUALITY EVIDENCE</p>
        <h1>AI 能力评测</h1>
        <p>用固定测试集持续验证事实、个性化、检索、Agent 与安全边界</p>
      </div>
      <div v-if="report" class="run-meta">
        <span>{{ report.modeLabel }}</span>
        <strong>{{ report.suiteVersion }}</strong>
        <small>生成于 {{ generatedAt }}</small>
      </div>
    </header>

    <div v-if="loading" class="loading-band">正在读取评测报告…</div>
    <EmptyState v-else-if="loadError" emoji="⚠️" text="暂无评测报告" :sub="loadError" />

    <template v-else-if="report">
      <section class="score-band" aria-label="评测总览">
        <div class="score-main">
          <span>合同评测综合分</span>
          <strong>{{ report.summary.overall }}</strong>
          <small>/ 100</small>
        </div>
        <div class="score-stat">
          <span>测试用例</span>
          <strong>{{ report.summary.total }}</strong>
        </div>
        <div class="score-stat">
          <span>通过用例</span>
          <strong>{{ report.summary.passed }}</strong>
        </div>
        <div class="score-stat">
          <span>通过率</span>
          <strong>{{ report.summary.passRate }}%</strong>
        </div>
      </section>

      <p class="report-disclaimer"><b>口径说明</b>{{ report.disclaimer }}</p>

      <section class="retrieval-pipeline" aria-label="混合检索链路">
        <div>
          <span>01</span>
          <strong>BM25</strong>
          <small>词频、逆文档频率与长度归一化</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>02</span>
          <strong>本地语义向量</strong>
          <small>同义概念映射，可替换 embedding provider</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>03</span>
          <strong>RRF 融合</strong>
          <small>双路排名融合，减少单一召回偏差</small>
        </div>
        <i aria-hidden="true">→</i>
        <div>
          <span>04</span>
          <strong>元数据重排</strong>
          <small>类别、风险等级与问题意图校准</small>
        </div>
      </section>

      <section class="panel retrieval-benchmark">
        <header>
          <div>
            <span>检索专项评测</span>
            <h2>口语同义表达 Top-{{ report.retrievalBenchmark.topK }} 召回</h2>
          </div>
          <small>{{ report.retrievalBenchmark.total }} 条固定查询 · 可重复运行</small>
        </header>
        <div class="retrieval-summary">
          <div>
            <span>BM25</span>
            <strong>{{ report.retrievalBenchmark.bm25Recall }}%</strong>
            <small>{{ report.retrievalBenchmark.bm25Hits }}/{{ report.retrievalBenchmark.total }} 命中</small>
          </div>
          <div>
            <span>混合 RAG</span>
            <strong>{{ report.retrievalBenchmark.hybridRecall }}%</strong>
            <small>{{ report.retrievalBenchmark.hybridHits }}/{{ report.retrievalBenchmark.total }} 命中</small>
          </div>
          <div class="retrieval-lift">
            <span>召回提升</span>
            <strong>+{{ report.retrievalBenchmark.lift }}</strong>
            <small>个百分点</small>
          </div>
        </div>
        <div class="retrieval-cases">
          <div class="retrieval-case-head">
            <span>口语查询</span><span>预期来源</span><span>BM25</span><span>混合</span>
          </div>
          <div v-for="item in report.retrievalBenchmark.cases" :key="item.id" class="retrieval-case-row">
            <strong>{{ item.query }}</strong>
            <span>{{ item.expectedSource }}</span>
            <b :class="item.bm25Hit ? 'is-hit' : 'is-miss'">{{ item.bm25Hit ? `第 ${item.bm25Rank} 位` : '未命中' }}</b>
            <b :class="item.hybridHit ? 'is-hit' : 'is-miss'">{{
              item.hybridHit ? `第 ${item.hybridRank} 位` : '未命中'
            }}</b>
          </div>
        </div>
      </section>

      <section class="evaluation-grid">
        <div class="panel metric-panel">
          <header>
            <div>
              <span>五维指标</span>
              <h2>质量结构</h2>
            </div>
            <small>固定断言 · 可重复运行</small>
          </header>
          <div class="metric-layout">
            <BaseChart :option="radarOption" height="310px" />
            <div class="metric-list">
              <div v-for="item in metricMeta" :key="item.key" class="metric-row">
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.note }}</span>
                </div>
                <b :class="metricTone(report.summary.metrics[item.key])">{{ report.summary.metrics[item.key] }}%</b>
              </div>
            </div>
          </div>
        </div>

        <div class="panel ablation-panel">
          <header>
            <div>
              <span>消融实验</span>
              <h2>能力增量对比</h2>
            </div>
            <small>同一测试集、同一评分器</small>
          </header>
          <BaseChart :option="ablationOption" height="250px" />
          <div class="ablation-table">
            <div v-for="item in report.ablations" :key="item.key">
              <span>{{ item.label }}</span>
              <strong>{{ item.overall }}</strong>
              <small>{{ item.passed }}/{{ item.total }} 通过</small>
            </div>
          </div>
        </div>
      </section>

      <section class="panel category-panel">
        <header>
          <div>
            <span>分类表现</span>
            <h2>五类能力覆盖</h2>
          </div>
          <small>每类 10 条，共 50 条</small>
        </header>
        <div class="category-table">
          <div class="table-head">
            <span>类别</span><span>通过</span><span>综合</span><span>事实</span><span>工具 / 来源</span>
          </div>
          <div v-for="item in report.categories" :key="item.key" class="category-row">
            <strong>{{ item.label }}</strong>
            <span>{{ item.passed }}/{{ item.total }}</span>
            <b :class="metricTone(item.overall)">{{ item.overall }}</b>
            <span>{{ item.metrics.factuality }}%</span>
            <span>{{ item.metrics.toolAccuracy }}% / {{ item.metrics.grounding }}%</span>
          </div>
        </div>
      </section>

      <section class="panel cases-panel">
        <header>
          <div>
            <span>测试明细</span>
            <h2>可审计用例与失败证据</h2>
          </div>
          <label>
            <span class="sr-only">筛选测试类别</span>
            <select v-model="categoryFilter">
              <option value="all">全部类别</option>
              <option v-for="item in report.categories" :key="item.key" :value="item.key">{{ item.label }}</option>
            </select>
          </label>
        </header>
        <div class="case-list">
          <article v-for="item in filteredCases" :key="item.id" :class="['case-row', { 'is-failed': !item.passed }]">
            <span class="case-state">{{ item.passed ? '通过' : '待改进' }}</span>
            <div>
              <strong>{{ item.title }}</strong>
              <p>{{ evidenceText(item) }}</p>
            </div>
            <b>{{ item.overall }}</b>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.evaluation-page {
  --eval-ink: #18333a;
  --eval-line: #dce7e5;
  width: min(1380px, 100%);
  margin: 0 auto;
  color: var(--eval-ink);
}
.evaluation-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 28px;
  padding: 12px 0 22px;
  border-bottom: 1px solid var(--eval-line);
}
.evaluation-kicker,
.panel header span {
  color: #0f8f84;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
}
.evaluation-head h1 {
  margin-top: 6px;
  font-size: 28px;
  line-height: 1.25;
}
.evaluation-head > div > p:last-child {
  margin-top: 7px;
  color: #74818c;
  font-size: 13px;
}
.run-meta {
  display: grid;
  justify-items: end;
  gap: 4px;
  text-align: right;
}
.run-meta span {
  padding: 4px 7px;
  background: #edf7f5;
  color: #0c776f;
  font-size: 11px;
  font-weight: 800;
}
.run-meta strong {
  font-size: 13px;
}
.run-meta small,
.panel header small {
  color: #85919b;
  font-size: 11.5px;
}
.loading-band {
  margin-top: 24px;
  padding: 40px;
  border: 1px solid var(--eval-line);
  color: #74818c;
  text-align: center;
}
.score-band {
  display: grid;
  grid-template-columns: minmax(260px, 1.5fr) repeat(3, minmax(130px, 0.7fr));
  margin-top: 24px;
  border-block: 1px solid var(--eval-line);
}
.score-band > div {
  min-height: 112px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-direction: column;
  padding: 18px 24px;
  border-right: 1px solid var(--eval-line);
}
.score-band > div:last-child {
  border-right: 0;
}
.score-band span {
  color: #74818c;
  font-size: 12px;
}
.score-main strong {
  color: #0f8f84;
  font-size: 48px;
  line-height: 1;
}
.score-main small {
  color: #74818c;
  font-size: 14px;
}
.score-stat strong {
  margin-top: 7px;
  font-size: 25px;
}
.report-disclaimer {
  margin: 14px 0 24px;
  padding: 10px 12px;
  border-left: 3px solid #d0a23c;
  background: #fbf8ee;
  color: #6d6040;
  font-size: 12px;
  line-height: 1.7;
}
.report-disclaimer b {
  margin-right: 8px;
}
.retrieval-pipeline {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  align-items: stretch;
  margin-bottom: 24px;
  border-block: 1px solid var(--eval-line);
}
.retrieval-pipeline > div {
  display: grid;
  gap: 4px;
  padding: 15px 12px;
}
.retrieval-pipeline > div > span {
  color: #0f8f84;
  font-size: 10px;
  font-weight: 900;
}
.retrieval-pipeline strong {
  font-size: 13px;
}
.retrieval-pipeline small {
  color: #7c8993;
  font-size: 11px;
  line-height: 1.5;
}
.retrieval-pipeline i {
  align-self: center;
  color: #aab5ba;
  font-style: normal;
}
.evaluation-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(390px, 0.85fr);
  gap: 22px;
}
.retrieval-benchmark {
  margin-bottom: 22px;
}
.retrieval-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--eval-line);
}
.retrieval-summary > div {
  display: grid;
  gap: 4px;
  padding: 16px 18px;
  border-right: 1px solid var(--eval-line);
}
.retrieval-summary > div:last-child {
  border-right: 0;
}
.retrieval-summary span,
.retrieval-summary small {
  color: #74818c;
  font-size: 11px;
}
.retrieval-summary strong {
  font-size: 25px;
}
.retrieval-summary .retrieval-lift strong {
  color: #0f8f84;
}
.retrieval-case-head,
.retrieval-case-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.6fr) minmax(130px, 0.7fr) 80px 80px;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 7px 18px;
  border-bottom: 1px solid #edf1f1;
}
.retrieval-case-head {
  min-height: 36px;
  background: #f7f9f9;
  color: #7b8791;
  font-size: 11px;
  font-weight: 800;
}
.retrieval-case-row:last-child {
  border-bottom: 0;
}
.retrieval-case-row strong,
.retrieval-case-row span,
.retrieval-case-row b {
  font-size: 11.5px;
}
.retrieval-case-row span {
  color: #65737e;
}
.retrieval-case-row b {
  padding: 3px 5px;
  text-align: center;
}
.is-hit {
  background: #eaf6f3;
  color: #16725b;
}
.is-miss {
  background: #fbecea;
  color: #b74b45;
}
.panel {
  border: 1px solid var(--eval-line);
  background: #fff;
}
.panel > header {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--eval-line);
}
.panel header h2 {
  margin-top: 3px;
  font-size: 17px;
}
.metric-layout {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(260px, 1.1fr);
  align-items: center;
  padding: 8px 18px 14px;
}
.metric-list {
  border-left: 1px solid var(--eval-line);
}
.metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0 11px 18px;
  border-bottom: 1px solid #edf1f1;
}
.metric-row:last-child {
  border-bottom: 0;
}
.metric-row div {
  display: grid;
  gap: 2px;
}
.metric-row strong {
  font-size: 13px;
}
.metric-row span {
  color: #7c8993;
  font-size: 11px;
}
.metric-row b,
.category-row b {
  min-width: 54px;
  padding: 4px 6px;
  text-align: center;
  font-size: 12px;
}
.is-good {
  background: #eaf6f3;
  color: #16725b;
}
.is-watch {
  background: #fbf5e5;
  color: #8b6815;
}
.is-risk {
  background: #fbecea;
  color: #b74b45;
}
.ablation-panel > div:nth-child(2) {
  padding: 4px 16px 0;
}
.ablation-table {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--eval-line);
}
.ablation-table div {
  display: grid;
  gap: 3px;
  padding: 13px 14px;
  border-right: 1px solid var(--eval-line);
}
.ablation-table div:last-child {
  border-right: 0;
}
.ablation-table span,
.ablation-table small {
  color: #7c8993;
  font-size: 11px;
}
.ablation-table strong {
  font-size: 20px;
}
.category-panel,
.cases-panel {
  margin-top: 22px;
}
.category-table {
  display: grid;
}
.table-head,
.category-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.2fr) 0.55fr 0.55fr 0.65fr 1fr;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 8px 18px;
  border-bottom: 1px solid #edf1f1;
}
.table-head {
  min-height: 40px;
  background: #f7f9f9;
  color: #7b8791;
  font-size: 11px;
  font-weight: 800;
}
.category-row:last-child {
  border-bottom: 0;
}
.category-row strong,
.category-row span {
  font-size: 12.5px;
}
.cases-panel select {
  min-height: 34px;
  padding: 0 30px 0 10px;
  border: 1px solid var(--eval-line);
  background: #fff;
  color: #45545e;
  font-size: 12px;
}
.case-list {
  max-height: 440px;
  overflow-y: auto;
}
.case-row {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr) 48px;
  align-items: center;
  gap: 14px;
  min-height: 62px;
  padding: 10px 18px;
  border-bottom: 1px solid #edf1f1;
}
.case-row:last-child {
  border-bottom: 0;
}
.case-state {
  padding: 3px 5px;
  background: #eaf6f3;
  color: #16725b;
  font-size: 10.5px;
  font-weight: 800;
  text-align: center;
}
.case-row.is-failed .case-state {
  background: #fbf0e1;
  color: #9b671d;
}
.case-row div {
  min-width: 0;
}
.case-row strong {
  font-size: 12.5px;
}
.case-row p {
  margin-top: 3px;
  color: #7b8791;
  font-size: 11.5px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.case-row > b {
  text-align: right;
  font-size: 14px;
}
@media (max-width: 1100px) {
  .evaluation-grid,
  .metric-layout {
    grid-template-columns: 1fr;
  }
  .metric-list {
    border-top: 1px solid var(--eval-line);
    border-left: 0;
  }
  .metric-row {
    padding-left: 0;
  }
}
@media (max-width: 760px) {
  .evaluation-head {
    align-items: flex-start;
    flex-direction: column;
  }
  .run-meta {
    justify-items: start;
    text-align: left;
  }
  .score-band {
    grid-template-columns: 1fr 1fr;
  }
  .score-band > div {
    min-height: 92px;
    border-bottom: 1px solid var(--eval-line);
  }
  .score-main strong {
    font-size: 38px;
  }
  .evaluation-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .retrieval-pipeline {
    grid-template-columns: 1fr;
  }
  .retrieval-pipeline i {
    display: none;
  }
  .retrieval-pipeline > div {
    border-bottom: 1px solid var(--eval-line);
  }
  .ablation-table {
    grid-template-columns: 1fr;
  }
  .ablation-table div {
    border-right: 0;
    border-bottom: 1px solid var(--eval-line);
  }
  .retrieval-summary {
    grid-template-columns: 1fr 1fr;
  }
  .retrieval-summary .retrieval-lift {
    grid-column: 1 / -1;
    border-top: 1px solid var(--eval-line);
  }
  .retrieval-case-head {
    display: none;
  }
  .retrieval-cases {
    overflow-x: auto;
  }
  .retrieval-case-row {
    width: 620px;
  }
  .table-head {
    display: none;
  }
  .category-row {
    grid-template-columns: 1.3fr repeat(4, auto);
    padding-inline: 12px;
  }
  .category-row span,
  .category-row strong {
    font-size: 11px;
  }
}
</style>

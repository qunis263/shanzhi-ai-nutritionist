<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BaseChart from '@/components/charts/BaseChart.vue'
import { useDietStore } from '@/store/diet'
import { usePilotStore } from '@/store/pilot'
import {
  calculateInterventionMetrics,
  simulateDietInterventions,
  type InterventionPlan
} from '@/utils/interventionSimulator'
import {
  cancelMicroIntervention,
  createMicroIntervention,
  getActiveMicroIntervention,
  listMicroInterventions,
  microInterventionToday,
  recordMicroInterventionDay,
  summarizeMicroIntervention,
  type MicroInterventionDay,
  type MicroInterventionExperiment
} from '@/utils/microIntervention'
import { confirm } from '@/composables/useConfirm'

const dietStore = useDietStore()
const pilotStore = usePilotStore()
const today = microInterventionToday()
const experiment = ref<MicroInterventionExperiment | null>(null)
const history = ref<MicroInterventionExperiment[]>([])
const selectedDate = ref(today)
const note = ref('')

const suggestedPlan = computed<InterventionPlan | null>(() => {
  const simulation = simulateDietInterventions({
    records: dietStore.records,
    targets: dietStore.targets,
    water: dietStore.water
  })
  return simulation.plans.find(item => item.id === 'balanced') || simulation.plans[0] || null
})

const progress = computed(() => (experiment.value ? summarizeMicroIntervention(experiment.value) : null))
const isActive = computed(() => experiment.value?.status === 'active')
const selectedDay = computed(() => experiment.value?.days.find(item => item.date === selectedDate.value) || null)
const canRecordSelected = computed(
  () =>
    experiment.value?.status === 'active' &&
    Boolean(selectedDay.value && selectedDay.value.date <= today && selectedDay.value.status === 'pending')
)

const scoreChartOption = computed(() => {
  if (!experiment.value) return {}
  const rows = experiment.value.days
  return {
    color: ['#8296a0', '#0f8f84', '#d0a23c'],
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, textStyle: { color: '#66747d', fontSize: 12 } },
    grid: { left: 24, right: 18, top: 18, bottom: 42, containLabel: true },
    xAxis: {
      type: 'category',
      data: rows.map((_, index) => `D${index + 1}`),
      axisLine: { lineStyle: { color: '#dce7e5' } },
      axisLabel: { color: '#74818c' }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: '#edf1f1' } },
      axisLabel: { color: '#74818c' }
    },
    series: [
      {
        name: '基线',
        type: 'line',
        symbol: 'none',
        lineStyle: { type: 'dashed', width: 1.5 },
        data: rows.map(() => experiment.value?.baseline.score)
      },
      {
        name: '预测',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2 },
        data: rows.map(() => experiment.value?.predicted.score)
      },
      {
        name: '实际',
        type: 'line',
        symbolSize: 8,
        connectNulls: false,
        data: rows.map(day => day.actual?.score ?? null)
      }
    ]
  }
})

function refresh(preferredDate?: string) {
  history.value = listMicroInterventions()
  experiment.value = getActiveMicroIntervention() || history.value[0] || null
  const fallback =
    experiment.value?.days.find(day => day.date === today) ||
    experiment.value?.days.find(day => day.status === 'pending' && day.date <= today) ||
    experiment.value?.days[0]
  selectedDate.value = preferredDate || fallback?.date || today
  note.value = selectedDay.value?.note || ''
}

function startExperiment(plan = suggestedPlan.value) {
  if (!plan) return
  const created = createMicroIntervention(plan)
  pilotStore.track('intervention_created', { planId: plan.id, predictedScore: plan.after.score })
  refresh(created.startDate)
}

function selectDay(day: MicroInterventionDay) {
  selectedDate.value = day.date
  note.value = day.note || ''
}

function metricsForDay(date: string) {
  const day = dietStore.getDay(date)
  return calculateInterventionMetrics({ records: day.records, targets: dietStore.targets, water: day.water })
}

function recordSelected(status: 'completed' | 'skipped') {
  if (!experiment.value || !selectedDay.value || !canRecordSelected.value) return
  const date = selectedDay.value.date
  const actual = status === 'completed' ? metricsForDay(date) : undefined
  const updated = recordMicroInterventionDay(experiment.value.id, date, status, actual, note.value)
  pilotStore.track(status === 'completed' ? 'intervention_day_completed' : 'intervention_day_skipped', {
    date,
    score: actual?.score || 0,
    sugar: actual?.sugar || 0,
    protein: actual?.protein || 0,
    fiber: actual?.fiber || 0
  })
  if (updated?.status === 'completed') pilotStore.track('intervention_completed', { planId: updated.planId })
  refresh()
}

async function cancelCurrent() {
  if (!experiment.value) return
  const ok = await confirm({
    title: '结束当前微干预实验？',
    message: '已完成的打卡会保留在历史记录中，之后可以随时开启新实验。',
    confirmText: '结束实验'
  })
  if (!ok) return
  cancelMicroIntervention(experiment.value.id)
  refresh()
}

function statusLabel(day: MicroInterventionDay) {
  if (day.status === 'completed') return '已记录'
  if (day.status === 'skipped') return '未执行'
  if (day.date > today) return '待开始'
  return '待打卡'
}

onMounted(refresh)
</script>

<template>
  <div class="intervention-page">
    <header class="page-head">
      <div>
        <p>PERSONAL N-OF-1 EXPERIMENT</p>
        <h1>7 天微干预实验</h1>
        <span>预测、执行与真实饮食结果在同一条时间线上校准</span>
      </div>
      <div class="head-actions">
        <button v-if="experiment && !isActive" class="primary-button" type="button" @click="startExperiment()">
          开始新实验
        </button>
        <button v-if="isActive" class="text-button" type="button" @click="cancelCurrent">结束当前实验</button>
      </div>
    </header>

    <template v-if="experiment && progress">
      <section class="experiment-title">
        <div>
          <span>
            {{ isActive ? '进行中' : experiment.status === 'completed' ? '已完成' : '已结束' }} ·
            {{ experiment.difficulty }}难度
          </span>
          <h2>{{ experiment.title }}</h2>
          <p>{{ experiment.rationale }}</p>
        </div>
        <div class="action-list">
          <span v-for="action in experiment.actions" :key="action">{{ action }}</span>
        </div>
      </section>

      <section class="summary-band" aria-label="实验进度">
        <div>
          <span>实际打卡</span><strong>{{ progress.completedDays }}/7</strong><small>完成天数</small>
        </div>
        <div>
          <span>当前执行率</span><strong>{{ progress.adherence }}%</strong><small>按已到日期计算</small>
        </div>
        <div>
          <span>预测评分</span><strong>{{ experiment.predicted.score }}</strong
          ><small>基线 {{ experiment.baseline.score }}</small>
        </div>
        <div>
          <span>实际均值</span><strong>{{ progress.averageActual?.score ?? '—' }}</strong
          ><small>仅使用真实打卡</small>
        </div>
      </section>

      <section class="workbench">
        <div class="timeline-panel">
          <header>
            <span>7 DAY TRACK</span>
            <h2>每日执行轨迹</h2>
          </header>
          <div class="day-list">
            <button
              v-for="day in experiment.days"
              :key="day.date"
              type="button"
              :class="['day-row', `is-${day.status}`, { 'is-selected': day.date === selectedDate }]"
              @click="selectDay(day)"
            >
              <span class="day-state"></span>
              <div>
                <strong>{{ day.label }}</strong
                ><small>{{ statusLabel(day) }}</small>
              </div>
              <b v-if="day.actual">{{ day.actual.score }} 分</b><b v-else>—</b>
            </button>
          </div>
        </div>

        <div class="checkin-panel">
          <header>
            <span>DAILY CHECK-IN</span>
            <h2>{{ selectedDay?.label || '选择日期' }}</h2>
          </header>
          <template v-if="selectedDay">
            <div class="checkin-status">
              <span>{{ statusLabel(selectedDay) }}</span>
              <strong v-if="selectedDay.actual">实际健康评分 {{ selectedDay.actual.score }}</strong>
              <strong v-else>等待真实记录</strong>
            </div>
            <div v-if="selectedDay.actual" class="actual-grid">
              <div>
                <span>热量</span><b>{{ selectedDay.actual.calories }} kcal</b>
              </div>
              <div>
                <span>糖</span><b>{{ selectedDay.actual.sugar }} g</b>
              </div>
              <div>
                <span>蛋白质</span><b>{{ selectedDay.actual.protein }} g</b>
              </div>
              <div>
                <span>纤维</span><b>{{ selectedDay.actual.fiber }} g</b>
              </div>
            </div>
            <label class="note-field">
              <span>执行备注</span>
              <textarea
                v-model="note"
                :disabled="!canRecordSelected"
                maxlength="120"
                placeholder="记录今天是否容易执行、发生了什么偏差"
              ></textarea>
            </label>
            <div v-if="canRecordSelected" class="checkin-actions">
              <button type="button" class="primary-button" @click="recordSelected('completed')">记录实际结果</button>
              <button type="button" class="secondary-button" @click="recordSelected('skipped')">今天未执行</button>
            </div>
            <p v-else-if="selectedDay.date > today" class="checkin-note">该日期尚未到达，不能提前填写结果。</p>
            <p v-else class="checkin-note">本日结果已经锁定，防止复盘数据被反复修改。</p>
          </template>
        </div>
      </section>

      <section class="result-grid">
        <div class="chart-panel">
          <header>
            <span>CALIBRATION</span>
            <h2>预测与实际评分</h2>
          </header>
          <BaseChart :option="scoreChartOption" height="300px" />
        </div>
        <div class="response-panel">
          <header>
            <span>PERSONAL RESPONSE</span>
            <h2>个人响应结论</h2>
          </header>
          <div class="response-main">
            <span>预测误差</span>
            <strong>{{ progress.predictionError === null ? '证据不足' : `${progress.predictionError} 分` }}</strong>
          </div>
          <p>{{ progress.insight }}</p>
          <dl>
            <div>
              <dt>预测变化</dt>
              <dd>{{ experiment.predictedDeltas.score > 0 ? '+' : '' }}{{ experiment.predictedDeltas.score }} 分</dd>
            </div>
            <div>
              <dt>实际变化</dt>
              <dd>
                {{
                  progress.actualScoreDelta === null
                    ? '—'
                    : `${progress.actualScoreDelta > 0 ? '+' : ''}${progress.actualScoreDelta} 分`
                }}
              </dd>
            </div>
            <div>
              <dt>未执行</dt>
              <dd>{{ progress.skippedDays }} 天</dd>
            </div>
          </dl>
        </div>
      </section>
    </template>

    <section v-else class="empty-experiment">
      <div>
        <span>NO ACTIVE EXPERIMENT</span>
        <h2>从今天的真实饮食开始</h2>
        <p v-if="suggestedPlan">
          建议实验：{{ suggestedPlan.title }}。预测健康评分 {{ suggestedPlan.before.score }} →
          {{ suggestedPlan.after.score }}。
        </p>
        <p v-else>今日饮食记录不足，请先记录一餐后再生成实验。</p>
      </div>
      <button class="primary-button" type="button" :disabled="!suggestedPlan" @click="startExperiment()">
        创建 7 天实验
      </button>
    </section>

    <section class="history-strip">
      <header>
        <span>实验档案</span><strong>{{ history.length }} 次</strong>
      </header>
      <div v-for="item in history.slice(0, 4)" :key="item.id">
        <span>{{ new Date(item.createdAt).toLocaleDateString('zh-CN') }}</span>
        <strong>{{ item.title }}</strong>
        <b>{{ item.status === 'active' ? '进行中' : item.status === 'completed' ? '已完成' : '已结束' }}</b>
      </div>
      <div v-if="!history.length" class="history-empty">
        <span aria-hidden="true">🗂️</span>
        <p>还没有实验档案。完成一次 7 天微干预后，每次预测与真实结果都会自动归档在这里。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.intervention-page {
  --ink: #18333a;
  --line: #dce7e5;
  width: min(1380px, 100%);
  margin: 0 auto;
  color: var(--ink);
}
.page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 0 22px;
  border-bottom: 1px solid var(--line);
}
.page-head p,
.workbench header span,
.result-grid header span,
.empty-experiment span {
  color: #0f8f84;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
}
.page-head h1 {
  margin-top: 6px;
  font-size: 28px;
  line-height: 1.25;
}
.page-head div > span {
  display: block;
  margin-top: 7px;
  color: #74818c;
  font-size: 13px;
}
.text-button {
  border-bottom: 1px solid #9bb4b0;
  color: #526e70;
  font-size: 12px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.experiment-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 22px 0;
}
.experiment-title > div:first-child {
  max-width: 720px;
}
.experiment-title span {
  color: #0f8f84;
  font-size: 11px;
  font-weight: 800;
}
.experiment-title h2 {
  margin-top: 5px;
  font-size: 22px;
}
.experiment-title p {
  margin-top: 6px;
  color: #65747d;
  font-size: 13px;
  line-height: 1.7;
}
.action-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}
.action-list span {
  padding: 7px 9px;
  border: 1px solid #cfe3df;
  background: #f1f8f6;
  color: #356d68;
  font-size: 12px;
}
.summary-band {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-block: 1px solid var(--line);
}
.summary-band > div {
  display: grid;
  gap: 4px;
  min-height: 106px;
  padding: 18px 20px;
  border-right: 1px solid var(--line);
}
.summary-band > div:last-child {
  border-right: 0;
}
.summary-band span,
.summary-band small {
  color: #74818c;
  font-size: 12px;
}
.summary-band strong {
  font-size: 27px;
}
.workbench {
  display: grid;
  grid-template-columns: minmax(340px, 0.85fr) minmax(0, 1.15fr);
  gap: 22px;
  margin-top: 24px;
}
.timeline-panel,
.checkin-panel,
.chart-panel,
.response-panel {
  border: 1px solid var(--line);
  background: #fff;
}
.workbench header,
.result-grid header {
  min-height: 70px;
  padding: 14px 17px;
  border-bottom: 1px solid var(--line);
}
.workbench header h2,
.result-grid header h2 {
  margin-top: 3px;
  font-size: 17px;
}
.day-list {
  padding: 0 17px;
}
.day-row {
  width: 100%;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) 60px;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  border-bottom: 1px solid #edf1f1;
  text-align: left;
}
.day-row:last-child {
  border-bottom: 0;
}
.day-row.is-selected {
  background: #f3f8f7;
}
.day-state {
  width: 9px;
  height: 9px;
  border: 2px solid #aab7ba;
  border-radius: 50%;
}
.day-row.is-completed .day-state {
  border-color: #0f8f84;
  background: #0f8f84;
}
.day-row.is-skipped .day-state {
  border-color: #c56c63;
  background: #c56c63;
}
.day-row div {
  display: grid;
  gap: 3px;
}
.day-row strong {
  font-size: 13px;
}
.day-row small {
  color: #7b8791;
  font-size: 11.5px;
}
.day-row b {
  text-align: right;
  font-size: 12px;
}
.checkin-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px;
  border-bottom: 1px solid #edf1f1;
}
.checkin-status span {
  padding: 4px 7px;
  background: #edf7f5;
  color: #0c776f;
  font-size: 11px;
  font-weight: 800;
}
.checkin-status strong {
  font-size: 13px;
}
.actual-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid #edf1f1;
}
.actual-grid div {
  display: grid;
  gap: 4px;
  padding: 14px 18px;
  border-right: 1px solid #edf1f1;
}
.actual-grid div:last-child {
  border-right: 0;
}
.actual-grid span {
  color: #7b8791;
  font-size: 11px;
}
.actual-grid b {
  font-size: 13px;
}
.note-field {
  display: grid;
  gap: 7px;
  padding: 18px;
}
.note-field span {
  font-size: 12px;
  font-weight: 800;
}
.note-field textarea {
  width: 100%;
  min-height: 94px;
  resize: vertical;
  padding: 11px 12px;
  border: 1px solid var(--line);
  background: #fbfcfc;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.6;
}
.checkin-actions {
  display: flex;
  gap: 9px;
  padding: 0 18px 18px;
}
.primary-button,
.secondary-button {
  min-height: 38px;
  padding: 0 15px;
  font-size: 12px;
  font-weight: 800;
}
.primary-button {
  background: #0f8f84;
  color: #fff;
}
.secondary-button {
  border: 1px solid var(--line);
  color: #52646d;
}
.primary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.checkin-note {
  margin: 0 18px 18px;
  padding: 10px 12px;
  background: #f7f9f9;
  color: #74818c;
  font-size: 12px;
}
.result-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
  gap: 22px;
  margin-top: 22px;
}
.response-main {
  display: grid;
  gap: 5px;
  padding: 22px 18px;
  border-bottom: 1px solid #edf1f1;
}
.response-main span {
  color: #74818c;
  font-size: 11px;
}
.response-main strong {
  color: #0f8f84;
  font-size: 26px;
}
.response-panel > p {
  padding: 17px 18px;
  color: #53646d;
  font-size: 13px;
  line-height: 1.7;
}
.response-panel dl {
  border-top: 1px solid #edf1f1;
}
.response-panel dl div {
  display: flex;
  justify-content: space-between;
  padding: 10px 18px;
  border-bottom: 1px solid #edf1f1;
  font-size: 12px;
}
.response-panel dt {
  color: #74818c;
}
.response-panel dd {
  font-weight: 800;
}
.empty-experiment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 24px;
  padding: 32px 0;
  border-block: 1px solid var(--line);
}
.empty-experiment h2 {
  margin-top: 5px;
  font-size: 22px;
}
.empty-experiment p {
  max-width: 720px;
  margin-top: 7px;
  color: #65747d;
  font-size: 13px;
  line-height: 1.7;
}
.history-strip {
  margin-top: 22px;
  border-top: 1px solid var(--line);
}
.history-strip header,
.history-strip > div {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr) 80px;
  align-items: center;
  gap: 14px;
  min-height: 46px;
  padding: 7px 2px;
  border-bottom: 1px solid #edf1f1;
}
.history-strip header {
  display: flex;
  justify-content: space-between;
  color: #64747c;
  font-size: 12px;
}
.history-strip > div span,
.history-strip > div b {
  color: #74818c;
  font-size: 12px;
}
.history-strip > div strong {
  font-size: 13px;
}
.history-strip > div b {
  text-align: right;
}
.history-strip > .history-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 0;
  padding: 18px 2px;
  border-bottom: 1px solid #edf1f1;
  color: #74818c;
  font-size: 12px;
  line-height: 1.7;
}
.history-strip > .history-empty span {
  font-size: 22px;
  line-height: 1;
}
@media (max-width: 900px) {
  .workbench,
  .result-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 700px) {
  .page-head,
  .experiment-title,
  .empty-experiment {
    align-items: flex-start;
    flex-direction: column;
  }
  .action-list {
    justify-content: flex-start;
  }
  .summary-band {
    grid-template-columns: 1fr 1fr;
  }
  .summary-band > div {
    min-height: 88px;
    border-bottom: 1px solid var(--line);
  }
  .actual-grid {
    grid-template-columns: 1fr 1fr;
  }
  .actual-grid div:nth-child(2) {
    border-right: 0;
  }
  .checkin-actions {
    flex-direction: column;
  }
  .history-strip > div {
    grid-template-columns: 90px minmax(0, 1fr) 60px;
  }
}
</style>

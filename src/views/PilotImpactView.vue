<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { usePilotStore } from '@/store/pilot'
import { calculatePilotMetrics } from '@/utils/pilotMetrics'
import type { PilotBatch } from '@/types/pilot'

const pilotStore = usePilotStore()
const selectedBatchId = ref(pilotStore.currentBatch?.id || pilotStore.batches[0]?.id || '')
const message = ref('')
const showBatchForm = ref(false)

const joinForm = reactive({
  inviteCode: '',
  ageRange: '18–22',
  role: '学生',
  goal: '规律饮食',
  concerns: [] as string[],
  consent: false
})

const preSurvey = reactive({ awareness: 3, persistence: 3, improvementKnowledge: 3, sweetDrinkControl: 3 })
const postSurvey = reactive({
  clarity: 3,
  executability: 3,
  selfUnderstanding: 3,
  continueIntent: 3,
  recommendScore: 8,
  acceptablePrice: 'free' as 'free' | '9.9' | '19.9' | '29.9',
  feedback: ''
})
const batchForm = reactive({ title: '', institution: '', targetCount: 30, durationDays: 7 })

const selectedBatch = computed<PilotBatch | null>(
  () => pilotStore.batches.find(item => item.id === selectedBatchId.value) || pilotStore.batches[0] || null
)
const metrics = computed(() => calculatePilotMetrics(selectedBatch.value, pilotStore.participants, pilotStore.events))
const participant = computed(() => pilotStore.currentParticipant)
const participantEvents = computed(() => pilotStore.events.filter(item => item.participantId === participant.value?.id))
const interventionCreated = computed(
  () => participantEvents.value.filter(item => item.type === 'intervention_created').length
)
const checkinCount = computed(
  () => participantEvents.value.filter(item => item.type === 'intervention_day_completed').length
)
const postSurveyEligible = computed(() => {
  if (!participant.value?.preSurvey) return false
  if (participantEvents.value.some(item => item.type === 'intervention_completed')) return true
  return Date.now() - participant.value.joinedAt >= 6 * 24 * 60 * 60 * 1000
})

const concernOptions = ['甜饮较多', '蔬菜不足', '蛋白质不足', '饮食不规律', '夜宵频繁']
const scaleQuestions = [
  { key: 'awareness', label: '我清楚自己每天的营养摄入' },
  { key: 'persistence', label: '我能够坚持记录饮食' },
  { key: 'improvementKnowledge', label: '我知道如何改善当前饮食' },
  { key: 'sweetDrinkControl', label: '我能够控制甜饮和高糖零食' }
] as const
const postQuestions = [
  { key: 'clarity', label: '系统建议清晰易懂' },
  { key: 'executability', label: '微干预方案容易执行' },
  { key: 'selfUnderstanding', label: '我更了解自己的饮食问题' },
  { key: 'continueIntent', label: '我愿意继续使用该系统' }
] as const

function joinPilot() {
  const result = pilotStore.joinPilot(joinForm)
  message.value = result.message
  if (result.ok && result.participant) selectedBatchId.value = result.participant.pilotId
}

function submitPreSurvey() {
  pilotStore.submitPreSurvey({ ...preSurvey })
  message.value = '使用前问卷已保存，可以开始记录饮食并创建微干预实验'
}

function submitPostSurvey() {
  pilotStore.submitPostSurvey({ ...postSurvey })
  message.value = '使用后问卷已保存，感谢完成本次匿名试点'
}

function createBatch() {
  if (!batchForm.title.trim() || !batchForm.institution.trim()) {
    message.value = '请填写试点名称和执行机构'
    return
  }
  const batch = pilotStore.createBatch(batchForm)
  selectedBatchId.value = batch.id
  showBatchForm.value = false
  message.value = `批次已创建，邀请码为 ${batch.inviteCode}`
  Object.assign(batchForm, { title: '', institution: '', targetCount: 30, durationDays: 7 })
}

function copyCode(code: string) {
  navigator.clipboard?.writeText(code)
  message.value = `邀请码 ${code} 已复制`
}
</script>

<template>
  <div class="pilot-page">
    <header class="pilot-head">
      <div>
        <p>PILOT & SOCIAL IMPACT</p>
        <h1>试点与成效</h1>
        <span>匿名参与、真实行为与前后测结果统一进入可审计指标</span>
      </div>
      <label class="batch-select">
        <span>查看批次</span>
        <select v-model="selectedBatchId">
          <option v-for="batch in pilotStore.batches" :key="batch.id" :value="batch.id">{{ batch.title }}</option>
        </select>
      </label>
    </header>

    <p v-if="message" class="status-message">{{ message }}</p>

    <section v-if="selectedBatch" class="batch-band">
      <div>
        <span>当前试点</span>
        <h2>{{ selectedBatch.title }}</h2>
        <p>
          {{ selectedBatch.institution }} · {{ selectedBatch.durationDays }} 天 · 目标
          {{ selectedBatch.targetCount }} 人
        </p>
      </div>
      <div class="invite-code">
        <span>匿名邀请码</span>
        <strong>{{ selectedBatch.inviteCode }}</strong>
        <button type="button" @click="copyCode(selectedBatch.inviteCode)">复制</button>
      </div>
    </section>

    <section v-if="!participant" class="join-section">
      <header>
        <span>匿名参与</span>
        <h2>加入试点</h2>
      </header>
      <div class="join-grid">
        <label><span>邀请码</span><input v-model.trim="joinForm.inviteCode" placeholder="输入试点邀请码" /></label>
        <label
          ><span>年龄段</span
          ><select v-model="joinForm.ageRange">
            <option>18–22</option>
            <option>23–30</option>
            <option>31–45</option>
            <option>46 以上</option>
          </select></label
        >
        <label
          ><span>参与身份</span
          ><select v-model="joinForm.role">
            <option>学生</option>
            <option>教师</option>
            <option>其他</option>
          </select></label
        >
        <label
          ><span>主要目标</span
          ><select v-model="joinForm.goal">
            <option>规律饮食</option>
            <option>减脂</option>
            <option>控糖</option>
            <option>增肌</option>
          </select></label
        >
      </div>
      <fieldset class="concern-field">
        <legend>当前饮食困扰</legend>
        <label v-for="item in concernOptions" :key="item"
          ><input v-model="joinForm.concerns" type="checkbox" :value="item" />{{ item }}</label
        >
      </fieldset>
      <label class="consent-row">
        <input v-model="joinForm.consent" type="checkbox" />
        <span>我同意将匿名行为指标和问卷结果用于本试点统计；不采集姓名、手机号、学号或完整聊天内容。</span>
      </label>
      <button class="primary-button" type="button" @click="joinPilot">匿名加入试点</button>
    </section>

    <template v-else>
      <section class="participant-band">
        <div>
          <span>匿名参与编号</span><strong>{{ participant.id }}</strong>
        </div>
        <div>
          <span>前测</span><strong>{{ participant.preSurvey ? '已完成' : '待填写' }}</strong>
        </div>
        <div>
          <span>微干预</span><strong>{{ interventionCreated }} 次</strong>
        </div>
        <div>
          <span>真实打卡</span><strong>{{ checkinCount }} 天</strong>
        </div>
        <div>
          <span>后测</span
          ><strong>{{ participant.postSurvey ? '已完成' : postSurveyEligible ? '待填写' : '未开放' }}</strong>
        </div>
      </section>

      <section v-if="!participant.preSurvey" class="survey-section">
        <header>
          <span>BASELINE SURVEY</span>
          <h2>使用前问卷</h2>
          <small>1 表示非常不符合，5 表示非常符合</small>
        </header>
        <div class="scale-list">
          <div v-for="item in scaleQuestions" :key="item.key" class="scale-row">
            <strong>{{ item.label }}</strong>
            <div>
              <label v-for="value in 5" :key="value"
                ><input v-model.number="preSurvey[item.key]" type="radio" :value="value" />{{ value }}</label
              >
            </div>
          </div>
        </div>
        <button class="primary-button" type="button" @click="submitPreSurvey">提交使用前问卷</button>
      </section>

      <section v-else class="participant-progress">
        <div>
          <span>当前任务</span>
          <h2>
            {{
              checkinCount
                ? '继续完成每日真实打卡'
                : interventionCreated
                  ? '完成第 1 天真实打卡'
                  : '创建第一个 7 天微干预实验'
            }}
          </h2>
          <p>系统只统计事件类型和匿名数值，不保存完整对话或可识别身份信息。</p>
        </div>
        <RouterLink class="primary-button" to="/intervention">进入微干预实验</RouterLink>
      </section>

      <section v-if="participant.preSurvey && !participant.postSurvey" class="survey-section post-survey">
        <header>
          <span>FOLLOW-UP SURVEY</span>
          <h2>使用后问卷</h2>
          <small>{{ postSurveyEligible ? '已开放' : '完成 7 天实验后开放' }}</small>
        </header>
        <template v-if="postSurveyEligible">
          <div class="scale-list">
            <div v-for="item in postQuestions" :key="item.key" class="scale-row">
              <strong>{{ item.label }}</strong>
              <div>
                <label v-for="value in 5" :key="value"
                  ><input v-model.number="postSurvey[item.key]" type="radio" :value="value" />{{ value }}</label
                >
              </div>
            </div>
          </div>
          <div class="followup-grid">
            <label
              ><span>推荐意愿（0–10）</span
              ><input v-model.number="postSurvey.recommendScore" type="number" min="0" max="10"
            /></label>
            <label
              ><span>可接受月费</span
              ><select v-model="postSurvey.acceptablePrice">
                <option value="free">只接受免费</option>
                <option value="9.9">9.9 元</option>
                <option value="19.9">19.9 元</option>
                <option value="29.9">29.9 元</option>
              </select></label
            >
          </div>
          <label class="feedback-field"
            ><span>补充反馈</span
            ><textarea v-model="postSurvey.feedback" maxlength="300" placeholder="最有帮助或最难执行的部分"></textarea>
          </label>
          <button class="primary-button" type="button" @click="submitPostSurvey">提交使用后问卷</button>
        </template>
        <p v-else class="locked-note">后测尚未开放。完成 7 天微干预或加入满 7 天后可填写。</p>
      </section>
    </template>

    <section class="impact-section">
      <header>
        <div>
          <span>真实试点指标</span>
          <h2>社会价值运营看板</h2>
        </div>
        <small>仅统计当前浏览器中实际产生的匿名数据</small>
      </header>
      <p v-if="!metrics.sampleSufficient" class="sample-warning">
        当前有效样本 {{ metrics.participants }} 人，少于 5 人。指标仅用于流程验收，不用于效果结论。
      </p>
      <div class="impact-summary">
        <div>
          <span>匿名参与</span><strong>{{ metrics.participants }}</strong
          ><small>/ {{ metrics.targetCount }} 人</small>
        </div>
        <div>
          <span>微干预采纳率</span><strong>{{ metrics.interventionAdoption }}%</strong
          ><small>{{ metrics.interventionUsers }} 人创建</small>
        </div>
        <div>
          <span>7 天完成率</span><strong>{{ metrics.sevenDayRetentionProxy }}%</strong
          ><small>{{ metrics.completedUsers }} 人完成</small>
        </div>
        <div>
          <span>人均饮食记录</span><strong>{{ metrics.averageRecords }}</strong
          ><small>条真实事件</small>
        </div>
      </div>
      <div class="impact-grid">
        <div class="funnel-panel">
          <h3>参与漏斗</h3>
          <div v-for="step in metrics.funnel" :key="step.key" class="funnel-row">
            <span>{{ step.label }}</span>
            <div><i :style="{ width: `${step.rate}%` }"></i></div>
            <strong>{{ step.value }} · {{ step.rate }}%</strong>
          </div>
        </div>
        <div class="evidence-panel">
          <h3>问卷与行为证据</h3>
          <dl>
            <div>
              <dt>前测认知均值</dt>
              <dd>{{ metrics.preKnowledgeAverage ?? '—' }}<small>/ 5</small></dd>
            </div>
            <div>
              <dt>后测体验均值</dt>
              <dd>{{ metrics.postExperienceAverage ?? '—' }}<small>/ 5</small></dd>
            </div>
            <div>
              <dt>推荐意愿</dt>
              <dd>{{ metrics.averageRecommendScore ?? '—' }}<small>/ 10</small></dd>
            </div>
            <div>
              <dt>付费意愿</dt>
              <dd>{{ metrics.paidIntentRate === null ? '—' : `${metrics.paidIntentRate}%` }}</dd>
            </div>
            <div>
              <dt>实际评分变化</dt>
              <dd>
                {{
                  metrics.averageScoreChange === null
                    ? '—'
                    : `${metrics.averageScoreChange > 0 ? '+' : ''}${metrics.averageScoreChange}`
                }}<small>分</small>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </section>

    <section class="batch-admin">
      <header>
        <div>
          <span>试点批次</span>
          <h2>本地批次管理</h2>
        </div>
        <button class="secondary-button" type="button" @click="showBatchForm = !showBatchForm">
          {{ showBatchForm ? '收起' : '创建批次' }}
        </button>
      </header>
      <form v-if="showBatchForm" class="batch-form" @submit.prevent="createBatch">
        <label><span>试点名称</span><input v-model="batchForm.title" placeholder="例如：某高校健康饮食试点" /></label>
        <label><span>执行机构</span><input v-model="batchForm.institution" placeholder="学校、社团或健康中心" /></label>
        <label
          ><span>目标人数</span><input v-model.number="batchForm.targetCount" type="number" min="5" max="10000"
        /></label>
        <label><span>周期</span><input v-model.number="batchForm.durationDays" type="number" min="3" max="30" /></label>
        <button class="primary-button" type="submit">生成匿名邀请码</button>
      </form>
      <div class="batch-list">
        <div v-for="batch in pilotStore.batches" :key="batch.id">
          <span>{{ batch.institution }}</span
          ><strong>{{ batch.title }}</strong
          ><b>{{ batch.inviteCode }}</b>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pilot-page {
  --ink: #18333a;
  --line: #dce7e5;
  width: min(1380px, 100%);
  margin: 0 auto;
  color: var(--ink);
}
.pilot-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 0 22px;
  border-bottom: 1px solid var(--line);
}
.pilot-head p,
.survey-section header > span,
.join-section header span,
.impact-section header span,
.batch-admin header span {
  color: #0f8f84;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 1px;
}
.pilot-head h1 {
  margin-top: 6px;
  font-size: 28px;
}
.pilot-head div > span {
  display: block;
  margin-top: 7px;
  color: #74818c;
  font-size: 13px;
}
.batch-select {
  display: grid;
  gap: 5px;
}
.batch-select span,
label > span {
  color: #65747d;
  font-size: 12px;
}
.batch-select select,
input,
select,
textarea {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  font-size: 13px;
}
.batch-select select {
  min-width: 250px;
  height: 38px;
  padding: 0 10px;
}
.status-message {
  margin-top: 14px;
  padding: 10px 12px;
  border-left: 3px solid #0f8f84;
  background: #edf7f5;
  color: #386c67;
  font-size: 12px;
}
.batch-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 0;
  border-bottom: 1px solid var(--line);
}
.batch-band span {
  color: #74818c;
  font-size: 11px;
}
.batch-band h2 {
  margin-top: 4px;
  font-size: 20px;
}
.batch-band p {
  margin-top: 5px;
  color: #65747d;
  font-size: 12px;
}
.invite-code {
  display: grid;
  grid-template-columns: auto auto auto;
  align-items: center;
  gap: 10px;
}
.invite-code span {
  grid-column: 1/-1;
  text-align: right;
}
.invite-code strong {
  font-size: 16px;
  letter-spacing: 1px;
}
.invite-code button {
  padding: 5px 8px;
  border: 1px solid var(--line);
  font-size: 11px;
}
.join-section,
.survey-section,
.impact-section,
.batch-admin {
  margin-top: 24px;
  border: 1px solid var(--line);
  background: #fff;
}
.join-section > header,
.survey-section > header,
.impact-section > header,
.batch-admin > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 72px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}
.join-section > header {
  display: block;
}
.join-section h2,
.survey-section h2,
.impact-section h2,
.batch-admin h2 {
  margin-top: 3px;
  font-size: 17px;
}
.join-grid,
.followup-grid,
.batch-form {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  padding: 18px;
}
.join-grid label,
.followup-grid label,
.batch-form label,
.feedback-field {
  display: grid;
  gap: 6px;
}
.join-grid input,
.join-grid select,
.followup-grid input,
.followup-grid select,
.batch-form input {
  width: 100%;
  height: 40px;
  padding: 0 10px;
}
.concern-field {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 0 18px 18px;
}
.concern-field legend {
  width: 100%;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 800;
}
.concern-field label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #56656e;
  font-size: 12px;
}
.consent-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 18px 16px;
  padding: 12px;
  background: #f7f9f9;
  line-height: 1.6;
}
.consent-row input {
  margin-top: 2px;
}
.join-section > .primary-button,
.survey-section > .primary-button {
  margin: 0 18px 18px;
}
.primary-button,
.secondary-button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
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
.participant-band {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-top: 24px;
  border-block: 1px solid var(--line);
}
.participant-band div {
  display: grid;
  gap: 5px;
  min-height: 84px;
  padding: 16px 18px;
  border-right: 1px solid var(--line);
}
.participant-band div:last-child {
  border-right: 0;
}
.participant-band span {
  color: #74818c;
  font-size: 11px;
}
.participant-band strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.scale-list {
  padding: 0 18px;
}
.scale-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 54px;
  border-bottom: 1px solid #edf1f1;
}
.scale-row strong {
  font-size: 12.5px;
}
.scale-row > div {
  display: flex;
  gap: 14px;
}
.scale-row label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}
.survey-section header small,
.impact-section header small {
  color: #74818c;
  font-size: 11px;
}
.participant-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-top: 22px;
  padding: 22px 0;
  border-block: 1px solid var(--line);
}
.participant-progress span {
  color: #0f8f84;
  font-size: 11px;
  font-weight: 800;
}
.participant-progress h2 {
  margin-top: 4px;
  font-size: 19px;
}
.participant-progress p {
  margin-top: 5px;
  color: #65747d;
  font-size: 12px;
}
.locked-note {
  padding: 22px 18px;
  color: #74818c;
  font-size: 13px;
}
.feedback-field {
  padding: 0 18px 18px;
}
.feedback-field textarea {
  min-height: 90px;
  padding: 10px;
  resize: vertical;
}
.sample-warning {
  margin: 14px 18px 0;
  padding: 10px 12px;
  border-left: 3px solid #d0a23c;
  background: #fbf8ee;
  color: #756641;
  font-size: 12px;
}
.impact-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-top: 14px;
  border-block: 1px solid var(--line);
}
.impact-summary div {
  display: grid;
  gap: 4px;
  padding: 17px 18px;
  border-right: 1px solid var(--line);
}
.impact-summary div:last-child {
  border-right: 0;
}
.impact-summary span,
.impact-summary small {
  color: #74818c;
  font-size: 11px;
}
.impact-summary strong {
  font-size: 24px;
}
.impact-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
}
.funnel-panel,
.evidence-panel {
  padding: 20px 18px;
}
.funnel-panel {
  border-right: 1px solid var(--line);
}
.impact-grid h3 {
  margin-bottom: 14px;
  font-size: 14px;
}
.funnel-row {
  display: grid;
  grid-template-columns: 110px minmax(100px, 1fr) 80px;
  align-items: center;
  gap: 12px;
  min-height: 37px;
}
.funnel-row span,
.funnel-row strong {
  font-size: 11.5px;
}
.funnel-row strong {
  text-align: right;
}
.funnel-row > div {
  height: 8px;
  background: #edf1f1;
}
.funnel-row i {
  display: block;
  height: 100%;
  background: #0f8f84;
}
.evidence-panel dl div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  border-bottom: 1px solid #edf1f1;
}
.evidence-panel dt {
  color: #65747d;
  font-size: 12px;
}
.evidence-panel dd {
  font-size: 15px;
  font-weight: 800;
}
.evidence-panel dd small {
  margin-left: 3px;
  color: #849097;
  font-size: 10px;
}
.batch-form {
  border-bottom: 1px solid var(--line);
}
.batch-form {
  grid-template-columns: 1.3fr 1fr 0.5fr 0.5fr auto;
}
.batch-list {
  padding: 0 18px;
}
.batch-list > div {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 120px;
  gap: 14px;
  align-items: center;
  min-height: 48px;
  border-bottom: 1px solid #edf1f1;
}
.batch-list span,
.batch-list b {
  color: #74818c;
  font-size: 11.5px;
}
.batch-list strong {
  font-size: 12.5px;
}
.batch-list b {
  text-align: right;
  letter-spacing: 0.5px;
}
@media (max-width: 900px) {
  .join-grid,
  .batch-form {
    grid-template-columns: 1fr 1fr;
  }
  .participant-band {
    grid-template-columns: repeat(3, 1fr);
  }
  .impact-grid {
    grid-template-columns: 1fr;
  }
  .funnel-panel {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
@media (max-width: 700px) {
  .pilot-head,
  .batch-band,
  .participant-progress {
    align-items: flex-start;
    flex-direction: column;
  }
  .batch-select,
  .batch-select select {
    width: 100%;
  }
  .invite-code span {
    text-align: left;
  }
  .join-grid,
  .followup-grid,
  .batch-form {
    grid-template-columns: 1fr;
  }
  .participant-band,
  .impact-summary {
    grid-template-columns: 1fr 1fr;
  }
  .scale-row {
    grid-template-columns: 1fr;
    padding: 12px 0;
  }
  .scale-row > div {
    justify-content: space-between;
  }
  .impact-section > header,
  .batch-admin > header {
    align-items: flex-start;
    flex-direction: column;
  }
  .batch-list > div {
    grid-template-columns: 90px minmax(0, 1fr);
  }
  .batch-list b {
    grid-column: 2;
    text-align: left;
  }
}
</style>

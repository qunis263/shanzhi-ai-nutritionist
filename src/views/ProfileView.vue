<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseChart from '@/components/charts/BaseChart.vue'
import { useUserStore } from '@/store/user'
import { useDietStore } from '@/store/diet'
import { usePilotStore } from '@/store/pilot'
import { ACTIVITY_LEVELS, buildReport, computeMetrics, evaluateNutrient, round1, sumNutrition } from '@/utils/nutrition'
import { macaronBarOption, macaronLineOption, MACARON } from '@/utils/charts'
import { themeBg, themeText } from '@/utils/theme'
import { MEAL_EMOJI, MEAL_TYPES } from '@/data/mockHistory'
import { formatCN, isToday, relativeDay } from '@/utils/date'
import { confirm } from '@/composables/useConfirm'

const userStore = useUserStore()
const dietStore = useDietStore()
const pilotStore = usePilotStore()

const AVATARS = ['🧑‍🍳', '🥗', '🍎', '🏃', '💪', '🧘', '🐟', '🥦']
const PROFILE_TABS = [
  { key: 'overview', label: '数据概览' },
  { key: 'trends', label: '一周趋势' },
  { key: 'history', label: '饮食历史' },
  { key: 'reports', label: '营养报告' }
]
const COMPARE_KEYS = ['calories', 'protein', 'fat', 'carb', 'fiber']

const activeTab = ref('overview')
const editorOpen = ref(false)
const editorStep = ref(1)
const manageOpen = ref(false)
const expandedDay = ref('')
const expandedReport = ref('')
const form = reactive({ ...userStore.profile })

const metrics = computed(() => userStore.metrics)
const previewMetrics = computed(() =>
  computeMetrics({
    ...form,
    age: Number(form.age) || 0,
    height: Number(form.height) || 0,
    weight: Number(form.weight) || 0
  })
)
const stats = computed(() => dietStore.stats)
const totalWaterL = computed(() => round1(stats.value.totalWater / 1000))
const bestDateText = computed(() => formatCN(stats.value.bestDate))
const weekData = computed(() => dietStore.weekData)
const historyDays = computed(() => dietStore.historyDays)
const hasHistory = computed(() => historyDays.value.some(day => day.recordCount > 0))

const overviewStats = computed(() => [
  { label: '本周记录', value: stats.value.days, unit: '天' },
  { label: '日均热量', value: stats.value.avgCalories, unit: 'kcal' },
  { label: '日均健康评分', value: stats.value.avgScore, unit: '分' },
  { label: '最高评分', value: stats.value.bestScore, unit: '分', sub: bestDateText.value },
  { label: '平均蛋白质', value: stats.value.avgProtein, unit: 'g' },
  { label: '平均膳食纤维', value: stats.value.avgFiber, unit: 'g' },
  { label: '累计饮食记录', value: stats.value.totalRecords, unit: '条' },
  { label: '累计饮水', value: totalWaterL.value, unit: 'L' }
])

const lineOption = computed(() =>
  macaronLineOption({
    labels: weekData.value.map(day => day.label),
    series: [{ name: '每日热量', data: weekData.value.map(day => day.calories), color: MACARON.orange, area: true }],
    target: dietStore.targets.calories,
    targetLabel: '目标',
    unit: 'kcal'
  })
)

const barOption = computed(() =>
  macaronBarOption({
    labels: weekData.value.map(day => day.label),
    values: weekData.value.map(day => day.score),
    name: '健康评分',
    unit: '分'
  })
)

const expandedDetail = computed(() => {
  if (!expandedDay.value) return null
  const day = dietStore.getDay(expandedDay.value)
  const groups = MEAL_TYPES.map(type => ({
    type,
    emoji: MEAL_EMOJI[type],
    items: day.records.filter(record => record.mealType === type)
  })).filter(group => group.items.length > 0)
  return {
    date: expandedDay.value,
    water: day.water,
    groups,
    recordCount: day.records.length,
    isToday: isToday(expandedDay.value)
  }
})

const reportDays = computed(() =>
  historyDays.value.map(day => {
    const detail = dietStore.getDay(day.date)
    const summary = sumNutrition(detail.records)
    const report = buildReport({ summary, targets: dietStore.targets, water: detail.water, records: detail.records })
    const compare = COMPARE_KEYS.map(key => evaluateNutrient(key, summary[key], dietStore.targets[key]))
    return { ...day, report, compare }
  })
)

function openEditor() {
  Object.assign(form, userStore.profile)
  editorStep.value = 1
  editorOpen.value = true
  manageOpen.value = false
}

function closeEditor() {
  editorOpen.value = false
}

function resetEditorForm() {
  Object.assign(form, userStore.DEFAULT_PROFILE)
}

function saveProfile() {
  userStore.updateProfile({
    nickname: form.nickname || '小营养家',
    avatar: form.avatar,
    gender: form.gender,
    age: Number(form.age) || 21,
    height: Number(form.height) || 0,
    weight: Number(form.weight) || 0,
    activity: form.activity
  })
  editorOpen.value = false
  showToast('档案已保存，全站数据已更新')
}

function toggleDay(date) {
  expandedDay.value = expandedDay.value === date ? '' : date
}

function toggleReport(date) {
  expandedReport.value = expandedReport.value === date ? '' : date
}

function removeRecord(id) {
  dietStore.removeRecord(id)
  showToast('已删除该条记录')
}

/** 一键填充演示数据：恢复演示档案 + 近 7 天饮食记录与饮水，适合答辩演示前快速就绪 */
function fillDemoData() {
  userStore.resetProfile()
  dietStore.resetToDemo()
  Object.assign(form, userStore.profile)
  expandedDay.value = ''
  manageOpen.value = false
  showToast('已填充演示档案与近 7 天饮食数据')
}

async function clearAllData() {
  const ok = await confirm({
    title: '清空全部饮食数据？',
    message: '将删除本机保存的全部饮食记录与饮水数据，此操作不可恢复。',
    confirmText: '清空数据'
  })
  if (!ok) return
  dietStore.clearAll()
  expandedDay.value = ''
  manageOpen.value = false
  showToast('已清空全部饮食数据')
}

const toastVisible = ref(false)
const toastText = ref('')
let toastTimer = null

function showToast(text) {
  toastText.value = text
  toastVisible.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 2000)
}

onBeforeUnmount(() => clearTimeout(toastTimer))
</script>

<template>
  <div class="profile-page stagger">
    <PageHeader>
      <template #extra><RouterLink to="/dashboard" class="btn btn-primary">数据大屏</RouterLink></template>
    </PageHeader>

    <main class="profile-shell">
      <section class="profile-hero">
        <div class="identity-block">
          <span class="profile-avatar" aria-hidden="true">{{ userStore.profile.avatar }}</span>
          <div>
            <p class="section-eyebrow">个人健康档案</p>
            <h1>{{ userStore.profile.nickname }}</h1>
            <p>
              {{ userStore.genderText }} · {{ userStore.profile.age }} 岁 · {{ userStore.profile.height }}cm ·
              {{ userStore.profile.weight }}kg · {{ userStore.activityInfo.label }}
            </p>
          </div>
        </div>
        <div class="profile-actions">
          <RouterLink class="btn btn-ghost" to="/pilot">
            {{ pilotStore.currentParticipant ? '我的试点' : '加入试点' }}
          </RouterLink>
          <button class="btn btn-primary" type="button" @click="openEditor">编辑档案</button>
          <div class="manage-menu-wrap">
            <button class="icon-menu" type="button" aria-label="打开数据管理菜单" @click="manageOpen = !manageOpen">
              •••
            </button>
            <div v-if="manageOpen" class="manage-menu">
              <strong>本机数据管理</strong>
              <p>饮食记录仅保存在当前浏览器。</p>
              <button type="button" @click="fillDemoData">一键填充演示数据</button>
              <button class="danger" type="button" @click="clearAllData">清空全部饮食数据</button>
            </div>
          </div>
        </div>
      </section>

      <section class="metric-strip" aria-label="当前身体指标">
        <div class="bmi-metric">
          <span>BMI</span><strong class="num" :style="{ color: metrics.bmiGrade.color }">{{ metrics.bmi }}</strong
          ><em :style="{ color: metrics.bmiGrade.color }">{{ metrics.bmiGrade.label }}</em>
        </div>
        <div>
          <span>基础代谢 BMR</span><strong class="num">{{ metrics.bmr }} <small>kcal</small></strong>
        </div>
        <div>
          <span>每日消耗 TDEE</span><strong class="num">{{ metrics.tdee }} <small>kcal</small></strong>
        </div>
        <div>
          <span>推荐摄入</span><strong class="num">{{ metrics.dailyCalories }} <small>kcal</small></strong>
        </div>
        <div>
          <span>饮食模式</span><strong>{{ metrics.dietModeEmoji }} {{ metrics.dietMode }}</strong>
        </div>
      </section>

      <nav class="profile-tabs" aria-label="个人数据视图">
        <button
          v-for="tab in PROFILE_TABS"
          :key="tab.key"
          type="button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>

      <Transition name="view-fade" mode="out-in">
        <section v-if="activeTab === 'overview'" key="overview" class="view-section overview-view">
          <header class="view-head">
            <div>
              <p class="section-eyebrow">最近 7 天</p>
              <h2>健康数据概览</h2>
            </div>
            <p>{{ metrics.bmiGrade.advice }}</p>
          </header>
          <div class="overview-grid">
            <div v-for="item in overviewStats" :key="item.label" class="overview-stat">
              <span>{{ item.label }}</span
              ><strong class="num"
                >{{ item.value }} <small>{{ item.unit }}</small></strong
              ><em v-if="item.sub">{{ item.sub }}</em>
            </div>
          </div>
          <div class="overview-note">
            <strong>当前建议</strong>
            <p>{{ metrics.dietModeDesc }}</p>
            <RouterLink to="/report">查看今日营养分析 →</RouterLink>
          </div>
        </section>

        <section v-else-if="activeTab === 'trends'" key="trends" class="view-section">
          <header class="view-head">
            <div>
              <p class="section-eyebrow">趋势视图</p>
              <h2>近 7 天变化</h2>
            </div>
            <p>热量目标 {{ dietStore.targets.calories }} kcal</p>
          </header>
          <div class="trend-grid">
            <div>
              <h3>每日热量</h3>
              <BaseChart :option="lineOption" height="340px" />
            </div>
            <div>
              <h3>健康评分</h3>
              <BaseChart :option="barOption" height="340px" />
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'history'" key="history" class="view-section">
          <header class="view-head">
            <div>
              <p class="section-eyebrow">时间轴</p>
              <h2>最近饮食记录</h2>
            </div>
            <RouterLink to="/diet">记录今天的饮食 →</RouterLink>
          </header>
          <div v-if="hasHistory" class="history-list">
            <article
              v-for="day in historyDays"
              :key="day.date"
              class="history-day"
              :class="{ expanded: expandedDay === day.date }"
            >
              <button class="history-summary" type="button" @click="toggleDay(day.date)">
                <span class="history-date"
                  ><strong>{{ formatCN(day.date) }}</strong
                  ><small>{{ relativeDay(day.date) }} · {{ day.weekday }}</small></span
                >
                <span
                  ><small>热量</small><strong class="num">{{ day.calories }} kcal</strong></span
                >
                <span
                  ><small>健康评分</small
                  ><strong class="num" :style="{ color: day.grade.color }">{{ day.score }}</strong></span
                >
                <span
                  ><small>记录</small><strong class="num">{{ day.recordCount }} 条</strong></span
                >
                <span
                  ><small>饮水</small><strong class="num">{{ day.water }} ml</strong></span
                >
                <em>{{ expandedDay === day.date ? '收起' : '展开' }}</em>
              </button>
              <Transition name="view-fade">
                <div v-if="expandedDay === day.date && expandedDetail" class="history-detail">
                  <div v-for="group in expandedDetail.groups" :key="group.type" class="meal-group">
                    <h3>{{ group.emoji }} {{ group.type }}</h3>
                    <div v-for="record in group.items" :key="record.id" class="record-line">
                      <span>{{ record.emoji }} {{ record.name }}</span
                      ><small>{{ record.grams }}{{ record.unit === '100ml' ? 'ml' : 'g' }}</small
                      ><strong class="num">{{ record.nutrition.calories }} kcal</strong>
                      <button
                        v-if="expandedDetail.isToday"
                        type="button"
                        aria-label="删除记录"
                        @click.stop="removeRecord(record.id)"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <EmptyState v-if="!expandedDetail.groups.length" emoji="🍽️" text="当日没有饮食记录" height="100px" />
                </div>
              </Transition>
            </article>
          </div>
          <EmptyState v-else emoji="📭" text="暂无历史记录" sub="记录第一餐后，这里会形成你的健康时间轴" />
        </section>

        <section v-else key="reports" class="view-section">
          <header class="view-head">
            <div>
              <p class="section-eyebrow">AI 报告档案</p>
              <h2>每日营养报告</h2>
            </div>
            <RouterLink to="/report">查看今日完整报告 →</RouterLink>
          </header>
          <div v-if="hasHistory" class="report-list">
            <article v-for="day in reportDays" :key="day.date" class="report-day">
              <button class="report-summary" type="button" @click="toggleReport(day.date)">
                <span
                  ><strong>{{ formatCN(day.date) }}</strong
                  ><small>{{ relativeDay(day.date) }} · {{ day.weekday }}</small></span
                >
                <b class="num" :style="{ color: day.report.grade.color }">{{ day.report.score }}</b>
                <i
                  :style="{
                    backgroundColor: themeBg(day.report.grade.theme),
                    color: themeText(day.report.grade.theme)
                  }"
                  >{{ day.report.grade.emoji }} {{ day.report.grade.label }}</i
                >
                <p>{{ day.report.grade.desc }}</p>
                <em>{{ expandedReport === day.date ? '收起' : '展开' }}</em>
              </button>
              <Transition name="view-fade">
                <div v-if="expandedReport === day.date" class="report-detail">
                  <div class="report-findings">
                    <section>
                      <h3>表现良好</h3>
                      <p v-for="item in day.report.strengths" :key="item">{{ item }}</p>
                    </section>
                    <section>
                      <h3>需要关注</h3>
                      <p v-for="item in day.report.weaknesses" :key="item">{{ item }}</p>
                    </section>
                  </div>
                  <div class="compare-lines">
                    <div v-for="item in day.compare" :key="item.key">
                      <span>{{ item.emoji }} {{ item.label }}</span
                      ><strong class="num">{{ item.value }} / {{ item.target }} {{ item.unit }}</strong
                      ><StatusBadge :status="item.status" size="sm" />
                    </div>
                  </div>
                </div>
              </Transition>
            </article>
          </div>
          <EmptyState v-else emoji="📋" text="暂无历史报告" sub="记录饮食后即可生成 AI 报告" />
        </section>
      </Transition>
    </main>

    <Transition name="drawer-fade"
      ><div v-if="editorOpen" class="drawer-backdrop" @click="closeEditor"></div
    ></Transition>
    <Transition name="drawer-slide">
      <aside v-if="editorOpen" class="profile-drawer" aria-label="编辑健康档案">
        <header class="drawer-head">
          <div>
            <p class="section-eyebrow">编辑健康档案</p>
            <h2>{{ editorStep === 1 ? '基础资料' : editorStep === 2 ? '身体数据' : '活动状态' }}</h2>
          </div>
          <button type="button" @click="closeEditor">关闭</button>
        </header>
        <nav class="editor-steps">
          <button
            v-for="step in 3"
            :key="step"
            type="button"
            :class="{ active: editorStep === step }"
            @click="editorStep = step"
          >
            <span>0{{ step }}</span
            >{{ ['基础资料', '身体数据', '活动状态'][step - 1] }}
          </button>
        </nav>
        <div class="drawer-scroll">
          <section v-if="editorStep === 1" class="editor-panel">
            <label>选择形象</label>
            <div class="avatar-options">
              <button
                v-for="avatar in AVATARS"
                :key="avatar"
                type="button"
                :class="{ active: form.avatar === avatar }"
                @click="form.avatar = avatar"
              >
                {{ avatar }}
              </button>
            </div>
            <label for="profile-name">昵称</label
            ><input id="profile-name" v-model="form.nickname" class="editor-input" placeholder="给自己起个名字" />
            <label>性别</label>
            <div class="gender-options">
              <button type="button" :class="{ active: form.gender === 'male' }" @click="form.gender = 'male'">男</button
              ><button type="button" :class="{ active: form.gender === 'female' }" @click="form.gender = 'female'">
                女
              </button>
            </div>
          </section>
          <section v-else-if="editorStep === 2" class="editor-panel numeric-panel">
            <label for="profile-age">年龄 <small>岁</small></label
            ><input id="profile-age" v-model.number="form.age" type="number" min="10" max="90" class="editor-input" />
            <label for="profile-height">身高 <small>cm</small></label
            ><input
              id="profile-height"
              v-model.number="form.height"
              type="number"
              min="120"
              max="230"
              class="editor-input"
            />
            <label for="profile-weight">体重 <small>kg</small></label
            ><input
              id="profile-weight"
              v-model.number="form.weight"
              type="number"
              min="30"
              max="200"
              step="0.1"
              class="editor-input"
            />
          </section>
          <section v-else class="editor-panel activity-options">
            <button
              v-for="activity in ACTIVITY_LEVELS"
              :key="activity.key"
              type="button"
              :class="{ active: form.activity === activity.key }"
              @click="form.activity = activity.key"
            >
              <span>{{ activity.emoji }}</span
              ><strong>{{ activity.label }}</strong
              ><small>{{ activity.desc }}</small
              ><b>{{ form.activity === activity.key ? '已选择' : '' }}</b>
            </button>
          </section>
          <section class="preview-strip">
            <div>
              <span>预览 BMI</span><strong class="num">{{ previewMetrics.bmi }}</strong>
            </div>
            <div>
              <span>推荐热量</span><strong class="num">{{ previewMetrics.dailyCalories }} kcal</strong>
            </div>
            <p>{{ previewMetrics.bmiGrade.label }} · 保存后全站数据将同步更新</p>
          </section>
        </div>
        <footer class="drawer-footer">
          <button type="button" class="reset-editor" @click="resetEditorForm">恢复默认填写</button>
          <div>
            <button v-if="editorStep > 1" type="button" class="btn btn-ghost" @click="editorStep--">上一步</button
            ><button v-if="editorStep < 3" type="button" class="btn btn-primary" @click="editorStep++">下一步</button
            ><button v-else type="button" class="btn btn-primary" @click="saveProfile">保存档案</button>
          </div>
        </footer>
      </aside>
    </Transition>

    <div v-if="toastVisible" class="profile-toast">{{ toastText }}</div>
  </div>
</template>

<style scoped>
.profile-shell {
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 6px 0 52px;
}
.section-eyebrow {
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.profile-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 26px 0;
  border-bottom: 1px solid var(--line);
}
.identity-block {
  display: flex;
  align-items: center;
  gap: 16px;
}
.profile-avatar {
  width: 66px;
  height: 66px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  background: #fff;
  font-size: 32px;
}
.identity-block h1 {
  margin: 3px 0;
  color: var(--ink);
  font-size: 25px;
}
.identity-block > div > p:last-child {
  color: var(--tx-muted);
  font-size: 12px;
}
.profile-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.manage-menu-wrap {
  position: relative;
}
.icon-menu {
  width: 38px;
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: #fff;
  color: var(--tx-sub);
  font-weight: 800;
}
.manage-menu {
  position: absolute;
  z-index: 20;
  top: 46px;
  right: 0;
  width: 230px;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(27, 43, 38, 0.12);
}
.manage-menu strong {
  font-size: 12px;
}
.manage-menu p {
  margin: 3px 0 10px;
  color: var(--tx-muted);
  font-size: 9px;
}
.manage-menu button {
  width: 100%;
  padding: 8px;
  border: 0;
  border-top: 1px solid var(--line);
  background: #fff;
  text-align: left;
  color: var(--tx-sub);
  font-size: 10px;
}
.manage-menu button.danger {
  color: #b84e4e;
}
.metric-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border-bottom: 1px solid var(--line);
}
.metric-strip > div {
  position: relative;
  display: grid;
  gap: 5px;
  padding: 20px 20px 20px 0;
}
.metric-strip > div + div {
  padding-left: 20px;
  border-left: 1px solid var(--line);
}
.metric-strip span {
  color: var(--tx-muted);
  font-size: 10px;
}
.metric-strip strong {
  color: var(--ink);
  font-size: 18px;
}
.metric-strip strong small {
  font-size: 9px;
}
.metric-strip em {
  position: absolute;
  right: 14px;
  bottom: 23px;
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
}
.profile-tabs {
  display: flex;
  gap: 30px;
  border-bottom: 1px solid var(--line);
}
.profile-tabs button {
  min-height: 52px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--tx-muted);
  font-size: 12px;
}
.profile-tabs button.active {
  border-bottom-color: var(--brand);
  color: var(--brand);
  font-weight: 800;
}
.view-section {
  min-height: 430px;
  padding: 30px 0;
}
.view-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}
.view-head h2 {
  margin-top: 3px;
  color: var(--ink);
  font-size: 20px;
}
.view-head > p,
.view-head > a {
  color: var(--tx-muted);
  font-size: 10px;
}
.view-head > a {
  color: var(--brand);
  font-weight: 800;
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--line);
}
.overview-stat {
  position: relative;
  display: grid;
  gap: 7px;
  min-height: 112px;
  padding: 20px 20px 18px 0;
  border-bottom: 1px solid var(--line);
}
.overview-stat:not(:nth-child(4n + 1)) {
  padding-left: 20px;
  border-left: 1px solid var(--line);
}
.overview-stat span {
  color: var(--tx-muted);
  font-size: 10px;
}
.overview-stat strong {
  color: var(--ink);
  font-size: 24px;
}
.overview-stat strong small {
  font-size: 10px;
}
.overview-stat em {
  position: absolute;
  right: 12px;
  bottom: 22px;
  color: var(--tx-muted);
  font-size: 9px;
  font-style: normal;
}
.overview-note {
  display: grid;
  grid-template-columns: 100px 1fr auto;
  align-items: center;
  gap: 20px;
  margin-top: 28px;
  padding: 16px 0;
  border-block: 1px solid var(--line);
  font-size: 11px;
}
.overview-note p {
  color: var(--tx-sub);
}
.overview-note a {
  color: var(--brand);
  font-weight: 800;
}
.trend-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 34px;
}
.trend-grid > div + div {
  padding-left: 34px;
  border-left: 1px solid var(--line);
}
.trend-grid h3 {
  margin-bottom: 10px;
  color: var(--ink);
  font-size: 13px;
}
.history-list,
.report-list {
  border-top: 1px solid var(--line);
}
.history-day,
.report-day {
  border-bottom: 1px solid var(--line);
}
.history-summary {
  width: 100%;
  min-height: 76px;
  display: grid;
  grid-template-columns: 190px repeat(4, 1fr) 38px;
  align-items: center;
  gap: 14px;
  border: 0;
  background: transparent;
  text-align: left;
}
.history-summary > span:not(.history-date) {
  display: grid;
  gap: 3px;
}
.history-summary small {
  color: var(--tx-muted);
  font-size: 9px;
}
.history-summary strong {
  color: var(--ink);
  font-size: 12px;
}
.history-date strong {
  display: block;
  font-size: 13px;
}
.history-summary em,
.report-summary em {
  color: var(--brand);
  font-size: 9px;
  font-style: normal;
  text-align: right;
}
.history-detail,
.report-detail {
  padding: 4px 0 20px 204px;
}
.meal-group {
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.meal-group h3 {
  margin-bottom: 7px;
  font-size: 11px;
}
.record-line {
  display: grid;
  grid-template-columns: 1fr 80px 90px 40px;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  color: var(--tx-sub);
  font-size: 10px;
}
.record-line small {
  color: var(--tx-muted);
}
.record-line strong {
  text-align: right;
}
.record-line button {
  border: 0;
  background: transparent;
  color: #b84e4e;
  font-size: 9px;
}
.report-summary {
  width: 100%;
  min-height: 78px;
  display: grid;
  grid-template-columns: 190px 52px 80px 1fr 38px;
  align-items: center;
  gap: 15px;
  border: 0;
  background: transparent;
  text-align: left;
}
.report-summary > span {
  display: grid;
  gap: 3px;
}
.report-summary > span strong {
  font-size: 13px;
}
.report-summary > span small,
.report-summary p {
  color: var(--tx-muted);
  font-size: 10px;
}
.report-summary > b {
  font-size: 26px;
}
.report-summary i {
  padding: 4px 7px;
  border-radius: 4px;
  font-size: 9px;
  font-style: normal;
  text-align: center;
}
.report-findings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  padding: 15px 0;
  border-top: 1px solid var(--line);
}
.report-findings h3 {
  margin-bottom: 7px;
  font-size: 11px;
}
.report-findings p {
  margin-top: 4px;
  color: var(--tx-sub);
  font-size: 10px;
}
.compare-lines {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
}
.compare-lines > div {
  display: grid;
  grid-template-columns: 90px 1fr 52px;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  border-top: 1px solid var(--line);
  font-size: 9px;
}
.compare-lines strong {
  text-align: right;
}
.drawer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(30, 37, 39, 0.26);
}
.profile-drawer {
  position: fixed;
  z-index: 70;
  top: 0;
  right: 0;
  width: 480px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: -18px 0 50px rgba(30, 37, 39, 0.13);
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px 18px;
  border-bottom: 1px solid var(--line);
}
.drawer-head h2 {
  margin-top: 3px;
  font-size: 21px;
}
.drawer-head > button {
  border: 0;
  background: transparent;
  color: var(--tx-sub);
  font-size: 10px;
}
.editor-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 0 28px;
  border-bottom: 1px solid var(--line);
}
.editor-steps button {
  display: grid;
  gap: 2px;
  padding: 13px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--tx-muted);
  font-size: 9px;
}
.editor-steps button span {
  font-size: 8px;
}
.editor-steps button.active {
  border-bottom-color: var(--brand);
  color: var(--brand);
  font-weight: 800;
}
.drawer-scroll {
  flex: 1;
  overflow: auto;
  padding: 8px 28px 28px;
}
.editor-panel {
  display: grid;
  gap: 10px;
  padding: 18px 0;
}
.editor-panel > label {
  margin-top: 7px;
  color: var(--ink);
  font-size: 11px;
  font-weight: 800;
}
.editor-panel label small {
  color: var(--tx-muted);
  font-weight: 500;
}
.avatar-options {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 5px;
}
.avatar-options button {
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  font-size: 19px;
}
.avatar-options button.active {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.editor-input {
  width: 100%;
  height: 42px;
  padding: 0 11px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  outline: 0;
  font-size: 12px;
}
.editor-input:focus {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-soft);
}
.gender-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}
.gender-options button {
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: #fff;
  color: var(--tx-sub);
  font-size: 11px;
}
.gender-options button.active {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 800;
}
.numeric-panel {
  grid-template-columns: 120px 1fr;
  align-items: center;
  gap: 14px;
}
.numeric-panel label {
  margin: 0;
}
.activity-options button {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  gap: 2px 10px;
  padding: 14px 4px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: #fff;
  text-align: left;
}
.activity-options button > span {
  grid-row: 1/3;
  font-size: 22px;
}
.activity-options strong {
  font-size: 11px;
}
.activity-options small {
  color: var(--tx-muted);
  font-size: 9px;
}
.activity-options b {
  grid-row: 1/3;
  grid-column: 3;
  align-self: center;
  color: var(--brand);
  font-size: 9px;
}
.activity-options button.active {
  background: var(--brand-soft);
}
.preview-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 18px;
  margin-top: 10px;
  padding: 16px 0;
  border-block: 1px solid var(--line);
}
.preview-strip div {
  display: grid;
  gap: 4px;
}
.preview-strip span,
.preview-strip p {
  color: var(--tx-muted);
  font-size: 9px;
}
.preview-strip strong {
  font-size: 17px;
}
.preview-strip p {
  grid-column: 1/-1;
}
.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 15px 28px;
  border-top: 1px solid var(--line);
}
.drawer-footer > div {
  display: flex;
  gap: 7px;
}
.reset-editor {
  border: 0;
  background: transparent;
  color: var(--tx-muted);
  font-size: 9px;
}
.profile-toast {
  position: fixed;
  z-index: 90;
  right: 28px;
  bottom: 28px;
  padding: 10px 17px;
  border-radius: 999px;
  background: #27322f;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.28s ease;
}
.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
.drawer-fade-enter-active,
.drawer-fade-leave-active,
.view-fade-enter-active,
.view-fade-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to,
.view-fade-enter-from,
.view-fade-leave-to {
  opacity: 0;
}
</style>

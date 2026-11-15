<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/common/PageHeader.vue'
import { useUserStore } from '@/store/user'
import { ACTIVITY_LEVELS, bmiBarPercent, computeMetrics } from '@/utils/nutrition'

const router = useRouter()
const userStore = useUserStore()
const step = ref(1)
const resultVisible = ref(false)
const toast = reactive({ visible: false, text: '' })
let toastTimer = null
const form = reactive({ ...userStore.profile })
const GOALS = [
  { key: 'lose', emoji: '📉', label: '减脂', desc: '建立温和热量缺口，循序渐进降低体脂' },
  { key: 'keep', emoji: '⚖️', label: '维持体重', desc: '保持当前体重与稳定能量平衡' },
  { key: 'gain', emoji: '💪', label: '增肌增重', desc: '适度增加能量与优质蛋白摄入' }
]
const errors = computed(() => {
  const e = {}
  if (!Number(form.age) || form.age < 10 || form.age > 90) e.age = '年龄需在 10–90 岁之间'
  if (!Number(form.height) || form.height < 120 || form.height > 220) e.height = '身高需在 120–220 cm 之间'
  if (!Number(form.weight) || form.weight < 30 || form.weight > 200) e.weight = '体重需在 30–200 kg 之间'
  return e
})
const isValid = computed(() => !Object.keys(errors.value).length)
const metrics = computed(() =>
  computeMetrics({
    ...form,
    age: Number(form.age) || 0,
    height: Number(form.height) || 0,
    weight: Number(form.weight) || 0
  })
)
const grade = computed(() => metrics.value.bmiGrade)
const activity = computed(() => ACTIVITY_LEVELS.find(x => x.key === form.activity) || ACTIVITY_LEVELS[0])
const goal = computed(() => GOALS.find(x => x.key === form.goal) || GOALS[1])
const bmiPercent = computed(() => bmiBarPercent(metrics.value.bmi))
const genderText = computed(() => (form.gender === 'female' ? '女' : '男'))
function notify(message) {
  toast.text = message
  toast.visible = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.visible = false), 2000)
}
function next() {
  if (step.value === 1 && !isValid.value) return notify('请先修正基础信息')
  step.value = Math.min(3, step.value + 1)
}
function back() {
  step.value = Math.max(1, step.value - 1)
}
function generate() {
  if (!isValid.value) return notify('请先修正基础信息')
  step.value = 4
  resultVisible.value = true
}
function edit(target = 1) {
  resultVisible.value = false
  step.value = target
}
function save() {
  if (!isValid.value) return
  userStore.updateProfile({ ...form, age: Number(form.age), height: Number(form.height), weight: Number(form.weight) })
  notify('测评结果已保存到健康档案')
}
function reset() {
  Object.assign(form, userStore.DEFAULT_PROFILE)
  step.value = 1
  resultVisible.value = false
  notify('已恢复默认演示数据')
}
onBeforeUnmount(() => clearTimeout(toastTimer))
</script>

<template>
  <div class="assessment-page stagger">
    <PageHeader>
      <template #extra>
        <template v-if="resultVisible">
          <span class="result-chip">BMI {{ metrics.bmi }} · {{ grade.label }}</span>
          <button class="btn btn-ghost" @click="edit(1)">修改档案</button>
          <button class="btn btn-primary" @click="save">保存到健康档案</button>
        </template>
      </template>
    </PageHeader>
    <main class="assessment-shell">
      <Transition name="shift" mode="out-in">
        <section v-if="!resultVisible" key="wizard">
          <header class="intro">
            <p class="eyebrow">个性化身体测评</p>
            <h2>用三步建立身体健康档案</h2>
            <p>填写资料与查看结果分开进行，完成后再生成 BMI、代谢和每日摄入建议。</p>
          </header>
          <nav class="stepper">
            <button v-for="n in 3" :key="n" :class="{ active: step === n, done: step > n }" @click="step = n">
              <i>{{ step > n ? '✓' : n }}</i
              ><span>{{ n === 1 ? '基础信息' : n === 2 ? '活动状态' : '健康目标' }}</span>
            </button>
            <span>4 查看结果</span>
          </nav>
          <div class="summary-lines">
            <button v-if="step > 1" @click="step = 1">
              <b>✓ 基础信息</b
              ><span>{{ genderText }} · {{ form.age }} 岁 · {{ form.height }}cm · {{ form.weight }}kg</span
              ><em>修改</em>
            </button>
            <button v-if="step > 2" @click="step = 2">
              <b>✓ 活动状态</b><span>{{ activity.emoji }} {{ activity.label }} · 系数 {{ activity.factor }}</span
              ><em>修改</em>
            </button>
          </div>
          <Transition name="reveal" mode="out-in">
            <section v-if="step === 1" key="basic" class="panel">
              <header>
                <i>01</i>
                <div>
                  <h3>你的基础信息</h3>
                  <p>这些数据用于计算 BMI 和基础代谢。</p>
                </div>
              </header>
              <div class="field-grid">
                <label class="wide"><span>昵称</span><input v-model="form.nickname" /></label>
                <div class="wide">
                  <span>性别</span>
                  <div class="choice">
                    <button :class="{ selected: form.gender === 'male' }" @click="form.gender = 'male'">👨 男</button
                    ><button :class="{ selected: form.gender === 'female' }" @click="form.gender = 'female'">
                      👩 女
                    </button>
                  </div>
                </div>
                <label
                  ><span>年龄</span>
                  <div class="unit-input"><input v-model.number="form.age" type="number" /><b>岁</b></div>
                  <small>{{ errors.age }}</small></label
                >
                <label
                  ><span>身高</span>
                  <div class="unit-input"><input v-model.number="form.height" type="number" /><b>cm</b></div>
                  <small>{{ errors.height }}</small></label
                >
                <label
                  ><span>当前体重</span>
                  <div class="unit-input"><input v-model.number="form.weight" type="number" step="0.1" /><b>kg</b></div>
                  <small>{{ errors.weight }}</small></label
                >
              </div>
              <footer>
                <button class="link-btn" @click="reset">恢复默认</button
                ><button class="btn btn-primary" :disabled="!isValid" @click="next">下一步：选择活动状态 →</button>
              </footer>
            </section>
            <section v-else-if="step === 2" key="activity" class="panel">
              <header>
                <i>02</i>
                <div>
                  <h3>你的日常活动状态</h3>
                  <p>请选择最接近过去三个月平均状态的一项。</p>
                </div>
              </header>
              <div class="option-list">
                <button
                  v-for="item in ACTIVITY_LEVELS"
                  :key="item.key"
                  :class="{ selected: form.activity === item.key }"
                  @click="form.activity = item.key"
                >
                  <i></i><b>{{ item.emoji }} {{ item.label }}</b
                  ><span>{{ item.desc }}</span
                  ><em>×{{ item.factor }}</em>
                </button>
              </div>
              <footer>
                <button class="btn btn-ghost" @click="back">← 上一步</button
                ><button class="btn btn-primary" @click="next">下一步：选择健康目标 →</button>
              </footer>
            </section>
            <section v-else key="goal" class="panel">
              <header>
                <i>03</i>
                <div>
                  <h3>你希望改善什么</h3>
                  <p>健康目标会影响每日推荐摄入热量。</p>
                </div>
              </header>
              <div class="goal-list">
                <button
                  v-for="item in GOALS"
                  :key="item.key"
                  :class="{ selected: form.goal === item.key }"
                  @click="form.goal = item.key"
                >
                  <i>{{ item.emoji }}</i>
                  <div>
                    <b>{{ item.label }}</b
                    ><span>{{ item.desc }}</span>
                  </div>
                  <em>{{ form.goal === item.key ? '已选择' : '选择' }}</em>
                </button>
              </div>
              <footer>
                <button class="btn btn-ghost" @click="back">← 上一步</button
                ><button class="btn btn-primary" @click="generate">生成身体测评 →</button>
              </footer>
            </section>
          </Transition>
        </section>
        <section v-else key="result" class="report">
          <header class="report-hero">
            <div>
              <p class="eyebrow">身体测评结果</p>
              <h2>你的身体状态处于{{ grade.label }}区间</h2>
              <p>{{ grade.advice }}</p>
            </div>
            <div class="bmi-number">
              <strong>{{ metrics.bmi }}</strong
              ><span>BMI · {{ grade.label }}</span>
            </div>
          </header>
          <section class="report-section">
            <header>
              <div>
                <h3>BMI 身体质量指数</h3>
                <p>体重与身高的比例位置</p>
              </div>
              <button @click="edit(1)">调整身高体重</button>
            </header>
            <div class="bmi-wrap">
              <div class="bmi-track">
                <i :style="{ left: bmiPercent + '%' }"
                  ><b>{{ metrics.bmi }}</b></i
                >
              </div>
              <div class="bmi-labels">
                <span>偏瘦<small>18.5</small></span
                ><span>标准<small>24</small></span
                ><span>超重<small>28</small></span
                ><span>肥胖</span>
              </div>
            </div>
          </section>
          <section class="report-section">
            <header>
              <div>
                <h3>每日能量路径</h3>
                <p>从静息消耗到最终建议摄入的计算关系</p>
              </div>
              <button @click="edit(2)">调整活动状态</button>
            </header>
            <div class="energy-path">
              <div>
                <span>基础代谢 BMR</span><strong>{{ metrics.bmr }} <small>kcal</small></strong>
                <p>静息状态所需</p>
              </div>
              <i>× {{ activity.factor }}</i>
              <div>
                <span>全天总消耗 TDEE</span><strong>{{ metrics.tdee }} <small>kcal</small></strong>
                <p>{{ activity.label }}</p>
              </div>
              <i>→</i>
              <div class="primary">
                <span>每日推荐摄入</span><strong>{{ metrics.dailyCalories }} <small>kcal</small></strong>
                <p>{{ metrics.dietMode }}</p>
              </div>
            </div>
          </section>
          <section class="recommend">
            <div>
              <p class="eyebrow">今日行动建议</p>
              <h3>{{ goal.emoji }} {{ metrics.dietMode }}</h3>
              <p>{{ metrics.dietModeDesc }}</p>
            </div>
            <div>
              <button class="btn btn-primary" @click="save">保存到健康档案</button
              ><button class="btn btn-ghost" @click="router.push('/diet')">去记录饮食</button
              ><button class="btn btn-ghost" @click="router.push('/plan')">查看膳食建议</button>
            </div>
          </section>
          <footer class="report-footer">
            <span>{{ genderText }} · {{ form.age }} 岁 · {{ form.height }}cm · {{ form.weight }}kg</span
            ><span>活动系数 {{ activity.factor }}</span
            ><button @click="edit(1)">重新测评</button>
          </footer>
        </section>
      </Transition>
    </main>
    <div v-if="toast.visible" class="toast">{{ toast.text }}</div>
  </div>
</template>

<style scoped>
.assessment-shell {
  width: min(980px, 100%);
  margin: 0 auto;
  padding: 8px 0 52px;
}
.result-chip {
  font-size: 12px;
  color: var(--tx-sub);
}
.intro {
  max-width: 700px;
  padding: 14px 0 28px;
}
.eyebrow {
  color: var(--brand);
  font-size: 11px;
  font-weight: 800;
}
.intro h2,
.report-hero h2 {
  margin-top: 7px;
  color: var(--ink);
  font-size: 32px;
  font-weight: 800;
}
.intro > p:last-child,
.report-hero p:last-child {
  margin-top: 8px;
  color: var(--tx-sub);
  font-size: 13px;
}
.stepper {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-bottom: 1px solid var(--line);
}
.stepper button,
.stepper > span {
  height: 58px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--tx-muted);
  font-size: 11px;
}
.stepper i {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  font-style: normal;
}
.stepper button.active {
  border-bottom-color: var(--brand);
  color: var(--brand);
}
.stepper button.active i,
.stepper button.done i {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.summary-lines button {
  width: 100%;
  display: grid;
  grid-template-columns: 120px 1fr auto;
  gap: 14px;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  text-align: left;
  font-size: 11px;
}
.summary-lines b,
.summary-lines em {
  color: var(--brand);
}
.summary-lines span {
  color: var(--tx-sub);
}
.summary-lines em {
  font-style: normal;
}
.panel {
  padding-top: 32px;
}
.panel > header {
  display: flex;
  gap: 14px;
  margin-bottom: 28px;
}
.panel > header > i {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
  font-style: normal;
  font-size: 11px;
}
.panel h3,
.report-section h3,
.recommend h3 {
  font-size: 18px;
  color: var(--ink);
}
.panel header p,
.report-section header p {
  margin-top: 3px;
  color: var(--tx-muted);
  font-size: 11px;
}
.field-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px 18px;
  margin-left: 52px;
  max-width: 760px;
}
.wide {
  grid-column: 1/-1;
}
.field-grid label > span,
.field-grid > .wide > span {
  display: block;
  margin-bottom: 7px;
  color: var(--tx-sub);
  font-size: 11px;
  font-weight: 700;
}
.field-grid input,
.unit-input {
  height: 46px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: #fff;
}
.field-grid label > input {
  width: 100%;
  padding: 0 12px;
}
.unit-input {
  display: flex;
}
.unit-input input {
  min-width: 0;
  flex: 1;
  border: 0;
  padding: 0 12px;
}
.unit-input b {
  align-self: center;
  padding-right: 12px;
  color: var(--tx-muted);
  font-size: 10px;
}
.field-grid small {
  display: block;
  color: #c24f4f;
  font-size: 10px;
}
.choice {
  display: flex;
  gap: 8px;
}
.choice button {
  min-width: 110px;
  height: 42px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: #fff;
}
.choice button.selected {
  border-color: var(--brand);
  background: var(--brand-soft);
  color: var(--brand);
}
.panel > footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 34px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.link-btn {
  margin-right: auto;
  border: 0;
  background: transparent;
  color: var(--tx-muted);
}
.option-list,
.goal-list {
  margin-left: 52px;
  max-width: 760px;
}
.option-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 20px 130px 1fr 70px;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: #fff;
  text-align: left;
}
.option-list button.selected,
.goal-list button.selected {
  background: var(--brand-soft);
}
.option-list button > i {
  width: 14px;
  height: 14px;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
}
.option-list button.selected > i {
  border: 4px solid var(--brand);
}
.option-list span,
.goal-list span {
  color: var(--tx-sub);
  font-size: 11px;
}
.option-list em,
.goal-list em {
  color: var(--brand);
  font-size: 10px;
  font-style: normal;
}
.goal-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 44px 1fr 54px;
  align-items: center;
  gap: 12px;
  min-height: 76px;
  padding: 0 14px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: #fff;
  text-align: left;
}
.goal-list button > i {
  font-size: 24px;
  font-style: normal;
}
.goal-list b,
.goal-list span {
  display: block;
}
.report-hero {
  display: grid;
  grid-template-columns: 1fr 180px;
  align-items: center;
  gap: 36px;
  padding: 22px 0 32px;
  border-bottom: 1px solid var(--line);
}
.bmi-number {
  text-align: right;
}
.bmi-number strong {
  display: block;
  font-size: 52px;
  line-height: 1;
}
.bmi-number span {
  color: var(--tx-sub);
  font-size: 11px;
}
.report-section {
  padding: 30px 0;
  border-bottom: 1px solid var(--line);
}
.report-section > header {
  display: flex;
  justify-content: space-between;
}
.report-section > header > button,
.report-footer button {
  border: 0;
  background: transparent;
  color: var(--brand);
  font-size: 10px;
}
.bmi-wrap {
  padding-top: 42px;
}
.bmi-track {
  height: 10px;
  position: relative;
  border-radius: 999px;
  background: linear-gradient(90deg, #c59245 0 17.5%, #0f9b8c 17.5% 45%, #c59245 45% 65%, #d75559 65%);
}
.bmi-track i {
  position: absolute;
  bottom: 16px;
  transform: translateX(-50%);
  font-style: normal;
}
.bmi-track i:after {
  content: '';
  display: block;
  width: 2px;
  height: 20px;
  margin: auto;
  background: var(--ink);
}
.bmi-track b {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--ink);
  color: #fff;
  font-size: 9px;
}
.bmi-labels {
  display: grid;
  grid-template-columns: 17.5fr 27.5fr 20fr 35fr;
  margin-top: 8px;
  font-size: 10px;
  color: var(--tx-muted);
}
.bmi-labels span {
  display: flex;
  justify-content: space-between;
}
.energy-path {
  display: grid;
  grid-template-columns: 1fr 70px 1fr 70px 1fr;
  align-items: center;
  margin-top: 28px;
}
.energy-path > div {
  display: grid;
  gap: 5px;
  padding-left: 18px;
  border-left: 2px solid var(--line-strong);
}
.energy-path > i {
  text-align: center;
  color: var(--tx-muted);
  font-style: normal;
}
.energy-path span,
.energy-path p {
  color: var(--tx-muted);
  font-size: 10px;
}
.energy-path strong {
  font-size: 24px;
}
.energy-path strong small {
  font-size: 10px;
}
.energy-path .primary {
  border-color: var(--brand);
}
.energy-path .primary strong {
  color: var(--brand);
}
.recommend {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 30px;
  padding: 30px 0;
}
.recommend > div:first-child > p:last-child {
  max-width: 560px;
  color: var(--tx-sub);
  font-size: 12px;
}
.recommend > div:last-child {
  display: flex;
  gap: 8px;
}
.report-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  color: var(--tx-muted);
  font-size: 10px;
}
.toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 18px;
  border-radius: 999px;
  background: #27322f;
  color: #fff;
}
.shift-enter-active,
.shift-leave-active,
.reveal-enter-active,
.reveal-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.shift-enter-from,
.reveal-enter-from {
  opacity: 0;
  transform: translateX(14px);
}
.shift-leave-to,
.reveal-leave-to {
  opacity: 0;
  transform: translateX(-14px);
}
</style>

<script setup>
/**
 * BodyAssessmentView 身体数据测评页（BMI / BMR / TDEE）
 * ------------------------------------------------------------------
 * 页面职责：
 *   1. 健康档案录入：昵称 / 性别 / 年龄 / 身高 / 体重 / 运动强度（实时联动，无需点保存即生效）
 *   2. 核心测评结果：BMI 大数字 + 彩色等级标签 + 渐变刻度条游标 + 4 个关键指标 + 饮食模式
 *   3. BMR / TDEE 计算说明：把 Mifflin-St Jeor 公式代入用户真实数值，便于答辩讲解
 *   4. 每日营养目标：由推荐热量与体重推导的 8 项目标值与依据说明
 *   5. 营养目标雷达图：以目标值为基准的「达标轮廓」
 *   6. BMI 分级标准对照表：当前所处分级高亮
 *
 * 说明：所有计算统一复用 utils/nutrition 的 computeMetrics（BMI / BMR / TDEE / 推荐热量 / 营养目标），
 *      页面只做「实时展示 + 表单校验 + 与全局 Store 同步」。
 */
import { computed, onBeforeUnmount, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'

import PageHeader from '@/components/common/PageHeader.vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import StatTile from '@/components/common/StatTile.vue'
import BaseChart from '@/components/charts/BaseChart.vue'

import { useUserStore } from '@/store/user'
import { ACTIVITY_LEVELS, NUTRIENT_META, bmiBarPercent, computeMetrics, round1 } from '@/utils/nutrition'
import { macaronRadarOption } from '@/utils/charts'
import { themeText } from '@/utils/theme'

const router = useRouter()
const userStore = useUserStore()

/* =================================================================
 * 一、轻量 Toast 提示
 * ================================================================= */
const toast = reactive({ visible: false, text: '' })
let toastTimer = null

/** 展示一条 2 秒后自动消失的提示 */
function showToast(text) {
  toast.text = text
  toast.visible = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.visible = false
  }, 2000)
}
onBeforeUnmount(() => clearTimeout(toastTimer))

/* =================================================================
 * 二、档案录入表单（本地 form，实时联动全局 Store）
 * ================================================================= */
/** 表单状态：初值取自全局档案（含 avatar / goal，保存时一并回写，避免丢失字段） */
const form = reactive({
  nickname: userStore.profile.nickname,
  avatar: userStore.profile.avatar,
  gender: userStore.profile.gender,
  age: userStore.profile.age,
  height: userStore.profile.height,
  weight: userStore.profile.weight,
  activity: userStore.profile.activity,
  goal: userStore.profile.goal
})

/**
 * 表单校验：身高 120–220 / 体重 30–200 / 年龄 10–90
 * @returns {object} 字段 → 错误提示文案
 */
const errors = computed(() => {
  const result = {}
  const age = Number(form.age)
  const height = Number(form.height)
  const weight = Number(form.weight)
  if (!age || age < 10 || age > 90) result.age = '年龄需在 10–90 岁之间'
  if (!height || height < 120 || height > 220) result.height = '身高需在 120–220 cm 之间'
  if (!weight || weight < 30 || weight > 200) result.weight = '体重需在 30–200 kg 之间'
  return result
})

/** 表单是否有效（无效时禁用「保存」按钮） */
const isValid = computed(() => Object.keys(errors.value).length === 0)

/** 规范化的档案数据（数值字段统一转 Number，避免字符串写入 Store） */
function buildPayload() {
  return {
    ...form,
    age: Number(form.age) || 0,
    height: Number(form.height) || 0,
    weight: Number(form.weight) || 0
  }
}

/**
 * 实时联动：表单任一字段变化即回写全局档案（仅在合法时写入），
 * 因此其他页面（报告 / 大屏 / 推荐）的数据会同步刷新。
 */
watch(
  form,
  () => {
    if (isValid.value) userStore.updateProfile(buildPayload())
  },
  { deep: true }
)

/** 保存到健康档案（明确回写 + 提示） */
function saveProfile() {
  if (!isValid.value) {
    showToast('表单存在不合法的数值，请先修正 ⚠️')
    return
  }
  userStore.updateProfile(buildPayload())
  showToast('已保存到健康档案 ✅')
}

/** 恢复默认演示档案 */
function resetDefault() {
  Object.assign(form, userStore.DEFAULT_PROFILE)
  userStore.updateProfile(buildPayload())
  showToast('已恢复默认档案 ↺')
}

/** 选中态样式（视觉等价于 .seg-item.is-active） */
const activityActiveStyle = { background: '#fff1e6', boxShadow: 'inset 0 0 0 2px #ffc59b' }
const activityIdleStyle = { background: '#ffffff', boxShadow: 'inset 0 0 0 1px #e7ecf3' }

/* =================================================================
 * 三、实时测评指标
 * ================================================================= */
/** 用 computeMetrics 从本地表单实时推导全部身体指标（无需点保存即变化） */
const metrics = computed(() =>
  computeMetrics({
    ...form,
    age: Number(form.age) || 0,
    height: Number(form.height) || 0,
    weight: Number(form.weight) || 0
  })
)

/** BMI 分级结果（含颜色 / 底色 / 建议文案） */
const grade = computed(() => metrics.value.bmiGrade)

/** 性别中文（取自本地表单，保证切换性别时提示同步） */
const genderText = computed(() => (form.gender === 'female' ? '女' : '男'))

/** 当前运动强度配置 */
const activeActivity = computed(
  () => ACTIVITY_LEVELS.find((a) => a.key === form.activity) || ACTIVITY_LEVELS[0]
)

/** BMI 在刻度条上的位置百分比（15–35 映射到 0–100） */
const bmiPercent = computed(() => bmiBarPercent(metrics.value.bmi))

/** 刻度条渐变：偏瘦黄 / 标准绿 / 超重橙 / 肥胖红（断点与 BMI 标准一致：18.5 / 24 / 28） */
const bmiGradient =
  'linear-gradient(90deg, #ffd98a 0%, #ffd98a 17.5%, #7fdbb0 17.5%, #7fdbb0 45%, #ffb27a 45%, #ffb27a 65%, #f87171 65%, #f87171 100%)'

/* =================================================================
 * 四、BMR / TDEE 公式说明（代入真实数值，便于答辩讲解）
 * ================================================================= */
/** Mifflin-St Jeor 公式文本 */
const bmrFormulaText = computed(() =>
  form.gender === 'female'
    ? 'BMR = 10×体重 + 6.25×身高 − 5×年龄 − 161'
    : 'BMR = 10×体重 + 6.25×身高 − 5×年龄 + 5'
)

/** 公式代入实际数值的计算过程 */
const bmrSteps = computed(() => {
  const weight = Number(form.weight) || 0
  const height = Number(form.height) || 0
  const age = Number(form.age) || 0
  const tail = form.gender === 'female' ? '− 161' : '+ 5'
  return `10×${weight} + 6.25×${height} − 5×${age} ${tail} = ${metrics.value.bmr} kcal`
})

/* =================================================================
 * 五、每日营养目标（8 项：热量 / 蛋白 / 脂肪 / 碳水 / 纤维 / 糖 / 钠 / 饮水）
 * ================================================================= */
/** 目标展示顺序 */
const TARGET_KEYS = ['calories', 'protein', 'fat', 'carb', 'fiber', 'sugar', 'sodium', 'water']

/** 每项目标的推导依据（来自 utils/nutrition 的 computeTargets 实现） */
const TARGET_BASIS = {
  calories: 'TDEE ± 目标调整：增重 +300 / 维持 0 / 减脂 −400（不低于 BMR×1.1）',
  protein: '占总热量 18%（1g 蛋白质 = 4kcal）',
  fat: '占总热量 25%（1g 脂肪 = 9kcal）',
  carb: '占总热量 57%（1g 碳水 = 4kcal）',
  fiber: '《中国居民膳食指南》推荐每日 25g',
  sugar: '世界卫生组织建议：添加糖每日不超过 25g',
  sodium: '食盐每日 ≤ 5g，折算钠上限 2000mg',
  water: `按体重 33ml/kg 估算，并限制在 1500–2500ml`
}

/** 目标值列表（label / emoji / unit 取自 NUTRIENT_META，数值取自 metrics.targets） */
const targetRows = computed(() =>
  TARGET_KEYS.map((key) => {
    const meta = NUTRIENT_META[key]
    return {
      key,
      label: meta.label,
      unit: meta.unit,
      emoji: meta.emoji,
      theme: meta.theme,
      value: metrics.value.targets[key],
      basis: TARGET_BASIS[key]
    }
  })
)

/* =================================================================
 * 六、营养目标雷达图（以目标值为基准的达标轮廓）
 * ================================================================= */
const radarOption = computed(() => {
  const targets = metrics.value.targets
  // 五轴指标：每轴 max 取该营养素的目标值，因此「目标值」恰好落在最外圈
  const indicators = [
    { name: '蛋白质', max: Math.max(1, targets.protein) },
    { name: '脂肪', max: Math.max(1, targets.fat) },
    { name: '碳水', max: Math.max(1, targets.carb) },
    { name: '膳食纤维', max: Math.max(1, targets.fiber) },
    { name: '饮水', max: Math.max(1, targets.water) }
  ]
  return macaronRadarOption({
    indicators,
    series: [
      // 外圈：每日推荐目标（= 各轴 max）
      { name: '每日推荐目标', value: [targets.protein, targets.fat, targets.carb, targets.fiber, targets.water], color: '#7fdbb0' },
      // 内圈：推荐区间下限（目标值的 80%）作为参照
      {
        name: '推荐下限 80%',
        value: [
          round1(targets.protein * 0.8),
          round1(targets.fat * 0.8),
          round1(targets.carb * 0.8),
          round1(targets.fiber * 0.8),
          round1(targets.water * 0.8)
        ],
        color: '#8cc4f5'
      }
    ]
  })
})

/* =================================================================
 * 七、BMI 分级标准对照表
 * ================================================================= */
const BMI_STANDARDS = [
  { key: 'thin', emoji: '💡', label: '偏瘦', range: 'BMI < 18.5', advice: '增加优质蛋白与主食摄入，配合力量训练逐步增重' },
  { key: 'normal', emoji: '✅', label: '标准', range: '18.5 ≤ BMI < 24', advice: '体重处于健康区间，保持均衡饮食与规律运动即可' },
  { key: 'overweight', emoji: '🔴', label: '超重', range: '24 ≤ BMI < 28', advice: '制造 300–500 kcal 热量缺口，增加有氧运动' },
  { key: 'obese', emoji: '🔴', label: '肥胖', range: 'BMI ≥ 28', advice: '循序渐进控制热量，减少含糖饮料与油炸，必要时咨询医师' }
]

/** 对照表行样式：当前所处分级高亮 */
function rowStyle(row) {
  return row.key === grade.value.key ? { background: '#fff9e6' } : {}
}

/** 当前所处的分级是否已被测评 */
const isGraded = computed(() => grade.value.key !== 'unknown')
</script>

<template>
  <!-- 根容器加 stagger：直接子元素依次淡入 -->
  <div class="stagger">
    <!-- ============ 页面标题 + 右侧状态速览 ============ -->
    <PageHeader>
      <template #extra>
        <span class="chip">
          <span aria-hidden="true">⚖️</span>
          <span class="chip-strong">BMI {{ metrics.bmi }}</span>
          <span class="badge" :style="{ backgroundColor: grade.bg, color: grade.color }">
            {{ grade.emoji }} {{ grade.label }}
          </span>
        </span>
      </template>
    </PageHeader>

    <!-- ============ 左：档案录入 / 右：核心测评结果 ============ -->
    <div class="grid-cards mb-5 grid-cols-12">
      <!-- 档案录入（mc-cyan） -->
      <MacaronCard
        class="col-span-4"
        theme="cyan"
        emoji="🧑"
        title="健康档案录入"
        sub="修改任一字段，右侧指标实时重算"
      >
        <!-- 昵称 -->
        <div>
          <div class="field-label">📛 昵称</div>
          <input v-model="form.nickname" class="field" placeholder="请输入昵称" />
        </div>

        <!-- 性别 -->
        <div class="mt-4">
          <div class="field-label">🚻 性别（影响 BMR 公式常数项）</div>
          <div class="seg">
            <button class="seg-item" :class="{ 'is-active': form.gender === 'male' }" @click="form.gender = 'male'">
              👨 男
            </button>
            <button class="seg-item" :class="{ 'is-active': form.gender === 'female' }" @click="form.gender = 'female'">
              👩 女
            </button>
          </div>
        </div>

        <!-- 年龄 / 身高 / 体重 -->
        <div class="mt-4 grid grid-cols-3 gap-3">
          <div>
            <div class="field-label">🎂 年龄</div>
            <input v-model.number="form.age" type="number" min="10" max="90" class="field" />
            <p class="mt-1 text-[11px] tx-muted">单位：岁</p>
          </div>
          <div>
            <div class="field-label">📏 身高</div>
            <input v-model.number="form.height" type="number" step="0.5" min="120" max="220" class="field" />
            <p class="mt-1 text-[11px] tx-muted">单位：cm</p>
          </div>
          <div>
            <div class="field-label">🏋️ 体重</div>
            <input v-model.number="form.weight" type="number" step="0.5" min="30" max="200" class="field" />
            <p class="mt-1 text-[11px] tx-muted">单位：kg</p>
          </div>
        </div>

        <!-- 日常运动强度 -->
        <div class="mt-4">
          <div class="field-label">🏃 日常运动强度（决定活动系数）</div>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="level in ACTIVITY_LEVELS"
              :key="level.key"
              class="rounded-[14px] p-3 text-left transition-all duration-200"
              :style="form.activity === level.key ? activityActiveStyle : activityIdleStyle"
              @click="form.activity = level.key"
            >
              <div class="flex items-center gap-2">
                <span class="text-[18px]" aria-hidden="true">{{ level.emoji }}</span>
                <span class="text-[13px] font-bold tx-main">{{ level.label }}</span>
              </div>
              <p class="mt-1 text-[11px] tx-muted">{{ level.desc }}</p>
              <span class="tag mt-2">活动系数 ×{{ level.factor }}</span>
            </button>
          </div>
        </div>

        <!-- 校验提示 -->
        <div v-if="!isValid" class="soft-panel mt-4" style="background: rgba(239, 68, 68, 0.08)">
          <p class="text-[12px] font-semibold tx-over">⚠️ 请先修正以下问题：</p>
          <ul class="mt-1 space-y-0.5 text-[11px] tx-over">
            <li v-for="(message, key) in errors" :key="key">· {{ message }}</li>
          </ul>
        </div>

        <!-- 操作按钮 -->
        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn btn-green" :disabled="!isValid" @click="saveProfile">
            <span aria-hidden="true">💾</span>保存到健康档案
          </button>
          <button class="btn btn-ghost" @click="resetDefault">
            <span aria-hidden="true">↺</span>恢复默认
          </button>
          <button class="btn btn-purple" @click="router.push('/profile')">
            <span aria-hidden="true">🧑</span>去个人中心
          </button>
        </div>
      </MacaronCard>

      <!-- 核心测评结果区 -->
      <div class="stagger col-span-8 grid gap-5">
        <!-- BMI 主卡片（mc-orange） -->
        <MacaronCard theme="orange" emoji="⚖️" title="BMI 身体质量指数" sub="BMI = 体重(kg) ÷ 身高(m)²">
          <div class="flex items-center gap-6">
            <div>
              <div class="num text-[46px] font-extrabold leading-none tx-main">{{ metrics.bmi }}</div>
              <div class="mt-1 text-[12px] tx-muted">kg / m²</div>
            </div>
            <div class="min-w-0 flex-1">
              <span class="badge" :style="{ backgroundColor: grade.bg, color: grade.color }">
                {{ grade.emoji }} {{ grade.label }}
              </span>
              <p class="mt-2 text-[12px] tx-sub">{{ grade.advice }}</p>
            </div>
          </div>

          <!-- BMI 渐变刻度条 + 游标 -->
          <div class="relative mt-5 h-[52px]">
            <div class="absolute inset-x-0 top-[34px] h-[14px] rounded-pill" :style="{ background: bmiGradient }"></div>
            <!-- 游标：位置由 bmiBarPercent 计算 -->
            <div
              class="absolute top-0 -translate-x-1/2 transition-all duration-500"
              :style="{ left: bmiPercent + '%' }"
            >
              <div class="num mx-auto w-max rounded-pill bg-accent-orange px-2 py-0.5 text-[10px] font-bold text-white shadow-card">
                {{ metrics.bmi }}
              </div>
              <div class="mx-auto h-[20px] w-[3px] rounded-pill" style="background: #b46b3a"></div>
            </div>
          </div>
          <!-- 刻度标注 18.5 / 24 / 28 -->
          <div class="relative mt-1 h-[16px] text-[11px] tx-muted">
            <span class="absolute -translate-x-1/2" style="left: 17.5%">18.5</span>
            <span class="absolute -translate-x-1/2" style="left: 45%">24</span>
            <span class="absolute -translate-x-1/2" style="left: 65%">28</span>
          </div>
          <div class="mt-1 flex justify-between text-[11px] tx-muted">
            <span>💡 偏瘦</span><span>✅ 标准</span><span>🔴 超重</span><span>🔴 肥胖</span>
          </div>
        </MacaronCard>

        <!-- 4 个关键指标 -->
        <div class="stagger grid grid-cols-4 gap-3">
          <StatTile
            theme="orange"
            emoji="⚖️"
            label="BMI 指数"
            :value="metrics.bmi"
            sub="18.5–23.9 为健康区间"
          />
          <StatTile
            theme="green"
            emoji="🔥"
            label="基础代谢 BMR"
            :value="metrics.bmr"
            unit="kcal"
            sub="静息状态下每日最低消耗"
          />
          <StatTile
            theme="purple"
            emoji="🏃"
            label="每日总消耗 TDEE"
            :value="metrics.tdee"
            unit="kcal"
            :sub="`BMR × 活动系数 ${activeActivity.factor}`"
          />
          <StatTile
            theme="cyan"
            emoji="🍽️"
            label="每日推荐摄入"
            :value="metrics.dailyCalories"
            unit="kcal"
            :sub="`模式：${metrics.dietMode}`"
          />
        </div>

        <!-- 饮食模式 -->
        <MacaronCard theme="cyan" emoji="🍽️" title="饮食模式建议" :sub="metrics.dietModeDesc">
          <div class="flex items-center gap-4">
            <span class="emoji-badge-lg" aria-hidden="true">{{ metrics.dietModeEmoji }}</span>
            <div class="min-w-0">
              <div class="text-[18px] font-extrabold tx-main">{{ metrics.dietMode }}</div>
              <div class="num text-[12px] tx-sub">
                推荐摄入 {{ metrics.dailyCalories }} kcal（TDEE {{ metrics.tdee }} kcal）
              </div>
            </div>
          </div>
        </MacaronCard>
      </div>
    </div>

    <!-- ============ BMR / TDEE 说明 + 每日营养目标 + 雷达图 ============ -->
    <div class="grid-cards mb-5 grid-cols-6">
      <!-- BMR / TDEE 计算说明（mc-purple） -->
      <MacaronCard
        class="col-span-2"
        theme="purple"
        emoji="🧮"
        title="BMR / TDEE 计算说明"
        sub="Mifflin-St Jeor 公式，可直接用于答辩讲解"
      >
        <div class="soft-panel">
          <p class="text-[12px] font-bold tx-main">{{ genderText }}性基础代谢公式</p>
          <p class="num mt-1 text-[12px] tx-sub">{{ bmrFormulaText }}</p>
        </div>

        <div class="soft-panel mt-3">
          <p class="text-[12px] font-bold tx-main">代入你的实际数值</p>
          <p class="num mt-1 text-[13px] tx-main">{{ bmrSteps }}</p>
        </div>

        <div class="soft-panel mt-3">
          <p class="text-[12px] font-bold tx-main">TDEE = BMR × 活动系数</p>
          <p class="num mt-1 text-[13px] tx-main">
            {{ metrics.bmr }} × {{ activeActivity.factor }} ≈ {{ metrics.tdee }} kcal
          </p>
          <p class="mt-1 text-[11px] tx-muted">
            当前：{{ activeActivity.emoji }} {{ activeActivity.label }}（{{ activeActivity.desc }}）
          </p>
        </div>

        <div class="divider my-3"></div>

        <p class="text-[11px] font-semibold tx-sub">🔢 活动系数含义对照</p>
        <div class="mt-2 space-y-1.5">
          <div
            v-for="level in ACTIVITY_LEVELS"
            :key="level.key"
            class="flex items-center justify-between rounded-[12px] px-2.5 py-1.5"
            :style="form.activity === level.key ? activityActiveStyle : {}"
          >
            <span class="text-[12px] tx-sub">{{ level.emoji }} {{ level.label }}</span>
            <span class="num text-[12px] font-bold tx-muted">×{{ level.factor }}</span>
          </div>
        </div>
      </MacaronCard>

      <!-- 每日营养目标（mc-green） -->
      <MacaronCard
        class="col-span-2"
        theme="green"
        emoji="🎯"
        title="每日营养目标"
        sub="由推荐热量与体重推导，共 8 项"
      >
        <div class="stagger space-y-1">
          <div v-for="row in targetRows" :key="row.key" class="list-item">
            <span class="emoji-badge" aria-hidden="true">{{ row.emoji }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <span class="text-[13px] font-bold tx-main">{{ row.label }}</span>
                <span class="num text-[13px] font-extrabold" :style="{ color: themeText(row.theme) }">
                  {{ row.value }} <span class="text-[11px] tx-muted">{{ row.unit }}</span>
                </span>
              </div>
              <p class="text-[11px] tx-muted">{{ row.basis }}</p>
            </div>
          </div>
        </div>
      </MacaronCard>

      <!-- 营养目标雷达图（mc-blue，承载图表用 card-hover-static） -->
      <MacaronCard
        class="col-span-2"
        theme="blue"
        emoji="📊"
        title="营养目标雷达图"
        sub="以目标值为基准的达标轮廓"
        :static-scale="true"
      >
        <BaseChart :option="radarOption" height="300px" />
        <p class="mt-2 text-[11px] tx-muted">
          🟢 每日推荐目标 ｜ 🔵 推荐区间下限（目标值的 80%）
        </p>
      </MacaronCard>
    </div>

    <!-- ============ BMI 分级标准对照表（mc-yellow）============ -->
    <MacaronCard
      class="mb-5"
      theme="yellow"
      emoji="📖"
      title="BMI 分级标准对照表"
      sub="依据《中国超重 / 肥胖医学营养治疗专家共识》，当前所处分级已高亮"
    >
      <table class="table-macaron">
        <thead>
          <tr>
            <th>分级</th>
            <th>BMI 区间</th>
            <th>健康建议</th>
          </tr>
        </thead>
        <tbody class="stagger">
          <tr v-for="row in BMI_STANDARDS" :key="row.key">
            <td :style="rowStyle(row)">
              <span class="font-bold tx-main">{{ row.emoji }} {{ row.label }}</span>
              <span v-if="isGraded && row.key === grade.key" class="tag tag-orange ml-2">当前</span>
            </td>
            <td :style="rowStyle(row)"><span class="num tx-sub">{{ row.range }}</span></td>
            <td :style="rowStyle(row)"><span class="tx-sub">{{ row.advice }}</span></td>
          </tr>
        </tbody>
      </table>
    </MacaronCard>

    <!-- ============ 轻量 Toast ============ -->
    <div
      v-if="toast.visible"
      class="anim-pop fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-accent-green px-5 py-2.5 text-[13px] font-bold text-white shadow-cardHover"
    >
      {{ toast.text }}
    </div>
  </div>
</template>

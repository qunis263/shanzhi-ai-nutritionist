<script setup>
/**
 * ProfileView 页面组件：个人中心 & 历史记录
 * ------------------------------------------------------------------
 * 页面职责：
 *   1. 个人健康档案：可编辑表单（昵称 / 头像 / 性别 / 年龄 / 身高 / 体重 / 运动强度）+ 实时指标
 *   2. 整体数据统计：基于 dietStore.stats 的 8 个关键指标
 *   3. 一周趋势图表：热量折线（含目标线）+ 健康评分柱状
 *   4. 历史饮食记录：每天一行，展开查看该日按餐段分组的明细（今天可逐条删除）
 *   5. 历史营养报告：每天一份报告摘要，展开查看优点 / 待改进 / 超标项 / 缺口项 + 营养素对比
 *   6. 数据管理：重置为演示数据 / 清空全部数据
 * 全部数据来自 Pinia Store 与 localStorage，纯前端 mock。
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatTile from '@/components/common/StatTile.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseChart from '@/components/charts/BaseChart.vue'
import { useUserStore } from '@/store/user'
import { useDietStore } from '@/store/diet'
import { ACTIVITY_LEVELS, evaluateNutrient, round1, sumNutrition, buildReport } from '@/utils/nutrition'
import { macaronLineOption, macaronBarOption, MACARON } from '@/utils/charts'
import { themeBg, themeText } from '@/utils/theme'
import { MEAL_TYPES, MEAL_EMOJI } from '@/data/mockHistory'
import { formatCN, relativeDay, isToday } from '@/utils/date'

const userStore = useUserStore()
const dietStore = useDietStore()

/* ===================================================================
 * 一、个人健康档案表单
 * =================================================================== */
/** 可切换的头像 Emoji 列表 */
const AVATARS = ['🧑‍🍳', '🥗', '🍎', '🏃', '💪', '🧘', '🐟', '🥦']

/** 表单本地副本（保存时才写回 Store，避免输入过程中频繁触发全站重算） */
const form = reactive({ ...userStore.profile })

/** 点击头像：按列表循环切换到下一个 Emoji 形象 */
function nextAvatar() {
  const index = AVATARS.indexOf(form.avatar)
  form.avatar = AVATARS[(index + 1) % AVATARS.length]
}

/** 保存档案：数值字段做一次类型转换，再写回 Store（全站数据随之联动） */
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
  showToast('档案已保存 ✅')
}

/** 恢复默认档案并同步到表单 */
function resetProfile() {
  userStore.resetProfile()
  Object.assign(form, userStore.profile)
  showToast('已恢复默认档案 ↩️')
}

/** 身体指标（BMI / BMR / TDEE / 推荐热量 / 饮食模式），由档案实时推导 */
const metrics = computed(() => userStore.metrics)

/* ===================================================================
 * 二、整体数据统计
 * =================================================================== */
const stats = computed(() => dietStore.stats)

/** 累计饮水由 ml 换算为 L，展示更直观 */
const totalWaterL = computed(() => round1(stats.value.totalWater / 1000))

/** 最高评分对应的日期（中文格式） */
const bestDateText = computed(() => formatCN(stats.value.bestDate))

/* ===================================================================
 * 三、一周趋势图表
 * =================================================================== */
const weekData = computed(() => dietStore.weekData)

/** 近 7 天热量折线（含每日目标热量参考线） */
const lineOption = computed(() =>
  macaronLineOption({
    labels: weekData.value.map((day) => day.label),
    series: [{ name: '每日热量', data: weekData.value.map((day) => day.calories), color: MACARON.orange, area: true }],
    target: dietStore.targets.calories,
    targetLabel: '目标',
    unit: 'kcal'
  })
)

/** 近 7 天健康评分柱状图 */
const barOption = computed(() =>
  macaronBarOption({
    labels: weekData.value.map((day) => day.label),
    values: weekData.value.map((day) => day.score),
    name: '健康评分',
    unit: '分'
  })
)

/* ===================================================================
 * 四、历史饮食记录（每天的记录明细）
 * =================================================================== */
const historyDays = computed(() => dietStore.historyDays)

/** 是否存在任意一天的饮食记录（用于空数据兜底：清空全部数据后展示 EmptyState） */
const hasHistory = computed(() => historyDays.value.some((day) => day.recordCount > 0))

const expandedDay = ref('') // 当前展开的日期（'' 表示全部收起）

/** 点击行：展开 / 收起该日明细 */
function toggleDay(date) {
  expandedDay.value = expandedDay.value === date ? '' : date
}

/**
 * 展开日的明细：按餐段（MEAL_TYPES）分组，并标记是否为今天（今天可逐条删除）
 */
const expandedDetail = computed(() => {
  if (!expandedDay.value) return null
  const day = dietStore.getDay(expandedDay.value)
  const groups = MEAL_TYPES.map((type) => ({
    type,
    emoji: MEAL_EMOJI[type],
    items: day.records.filter((record) => record.mealType === type)
  })).filter((group) => group.items.length > 0)
  return {
    date: expandedDay.value,
    water: day.water,
    groups,
    recordCount: day.records.length,
    isToday: isToday(expandedDay.value)
  }
})

/** 删除今日某条记录（仅今天可用） */
function removeRecord(id) {
  dietStore.removeRecord(id)
  showToast('已删除该条记录 🗑️')
}

/* ===================================================================
 * 五、历史营养报告
 * =================================================================== */
const expandedReport = ref('') // 当前展开的报告日期

/** 点击：展开 / 收起某天的报告详情 */
function toggleReport(date) {
  expandedReport.value = expandedReport.value === date ? '' : date
}

/** 报告对比中展示的营养素 */
const COMPARE_KEYS = ['calories', 'protein', 'fat', 'carb', 'fiber']

/**
 * 近 7 天报告摘要：逐日取记录 → 累加营养 → 复用 buildReport 生成完整报告，
 * 同时给出热量 / 蛋白质 / 脂肪 / 碳水 / 纤维 的实际值与目标值对比。
 */
const reportDays = computed(() =>
  historyDays.value.map((day) => {
    const detail = dietStore.getDay(day.date)
    const summary = sumNutrition(detail.records)
    const report = buildReport({
      summary,
      targets: dietStore.targets,
      water: detail.water,
      records: detail.records
    })
    const compare = COMPARE_KEYS.map((key) => evaluateNutrient(key, summary[key], dietStore.targets[key]))
    return { ...day, report, compare }
  })
)

/* ===================================================================
 * 六、数据管理
 * =================================================================== */
/** 重置为演示数据 */
function resetDemo() {
  dietStore.resetToDemo()
  expandedDay.value = ''
  showToast('已重置为演示数据 🔄')
}

/** 清空全部数据（二次确认） */
function clearAllData() {
  const ok = window.confirm('确定要清空全部饮食记录与饮水数据吗？此操作不可恢复。')
  if (!ok) return
  dietStore.clearAll()
  expandedDay.value = ''
  showToast('已清空全部数据 🗑️')
}

/* ===================================================================
 * 七、Toast 轻提示
 * =================================================================== */
const toastVisible = ref(false)
const toastText = ref('')
let toastTimer = null

/** 显示 Toast，2 秒后自动隐藏 */
function showToast(text) {
  toastText.value = text
  toastVisible.value = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
  }, 2000)
}

// 组件卸载时清理定时器，避免内存泄漏
onBeforeUnmount(() => {
  clearTimeout(toastTimer)
})
</script>

<template>
  <div>
    <!-- ===================== 页面标题 ===================== -->
    <PageHeader>
      <template #extra>
        <RouterLink to="/dashboard" class="btn btn-primary">📊 数据大屏</RouterLink>
      </template>
    </PageHeader>

    <div class="stagger flex flex-col gap-5">
      <!-- ===================== 1. 个人健康档案 + 身体指标 ===================== -->
      <div class="grid grid-cols-2 gap-5">
        <!-- 左栏：可编辑档案表单 -->
        <MacaronCard theme="purple" emoji="🧑" title="个人健康档案" sub="修改后全站数据实时联动">
          <!-- 头像 + 昵称 -->
          <div class="flex items-center gap-4">
            <button class="emoji-badge-lg text-[36px]" title="点击切换头像" @click="nextAvatar">
              {{ form.avatar }}
            </button>
            <div class="min-w-0">
              <p class="truncate text-[15px] font-bold tx-main">{{ form.nickname || '未命名' }}</p>
              <p class="mt-0.5 text-[12px] tx-muted">点击左侧头像可切换 Emoji 形象 🎨</p>
            </div>
          </div>

          <div class="divider"></div>

          <!-- 基础字段 -->
          <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
              <label class="field-label">昵称</label>
              <input v-model="form.nickname" class="field" placeholder="给自己起个名字" />
            </div>
            <div class="col-span-2">
              <label class="field-label">性别</label>
              <div class="seg">
                <button class="seg-item" :class="{ 'is-active': form.gender === 'male' }" @click="form.gender = 'male'">👦 男</button>
                <button class="seg-item" :class="{ 'is-active': form.gender === 'female' }" @click="form.gender = 'female'">👧 女</button>
              </div>
            </div>
            <div>
              <label class="field-label">年龄（岁）</label>
              <input v-model.number="form.age" type="number" class="field" min="10" max="90" />
            </div>
            <div>
              <label class="field-label">身高（cm）</label>
              <input v-model.number="form.height" type="number" class="field" min="120" max="230" />
            </div>
            <div>
              <label class="field-label">体重（kg）</label>
              <input v-model.number="form.weight" type="number" class="field" min="30" max="200" step="0.1" />
            </div>
          </div>

          <!-- 运动强度（4 个可点卡片） -->
          <label class="field-label mt-4">运动强度</label>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="activity in ACTIVITY_LEVELS"
              :key="activity.key"
              class="rounded-[16px] p-3 text-left transition-all duration-200"
              :style="
                form.activity === activity.key
                  ? { background: '#fff1e6', boxShadow: 'inset 0 0 0 2px #ffc59b' }
                  : { background: '#fff', boxShadow: 'inset 0 0 0 1px #e7ecf3' }
              "
              @click="form.activity = activity.key"
            >
              <p class="flex items-center gap-1.5 text-[13px] font-bold tx-main">
                <span aria-hidden="true">{{ activity.emoji }}</span>
                {{ activity.label }}
              </p>
              <p class="mt-1 text-[11px] tx-muted">{{ activity.desc }}</p>
            </button>
          </div>

          <!-- 操作按钮 -->
          <div class="mt-5 flex items-center gap-3">
            <button class="btn btn-primary" @click="saveProfile">💾 保存档案</button>
            <button class="btn btn-ghost" @click="resetProfile">↺ 恢复默认</button>
          </div>
        </MacaronCard>

        <!-- 右栏：实时身体指标 -->
        <MacaronCard theme="cyan" emoji="📏" title="身体指标" sub="由档案实时推导而来">
          <div class="soft-panel">
            <div class="flex items-center justify-between">
              <div>
                <p class="tile-label"><span aria-hidden="true">⚖️</span> BMI 身体质量指数</p>
                <p class="num mt-1 text-[34px] font-extrabold leading-none" :style="{ color: metrics.bmiGrade.color }">
                  {{ metrics.bmi }}
                </p>
              </div>
              <span
                class="badge"
                :style="{ backgroundColor: metrics.bmiGrade.bg, color: metrics.bmiGrade.color }"
              >
                {{ metrics.bmiGrade.emoji }} {{ metrics.bmiGrade.label }}
              </span>
            </div>
            <p class="mt-2 text-[11.5px] tx-muted">{{ metrics.bmiGrade.advice }}</p>
          </div>

          <div class="mt-3 grid grid-cols-2 gap-4">
            <StatTile theme="white" label="基础代谢 BMR" emoji="🔥" :value="metrics.bmr" unit="kcal" />
            <StatTile theme="white" label="每日消耗 TDEE" emoji="⚡" :value="metrics.tdee" unit="kcal" />
            <StatTile theme="white" label="每日推荐热量" emoji="🎯" :value="metrics.dailyCalories" unit="kcal" />
            <StatTile
              theme="white"
              label="饮食模式"
              emoji="🍽️"
              :value="metrics.dietModeEmoji + ' ' + metrics.dietMode"
            />
          </div>

          <p class="mt-3 text-[11.5px] tx-muted">💡 {{ metrics.dietModeDesc }}</p>
        </MacaronCard>
      </div>

      <!-- ===================== 2. 整体数据统计 ===================== -->
      <MacaronCard theme="green" emoji="📈" title="整体数据统计" sub="近 7 天汇总数据">
        <div class="grid grid-cols-4 gap-4">
          <StatTile theme="white" label="本周记录天数" emoji="📅" :value="stats.days" unit="天" />
          <StatTile theme="white" label="日均热量" emoji="🔥" :value="stats.avgCalories" unit="kcal" />
          <StatTile theme="white" label="日均健康评分" emoji="⭐" :value="stats.avgScore" unit="分" />
          <StatTile theme="white" label="最高评分" emoji="🏆" :value="stats.bestScore" :sub="'来自 ' + bestDateText" />
          <StatTile theme="white" label="平均蛋白质" emoji="🥩" :value="stats.avgProtein" unit="g" />
          <StatTile theme="white" label="平均膳食纤维" emoji="🌿" :value="stats.avgFiber" unit="g" />
          <StatTile theme="white" label="累计记录条数" emoji="📝" :value="stats.totalRecords" unit="条" />
          <StatTile theme="white" label="累计饮水" emoji="💧" :value="totalWaterL" unit="L" />
        </div>
      </MacaronCard>

      <!-- ===================== 3. 一周趋势图表 ===================== -->
      <MacaronCard
        theme="blue"
        emoji="📊"
        title="一周趋势图表"
        sub="近 7 天热量趋势（含目标线）与健康评分"
        :static-scale="true"
      >
        <div class="grid grid-cols-2 gap-5">
          <div>
            <p class="mb-2 text-[12.5px] font-bold tx-sub">🔥 近 7 天热量趋势</p>
            <BaseChart :option="lineOption" height="300px" />
          </div>
          <div>
            <p class="mb-2 text-[12.5px] font-bold tx-sub">⭐ 近 7 天健康评分</p>
            <BaseChart :option="barOption" height="300px" />
          </div>
        </div>
      </MacaronCard>

      <!-- ===================== 4. 历史饮食记录 ===================== -->
      <MacaronCard theme="yellow" emoji="🗂️" title="历史饮食记录" sub="最近 7 天（含今天），点击展开当日明细">
        <div v-if="hasHistory" class="space-y-3">
          <div v-for="day in historyDays" :key="day.date" class="soft-panel">
            <!-- 每天一行 -->
            <button class="flex w-full items-center gap-4 text-left" @click="toggleDay(day.date)">
              <div class="w-[150px] shrink-0">
                <p class="text-[13.5px] font-bold tx-main">{{ formatCN(day.date) }} · {{ relativeDay(day.date) }}</p>
                <p class="text-[11px] tx-muted">{{ day.weekday }}</p>
              </div>
              <div class="grid flex-1 grid-cols-4 gap-3">
                <div class="text-center">
                  <p class="text-[11px] tx-muted">🔥 热量</p>
                  <p class="num text-[15px] font-bold tx-main">{{ day.calories }} kcal</p>
                </div>
                <div class="text-center">
                  <p class="text-[11px] tx-muted">⭐ 评分</p>
                  <p class="num text-[15px] font-bold" :style="{ color: day.grade.color }">{{ day.score }}</p>
                </div>
                <div class="text-center">
                  <p class="text-[11px] tx-muted">📝 记录条数</p>
                  <p class="num text-[15px] font-bold tx-main">{{ day.recordCount }}</p>
                </div>
                <div class="text-center">
                  <p class="text-[11px] tx-muted">💧 饮水</p>
                  <p class="num text-[15px] font-bold tx-main">{{ day.water }} ml</p>
                </div>
              </div>
              <span class="shrink-0 text-[14px] tx-muted">{{ expandedDay === day.date ? '▲' : '▼' }}</span>
            </button>

            <!-- 展开：按餐段分组的记录明细 -->
            <div v-if="expandedDay === day.date && expandedDetail" class="anim-fade-up mt-3">
              <div class="flex items-center justify-between">
                <p class="text-[12px] tx-muted">
                  共 {{ expandedDetail.recordCount }} 条记录 · 饮水 {{ expandedDetail.water }} ml
                </p>
                <span v-if="expandedDetail.isToday" class="tag tag-green">今天可逐条删除</span>
              </div>

              <div v-for="group in expandedDetail.groups" :key="group.type" class="mt-3">
                <p class="mb-1.5 text-[12.5px] font-bold tx-sub">{{ group.emoji }} {{ group.type }}</p>
                <ul class="space-y-1.5">
                  <li
                    v-for="record in group.items"
                    :key="record.id"
                    class="flex items-center gap-3 rounded-[12px] px-3 py-2"
                    style="background: rgba(255, 255, 255, 0.72)"
                  >
                    <span aria-hidden="true">{{ record.emoji }}</span>
                    <span class="text-[12.5px] tx-main">{{ record.name }}</span>
                    <span class="text-[11px] tx-muted">
                      {{ record.grams }}{{ record.unit === '100ml' ? 'ml' : 'g' }}
                    </span>
                    <span class="num ml-auto text-[12px] font-bold tx-sub">{{ record.nutrition.calories }} kcal</span>
                    <button
                      v-if="expandedDetail.isToday"
                      class="btn btn-danger-soft btn-xs"
                      @click.stop="removeRecord(record.id)"
                    >
                      🗑️
                    </button>
                  </li>
                </ul>
              </div>

              <EmptyState v-if="!expandedDetail.groups.length" emoji="🍽️" text="当日没有饮食记录" height="110px" />
            </div>
          </div>
        </div>
        <EmptyState v-else emoji="📭" text="暂无历史记录" sub="去「三餐饮食记录」添加第一条吧" />
      </MacaronCard>

      <!-- ===================== 5. 历史营养报告 ===================== -->
      <MacaronCard theme="orange" emoji="📋" title="历史营养报告" sub="点开可查看当日报告详情">
        <div v-if="hasHistory" class="space-y-3">
          <div v-for="day in reportDays" :key="day.date" class="soft-panel">
            <!-- 每天一行：日期 + 评分大数字 + 等级徽章 + 精简评语 -->
            <button class="flex w-full items-center gap-4 text-left" @click="toggleReport(day.date)">
              <div class="w-[150px] shrink-0">
                <p class="text-[13.5px] font-bold tx-main">{{ formatCN(day.date) }} · {{ relativeDay(day.date) }}</p>
                <p class="text-[11px] tx-muted">{{ day.weekday }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <span class="num text-[30px] font-extrabold leading-none" :style="{ color: day.report.grade.color }">
                  {{ day.report.score }}
                </span>
                <span
                  class="badge"
                  :style="{ backgroundColor: themeBg(day.report.grade.theme), color: themeText(day.report.grade.theme) }"
                >
                  {{ day.report.grade.emoji }} {{ day.report.grade.label }}
                </span>
              </div>
              <p class="flex-1 truncate text-[12px] tx-muted">{{ day.report.grade.desc }}</p>
              <span class="shrink-0 text-[14px] tx-muted">{{ expandedReport === day.date ? '▲' : '▼' }}</span>
            </button>

            <!-- 展开：优点 / 待改进 / 超标项 / 缺口项 + 营养素对比 -->
            <div v-if="expandedReport === day.date" class="anim-fade-up mt-3">
              <div class="grid grid-cols-2 gap-4">
                <div class="rounded-[14px] p-3" style="background: rgba(255, 255, 255, 0.72)">
                  <p class="text-[12.5px] font-bold tx-ok">✅ 优点</p>
                  <ul class="mt-1.5 space-y-1">
                    <li v-for="(item, i) in day.report.strengths" :key="i" class="text-[12px] tx-sub">· {{ item }}</li>
                  </ul>
                </div>
                <div class="rounded-[14px] p-3" style="background: rgba(255, 255, 255, 0.72)">
                  <p class="text-[12.5px] font-bold tx-over">⚠️ 待改进</p>
                  <ul class="mt-1.5 space-y-1">
                    <li v-for="(item, i) in day.report.weaknesses" :key="i" class="text-[12px] tx-sub">· {{ item }}</li>
                  </ul>
                </div>
              </div>

              <!-- 超标项 / 缺口项 标签 -->
              <div class="mt-3 flex flex-wrap gap-2">
                <span v-for="(item, i) in day.report.overItems" :key="'over-' + i" class="tag tag-orange">
                  🔴 {{ item.label }} {{ item.value }}{{ item.unit }}
                </span>
                <span v-for="(item, i) in day.report.lowItems" :key="'low-' + i" class="tag tag-yellow">
                  💡 {{ item.label }} {{ item.value }}{{ item.unit }}
                </span>
              </div>

              <!-- 营养素实际 / 目标对比 -->
              <div class="mt-3 grid grid-cols-5 gap-3">
                <div
                  v-for="item in day.compare"
                  :key="item.key"
                  class="rounded-[14px] p-2.5 text-center"
                  style="background: rgba(255, 255, 255, 0.72)"
                >
                  <p class="text-[11px] tx-muted">{{ item.emoji }} {{ item.label }}</p>
                  <p class="num mt-1 text-[14px] font-extrabold tx-main">
                    {{ item.value }}<span class="text-[10px] tx-muted">{{ item.unit }}</span>
                  </p>
                  <p class="text-[10px] tx-muted">目标 {{ item.target }}{{ item.unit }}</p>
                  <div class="mt-1.5 flex justify-center">
                    <StatusBadge :status="item.status" size="sm" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else emoji="📋" text="暂无历史报告" sub="记录饮食后即可生成 AI 报告" />
      </MacaronCard>

      <!-- ===================== 6. 数据管理 ===================== -->
      <MacaronCard theme="cyan" emoji="🧰" title="数据管理" sub="所有数据仅保存在本机浏览器，不会上传服务器">
        <div class="flex items-center gap-3">
          <button class="btn btn-green" @click="resetDemo">🔄 重置为演示数据</button>
          <button class="btn btn-danger-soft" @click="clearAllData">🗑️ 清空全部数据</button>
        </div>
      </MacaronCard>
    </div>

    <!-- ===================== Toast 轻提示 ===================== -->
    <div
      v-if="toastVisible"
      class="anim-slide-right fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-pill px-4 py-2.5 text-[13px] font-bold"
      style="background: #fff; color: #2c3646; box-shadow: 0 10px 30px rgba(31, 45, 61, 0.18)"
    >
      <span>{{ toastText }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * KnowledgeView 页面组件：营养知识库
 * ------------------------------------------------------------------
 * 用顶部 Tab 切换四大板块（.seg + .seg-item.is-active）：
 *   1. 🍽️ 食物热量表 —— 搜索 / 分类筛选 / 排序 + 可滚动表格
 *   2. 🏋️ 减脂增肌科普 —— 卡片网格，点击展开完整科普正文
 *   3. ⚠️ 食物相克 —— 配对展示 + 等级标签，点击展开科学解释
 *   4. 🌟 健康习惯 —— 马卡龙底色循环的网格卡片
 * 数据全部来自 src/data/knowledge.js 与 src/data/foods.js，纯前端 mock。
 */
import { computed, ref } from 'vue'
import MacaronCard from '@/components/common/MacaronCard.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { CALORIE_TABLE_FULL, SCIENCE_ARTICLES, FOOD_CONFLICTS, HEALTHY_HABITS } from '@/data/knowledge'
import { FOOD_CATEGORIES } from '@/data/foods'
import { themeByIndex } from '@/utils/theme'

/* ===================================================================
 * 一、Tab 切换
 * =================================================================== */
/** 四个板块配置（key 用于 v-if 切换，emoji 点缀） */
const TABS = [
  { key: 'calorie', label: '食物热量表', emoji: '🍽️' },
  { key: 'science', label: '减脂增肌科普', emoji: '🏋️' },
  { key: 'conflict', label: '食物相克', emoji: '⚠️' },
  { key: 'habit', label: '健康习惯', emoji: '🌟' }
]

const activeTab = ref('calorie')

/* ===================================================================
 * 二、板块 1：常见食物热量表
 * =================================================================== */
const keyword = ref('') // 搜索关键词
const activeCategory = ref('全部') // 当前分类
const sortMode = ref('default') // 排序方式：default / desc / asc

/** 排序方式选项 */
const SORTS = [
  { key: 'default', label: '默认排序' },
  { key: 'desc', label: '热量从高到低' },
  { key: 'asc', label: '热量从低到高' }
]

/**
 * 过滤 + 排序后的热量表：
 *   1. 按名称关键词过滤
 *   2. 按分类过滤
 *   3. 按所选排序方式排序（默认保持原始顺序）
 */
const calorieList = computed(() => {
  const kw = keyword.value.trim()
  let list = CALORIE_TABLE_FULL.filter(food => {
    const matchKeyword = !kw || food.name.includes(kw)
    const matchCategory = activeCategory.value === '全部' || food.category === activeCategory.value
    return matchKeyword && matchCategory
  })
  if (sortMode.value === 'desc') list = [...list].sort((a, b) => b.calories - a.calories)
  else if (sortMode.value === 'asc') list = [...list].sort((a, b) => a.calories - b.calories)
  return list
})

/** 热量数值的颜色：> 400 超标红 / < 100 达标绿 / 其余默认深色 */
function calorieClass(value) {
  if (value > 400) return 'tx-over'
  if (value < 100) return 'tx-ok'
  return 'tx-main'
}

/* ===================================================================
 * 三、板块 2：减脂增肌科普
 * =================================================================== */
const expandedArticle = ref('') // 当前展开的文章 id（'' 表示全部收起）

/** 点击卡片：展开 / 收起该文章 */
function toggleArticle(id) {
  expandedArticle.value = expandedArticle.value === id ? '' : id
}

/* ===================================================================
 * 四、板块 3：食物相克
 * =================================================================== */
const expandedConflict = ref('') // 当前展开的相克条目 id

/** 点击：展开 / 收起科学解释 */
function toggleConflict(id) {
  expandedConflict.value = expandedConflict.value === id ? '' : id
}

/** 等级 → 标签配色：已辟谣使用绿色 tag，需注意使用黄色 tag */
function conflictTag(level) {
  return level === 'rumor' ? 'tag-green' : 'tag-yellow'
}

/** 等级 → 文字 */
function conflictText(level) {
  return level === 'rumor' ? '已辟谣' : '需注意'
}

/** 等级 → Emoji */
function conflictEmoji(level) {
  return level === 'rumor' ? '✅' : '⚠️'
}
</script>

<template>
  <div>
    <!-- ===================== 页面标题 ===================== -->
    <PageHeader />

    <!-- ===================== 顶部 Tab 切换 ===================== -->
    <div class="seg mb-5">
      <button
        v-for="tab in TABS"
        :key="tab.key"
        class="seg-item"
        :class="{ 'is-active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <span aria-hidden="true">{{ tab.emoji }}</span>
        {{ tab.label }}
      </button>
    </div>

    <!-- Tab 内容：切换时重新挂载以触发 stagger 入场动画 -->
    <div :key="activeTab" class="stagger flex flex-col gap-5">
      <!-- ============ 板块 1：常见食物热量表 ============ -->
      <MacaronCard
        v-if="activeTab === 'calorie'"
        theme="orange"
        emoji="🍽️"
        title="常见食物热量表"
        sub="按常见分量估算，含「需要慢跑多久才能消耗」参考"
      >
        <!-- 搜索 + 排序 -->
        <div class="flex items-center gap-3">
          <input v-model="keyword" class="field max-w-[280px]" placeholder="🔍 搜索食物名称，如「鸡胸肉」" />
          <div class="seg">
            <button
              v-for="s in SORTS"
              :key="s.key"
              class="seg-item"
              :class="{ 'is-active': sortMode === s.key }"
              @click="sortMode = s.key"
            >
              {{ s.label }}
            </button>
          </div>
          <span class="chip"
            >共 <b class="num chip-strong">{{ calorieList.length }}</b> 条</span
          >
        </div>

        <!-- 分类筛选 -->
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="cat in FOOD_CATEGORIES"
            :key="cat"
            class="tag"
            :class="activeCategory === cat ? 'tag-orange' : ''"
            @click="activeCategory = cat"
          >
            {{ cat }}
          </button>
        </div>

        <div class="divider"></div>

        <!-- 热量表格（可滚动） -->
        <div v-if="calorieList.length" class="scroll-area max-h-[560px]">
          <table class="table-macaron">
            <thead>
              <tr>
                <th>食物</th>
                <th>分类</th>
                <th>常见分量</th>
                <th>热量</th>
                <th>需要运动多久</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in calorieList" :key="item.name + '-' + i">
                <td class="font-semibold tx-main">
                  <span aria-hidden="true">{{ item.emoji }}</span>
                  {{ item.name }}
                </td>
                <td>
                  <span class="tag">{{ item.category }}</span>
                </td>
                <td class="tx-sub">{{ item.portion }}</td>
                <td class="num font-bold" :class="calorieClass(item.calories)">{{ item.calories }} kcal</td>
                <td class="tx-sub">🏃 慢跑 {{ item.burnMin }} 分钟</td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyState v-else emoji="🔍" text="没有找到匹配的食物" sub="试试更换关键词或分类" />
      </MacaronCard>

      <!-- ============ 板块 2：减脂增肌科普 ============ -->
      <MacaronCard
        v-else-if="activeTab === 'science'"
        theme="blue"
        emoji="🏋️"
        title="减脂增肌科普"
        sub="点击卡片查看完整科普"
      >
        <div class="grid grid-cols-3 gap-5">
          <MacaronCard
            v-for="article in SCIENCE_ARTICLES"
            :key="article.id"
            :theme="article.theme"
            :emoji="article.emoji"
            :title="article.title"
            @click="toggleArticle(article.id)"
          >
            <!-- 标签 -->
            <div class="flex flex-wrap gap-2">
              <span v-for="(t, i) in article.tags" :key="i" class="tag" :class="`tag-${article.theme}`">{{ t }}</span>
            </div>
            <!-- 摘要 -->
            <p class="mt-2.5 text-[12.5px] tx-sub">{{ article.summary }}</p>

            <!-- 展开的完整科普（\n 换行用 white-space: pre-line 呈现） -->
            <div v-if="expandedArticle === article.id" class="anim-fade-up mt-3">
              <div class="divider"></div>
              <div v-for="(section, i) in article.sections" :key="i" class="mb-3 last:mb-0">
                <p class="text-[13px] font-bold tx-main">{{ section.h }}</p>
                <p class="mt-1 text-[12.5px] tx-sub" style="white-space: pre-line">{{ section.p }}</p>
              </div>
            </div>
            <p v-else class="mt-3 text-[11px] tx-muted">👇 点击展开完整内容</p>
          </MacaronCard>
        </div>
      </MacaronCard>

      <!-- ============ 板块 3：食物相克 ============ -->
      <MacaronCard
        v-else-if="activeTab === 'conflict'"
        theme="yellow"
        emoji="⚠️"
        title="食物相克真相"
        sub="区分「以讹传讹」与「真正需要注意的搭配」"
      >
        <ul class="space-y-3">
          <li v-for="conflict in FOOD_CONFLICTS" :key="conflict.id" class="soft-panel card-hover">
            <!-- 配对展示 + 等级标签 -->
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 text-[14px] font-bold tx-main">
                <span
                  ><span aria-hidden="true">{{ conflict.a.emoji }}</span> {{ conflict.a.name }}</span
                >
                <span class="tx-muted">➕</span>
                <span
                  ><span aria-hidden="true">{{ conflict.b.emoji }}</span> {{ conflict.b.name }}</span
                >
              </div>
              <span class="tag shrink-0" :class="conflictTag(conflict.level)">
                {{ conflictEmoji(conflict.level) }} {{ conflictText(conflict.level) }}
              </span>
            </div>

            <!-- 民间说法 -->
            <p class="mt-2 text-[12.5px] tx-muted">📢 {{ conflict.desc }}</p>

            <!-- 展开的科学解释 -->
            <p
              v-if="expandedConflict === conflict.id"
              class="anim-fade-up mt-2 rounded-[12px] px-3 py-2 text-[12.5px] tx-sub"
              style="white-space: pre-line; background: rgba(255, 255, 255, 0.72)"
            >
              🔬 {{ conflict.truth }}
            </p>

            <button class="btn btn-ghost btn-xs mt-2.5" @click="toggleConflict(conflict.id)">
              {{ expandedConflict === conflict.id ? '收起科学解释' : '查看科学解释' }}
            </button>
          </li>
        </ul>
      </MacaronCard>

      <!-- ============ 板块 4：健康饮食习惯 ============ -->
      <MacaronCard
        v-else-if="activeTab === 'habit'"
        theme="green"
        emoji="🌟"
        title="健康饮食习惯"
        sub="把简单的小习惯坚持下来，就是最好的营养方案"
      >
        <div class="grid grid-cols-4 gap-4">
          <div
            v-for="(habit, i) in HEALTHY_HABITS"
            :key="i"
            class="macaron-card card-hover p-4"
            :class="`mc-${themeByIndex(i)}`"
          >
            <span class="emoji-badge text-[20px]" aria-hidden="true">{{ habit.emoji }}</span>
            <p class="mt-2 text-[13.5px] font-bold tx-main">{{ habit.title }}</p>
            <p class="mt-1.5 text-[12px] tx-sub">{{ habit.desc }}</p>
          </div>
        </div>
      </MacaronCard>

      <!-- ============ 底部：数据来源与免责说明 ============ -->
      <MacaronCard theme="blue" emoji="📚" title="数据来源与免责说明">
        <p class="text-[12.5px] tx-sub">
          📖 本页数据来源为公开膳食成分参考值与《中国居民膳食指南》，所有数值均为估算值，仅供学习与竞赛演示参考，
          不作为医疗建议或营养诊断依据。如有健康问题请咨询专业医师或注册营养师。
        </p>
      </MacaronCard>
    </div>
  </div>
</template>

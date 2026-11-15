<script setup>
/**
 * AppSidebar 侧边栏导航
 * ------------------------------------------------------------------
 * 功能模块的统一切换入口，导航项与路由 meta 自动同步。
 * 激活项使用对应模块的马卡龙底色高亮，Emoji 图标贯穿全站风格。
 *
 * 响应式行为：
 *   · 宽屏（≥1024px）：常驻左侧（lg:sticky）
 *   · 窄屏（<1024px）：收起为抽屉，由父组件通过 open 控制滑入滑出；
 *     点击导航项后由父组件（监听路由变化）自动收起，这里只负责关闭按钮
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NAV_ITEMS, NAV_GROUPS } from '../../router'
import { BRAND } from '@/config/brand'
import { useUserStore } from '../../store/user'
import { useDietStore } from '../../store/diet'
import { themeByIndex } from '../../utils/theme'
import { getAuth, clearAuth } from '@/utils/auth'
import { confirm } from '@/composables/useConfirm'

const props = defineProps({
  /** 窄屏下抽屉是否展开（宽屏忽略） */
  open: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const route = useRoute()
const userStore = useUserStore()
const dietStore = useDietStore()

/** 当前激活路由路径 */
const activePath = computed(() => route.path)

/** 导航搜索关键词（仅做展示层过滤，不影响路由与数据） */
const keyword = ref('')
/** 侧边栏是否已滚动（用于品牌区投影） */
const scrolled = ref(false)
/** 搜索框 DOM 引用（⌘K / Ctrl+K 快捷键聚焦） */
const searchRef = ref(null)
/** 侧边栏根节点引用（监听滚动） */
const asideRef = ref(null)

/**
 * 按分组整理后的导航数据（只影响展示层，顺序与内容完全来自路由表）
 * 空分组自动隐藏，保证新增页面时不出现空标题；
 * 输入关键词时按标题 / 描述 / 分组名做模糊匹配
 */
const groupedNav = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const match = (item) => {
    if (!kw) return true
    const text = [item.title, item.desc, item.badge].filter(Boolean).join(' ').toLowerCase()
    return text.includes(kw)
  }
  return NAV_GROUPS.map(group => ({
    ...group,
    items: NAV_ITEMS.filter(item => item.group === group.key && match(item))
  })).filter(group => group.items.length > 0)
})

/** 搜索无结果 */
const noResult = computed(() => keyword.value.trim() !== '' && groupedNav.value.length === 0)

/** 滚动监听：超过 4px 时给品牌区加投影，形成层次 */
function onScroll(e) {
  scrolled.value = (e.target.scrollTop || 0) > 4
}

/** 全局快捷键：⌘K / Ctrl+K 聚焦导航搜索，Esc 清空 */
function onKeydown(e) {
  const isK = e.key === 'k' || e.key === 'K'
  if ((e.metaKey || e.ctrlKey) && isK) {
    e.preventDefault()
    searchRef.value?.focus()
    searchRef.value?.select?.()
  } else if (e.key === 'Escape' && document.activeElement === searchRef.value) {
    keyword.value = ''
    searchRef.value?.blur()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

/** 侧边栏根节点 class：窄屏抽屉定位 + 宽屏常驻 + 位移切换 */
const rootClass = computed(() => [
  'sidebar fixed inset-y-0 left-0 z-40 flex h-screen w-[240px] shrink-0 flex-col overflow-y-auto transition-transform duration-300',
  'lg:sticky lg:top-0 lg:z-auto lg:translate-x-0',
  scrolled.value ? 'is-scrolled' : '',
  props.open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
])

/** 判断导航项是否激活 */
function isActive(path) {
  return activePath.value === path
}

/** 激活项的背景色与文字色：统一使用松石绿品牌色，克制商务感 */
function activeStyle() {
  return { backgroundColor: '#e8f6f4', color: '#0c7a71' }
}

/** 未激活项的图标底色：浅马卡龙色循环分配 */
function iconTheme(item, index) {
  return isActive(item.path) ? item.theme : themeByIndex(index)
}

/** 连续记录天数（本周有记录的天数） */
const activeDays = computed(() => dietStore.stats.days)

/** 当前登录用户名（登录前置页的演示账号体系） */
const authUser = computed(() => getAuth()?.username || '')

/**
 * 退出登录：仅清除登录态并回到登录页，
 * 档案与饮食数据（ai_nutrition_* 键）不受影响
 */
async function logout() {
  const ok = await confirm({
    title: '退出登录？',
    message: '你的健康档案与饮食记录会保留在本机，重新登录后可继续查看。',
    confirmText: '退出登录'
  })
  if (!ok) return
  clearAuth()
  location.replace('login.html')
}
</script>

<template>
  <aside ref="asideRef" :class="rootClass" @scroll="onScroll">
    <!-- ========== 品牌区（核心名「膳知」为视觉主体，完整名居副行） ========== -->
    <div class="sidebar-brand shrink-0 px-5 pb-3 pt-4">
      <div class="flex items-center gap-3">
        <span class="emoji-badge-lg anim-float mc-cyan shrink-0" aria-hidden="true">🥗</span>
        <div class="min-w-0 flex-1 leading-tight">
          <!-- 主行：核心品牌名「膳知」，字号最大 -->
          <p class="brand-name truncate text-[22px] font-black tracking-wide" :title="BRAND.fullName">
            {{ BRAND.name }}
          </p>
          <!-- 副行：完整产品名称的其余部分 -->
          <p class="truncate text-[11px] font-semibold tx-sub">AI 营养分析师</p>
        </div>
        <!-- 窄屏关闭按钮（宽屏隐藏） -->
        <button class="btn btn-ghost btn-xs shrink-0 lg:hidden" aria-label="关闭导航菜单" @click="emit('close')">
          ✕
        </button>
      </div>

      <!-- 导航搜索：快速定位 14 个模块，⌘K / Ctrl+K 聚焦 -->
      <label class="nav-search mt-3 flex items-center gap-2">
        <span class="text-[12px] opacity-60" aria-hidden="true">🔍</span>
        <input
          ref="searchRef"
          v-model="keyword"
          type="search"
          class="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
          placeholder="搜索功能"
          aria-label="搜索功能模块"
        />
        <kbd v-if="!keyword" class="nav-kbd" aria-hidden="true">⌘K</kbd>
        <button
          v-else
          type="button"
          class="shrink-0 text-[11px] font-semibold tx-muted"
          aria-label="清空搜索"
          @click="keyword = ''"
        >
          清空
        </button>
      </label>
    </div>

    <!-- ========== 导航列表（按分组呈现，组内条目仍来自路由表） ========== -->
    <nav class="scroll-area no-scrollbar flex-1 px-3 pb-2">
      <template v-for="group in groupedNav" :key="group.key">
        <p class="nav-group-title">
          <span>{{ group.title }}</span>
          <span class="nav-group-line" aria-hidden="true"></span>
        </p>
        <RouterLink
          v-for="item in group.items"
          :key="item.path"
          :to="item.path"
          class="nav-item mb-1"
          :class="{ 'is-active': isActive(item.path) }"
          :style="isActive(item.path) ? activeStyle(item.theme) : {}"
        >
          <span
            class="emoji-badge nav-emoji"
            :class="`mc-${iconTheme(item, NAV_ITEMS.indexOf(item))}`"
            aria-hidden="true"
          >{{ item.emoji }}</span>
          <span class="min-w-0 flex-1">
            <span class="nav-title">{{ item.title }}</span>
          </span>
          <span v-if="item.badge" class="nav-badge" :title="item.badge">{{ item.badge }}</span>
        </RouterLink>
      </template>

      <!-- 搜索无结果 -->
      <p v-if="noResult" class="nav-empty">
        没有匹配「{{ keyword }}」的功能
        <button type="button" class="mt-1 block font-semibold" style="color: var(--brand)" @click="keyword = ''">
          清除搜索
        </button>
      </p>
    </nav>

    <!-- ========== 用户迷你卡 ========== -->
    <div class="sidebar-foot shrink-0 px-3 pb-4">
      <RouterLink to="/profile" class="user-card">
        <span class="user-avatar" aria-hidden="true">{{ userStore.profile.avatar }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13px] font-bold tx-main">{{ userStore.profile.nickname }}</span>
          <span class="mt-0.5 flex items-center gap-1.5">
            <span
              class="badge"
              :style="{ backgroundColor: userStore.metrics.bmiGrade.bg, color: userStore.metrics.bmiGrade.color }"
            >
              {{ userStore.metrics.bmiGrade.emoji }} BMI {{ userStore.metrics.bmi }}
            </span>
            <span class="text-[10px] tx-muted">本周 {{ activeDays }} 天</span>
          </span>
        </span>
      </RouterLink>

      <!-- 登录状态与退出入口：与登录前置页共用同一套存储键 -->
      <div v-if="authUser" class="mt-2 flex items-center justify-between px-1 text-[11px]">
        <span class="truncate tx-muted">👤 {{ authUser }}</span>
        <button
          type="button"
          class="font-semibold transition-colors hover:text-red-500 tx-sub"
          title="退出登录（档案与记录保留在本机）"
          @click="logout"
        >
          退出 →
        </button>
      </div>
    </div>
  </aside>
</template>

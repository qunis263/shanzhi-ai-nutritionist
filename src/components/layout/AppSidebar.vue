<script setup>
/**
 * AppSidebar 侧边栏导航
 * ------------------------------------------------------------------
 * 11 个功能模块的统一切换入口，导航项与路由 meta 自动同步。
 * 激活项使用对应模块的马卡龙底色高亮，Emoji 图标贯穿全站风格。
 *
 * 响应式行为：
 *   · 宽屏（≥1024px）：常驻左侧（lg:sticky）
 *   · 窄屏（<1024px）：收起为抽屉，由父组件通过 open 控制滑入滑出；
 *     点击导航项后由父组件（监听路由变化）自动收起，这里只负责关闭按钮
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { NAV_ITEMS } from '../../router'
import { BRAND } from '@/config/brand'
import { useUserStore } from '../../store/user'
import { useDietStore } from '../../store/diet'
import { themeBg, themeText, themeByIndex } from '../../utils/theme'
import { getAuth, clearAuth } from '@/utils/auth'

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

/** 侧边栏根节点 class：窄屏抽屉定位 + 宽屏常驻 + 位移切换 */
const rootClass = computed(() => [
  'sidebar fixed inset-y-0 left-0 z-40 flex h-screen w-[240px] shrink-0 flex-col overflow-y-auto transition-transform duration-300',
  'lg:sticky lg:top-0 lg:z-auto lg:translate-x-0',
  props.open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
])

/** 判断导航项是否激活 */
function isActive(path) {
  return activePath.value === path
}

/** 激活项的背景色与文字色（使用内联样式，避免 hover 规则覆盖激活态） */
function activeStyle(theme) {
  return { backgroundColor: themeBg(theme), color: themeText(theme) }
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
function logout() {
  if (!confirm('确定退出登录吗？你的健康档案与饮食记录会保留在本机。')) return
  clearAuth()
  location.replace('login.html')
}
</script>

<template>
  <aside :class="rootClass">
    <!-- ========== 品牌区（核心名「膳知」为视觉主体，完整名居副行） ========== -->
    <div class="flex items-center gap-3 px-5 py-5">
      <span class="emoji-badge-lg anim-float mc-orange" aria-hidden="true">🥗</span>
      <div class="min-w-0 flex-1 leading-tight">
        <!-- 主行：核心品牌名「膳知」，渐变描边、字号最大 -->
        <p
          class="brand-name truncate text-[22px] font-black tracking-wide"
          :title="BRAND.fullName"
        >
          {{ BRAND.name }}
        </p>
        <!-- 副行：完整产品名称的其余部分，与主行共同构成「膳知・AI 营养分析师」 -->
        <p class="truncate text-[11px] font-semibold tx-sub">AI 营养分析师</p>
        <p class="truncate text-[9px] tracking-[0.14em] tx-muted">{{ BRAND.english }}</p>
      </div>
      <!-- 窄屏关闭按钮（宽屏隐藏） -->
      <button class="btn btn-ghost btn-xs shrink-0 lg:hidden" aria-label="关闭导航菜单" @click="emit('close')">✕</button>
    </div>

    <!-- ========== 导航列表 ========== -->
    <nav class="scroll-area no-scrollbar flex-1 px-3 pb-2">
      <p class="nav-group-title">功能模块</p>
      <RouterLink
        v-for="(item, index) in NAV_ITEMS"
        :key="item.path"
        :to="item.path"
        class="nav-item mb-1"
        :class="{ 'is-active': isActive(item.path) }"
        :style="isActive(item.path) ? activeStyle(item.theme) : {}"
      >
        <span class="emoji-badge" :class="`mc-${iconTheme(item, index)}`" aria-hidden="true">{{ item.emoji }}</span>
        <span class="min-w-0 flex-1">
          <span class="nav-title">{{ item.title }}</span>
        </span>
        <span v-if="item.badge" class="tag tag-purple text-[10px]">{{ item.badge }}</span>
      </RouterLink>
    </nav>

    <!-- ========== 用户迷你卡 ========== -->
    <div class="px-4 pb-5">
      <RouterLink to="/profile" class="macaron-card card-hover mc-purple block p-3.5">
        <div class="flex items-center gap-3">
          <span class="emoji-badge-lg mc-white text-[22px]" aria-hidden="true">{{ userStore.profile.avatar }}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-bold tx-main">{{ userStore.profile.nickname }}</p>
            <div class="mt-1 flex items-center gap-1.5">
              <span class="badge" :style="{ backgroundColor: userStore.metrics.bmiGrade.bg, color: userStore.metrics.bmiGrade.color }">
                {{ userStore.metrics.bmiGrade.emoji }} BMI {{ userStore.metrics.bmi }}
              </span>
            </div>
          </div>
        </div>
        <p class="mt-2.5 flex items-center gap-1 text-[11px] tx-muted">
          <span>📅 本周已记录</span>
          <span class="font-bold tx-sub">{{ activeDays }}</span>
          <span>天</span>
        </p>
      </RouterLink>

      <!-- 登录状态与退出入口：与登录前置页共用同一套存储键 -->
      <div v-if="authUser" class="mt-2 flex items-center justify-between rounded-[14px] px-3 py-2 text-[11px]" style="background: rgba(255, 255, 255, 0.65)">
        <span class="truncate tx-muted">👤 {{ authUser }}</span>
        <button type="button" class="font-semibold transition-colors hover:text-red-500 tx-sub" title="退出登录（档案与记录保留在本机）" @click="logout">
          退出 →
        </button>
      </div>
    </div>
  </aside>
</template>

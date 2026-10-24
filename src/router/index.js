/**
 * 路由配置
 * ------------------------------------------------------------------
 * 共 11 个页面，全部使用懒加载（路由级代码分割），
 * 保证首屏加载速度；每项 meta 中携带标题、Emoji 与马卡龙配色主题，
 * 供侧边栏导航、顶部标题栏统一读取，避免各页面硬编码。
 */

import { createRouter, createWebHashHistory } from 'vue-router'
import { BRAND } from '@/config/brand'
import { isLoggedIn, redirectToLogin } from '@/utils/auth'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: '首页主页', emoji: '🏠', theme: 'orange', desc: '今日营养总览与快速入口', order: 1 }
  },
  {
    path: '/recognize',
    name: 'recognize',
    component: () => import('../views/FoodRecognitionView.vue'),
    meta: { title: 'AI食物识别', emoji: '📷', theme: 'purple', desc: '上传食物照片，AI 秒出营养报告', order: 2, badge: '核心亮点' }
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('../views/NutritionChatView.vue'),
    meta: { title: 'AI营养对话助手', emoji: '💬', theme: 'cyan', desc: '多轮对话 · 个性化建议 · 知识库增强', order: 3, badge: 'AI 核心' }
  },
  {
    path: '/diet',
    name: 'diet',
    component: () => import('../views/DietRecordView.vue'),
    meta: { title: '三餐饮食记录', emoji: '🍽️', theme: 'green', desc: '记录三餐与饮水，自动累加营养', order: 4 }
  },
  {
    path: '/body',
    name: 'body',
    component: () => import('../views/BodyAssessmentView.vue'),
    meta: { title: '身体数据测评', emoji: '📏', theme: 'cyan', desc: 'BMI / BMR 与每日推荐热量', order: 5 }
  },
  {
    path: '/report',
    name: 'report',
    component: () => import('../views/NutritionReportView.vue'),
    meta: { title: 'AI营养分析报告', emoji: '📋', theme: 'yellow', desc: '当日健康总分与 AI 评语', order: 6 }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/DashboardView.vue'),
    meta: { title: '数据可视化大屏', emoji: '📊', theme: 'blue', desc: 'ECharts 营养数据大屏', order: 7 }
  },
  {
    path: '/plan',
    name: 'plan',
    component: () => import('../views/MealRecommendView.vue'),
    meta: { title: 'AI膳食推荐', emoji: '🧑‍🍳', theme: 'orange', desc: '按营养缺口定制食谱与运动', order: 8 }
  },
  {
    path: '/knowledge',
    name: 'knowledge',
    component: () => import('../views/KnowledgeView.vue'),
    meta: { title: '营养知识库', emoji: '📚', theme: 'green', desc: '热量表 / 科普 / 相克 / 习惯', order: 9 }
  },
  {
    path: '/foods',
    name: 'foods',
    component: () => import('../views/FoodSearchView.vue'),
    meta: { title: '食物营养速查', emoji: '🍱', theme: 'orange', desc: '食物数据库 · 模糊检索 · 份量换算', order: 10 }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { title: '个人中心', emoji: '🧑', theme: 'purple', desc: '健康档案 / 历史记录 / 数据统计', order: 11 }
  },
  {
    // 兜底：未匹配路径回到首页
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  // 采用 hash 模式，保证直接用浏览器打开打包产物也能正常跳转（答辩演示更稳妥）
  history: createWebHashHistory(),
  routes,
  /** 切换路由后回到页面顶部 */
  scrollBehavior() {
    return { top: 0 }
  }
})

/** 侧边栏导航项（由路由表推导，保证导航与路由始终一致） */
export const NAV_ITEMS = routes
  .filter((r) => r.meta && r.meta.order)
  .map((r) => ({
    path: r.path,
    name: r.name,
    title: r.meta.title,
    emoji: r.meta.emoji,
    theme: r.meta.theme,
    desc: r.meta.desc,
    badge: r.meta.badge || '',
    order: r.meta.order
  }))
  .sort((a, b) => a.order - b.order)

/**
 * 登录前置守卫：未登录访问任何业务页面 → 跳转独立登录页 public/login.html
 * 登录态由登录页写入 localStorage / sessionStorage（键 shanzhi_auth_v1），
 * 与业务数据完全隔离，不影响健康档案与饮食记录。
 */
router.beforeEach(() => {
  if (!isLoggedIn()) {
    redirectToLogin()
    return false // 取消本次 SPA 导航，等待整页跳转到登录页
  }
  return true
})

/** 切换页面时同步浏览器标题（提升演示观感） */
router.afterEach((to) => {
  const title = to.meta?.title ? `${to.meta.emoji} ${to.meta.title} · ${BRAND.fullName}` : BRAND.fullName
  document.title = title
})

export default router

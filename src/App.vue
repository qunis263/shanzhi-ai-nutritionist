<script setup>
/**
 * App 根组件
 * ------------------------------------------------------------------
 * 布局结构：左侧固定侧边栏 + 右侧「顶部信息栏 + 页面内容区」。
 * 使用 <transition name="page"> 实现全局页面淡入过渡（样式定义在 style.css）。
 * 应用挂载后初始化饮食记录 Store（读取本地缓存 / 写入演示数据）。
 *
 * 移动端 Web 适配（对应比赛要求「含 PC 端 Web、移动端 Web」）：
 *   · 宽屏（≥1024px）：侧边栏常驻左侧，与 PC 端一致
 *   · 窄屏（<1024px）：侧边栏收起为抽屉，由顶栏「☰」按钮唤出，点击遮罩或跳转后自动关闭
 */
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/layout/AppSidebar.vue'
import AppTopbar from './components/layout/AppTopbar.vue'
import { useDietStore } from './store/diet'

const dietStore = useDietStore()
const route = useRoute()

/** 窄屏抽屉是否展开 */
const drawerOpen = ref(false)

// 路由跳转后自动收起抽屉，避免遮挡新页面内容
watch(
  () => route.path,
  () => {
    drawerOpen.value = false
  }
)

onMounted(() => {
  // 初始化今日饮食记录与历史数据
  dietStore.init()
})
</script>

<template>
  <div class="flex min-h-screen">
    <!-- 窄屏抽屉遮罩（宽屏隐藏） -->
    <transition name="page">
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-30 bg-[rgba(58,69,83,0.35)] lg:hidden"
        aria-hidden="true"
        @click="drawerOpen = false"
      ></div>
    </transition>

    <!-- 侧边栏导航（窄屏为抽屉，宽屏常驻） -->
    <AppSidebar :open="drawerOpen" @close="drawerOpen = false" />

    <!-- 主区域 -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- 顶部信息栏 -->
      <AppTopbar @toggle-drawer="drawerOpen = !drawerOpen" />

      <!-- 页面内容（带淡入过渡动画） -->
      <main class="min-w-0 flex-1 px-4 pb-8 pt-5 lg:px-7 lg:pb-9 lg:pt-6">
        <RouterView v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<script setup>
/**
 * BaseChart ECharts 通用封装
 * ------------------------------------------------------------------
 * 职责：
 *   1. 统一初始化 / 销毁实例，避免内存泄漏
 *   2. option 变化时自动重绘（notMerge 模式，防止残留旧系列）
 *   3. 使用 ResizeObserver 监听容器尺寸变化，窗口缩放 / 布局变化时自动 resize
 *   4. 页面切换动画期间（父容器尺寸变化）延迟 resize，保证图表不被裁切
 *
 * 用法：<BaseChart :option="option" height="320px" />
 */
import { onBeforeUnmount, onMounted, ref, shallowRef, watch, nextTick } from 'vue'
// ECharts 按需引入：只注册全站实际用到的图表类型 / 组件 / 渲染器，显著减小打包体积
// （core 上的 init / setOption / dispose / resize API 与全量包完全一致）
import * as echarts from 'echarts/core'
import { BarChart, GaugeChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
import {
  GridComponent, // xAxis / yAxis / grid（折线、柱状）
  LegendComponent, // legend（饼图、折线、雷达、双轴柱状）
  MarkLineComponent, // 折线图目标参考线
  RadarComponent, // radar 雷达坐标系
  TitleComponent, // 饼图圆心标题
  TooltipComponent // 全部图表的提示框
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  GaugeChart,
  LineChart,
  PieChart,
  RadarChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  RadarComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
])

const props = defineProps({
  /** ECharts 配置项 */
  option: { type: Object, required: true },
  /** 图表高度（必须给定，否则容器高度为 0 会导致图表不显示） */
  height: { type: String, default: '320px' },
  /** 加载中状态（显示骨架屏） */
  loading: { type: Boolean, default: false }
})

const chartRef = ref(null) // 图表容器 DOM
const chart = shallowRef(null) // ECharts 实例（用 shallowRef 避免被深度响应式代理）
let observer = null // 尺寸监听器
let resizeTimer = null // resize 防抖定时器

/** 渲染（重绘）图表 */
function render() {
  if (!chart.value) return
  chart.value.setOption(props.option || {}, true)
}

/** 防抖 resize，避免布局变化过程中频繁重建画布 */
function handleResize() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    chart.value && chart.value.resize()
  }, 80)
}

onMounted(async () => {
  await nextTick()
  if (!chartRef.value) return
  chart.value = echarts.init(chartRef.value)
  render()

  // 监听容器尺寸变化（父级布局变化 / 展开收起时图表自适应）
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(handleResize)
    observer.observe(chartRef.value)
  }
  window.addEventListener('resize', handleResize)
})

// option 变化 → 重绘
watch(() => props.option, render, { deep: true })

// loading 结束时补一次 resize，保证图表尺寸正确
watch(
  () => props.loading,
  v => {
    if (!v) nextTick(handleResize)
  }
)

onBeforeUnmount(() => {
  clearTimeout(resizeTimer)
  window.removeEventListener('resize', handleResize)
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (chart.value) {
    chart.value.dispose()
    chart.value = null
  }
})
</script>

<template>
  <div class="relative w-full" :style="{ height }">
    <div ref="chartRef" class="h-full w-full"></div>

    <!-- 加载骨架（首次渲染时的占位，避免图表区域出现空白闪烁） -->
    <div v-if="loading" class="absolute inset-0 grid place-items-center">
      <div class="skeleton h-[70%] w-[70%]"></div>
    </div>
  </div>
</template>

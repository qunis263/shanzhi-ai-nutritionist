/**
 * ECharts 图表配置工具库
 * ------------------------------------------------------------------
 * 目标：让全站图表配色与页面马卡龙风格严格统一。
 * 所有页面只需调用这里的构造函数即可得到「同一套视觉语言」的图表，
 * 无需各自重复书写 ECharts option，避免出现风格割裂。
 *
 * 统一规范：
 *   · 配色：使用马卡龙色板（低饱和、明亮）
 *   · 字体：统一中文无衬线、灰色文字
 *   · 网格：留足边距、隐藏竖向分割线、横向分割线使用极浅灰
 *   · 提示框：白底 + 大圆角 + 柔和阴影
 */

import { round1 } from './nutrition'

/* ===================================================================
 * 一、色板与基础样式
 * =================================================================== */

/** 马卡龙主色板（与 CSS 设计变量一一对应，饱和度略提高以便图表清晰可辨） */
export const MACARON = {
  orange: '#ffb27a',
  green: '#7fdbb0',
  blue: '#8cc4f5',
  purple: '#b9a6f2',
  yellow: '#ffd98a',
  cyan: '#8adfd8'
}

/** 图表系列默认取色顺序 */
export const PALETTE = [MACARON.orange, MACARON.green, MACARON.blue, MACARON.purple, MACARON.yellow, MACARON.cyan]

/** 统一文字色 */
export const TEXT_COLOR = {
  main: '#3a4553',
  sub: '#6b7a8d',
  muted: '#98a5b5'
}

/** 三大营养素固定配色：碳水 🍚 橙 / 蛋白质 🥩 绿 / 脂肪 🥑 黄 */
export const MACRO_COLORS = {
  carb: MACARON.orange,
  protein: MACARON.green,
  fat: MACARON.yellow
}

/** 统一提示框样式 */
export function tooltipBase(trigger = 'axis') {
  return {
    trigger,
    backgroundColor: '#ffffff',
    borderColor: '#eef2f7',
    borderWidth: 1,
    padding: [10, 14],
    textStyle: { color: TEXT_COLOR.main, fontSize: 12 },
    extraCssText: 'border-radius:14px;box-shadow:0 8px 24px rgba(31,45,61,.12);'
  }
}

/** 统一坐标轴文字样式 */
export function axisLabelStyle() {
  return { color: TEXT_COLOR.sub, fontSize: 11 }
}

/** 统一横向分割线样式 */
export function splitLineStyle() {
  return { lineStyle: { color: '#f1f4f9', type: 'dashed' } }
}

/** 通用网格配置 */
const GRID = { left: 8, right: 16, top: 42, bottom: 4, containLabel: true }

/* ===================================================================
 * 二、饼图（三大营养素摄入占比 / 食物分类占比）
 * =================================================================== */

/**
 * 马卡龙环形饼图
 * @param {object} p
 * @param {Array}  p.data 形如 [{ name:'碳水', value:120, color:'#ffb27a' }]
 * @param {string} p.centerTitle 圆心上方的小标题
 * @param {string|number} p.centerValue 圆心主数值
 * @param {string} p.centerUnit 圆心单位
 * @param {boolean} p.donut 是否环形（默认 true）
 */
export function macaronPieOption({ data = [], centerTitle = '', centerValue = '', centerUnit = '', donut = true }) {
  const list = data.filter((d) => Number(d.value) > 0)

  return {
    color: PALETTE,
    tooltip: {
      ...tooltipBase('item'),
      formatter: (p) => `${p.marker}${p.name}<br/><b>${round1(p.value)}</b> g（${p.percent}%）`
    },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 16,
      textStyle: { color: TEXT_COLOR.sub, fontSize: 12 }
    },
    // 圆心文字：总量展示
    title: centerValue !== ''
      ? {
          text: String(centerValue),
          subtext: centerTitle ? `${centerTitle}${centerUnit ? ' / ' + centerUnit : ''}` : '',
          left: 'center',
          top: donut ? '40%' : '44%',
          textAlign: 'center',
          textStyle: { color: TEXT_COLOR.main, fontSize: 22, fontWeight: 800 },
          subtextStyle: { color: TEXT_COLOR.muted, fontSize: 11 }
        }
      : undefined,
    series: [
      {
        type: 'pie',
        radius: donut ? ['56%', '76%'] : ['0%', '72%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        padAngle: 2,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 6 },
        data: list.map((d) => ({
          name: d.name,
          value: round1(d.value),
          itemStyle: d.color ? { color: d.color } : undefined
        }))
      }
    ]
  }
}

/* ===================================================================
 * 三、折线图（一周热量趋势）
 * =================================================================== */

/**
 * 马卡龙折线图
 * @param {object} p
 * @param {string[]} p.labels X 轴标签
 * @param {Array}    p.series 形如 [{ name:'热量', data:[], color:'#ffb27a', area:true }]
 * @param {number}   [p.target] 目标参考线数值
 * @param {string}   [p.targetLabel] 参考线文案
 * @param {string}   [p.unit] 数值单位
 * @param {boolean}  [p.smooth] 是否平滑曲线（默认 true）
 */
export function macaronLineOption({ labels = [], series = [], target = null, targetLabel = '目标', unit = '', smooth = true }) {
  const markLine =
    target !== null && target !== undefined
      ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#f5a524', type: 'dashed', width: 1.5 },
          label: {
            formatter: `${targetLabel} ${target}`,
            position: 'insideEndTop',
            color: '#b8801a',
            fontSize: 11,
            fontWeight: 'bold'
          },
          data: [{ yAxis: target }]
        }
      : undefined

  return {
    color: PALETTE,
    tooltip: {
      ...tooltipBase('axis'),
      axisPointer: { type: 'line', lineStyle: { color: '#dfe6ef', type: 'dashed' } }
    },
    legend: {
      top: 0,
      right: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: TEXT_COLOR.sub, fontSize: 12 }
    },
    grid: { ...GRID, top: 34 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLine: { lineStyle: { color: '#e7ecf3' } },
      axisTick: { show: false },
      axisLabel: axisLabelStyle()
    },
    yAxis: {
      type: 'value',
      name: unit,
      nameTextStyle: { color: TEXT_COLOR.muted, fontSize: 11, padding: [0, 0, 0, 4] },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisLabelStyle(),
      splitLine: splitLineStyle()
    },
    series: series.map((s, i) => ({
      name: s.name,
      type: 'line',
      smooth,
      symbol: 'circle',
      symbolSize: 8,
      lineStyle: { width: 3, color: s.color || PALETTE[i % PALETTE.length] },
      itemStyle: { color: s.color || PALETTE[i % PALETTE.length], borderColor: '#fff', borderWidth: 2 },
      areaStyle: s.area
        ? {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: hexToRgba(s.color || PALETTE[i % PALETTE.length], 0.28) },
                { offset: 1, color: hexToRgba(s.color || PALETTE[i % PALETTE.length], 0.02) }
              ]
            }
          }
        : undefined,
      markLine: i === 0 ? markLine : undefined,
      data: s.data
    }))
  }
}

/* ===================================================================
 * 四、柱状图（饮水 / 三餐热量分布）
 * =================================================================== */

/**
 * 马卡龙柱状图
 * @param {object} p
 * @param {string[]} p.labels X 轴标签
 * @param {Array<number>} p.values 数值
 * @param {Array<string>} [p.colors] 每个柱子的自定义颜色
 * @param {string} [p.name] 系列名称
 * @param {string} [p.unit] 数值单位
 * @param {boolean} [p.horizontal] 是否横向柱状图
 */
export function macaronBarOption({ labels = [], values = [], colors = null, name = '数值', unit = '' }) {
  const max = Math.max(...values.map((v) => Number(v) || 0), 1)

  return {
    color: PALETTE,
    tooltip: {
      ...tooltipBase('axis'),
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,241,230,.35)' } },
      formatter: (list) => {
        const p = Array.isArray(list) ? list[0] : list
        return `${p.axisValue}<br/>${p.marker}${name}：<b>${round1(p.value)}</b> ${unit}`
      }
    },
    grid: { ...GRID, top: 26 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#e7ecf3' } },
      axisTick: { show: false },
      axisLabel: axisLabelStyle()
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisLabelStyle(),
      splitLine: splitLineStyle()
    },
    series: [
      {
        name,
        type: 'bar',
        barMaxWidth: 34,
        itemStyle: {
          borderRadius: [10, 10, 4, 4],
          color: (p) => {
            if (colors && colors[p.dataIndex]) return colors[p.dataIndex]
            return PALETTE[p.dataIndex % PALETTE.length]
          }
        },
        label: {
          show: true,
          position: 'top',
          color: TEXT_COLOR.sub,
          fontSize: 11,
          fontWeight: 'bold',
          formatter: (p) => round1(p.value)
        },
        data: values.map((v) => round1(Number(v) || 0))
      }
    ],
    // 视觉上让柱子高度更有区分度
    __max: max
  }
}

/* ===================================================================
 * 五、双轴柱状图（三餐热量 + 饮水）
 * =================================================================== */

/**
 * 三餐热量与饮水对比柱状图（左轴 kcal / 右轴 ml）
 * @param {object} p
 * @param {string[]} p.mealLabels 餐段名称（早餐/午餐/晚餐/零食）
 * @param {number[]} p.mealValues 各餐段热量
 * @param {number}   p.water 当日饮水
 * @param {number}   p.waterTarget 饮水目标
 */
export function macaronMealWaterOption({ mealLabels = [], mealValues = [], water = 0, waterTarget = 1700 }) {
  return {
    tooltip: {
      ...tooltipBase('axis'),
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(230,244,255,.5)' } }
    },
    legend: {
      top: 0,
      right: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: TEXT_COLOR.sub, fontSize: 12 }
    },
    grid: { ...GRID, top: 34, right: 52 },
    xAxis: {
      type: 'category',
      data: [...mealLabels, '饮水'],
      axisLine: { lineStyle: { color: '#e7ecf3' } },
      axisTick: { show: false },
      axisLabel: axisLabelStyle()
    },
    yAxis: [
      {
        type: 'value',
        name: 'kcal',
        nameTextStyle: { color: TEXT_COLOR.muted, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: axisLabelStyle(),
        splitLine: splitLineStyle()
      },
      {
        type: 'value',
        name: 'ml',
        nameTextStyle: { color: TEXT_COLOR.muted, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: axisLabelStyle(),
        splitLine: { show: false },
        max: Math.max(waterTarget * 1.6, water * 1.2) || 2000
      }
    ],
    series: [
      {
        name: '热量',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 30,
        itemStyle: {
          borderRadius: [10, 10, 4, 4],
          color: (p) => [MACARON.yellow, MACARON.orange, MACARON.purple, MACARON.cyan][p.dataIndex] || MACARON.orange
        },
        label: {
          show: true,
          position: 'top',
          color: TEXT_COLOR.sub,
          fontSize: 11,
          fontWeight: 'bold'
        },
        data: [...mealValues.map((v) => round1(v)), '-']
      },
      {
        name: '饮水',
        type: 'bar',
        yAxisIndex: 1,
        barMaxWidth: 30,
        itemStyle: { borderRadius: [10, 10, 4, 4], color: MACARON.blue },
        label: {
          show: true,
          position: 'top',
          color: TEXT_COLOR.sub,
          fontSize: 11,
          fontWeight: 'bold',
          formatter: (p) => (p.value === '-' ? '' : p.value)
        },
        data: ['-', '-', '-', '-', Math.round(water)]
      }
    ]
  }
}

/* ===================================================================
 * 六、仪表盘（健康总分）
 * =================================================================== */

/**
 * 健康总分仪表盘
 * @param {object} p
 * @param {number} p.value 0–100
 * @param {string} p.color 主色（由评分等级决定）
 * @param {string} p.name 名称
 */
export function macaronGaugeOption({ value = 0, color = MACARON.green, name = '健康总分' }) {
  return {
    series: [
      {
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '92%',
        center: ['50%', '58%'],
        progress: {
          show: true,
          width: 16,
          roundCap: true,
          itemStyle: { color }
        },
        axisLine: {
          lineStyle: { width: 16, color: [[1, '#f1f4f9']] },
          roundCap: true
        },
        pointer: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: {
          offsetCenter: [0, '32%'],
          color: TEXT_COLOR.muted,
          fontSize: 12
        },
        detail: {
          offsetCenter: [0, '-2%'],
          color,
          fontSize: 36,
          fontWeight: 800,
          formatter: (v) => `${Math.round(v)}`
        },
        data: [{ value: round1(value), name }]
      }
    ]
  }
}

/* ===================================================================
 * 七、雷达图（营养素均衡度）
 * =================================================================== */

/**
 * 营养素均衡度雷达图
 * @param {object} p
 * @param {Array} p.indicators 形如 [{ name:'蛋白质', max:120 }]
 * @param {Array} p.series 形如 [{ name:'今日摄入', value:[...], color:'#7fdbb0' }]
 */
export function macaronRadarOption({ indicators = [], series = [] }) {
  return {
    color: PALETTE,
    tooltip: { ...tooltipBase('item') },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: TEXT_COLOR.sub, fontSize: 12 }
    },
    radar: {
      center: ['50%', '46%'],
      radius: '62%',
      indicator: indicators,
      axisName: { color: TEXT_COLOR.sub, fontSize: 11 },
      splitLine: { lineStyle: { color: '#eef2f7' } },
      axisLine: { lineStyle: { color: '#eef2f7' } },
      splitArea: {
        areaStyle: { color: ['#ffffff', '#fbfcfe'] }
      }
    },
    series: [
      {
        type: 'radar',
        symbolSize: 5,
        data: series.map((s, i) => ({
          name: s.name,
          value: s.value,
          lineStyle: { width: 3, color: s.color || PALETTE[i % PALETTE.length] },
          itemStyle: { color: s.color || PALETTE[i % PALETTE.length] },
          areaStyle: { color: hexToRgba(s.color || PALETTE[i % PALETTE.length], 0.22) }
        }))
      }
    ]
  }
}

/* ===================================================================
 * 八、工具函数
 * =================================================================== */

/**
 * 十六进制颜色转 rgba（用于面积渐变）
 * @param {string} hex
 * @param {number} alpha
 */
export function hexToRgba(hex, alpha = 1) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return `rgba(255,178,122,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * 主题配色映射工具
 * ------------------------------------------------------------------
 * 把「主题名」（orange / green / blue / purple / yellow / cyan）
 * 映射到对应的马卡龙底色与深色文字色，
 * 供需要在 JS 中动态上色的场景使用（导航高亮、ECharts 联动、动态标签等）。
 * 六种底色与需求中给定的色值严格一致，全站不得随意更改。
 */

/** 马卡龙底色（浅色卡片背景） */
export const THEME_BG = {
  orange: '#fff1e6',
  green: '#e6f7ef',
  blue: '#e6f4ff',
  purple: '#f3efff',
  yellow: '#fff9e6',
  cyan: '#e6f9f7',
  white: '#ffffff'
}

/** 与底色搭配的深色文字 / 描边色（保证可读性） */
export const THEME_TEXT = {
  orange: '#b46b3a',
  green: '#2f9e6b',
  blue: '#3b7fd4',
  purple: '#7a5fd0',
  yellow: '#b9912f',
  cyan: '#2f9e9a',
  white: '#3a4553'
}

/** 主题名列表（用于按顺序取色，保证配色循环稳定） */
export const THEME_LIST = ['orange', 'green', 'blue', 'purple', 'yellow', 'cyan']

/** 取底色（带兜底，未知主题返回白色） */
export function themeBg(theme) {
  return THEME_BG[theme] || THEME_BG.white
}

/** 取深色文字 */
export function themeText(theme) {
  return THEME_TEXT[theme] || THEME_TEXT.white
}

/** 按索引循环取主题，用于列表项自动配色 */
export function themeByIndex(index) {
  return THEME_LIST[index % THEME_LIST.length]
}

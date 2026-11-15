/**
 * 主题配色映射工具
 * ------------------------------------------------------------------
 * 把「主题名」（orange / green / blue / purple / yellow / cyan）
 * 映射到对应的低饱和点缀底色与文字色，供 JS 动态上色场景使用。
 * 风格基准：极简商务 SaaS —— 低饱和点缀底 + 委托色文字，整体克制。
 */

/** 低饱和点缀底色（浅色背景，卡片主体仍为纯白） */
export const THEME_BG = {
  orange: '#fbf4ef',
  green: '#eef7f4',
  blue: '#eff4fb',
  purple: '#f3f0f9',
  yellow: '#f9f6ec',
  cyan: '#edf7f6',
  white: '#ffffff'
}

/** 与底色搭配的文字 / 描边色（保证可读性） */
export const THEME_TEXT = {
  orange: '#b06a3c',
  green: '#217a5c',
  blue: '#3a5f8a',
  purple: '#6a5bb0',
  yellow: '#a07b1f',
  cyan: '#237c78',
  white: '#1d2430'
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

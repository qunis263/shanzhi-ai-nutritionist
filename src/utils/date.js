/**
 * 日期工具函数集合
 * ------------------------------------------------------------------
 * 统一处理日期格式化、星期中文、最近 N 天等逻辑，
 * 避免各页面自行拼接日期字符串导致格式不一致。
 */

/** 补零：1 → '01' */
function pad(n) {
  return String(n).padStart(2, '0')
}

/**
 * 将 Date 格式化为 'YYYY-MM-DD'
 * @param {Date|string} date
 */
export function formatDate(date = new Date()) {
  const d = typeof date === 'string' ? parseDate(date) : date
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 安全解析 'YYYY-MM-DD' 字符串为本地时间 Date
 * （直接用 new Date('2026-10-15') 会按 UTC 解析，可能差一天）
 * @param {string} str
 */
export function parseDate(str) {
  if (str instanceof Date) return str
  const [y, m, d] = String(str).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/**
 * 获取中文星期，如 '周三'
 * @param {Date|string} date
 */
export function weekdayCN(date = new Date()) {
  const d = typeof date === 'string' ? parseDate(date) : date
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
}

/**
 * 格式化为 '10月15日'
 * @param {Date|string} date
 */
export function formatCN(date = new Date()) {
  const d = typeof date === 'string' ? parseDate(date) : date
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/**
 * 生成「今天」的日期字符串（本地时区）
 */
export function todayStr() {
  return formatDate(new Date())
}

/**
 * 获取最近 N 天的日期数组（含今天），按时间正序返回
 * @param {number} n 天数
 * @returns {string[]} 形如 ['2026-10-09', ..., '2026-10-15']
 */
export function lastNDays(n = 7) {
  const arr = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    arr.push(formatDate(d))
  }
  return arr
}

/**
 * 判断某个日期是否是今天
 * @param {string} dateStr
 */
export function isToday(dateStr) {
  return dateStr === todayStr()
}

/**
 * 相对今天的友好描述，如 '今天' / '昨天' / '3 天前'
 * @param {string} dateStr
 */
export function relativeDay(dateStr) {
  const diff = Math.round((parseDate(todayStr()) - parseDate(dateStr)) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff > 1) return `${diff} 天前`
  return '未来'
}

/**
 * 当前时间字符串 'HH:mm'（用于记录饮食时间）
 */
export function nowTimeStr() {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 按时间段推断所属餐段（用于自动定位默认餐段）
 * 06:00–10:00 早餐 / 10:00–15:00 午餐 / 16:00–21:00 晚餐 / 其余 零食
 */
export function guessMealByNow() {
  const h = new Date().getHours()
  if (h >= 6 && h < 10) return '早餐'
  if (h >= 10 && h < 15) return '午餐'
  if (h >= 16 && h < 21) return '晚餐'
  return '零食'
}

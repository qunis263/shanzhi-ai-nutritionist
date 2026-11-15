/**
 * 轻量鼓励动画
 * ------------------------------------------------------------------
 * 记录饮食 / AI 食物识别提交成功后，在屏幕中央淡入淡出几颗小星星，
 * 300ms 自动消失，动画克制、不花哨，不阻断任何交互（pointer-events: none）。
 */

const STAR_GLYPHS = ['✨', '⭐', '✨', '🌟', '✨']

/**
 * 播放一次星星鼓励动画
 * @param {number} count 星星数量（默认 5 颗）
 */
export function celebrateStars(count = 5) {
  if (typeof document === 'undefined') return

  const layer = document.createElement('div')
  layer.className = 'star-layer'
  layer.setAttribute('aria-hidden', 'true')

  const cx = window.innerWidth / 2
  const cy = window.innerHeight / 2

  for (let i = 0; i < count; i += 1) {
    const star = document.createElement('span')
    star.className = 'star-burst'
    star.textContent = STAR_GLYPHS[i % STAR_GLYPHS.length]

    // 以屏幕中心为原点向外均匀扩散，带一点随机抖动让动画更自然
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2
    const radius = 44 + Math.random() * 30
    star.style.left = `${cx + (Math.random() - 0.5) * 48}px`
    star.style.top = `${cy + (Math.random() - 0.5) * 36}px`
    star.style.setProperty('--dx', `${Math.cos(angle) * radius}px`)
    star.style.setProperty('--dy', `${Math.sin(angle) * radius - 12}px`)

    layer.appendChild(star)
  }

  document.body.appendChild(layer)
  // 动画 300ms，多留 20ms 容错后移除节点
  window.setTimeout(() => layer.remove(), 320)
}

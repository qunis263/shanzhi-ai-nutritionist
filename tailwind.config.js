/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  // 明亮浅色主题：不做深色模式，全局只有一套马卡龙风格
  theme: {
    extend: {
      // ===== 马卡龙主题色板（低饱和度、明亮）=====
      colors: {
        macaron: {
          orange: '#fff1e6', // 浅橙 —— 热量 / 早餐
          green: '#e6f7ef', //  浅绿 —— 健康 / 蔬菜
          blue: '#e6f4ff', //   浅蓝 —— 水 / 数据
          purple: '#f3efff', // 浅紫 —— AI / 智能
          yellow: '#fff9e6', // 浅黄 —— 提醒 / 碳水
          cyan: '#e6f9f7' //    浅青 —— 分析 / 图表
        },
        // 深色版本（用于文字、图标描边，保证可读性）
        accent: {
          orange: '#b46b3a',
          green: '#2f9e6b',
          blue: '#3b7fd4',
          purple: '#7a5fd0',
          yellow: '#b9912f',
          cyan: '#2f9e9a'
        },
        // 数据状态色
        status: {
          ok: '#10b981', // 达标 ✅ 绿色
          over: '#ef4444', // 超标 🔴 红色
          low: '#f5a524' // 偏少 💡 黄色
        }
      },
      // ===== 柔和阴影（卡片基础样式）=====
      boxShadow: {
        soft: '0 2px 8px rgba(31, 45, 61, 0.04)',
        card: '0 6px 20px rgba(31, 45, 61, 0.07)',
        cardHover: '0 18px 40px rgba(31, 45, 61, 0.15)',
        inner: 'inset 0 1px 3px rgba(31, 45, 61, 0.05)'
      },
      // ===== 大圆角 =====
      borderRadius: {
        card: '24px',
        pill: '999px'
      },
      // ===== 动画 =====
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '70%': { opacity: '1', transform: 'scale(1.03)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        floatY: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-9px)' }
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' }
        }
      },
      // 注意：入场动画统一使用 backwards 填充模式，
      // 避免动画结束后残留的 transform 覆盖卡片 hover 的位移/缩放效果
      animation: {
        fadeUp: 'fadeUp 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) backwards',
        popIn: 'popIn 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) backwards',
        floatY: 'floatY 4s ease-in-out infinite',
        pulseSoft: 'pulseSoft 1.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite'
      }
    }
  },
  plugins: []
}

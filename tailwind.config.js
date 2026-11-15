/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  // 明亮浅色主题，不做深色模式，全局只此一套极简商务 SaaS 风格
  theme: {
    extend: {
      // ===== 极简商务配色 =====
      colors: {
        // 品牌主色：低饱和松石绿
        brand: {
          DEFAULT: '#0f8f84',
          hover: '#0c7a71',
          soft: '#e8f6f4',
          ink: '#1d2430'
        },
        // 低饱和点缀底色（保持功能区分但克制，卡片主体仍为纯白）
        macaron: {
          orange: '#fbf4ef',
          green: '#eef7f4',
          blue: '#eff4fb',
          purple: '#f3f0f9',
          yellow: '#f9f6ec',
          cyan: '#edf7f6'
        },
        // 深色版本（用于文字、图标描边，保证可读性）
        accent: {
          orange: '#b06a3c',
          green: '#217a5c',
          blue: '#3a5f8a',
          purple: '#6a5bb0',
          yellow: '#a07b1f',
          cyan: '#237c78'
        },
        // 数据状态色（四级预警）
        status: {
          ok: '#3d8a70',
          low: '#a98a26',
          over: '#b0652b',
          severe: '#bd5252'
        },
        // 炭灰灰阶
        ink: {
          DEFAULT: '#1d2430',
          soft: '#6b7382',
          muted: '#9aa3b2'
        }
      },
      // ===== 克制弱阴影（shadcn 质感）：近距、淡、小扩散 =====
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.04)',
        card: '0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.05)',
        cardHover: '0 2px 6px rgba(16, 24, 40, 0.08), 0 4px 14px rgba(16, 24, 40, 0.06)',
        inner: 'inset 0 1px 2px rgba(16, 24, 40, 0.04)'
      },
      // ===== 加大圆角（治愈简约） =====
      borderRadius: {
        card: '18px',
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

import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * Vite 构建配置
 * 说明：本项目为「前端 + 轻量 AI 代理」结构。
 *   · 业务数据（食物库 / 知识库 / 记录）仍全部在前端本地，无需后端数据库；
 *   · 唯一的服务端进程 server/ 只做一件事：持有模型 API Key 并转发识别请求，
 *     避免密钥被打包进浏览器产物。前端通过 /api 代理访问它：
 *       开发环境 → `npm run ai:server`（默认 http://localhost:8787）
 *     若未启动代理服务，识别页会自动回退到本地可解释规则引擎，功能不中断。
 */
export default defineConfig({
  // 相对基路径：hash 路由下可安全使用，保证 dist 可通过 HTTP 静态服务部署到任意子目录。
  // 构建入口使用 ES Module，浏览器不支持通过 file:// 可靠运行，请使用 npm run preview 验收。
  base: './',
  plugins: [vue()],
  // 路径别名：@ 指向 src 目录，方便分层引用
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    open: false,
    host: true, // 允许局域网访问，便于答辩时用手机 / 大屏演示
    // 开发期把 /api 转发到本地 AI 代理服务，规避浏览器跨域限制
    proxy: {
      '/api': {
        target: process.env.VITE_AI_PROXY_TARGET || 'http://localhost:8787',
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: process.env.VITE_AI_PROXY_TARGET || 'http://localhost:8787',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500, // ECharts 体积较大，放宽告警阈值
    rollupOptions: {
      output: {
        // 拆分第三方依赖，优化首屏加载
        manualChunks: {
          echarts: ['echarts'],
          vue: ['vue', 'vue-router', 'pinia']
        }
      }
    }
  }
})

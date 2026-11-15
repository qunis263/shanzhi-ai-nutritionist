import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 引入全局样式（Tailwind 指令 + 马卡龙设计系统）
import './styles/style.css'
// 思源黑体（Noto Sans SC）本地自托管：离线可用，100–900 全字重
import '@fontsource-variable/noto-sans-sc'

/**
 * 应用入口
 * 纯前端项目：所有数据均由 Pinia + localStorage 维护，无需后端接口
 */
const app = createApp(App)

app.use(createPinia()) // 状态管理
app.use(router) // 路由

/**
 * 全局错误兜底：捕获未被错误边界拦截的异常（如事件回调、异步钩子），
 * 只做日志上报，避免错误静默丢失，同时不打断用户操作。
 */
app.config.errorHandler = (err, instance, info) => {
  console.error(`[全局错误] ${info}`, err)
}

app.mount('#app')

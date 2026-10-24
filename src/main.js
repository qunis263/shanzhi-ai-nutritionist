import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// 引入全局样式（Tailwind 指令 + 马卡龙设计系统）
import './styles/style.css'

/**
 * 应用入口
 * 纯前端项目：所有数据均由 Pinia + localStorage 维护，无需后端接口
 */
const app = createApp(App)

app.use(createPinia()) // 状态管理
app.use(router) // 路由

app.mount('#app')

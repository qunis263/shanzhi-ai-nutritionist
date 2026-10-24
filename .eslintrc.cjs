/**
 * ESLint 配置（ESLint 8 传统配置，适用于 Vue3 + Vite 项目）
 * ------------------------------------------------------------------
 * 定位：只拦截「真实缺陷」（未使用变量、可疑写法、Vue 模板易错点），
 * 不做风格争执——所有格式问题统一交给 Prettier（见 .prettierrc.json）。
 *
 * `eslint-config-prettier` 放在 extends 末尾，用于关闭与 Prettier 冲突的规则。
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-essential', // 只保留 Vue 的「必要」规则，避免大量风格告警
    'prettier' // 必须放在最后：关闭与 Prettier 冲突的格式规则
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // 未使用变量降为警告，并允许以下划线开头的占位参数
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // 允许空 catch（本项目大量使用「静默降级」）
    'no-empty': ['error', { allowEmptyCatch: true }],
    // 允许 `while (true)` 读取循环（SSE 流解析等场景的标准写法，靠 break 退出）
    'no-constant-condition': ['error', { checkLoops: false }],
    // 单文件组件名不强求多词（本项目的组件名已足够清晰）
    'vue/multi-word-component-names': 'off'
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.min.js']
}

# AI 模型接入说明

> 本文档对应「真实模型接入」的**配置说明**与**调用文档**两部分交付内容。
> 目标是让任何人（含答辩评委、后续维护者）都能在 3 分钟内把项目跑起来、看清调用链路、
> 并在需要时切换模型厂商。

---

## 一、架构总览

### 1.1 为什么要有一个 Node 代理

本项目前端为纯静态 SPA（Vue3 + Vite），业务数据（食物库 915 条 / 营养知识库 / 饮食记录）
全部存放在浏览器本地，**不需要数据库**。

但调用视觉大模型必须携带 **API Key**。如果前端直接请求模型厂商：

- 打包后的 JS 里会残留密钥，任何访客打开开发者工具即可窃取；
- 浏览器直连第三方域名会触发 **CORS 跨域限制**；
- 密钥一旦泄露，账户额度会被盗刷。

因此引入**唯一的**服务端进程 `server/`，它只做一件事：**持有密钥并转发识别请求**。

```
┌─────────────────────────── 浏览器（前端） ───────────────────────────┐
│  上传图片 → visionAdapter 标准化参数 → aiClient 请求 /api/recognize  │
│                                ↓                                     │
│  结果解析 → 绑定 FOOD_DB 条目取营养值 → 交页面渲染                    │
│  云端失败时 → 静默回退本地可解释规则引擎 recognition.js（保证不断线）  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │  Vite 代理 /api → http://localhost:8787
┌──────────────────────────────▼───────────────────────────────────────┐
│  Node 代理 server/（零依赖，仅用 node:http + 全局 fetch）             │
│  env.js 读配置 ┊ validate.js 校验入参 ┊ modelClient.js 调模型         │
│  密钥只在这里读取（process.env.AI_API_KEY），绝不下发浏览器            │
└──────────────────────────────┬───────────────────────────────────────┘
                               │  HTTPS + Bearer Token
                    ┌──────────▼──────────┐
                    │  智谱 GLM-4V 云端   │（OpenAI 兼容端点）
                    └─────────────────────┘
```

### 1.2 三层识别策略（这是本项目的稳定性核心）

| 层级 | 触发条件 | 作用 | 输出特征 |
| --- | --- | --- | --- |
| ☁️ 云端大模型 | 已配置 API Key 且网络正常 | 识别准确，支持真实照片 | `source=cloud` |
| 🧪 Mock 演示 | 未配置 Key / 显式开启 Mock | 断网也能完整演示 | `source=mock` |
| 🔬 本地可解释引擎 | 云端失败（超时/限流/断网/鉴权失败） | **永不掉线** + 讲得清判定依据 | `source=local` |

> 降级是**静默且带提示**的：页面会显示来源徽标与降级原因，评委能一眼看出当前走的是哪一层。
>
> **同一套三层策略也复用于「AI 营养对话助手」**（`POST /api/chat`）：
> ☁️ 云端大模型 **SSE 流式输出** → 🧪 Mock 演示（打字机）→ 🔬 本地营养知识库检索作答，
> 保证对话在断网 / 未配置密钥 / 云端故障时依然可用（详见章节 4.5 与 4.6）。

---

## 二、快速开始

### 2.1 环境要求

- **Node.js >= 18**（`server/` 依赖全局 `fetch` 与 ESM）
- 零额外依赖：`server/` 不引入 express / dotenv / axios，全部用 Node 原生能力实现

### 2.2 启动步骤

```bash
# 1) 安装前端依赖
npm install

# 2) 复制配置模板（Windows PowerShell）
Copy-Item .env.example .env
#    macOS / Linux:  cp .env.example .env

# 3) 在 .env 中填入 AI_API_KEY（不填也能跑，会自动降级为 Mock 模式）

# 4) 启动 AI 代理服务（终端 A，端口 8787）
npm run ai:server

# 5) 启动前端开发服务器（终端 B，端口 5173）
npm run dev
```

浏览器打开 http://localhost:5173，进入「AI 食物识别」页，
页面**左上角会显示 AI 服务状态条**：

- `☁️ 云端模型已就绪：glm-4v-flash` → 正在调用真实模型
- `🧪 当前为 Mock 演示模式：未配置 API Key` → 未配置密钥
- `⚠️ 未连接到 AI 代理服务：请先执行 npm run ai:server` → 忘记启动代理

### 2.3 三种运行模式对照

| 场景 | 需要的配置 | 行为 |
| --- | --- | --- |
| 真实模型 | `.env` 填 `AI_API_KEY`，`AI_MOCK=0` | 请求智谱 GLM-4V，失败自动回退本地引擎 |
| 服务端 Mock | 不填 Key（或 `AI_MOCK=1`） | 代理不请求外网，返回 `server/mock.js` 的确定性响应 |
| 前端纯 Mock | `.env` 增加 `VITE_AI_MOCK=1` 并重启 dev | 前端**完全不发网络请求**，无网络也能答辩 |
| 不启动代理 | 什么都不启动 | 前端请求失败 → 自动回退本地可解释引擎，功能不中断 |

---

## 三、配置说明

所有配置集中在项目根目录的 `.env`（模板见 [.env.example](../.env.example)）。
`.env` 已被 [.gitignore](../.gitignore) 忽略，**不会被提交到仓库**。

### 3.1 服务端变量（仅 Node 进程读取，不会打包进前端）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `AI_API_KEY` | 空 | **密钥**。留空则自动降级为 Mock 模式 |
| `AI_MODEL` | `glm-4v-flash` | 模型名。智谱可选 `glm-4v-flash`（轻量免费）/ `glm-4v` / `glm-4v-plus` |
| `AI_API_BASE` | `https://open.bigmodel.cn/api/paas/v4` | OpenAI 兼容端点前缀 |
| `AI_PROXY_PORT` | `8787` | 代理服务端口 |
| `AI_TIMEOUT_MS` | `20000` | 单次请求超时（毫秒） |
| `AI_MAX_RETRY` | `2` | 可重试错误的最大重试次数（指数退避） |
| `AI_MOCK` | `0` | `1` = 强制 Mock，不请求真实模型 |
| `AI_MAX_IMAGE_BYTES` | `8388608`（8MB） | 单张图片体积上限 |
| `AI_CHAT_MODEL` | `glm-4-flash` | **对话专用文本模型**，与视觉模型分开配置 |
| `AI_CHAT_IDLE_MS` | `20000` | 流式对话的空闲超时：每收到一个数据块重置计时，避免长回答被整体切断 |
| `AI_CHAT_MAX_TURNS` | `12` | 上下文轮数上限（超出只保留最近对话，控制 token 消耗） |
| `AI_CHAT_MAX_CHARS` | `2000` | 单条消息最大字符数（防提示词注入式超长输入） |
| `AI_AGENT` | `1` | `0` = 关闭 AI Agent 工具调用（退化为普通问答） |
| `AI_AGENT_MAX_ROUNDS` | `4` | Agent 工具调用最多轮数（前端循环上限，防止无限调用） |

### 3.2 前端变量（必须以 `VITE_` 开头才会注入浏览器）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_AI_ENDPOINT` | `/api` | 接口前缀，开发环境由 Vite 代理转发 |
| `VITE_AI_TIMEOUT_MS` | `25000` | 前端等待上限，**建议略大于 `AI_TIMEOUT_MS`**，让服务端能先返回自己的错误码 |
| `VITE_AI_MOCK` | `0` | `1` = 前端完全不发请求，用内置 Mock |
| `VITE_AI_PROXY_TARGET` | `http://localhost:8787` | Vite 代理目标，改了 `AI_PROXY_PORT` 记得同步 |

> ⚠️ **安全红线**：`VITE_` 前缀的变量会被打包进浏览器产物，
> **绝对不要**在这里放任何密钥。密钥只能放 `AI_API_KEY`。

---

## 四、调用文档

### 4.1 HTTP 接口（Node 代理对外提供）

#### `GET /api/health` — 健康检查

用于页面初始化时探测「代理是否已启动、当前是云端还是 Mock」。

响应示例：

```json
{
  "ok": true,
  "service": "ai-nutrition-proxy",
  "mode": "cloud",
  "model": "glm-4v-flash",
  "chatModel": "glm-4-flash",
  "apiBase": "https://open.bigmodel.cn/api/paas/v4",
  "apiKeyReady": true,
  "timeoutMs": 20000,
  "chatIdleMs": 20000,
  "maxRetry": 2,
  "features": ["recognize", "chat", "chatStream", "agent"],
  "agent": { "enabled": true, "maxRounds": 4 },
  "mockKeywords": [],
  "mockChatTopics": [],
  "notice": "已配置 API Key，将调用真实模型（失败时前端会自动回退本地引擎）"
}
```

#### `POST /api/recognize` — 食物识别代理

**请求体**（`Content-Type: application/json`）：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `image` | string | 三选一 | 图片 `data:image/...;base64,...` 或 `http(s)://` 地址 |
| `hint` | string | 三选一 | 用户补充线索，截断至 100 字符 |
| `clues` | string[] | 三选一 | 文件名/线索关键词，最多 8 项 |

> 三类依据（`image` / `hint` / `clues`）**至少要有一个**，否则返回 `400`。

**成功响应**（HTTP 200）：

```json
{
  "ok": true,
  "source": "cloud",
  "data": {
    "food": "榴莲",
    "confidence": 0.97,
    "reason": "果肉高饱和金黄、果壳有密集尖刺纹理",
    "alternatives": ["菠萝蜜"]
  },
  "meta": {
    "mode": "cloud",
    "model": "glm-4v-flash",
    "attempts": 1,
    "elapsedMs": 1830,
    "usage": { "prompt_tokens": 1105, "completion_tokens": 62, "total_tokens": 1167 }
  }
}
```

**失败响应**（HTTP 4xx / 502）：

```json
{
  "ok": false,
  "source": "cloud",
  "error": {
    "code": "HTTP_401",
    "status": 401,
    "message": "鉴权失败：API Key 缺失或无效，请检查 .env 中的 AI_API_KEY 是否填写正确",
    "retryable": false,
    "detail": "…厂商原始报文前 300 字符…"
  },
  "meta": { "mode": "cloud", "model": "glm-4v-flash", "attempts": 1, "elapsedMs": 420 }
}
```

#### `POST /api/chat` — AI 营养对话助手代理

支持**流式（SSE）**与**非流式**两种模式，供「AI 营养对话助手」页面使用。

**请求体**（`Content-Type: application/json`）：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `messages` | array | ✅ | 对话消息数组，`role` 为 `system` / `user` / `assistant` / `tool`，**至少一条 `user`** |
| `stream` | boolean | ❌ | 默认 `true` 走 SSE 流式；显式传 `false` 走一次性返回 |
| `tools` | array | ❌ | AI Agent 工具声明（function calling schema），最多 20 个；不传则为普通问答 |

> 校验规则：单条消息截断至 `AI_CHAT_MAX_CHARS`，总轮数裁剪至 `AI_CHAT_MAX_TURNS`（`system` 消息保留），
> 请求体读取上限 256KB，任一不满足返回 `400`。
> Agent 消息约束：`assistant` 允许 `content` 为空但必须带 `tool_calls`；`tool` 消息必须带 `tool_call_id` 与 `content`；
> 轮数裁剪不会留下孤立的 `tool` 消息（否则上游会报错）。

**流式响应**（HTTP 200，`Content-Type: text/event-stream; charset=utf-8`）：

```
data: {"delta":"减脂的核心是"}
                                    ← 每个增量文本一帧，前端增量拼接做打字机效果
: keepalive                         ← 每 8 秒一次心跳（注释帧），防止推理阶段误判超时
data: {"delta":"**热量缺口**…"}
data: {"done":true,"source":"cloud","data":{"reply":"…完整回答…","toolCalls":[]},"meta":{"model":"glm-4-flash","elapsedMs":1830}}
                                    ← 末帧带完整回答与元信息，前端据此校正拼接结果
```

**Agent 工具调用帧**：模型决定调用工具时，`reply` 可能为空，`toolCalls` 为：

```json
[{ "id": "call_xxx", "type": "function", "function": { "name": "read_diet_history", "arguments": "{\"days\":3}" } }]
```

前端执行工具后，把 `assistant`（含 `tool_calls`）与 `tool`（含 `tool_call_id`）消息追加进 `messages`，
再次请求本接口，直到模型返回最终回答。最多 4 轮（`AI_AGENT_MAX_ROUNDS`）。

**非流式响应**（HTTP 200，`application/json`）：

```json
{
  "ok": true,
  "source": "cloud",
  "data": { "reply": "……完整回答文本……", "toolCalls": [] },
  "meta": { "mode": "cloud", "model": "glm-4-flash", "attempts": 1, "elapsedMs": 1830 }
}
```

**说明**：

- 流式模式带**空闲超时**（`AI_CHAT_IDLE_MS`）：每收到一个上游数据块就重置计时，
  只有「连续 20 秒无新数据」才判定超时，避免长回答被整体超时误杀。
- 若在**已收到部分内容**时才中断（超时 / 网络抖动），服务端返回 `ok:true` + `meta.truncated:true`，
  **不丢弃已展示内容**，前端提示「回答不完整」而非整段清空。
- 客户端断开连接（用户点「停止」）时，服务端通过 `res.on('close')` 立即 `abort` 上游请求，不再计费。
- 失败响应结构与 `/api/recognize` 一致（含 `error.code` / `message` / `retryable`），前端据此决定是否回退本地知识库。

#### `OPTIONS *` — 跨域预检

返回 204 + 统一 CORS 头（`Access-Control-Allow-Origin: *`），开发期允许任意来源直连。

> ⚠️ 该代理定位为**本地开发/演示代理**：监听本机回环地址、不对外暴露、不存储任何请求数据，
> 密钥仅存于服务端 `.env`。若将来部署到公网，应把 `Allow-Origin` 收紧为指定域名并加上请求限流。

### 4.2 前端调用 API

前端只需使用**编排层**的一个函数，其余模块均为其内部依赖。

#### `recognizeWithAI(dataUrl, fileName, hint, options)` — 页面唯一入口

文件：[src/utils/aiRecognition.js](../src/utils/aiRecognition.js)

```js
import { recognizeWithAI } from '@/utils/aiRecognition'

const result = await recognizeWithAI(previewUrl, fileName, hint)
// result.found          → 命中的 FOOD_DB 条目（含完整营养值）
// result.confidence     → 0–1
// result.source         → 'cloud' | 'mock' | 'local'
// result.reasons        → 判定依据文本数组（可解释性）
// result.candidates     → 候选排名 [{ food, score, fromModel }]
// result.unmatchedName  → 模型识别出但本地库无此条目时的原始名称（此时禁止写入记录）
```

内部链路：`buildRequestPayload`（标准化）→ `requestRecognition`（云端）→
`parseModelResponse`（解析）→ `resolveFood`（绑定营养条目）→ `toRecognitionResult`（结构映射）。
**任一步骤失败都会回退本地引擎**，返回结构与本地引擎完全一致，页面消费逻辑零改动。

#### `probeAIService(options)` — 服务状态探测

返回 `{ ok, mode, model, notice }` 或 `{ ok:false, error }`，供页面状态条使用。

### 4.3 模型侧请求格式（OpenAI 兼容）

由 [server/modelClient.js](../server/modelClient.js) 的 `buildRequestBody` 构造：

```json
{
  "model": "glm-4v-flash",
  "messages": [
    { "role": "system", "content": "你是专业的食物图像识别与营养分析助手…（约束只输出 JSON）" },
    {
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,…" } },
        { "type": "text", "text": "请识别这张图片中的食物。\n补充线索：榴莲" }
      ]
    }
  ],
  "temperature": 0.1,
  "stream": false
}
```

**认证机制**：请求头携带 `Authorization: Bearer <AI_API_KEY>`。

**输出解析**：`extractStructuredContent` 兼容三种常见返回——
纯 JSON、```json 代码围栏、夹带说明文字；无法解析时退化为宽松文本解析，
并对 `confidence` 做归一化（`95 → 0.95`、越界值钳制到 `[0,1]`）。

### 4.4 切换模型厂商

只要厂商提供 OpenAI 兼容端点，**改两行环境变量即可，无需改代码**：

```dotenv
# 通义千问（视觉）
AI_API_BASE=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-vl-max

# 豆包（视觉）
AI_API_BASE=https://ark.cn-beijing.volces.com/api/v3
AI_MODEL=doubao-1.5-vision-pro

# OpenAI
AI_API_BASE=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

> 对话模型（`AI_CHAT_MODEL`）同理：只要厂商有 OpenAI 兼容的文本模型，改这一行即可
> （如 `glm-4-flash` → `qwen-turbo` / `doubao-1.5-lite`）。

### 4.5 对话助手前端编排层

文件：[src/utils/aiChat.ts](../src/utils/aiChat.ts)（页面唯一入口，页面不直接发请求）

```js
import { askNutritionAI, retrieveKnowledge, buildContextText, SUGGESTED_QUESTIONS } from '@/utils/aiChat'

const res = await askNutritionAI({
  question: '减脂期蛋白质每天要吃多少克？',
  history,                 // 历史对话 [{role, content}]
  context: {               // 个性化上下文（从 userStore / dietStore 取）
    profile, metrics, summary, targets, report, water, records
  },
  onDelta: (chunk) => { /* 打字机：把增量文本追加到气泡 */ },
  signal                   // AbortSignal，用户点「停止」时取消
})
// res.ok        → 是否成功（本地兜底也算成功，保证不断线）
// res.text      → 完整回答文本
// res.source    → 'cloud' | 'mock' | 'local'
// res.refs      → RAG 命中的本地知识条目（页面「参考资料」区展示，供用户核对）
// res.toolCalls → 本次回答执行过的工具轨迹 [{name, label, summary, ok}]
// res.truncated → 回答是否被截断
// res.error     → 失败时的 { code, message }
```

辅助导出：

| 导出 | 作用 |
| --- | --- |
| `retrieveKnowledge(question, limit)` | 本地知识库关键词召回 Top-N（标签命中权重 6 / 标题 5 / 正文 1，中文做 2 字与 3 字滑窗切分） |
| `buildContextText(input)` | 把身体指标 + 今日饮食汇总成 system prompt 片段，并返回结构化 `facts` 供 UI 展示「模型看到的你」 |
| `localAnswer(question)` | 纯本地知识库作答；**未命中时不编造**，如实说明并引导换问法 |
| `knowledgeSize()` | 知识库规模（食物条目数 + 知识文档数） |
| `SUGGESTED_QUESTIONS` | 9 条首屏推荐问题（个性化 / Agent / 减脂 / 增肌 / 控糖 / 习惯 / 实操 / 搭配） |

### 4.6 对话助手的三个设计要点

1. **个性化上下文注入**（区别于通用问答的关键差异）
   每次提问都把用户的 BMI / BMR / TDEE / 推荐热量 / 饮食模式，以及今日已摄入营养、
   健康评分、饮水与已记录食物，拼进 system prompt。模型因此能回答
   「**根据我今天的饮食，我还能吃多少**」这类必须结合个人数据的问题，而不是泛泛而谈。

2. **RAG 检索增强（回答有据可依）**
   提问时先从本地知识库（科普文章 / 食物相克 / 健康习惯 / 915 条食物营养数据）召回最相关的 Top-4，
   作为「参考资料」注入提示词，并**同时展示给用户核对**——延续识别页「可解释 AI」的叙事。

3. **营养数据不臆造**
   与识别页同一红线：模型给出的食物名必须能绑定本地 `FOOD_DB` 才输出营养值；
   纯问答场景下若本地无依据，宁可如实说「知识库未覆盖」，也不推测。

### 4.7 AI Agent（规划 + 执行 + 工具调用）

文件：[src/utils/aiTools.ts](../src/utils/aiTools.ts)

**为什么工具在前端执行**：工具所需的数据源都在浏览器端——饮食记录与饮水在 Pinia `dietStore`，
身体档案在 `userStore`，食物营养库是前端 `FOOD_DB`（915 条）。服务端拿不到这些数据，
因此采用「**前端 Plan-and-Execute 编排 + 服务端只做模型调用**」。复杂任务与简单任务分流：

- 复杂任务（规划、复盘、综合分析、跨天数据与膳食安排）先生成 2–5 步结构化计划；
- 简单任务继续使用反应式 Function Calling，避免不必要的规划延迟。

```
① 复杂任务判定 → 模型输出结构化行动计划（只允许白名单工具，最多 5 步）
② 前端校验计划和参数 → 按步骤读取 dietStore / userStore / FOOD_DB
③ 每一步实时更新 pending / running / completed / failed 状态
④ 工具失败 → 最多一次受控重规划，历史不足时改用今日真实数据并说明局限
⑤ 执行结果作为事实上下文交给模型做最终校验和回答
⑥ 简单问题仍走原有 tool_calls 循环；最多 4 轮，超限则关闭工具强制作答
```

| 工具 | 作用 | 数据源 |
| --- | --- | --- |
| `read_today_summary` | 今日营养合计 / 目标 / 饮水 / 评分 / 超标与偏少项 | `dietStore.summary/targets/report` |
| `read_diet_history` | 最近 1–7 天饮食记录与每日汇总 | `dietStore.historyDays` |
| `read_user_profile` | 档案 + BMI / BMR / TDEE / 推荐摄入 | `userStore.profile/metrics` |
| `search_food_nutrition` | 食物营养库模糊检索（名称 / 别名 / 标签） | `FOOD_DB` + `searchFood()` |
| `get_meal_plan` | 今日膳食推荐与运动方案 | `dietStore.mealPlan` |
| `add_diet_record` | **写入型**：把「早餐 · 牛奶 250ml」这类记录写入今日饮食（默认不写，需用户在界面确认） | `dietStore.addRecord()` |

安全边界：
- 5 个查询工具**只读**，模型可以自由调用；
- 唯一写入工具 `add_diet_record` **不会直接落库**——它只生成一条 `pending` 记录，页面渲染成确认卡片，
  用户点「✅ 确认记录」才调用 `confirmAddDietRecord()` 真正写入；点「✖️ 取消」则丢弃。
  这样即使模型被提示词注入诱导、或参数识别有误，也不会污染用户的真实饮食数据。
- 刷新页面后未确认的卡片自动失效（持久化时按白名单序列化，丢弃 `pending`），不会出现可点击的悬空按钮。

页面会把每一次调用实时渲染成轨迹 chip（🛠️ 运行中 → ✅ 完成 + 结果摘要 / ⏳ 待确认），
让「模型查了哪些真实数据、要写什么」对用户与评委全程可见。

复杂任务还会展示独立的「Agent 执行计划」面板。该面板只展示目标、行动步骤、工具结果摘要与调整原因，
不展示模型隐藏思维过程；计划最多 5 步、最多重规划 1 次，避免无限循环和不可控消耗。

兼容性：若模型不支持 `tools` 而返回 400，服务端自动去掉 tools 重试一次并提示已降级为普通对话。

---

## 五、稳定性机制

### 5.1 超时

| 位置 | 机制 | 默认值 |
| --- | --- | --- |
| 服务端 | `AbortController` 单次请求超时，超时主动中断 | `AI_TIMEOUT_MS=20000` |
| 服务端（对话） | SSE 空闲超时：每收到上游数据块就重新计时 | `AI_CHAT_IDLE_MS=20000` |
| 前端 | 空闲超时 + 支持外部 `signal` 联动取消；收到任意字节（含服务端心跳）即重新计时 | `VITE_AI_TIMEOUT_MS=25000` |

对话模式额外有两层保护：服务端每 8 秒发送一次 SSE 心跳（`: keepalive`），
避免模型推理阶段长时间无文本分片时被误判为超时；前端把心跳也视为连接活跃。
Agent 多轮工具调用因此不会被「整体超时」误中断。

前端超时**故意大于**服务端超时，这样正常情况下服务端会先返回它自己的错误码，
前端拿到的是「有语义的错误」而不是笼统的「超时」。

### 5.2 重试（指数退避）

- **可重试**：`429`（限流）、`500/502/503/504`（服务端故障）、
  网络抖动码 `ECONNRESET / ETIMEDOUT / EAI_AGAIN / UND_ERR_CONNECT_TIMEOUT`
- **不重试**：`400/401/403/404/413/422` 等「重试也没用」的错误，避免无谓等待
- **退避序列**：`800ms → 1600ms → 3200ms`，重试上限由 `AI_MAX_RETRY`（默认 2）控制

### 5.3 错误码映射

服务端 [modelClient.js](../server/modelClient.js) 的 `mapError`：

| 状态码 | 中文提示 |
| --- | --- |
| 400 | 请求参数有误：图片格式或消息体不符合模型要求 |
| 401 | 鉴权失败：API Key 缺失或无效，请检查 .env 中的 AI_API_KEY |
| 403 | 权限不足：API Key 已过期或未开通该模型的调用权限 |
| 404 | 接口或模型不存在：请检查 AI_API_BASE 与 AI_MODEL 配置 |
| 408 | 模型服务响应超时 |
| 413 | 图片体积过大 |
| 422 | 请求内容无法处理 |
| 429 | 调用频率超限或账户额度不足 |
| 500 / 502 / 503 / 504 | 模型服务内部错误 / 网关错误 / 暂时不可用 / 网关超时 |

网络层：`ECONNREFUSED`（无法连接）、`ENOTFOUND`（域名解析失败）、`ABORT_ERR`（已超时中断）等。

前端 [src/utils/aiClient.ts](../src/utils/aiClient.ts) 再做一层兜底映射
（`TIMEOUT` / `NETWORK` / `ABORT` 等浏览器侧错误），并区分「自身超时」与「用户主动取消」。

### 5.4 入参防御

[server/validate.js](../server/validate.js) 在进模型前校验：

- 图片只接受 `data:image/...;base64,` 或 `http(s)://`（防止把本地文件路径透传给模型）
- 体积超 `AI_MAX_IMAGE_BYTES` → `413`
- `hint` 截断 100 字符、`clues` 截断 8 项（防止提示词注入式超长输入）
- 请求体读取带体积上限，超限立即中断（防止超大请求打满内存）

---

## 六、自校验与验证

### 6.1 服务端自校验（不联网、不起服务）

```bash
npm run ai:verify
```

覆盖 12 组纯函数环节共 **99 项断言**：环境变量解析与配置读取、错误码映射、
模型输出解析（纯 JSON / 代码围栏 / 夹带文字 / 百分数 / 越界 / 空 / 非法）、
请求体构造、Mock 确定性与命中、入参校验，以及**对话模块**（chat 请求体构造、
对话内容归一化、对话入参校验、对话 Mock 与调用链路、未配置 Key 时的降级行为）。
**当前结果：83/83 通过。**

### 6.2 HTTP 端到端校验

启动 `npm run ai:server` 后以真实 HTTP 请求验证识别链路 **25 项**：
健康检查、正常识别、仅线索识别、参数校验（空体/非 JSON/超长）、
404、`OPTIONS` 预检、Mock 响应确定性复核。**当前结果：25/25 通过。**

### 6.3 对话链路端到端校验

对 `POST /api/chat` 分别验证流式与非流式：

| 用例 | 结果 |
| --- | --- |
| 非流式（`stream:false`）正常作答 | `200`，`source=mock`，回复约 190 字 |
| 流式（`stream:true`）SSE | `200`，`Content-Type: text/event-stream; charset=utf-8`，37 个 `delta` 帧 |
| 流式增量拼接 vs 完整回复一致性 | **完全一致** |
| 参数校验：空请求体 `{}` | `400` |
| 参数校验：无 `user` 消息 | `400` |

**当前结果：全部通过。**

### 6.4 前端接入层校验

对 `visionAdapter` / `aiClient` / `aiRecognition` 做两模式断言：

| 模式 | 断言数 | 覆盖内容 |
| --- | --- | --- |
| Mock（`VITE_AI_MOCK=1`） | 29 项 | 参数标准化、响应解析、条目绑定、结构兼容、断网可用 |
| 云端（真实模式） | 53 项 | 上述全部 + 云端成功、Mock 透传、网络不可达、401、429、非 JSON 信封、模型未识别、结果不在库、健康检查提示 |

**当前结果：29/29 与 53/53 全部通过。**

### 6.5 构建自校验

```bash
npm run build
```

**当前结果：`✓ built in 6.68s`，625 modules transformed，10 个页面全部产出独立 chunk（对话页 `NutritionChatView` 21.16 kB / gzip 9.53 kB），无语法错误、无构建警告。**

### 6.6 代码质量校验

```bash
npm run lint
```

ESLint（`eslint:recommended` + `plugin:vue/vue3-essential` + `eslint-config-prettier`）扫描 `src` 与 `server` 全部 `.js` / `.vue`。
**当前结果：0 error、0 warning。** 格式统一由 Prettier 约束（配置见 [.prettierrc.json](../.prettierrc.json)，`npm run format` 一键格式化）。

---

## 七、常见问题排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 页面提示「未连接到 AI 代理服务」 | 代理未启动 | 执行 `npm run ai:server` |
| 状态条显示「Mock 演示模式」 | `.env` 未填 `AI_API_KEY` | 填写密钥后重启代理 |
| 状态条显示「鉴权失败 401」 | 密钥错误或过期 | 到智谱控制台重新生成并更新 `.env` |
| 状态条显示「接口或模型不存在 404」 | 模型名拼错 | 核对 `AI_MODEL`（如 `glm-4v-flash`）拼写 |
| 频繁「调用频率超限 429」 | 免费额度限流 | 稍后重试，或升级模型额度 |
| 识别结果与图片不符 | 模型判断有误 | 在「线索补充」里填写关键词，或在结果区查看本地引擎的候选排名交叉验证 |
| 结果显示「本地食物库暂无该条目」 | 模型识别出的食物不在库内 | 到「饮食记录」页手动搜索添加（系统**不臆造营养值**） |

---

## 八、如实说明的边界（重要）

为避免答辩误解，这里明确本项目的**能力边界**：

1. **本项目没有训练流程，也不产出训练准确率。**
   模型能力来自**调用准入的成熟云端视觉大模型**（智谱 GLM-4V）；项目自身不含
   数据集标注、模型训练与调参环节，因此**不宣称**「识别准确率 99%/95%」这类指标。

2. **本地可解释引擎是规则引擎，不是神经网络。**
   [src/utils/recognition.js](../src/utils/recognition.js) 基于 Canvas 像素采样做
   色彩/纹理特征规则匹配，定位是「**云端兜底 + 可解释性素材**」，
   用于保证演示不中断，并输出「判定依据 + 候选排名」供交叉验证。

3. **营养数据不臆造。**
   模型给出的食物名必须能绑定到本地 `FOOD_DB` 条目才输出营养值；
   绑定失败时明确提示并**禁止写入记录**，避免产生虚假营养数据。

4. **本项目的差异化卖点应表述为「可解释 AI + 永不掉线的三层降级架构」**，
   而非「自研识别模型」。

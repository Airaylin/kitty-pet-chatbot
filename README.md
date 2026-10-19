# 🎀 KITTY PET · 像素风 Hello Kitty AI 对话机器人

一台 **Hello Kitty 外形的电子宠物机**（Tamagotchi 风格）。
开机先**挑性格、给宠物起名字**，然后这只由 `mimo-v2.6-pro` 驱动的
AI 就会以设定好的人格，用宠物的身份跟你聊天。

```
        /\      /\
       /🎀\    /   \        ← 像素耳朵 + 蝴蝶结
      /____\  /_____\
     │  ●  ●          │     ← Kitty 脸
     │      ▬         │
     │ ┌────────────┐ │
     │ │  KITTY PET │ │     ← LCD 屏幕：对话区
     │ │  > input_  │ │
     │ └────────────┘ │
     │   (A) (B) (C)  │     ← 硬件按键
     └────────────────┘
```

---

## 🎮 宠物初始化流程

```
  开机 ──▶ ① 选择性格 ──▶ ② 起名字 ──▶ ③ 开始聊天
            │                │             │
        温柔 暴躁 犀利     [小棉花]     AI 以该人格
        呆萌 话痨 高冷      START ▶     扮演宠物对话
```

六种性格各有独立的语气设定，会真实影响模型回复：

| 性格 | 口头禅 / 表现 |
|---|---|
| 🌸 温柔 | 「呀」「呢」，软绵绵地安慰人 |
| 🔥 暴躁 | 「哼！」「笨蛋主人」，嘴硬心软 |
| ⚡ 犀利 | 「说重点」，一针见血、毒舌但精准 |
| 🐣 呆萌 | 「诶？」「嘿嘿」，颜文字 + 自嘲 |
| 💬 话痨 | 「还有还有！」，停不下来地分享 |
| 🌙 高冷 | 「哦。」「……」，惜字如金、傲娇 |

> 选择会存在浏览器 `localStorage`，下次打开直接进聊天。
> 想换一只？点左下角 **♻ 更换宠物** 重新开始。

---

## ✨ 特性

| 模块 | 说明 |
|---|---|
| 🐣 开机初始化 | 选性格 → 起名字 → 进入聊天，全程在电子宠物机屏内完成 |
| 🎭 角色扮演 | 6 套人格预设，system prompt 由后端按 `pet_name` + `personality` 动态生成 |
| 🎨 前端 | 纯 HTML / CSS / JS，像素风 Hello Kitty 机身，无框架 |
| 🌈 界面 | 电子宠物机形态：LCD 屏、扫描线、硬件按键、像素云朵背景 |
| 🌙 主题 | 日间（粉彩）/ 夜间（霓虹）双主题切换 |
| 🔌 通信 | **axios** 对接后端，XHR 适配器实现真正的流式打字机效果 |
| 📝 渲染 | marked + DOMPurify 渲染 Markdown，防 XSS |
| 🗂 会话 | 多会话存档、自动命名、侧边「卡带」管理 |
| ⚡ 后端 | FastAPI + `uv` 管理，SSE 流式输出 |
| 🤖 模型 | `mimo-v2.6-pro` @ `api.xiaomimimo.com` |
| 🧪 联调测试 | `tools/e2e.mjs` 用 CDP 驱动真实浏览器走完整链路 |

---

## 🚀 快速开始

### 前置要求

- **Python 3.11+**（推荐 3.12）
- **[uv](https://docs.astral.sh/uv/)** —— Python 项目管理

```bash
# 安装 uv（Windows PowerShell）
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# macOS / Linux
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 一键启动

**Windows**

```bat
start.bat
```

**macOS / Linux**

```bash
chmod +x start.sh && ./start.sh
```

**手动启动**

```bash
cd backend
uv sync                                   # 安装依赖
uv run uvicorn app.main:app --reload      # 启动后端
```

然后打开浏览器访问：**http://127.0.0.1:8000**

> 后端同时托管前端静态文件，无需再起第二个服务。

---

## ⚙️ 配置

密钥与模型参数都在 `backend/.env`（已 gitignore，不会被提交）：

```ini
# 大模型接入
API_KEY=sk-xxxxxxxxxxxxxxxx
API_BASE_URL=https://api.xiaomimimo.com/v1
MODEL_NAME=mimo-v2.6-pro

# 生成参数
TEMPERATURE=0.7
MAX_TOKENS=2048

# 服务
HOST=127.0.0.1
PORT=8000

# 人设
SYSTEM_PROMPT=你是一个乐于助人、专业友好的中文 AI 助手。
```

> ⚠️ **切勿把真实 API_KEY 提交到仓库。** 若密钥已泄露，请立刻到服务商控制台吊销重发。

---

## 📁 项目结构

```
cc/
├── backend/                    # FastAPI 后端（uv 管理）
│   ├── app/
│   │   ├── main.py             # 路由 / 会话 / 静态托管
│   │   ├── personalities.py    # 🆕 6 种性格预设 + system prompt 生成
│   │   ├── config.py           # pydantic-settings 读 .env
│   │   ├── llm.py              # 调用 OpenAI 兼容接口（含 SSE 流式）
│   │   └── schemas.py          # 请求 / 响应模型（含 pet_name / personality）
│   ├── pyproject.toml
│   ├── .python-version
│   ├── .env                    # ← 你的密钥（不入库）
│   └── .env.example            # 配置模板
│
├── frontend/                   # 原生前端（无构建）
│   ├── index.html              # Hello Kitty 电子宠物机外壳 + 初始化屏
│   ├── css/styles.css          # 像素风全量样式（含性格卡片 / 起名界面）
│   └── js/
│       ├── api.js              # axios 封装（REST + SSE 流式）
│       └── app.js              # 初始化流程 / 交互 / Markdown / 主题
│
├── tools/
│   └── e2e.mjs                 # 🆕 端到端联调脚本（CDP 驱动真实浏览器）
│
├── start.bat                   # Windows 一键启动
├── start.sh                    # macOS / Linux 一键启动
└── README.md
```

---

## 🔌 API 文档

启动后访问交互式文档：

- Swagger UI → <http://127.0.0.1:8000/docs>
- ReDoc → <http://127.0.0.1:8000/redoc>

### 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 健康检查 / 模型信息 |
| `GET` | `/api/personalities` | **可选性格列表** |
| `GET` | `/api/sessions` | 会话列表 |
| `POST` | `/api/sessions` | 新建会话 |
| `GET` | `/api/sessions/{id}/messages` | 会话历史 |
| `DELETE` | `/api/sessions/{id}` | 删除单个会话 |
| `DELETE` | `/api/sessions` | 清空所有会话 |
| `POST` | `/api/chat` | 非流式对话 |
| `POST` | `/api/chat/stream` | **流式对话（SSE）** |

### 调用示例

```bash
# 带宠物人设对话
curl -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
        "message": "你好呀，你是谁？",
        "history": [],
        "pet_name": "小煤球",
        "personality": "tsundere"
      }'
```

返回示例：

```json
{
  "reply": "哼！才想起来问我是谁吗？我是小煤球啦！……",
  "session_id": "…",
  "model": "mimo-v2.6-pro",
  "pet_name": "小煤球",
  "personality": "tsundere",
  "usage": { "total_tokens": 395 }
}
```

`personality` 取值：`gentle` / `tsundere` / `sharp` / `derpy` / `chatty` / `aloof`

流式响应（`POST /api/chat/stream`）事件格式：

```
event: meta
data: {"session_id": "…", "model": "mimo-v2.6-pro"}

event: delta
data: {"text": "你好"}

event: done
data: {"session_id": "…", "usage": null}
```

---

## 🎮 操作说明

| 按键 | 功能 |
|---|---|
| 点击性格卡片 | 选中并进入起名步骤 |
| `Enter`（起名框） | 确认名字，进入聊天 |
| `A` / `Enter` | 发送消息 |
| `B` | 开新对话 |
| `C` / `Esc` | 中断当前回复 |
| `Shift + Enter` | 换行 |
| 点击左侧存档 | 载入历史会话 |
| `♻ 更换宠物` | 重新选性格、起名字 |
| `◐ 主题` | 日间 / 夜间切换 |

---

## 🧪 联调测试

`tools/e2e.mjs` 会启动真实 Chrome，走完 **选性格 → 起名字 → 发消息 → 收 AI 回复**
的完整链路，并逐帧截图到 `.shots/`。

```bash
# 先启动后端
cd backend && uv run uvicorn app.main:app --port 8000

# 另开一个终端跑测试
node tools/e2e.mjs
```

测试会校验：

- 性格卡片数量与点击交互
- 已选性格徽章、欢迎语、机身铭牌是否更新
- 请求是否真的带上 `pet_name` / `personality`
- AI 回复是否体现人设
- **流式是否增量增长**（而非一次性到达）
- 回复文本**是否被重复派发**

---

## 🛠 常见问题

**1. 启动后一直转圈 / 提示未配置 API_KEY**
检查 `backend/.env` 里的 `API_KEY` 是否填写，改完重启服务。

**2. CORS 报错**
本项目后端已放行所有来源（本地开发用）。上线前请在 `app/main.py` 的
`allow_origins` 里改成你的前端域名。

**3. 中文字体不像像素字**
`Press Start 2P` 只覆盖拉丁字符，中文会回退到系统字体。
若想要完整像素中文字体，可自行引入 Zpix / Fusion Pixel 并在
`css/styles.css` 的 `--font-pixel` 中追加。

**4. 会话重启后丢失**
会话保存在内存中，仅用于演示。生产环境请替换为 Redis / SQLite
（见 `app/main.py` 中 `SessionStore` 注释）。

---

## 📄 License

MIT

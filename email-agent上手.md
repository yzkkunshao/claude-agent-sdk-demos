# Email Agent 项目上手指南

## 一、Agent 是什么？有什么用？

这是一个由 **Anthropic 官方** 出品的 Demo 应用——基于 **Claude Agent SDK** 构建的 **AI 邮件助手**。它不是一个简单的邮件客户端，而是一个能**理解你的邮件、主动响应邮件事件、执行自定义工作流**的智能代理。

### 核心价值

- **对话式邮件管理**：用自然语言搜索、分析邮件，而不是手动翻找
- **自动化事件响应**：新邮件到达时自动触发自定义逻辑（监听器）
- **一键执行操作**：将常用工作流封装为可点击的 Action 按钮
- **持久化 UI 组件**：邮件数据可视化（任务看板、财务面板等）

---

## 二、功能全景

| 功能 | 说明 | 例子 |
|---|---|---|
| **邮件搜索** | 通过对话用 Gmail 语法搜索邮件 | "找老板发的所有紧急邮件" |
| **邮件阅读** | 点击 [email:ID] 链接查看详情 | 聊天中点击即可查看 |
| **Listeners（监听器）** | 新邮件到达时自动执行脚本 | 自动归档新闻邮件、老板紧急邮件通知 |
| **Actions（动作）** | 一键执行预定义操作 | "给 ACME 公司发催款提醒"、"转发 bug 报告给工程团队" |
| **UI State（UI 状态）** | 持久化数据 + 可视化组件 | 任务看板、财务面板 |
| **邮件同步** | IMAP IDLE 实时监控 + 手动同步 | 新邮件自动入库 |
| **AI 子代理** | Action/Listener 内可调用 Claude | 智能分类邮件、提取会议信息 |

---

## 三、如何使用

### 1. 安装运行

```bash
# 安装依赖
bun install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 IMAP 凭据和 ANTHROPIC_API_KEY

# 启动服务
bun run dev
```

浏览器打开 `http://localhost:3000`，你会看到：

```
┌─────────────────────────────────┬──────────────┐
│                                 │              │
│    Inbox 邮件列表 / 看板视图     │  AI 对话窗口  │
│                                 │              │
│    (Tab 切换: Inbox / Tasks /   │  与 Claude   │
│     Financial Dashboard)        │  聊天搜索邮件 │
│                                 │              │
└─────────────────────────────────┴──────────────┘
```

### 2. 日常使用场景

**场景 A：搜索邮件**
> 在右侧聊天框输入："找最近7天所有带附件的未读邮件"

**场景 B：创建监听器**
> "帮我监听老板的紧急邮件，收到时立刻通知我"
> → Agent 自动生成 `boss-urgent-watcher.ts`，之后每封新邮件都会触发检查

**场景 C：创建一键操作**
> "我经常给 ACME 公司发催款邮件"
> → Agent 创建 `send-payment-reminder-to-acme.ts`，之后聊天中会显示可点击的 Action 按钮

**场景 D：数据可视化**
> "帮我建一个任务看板来追踪邮件里的待办"
> → Agent 创建 UI State + Action，左侧出现 "Task Board" Tab

---

## 四、架构详解：功能是怎么实现的

### 整体架构图

```
┌────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                        │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ InboxView│  │ ChatInterface│  │ TaskBoard / FinDashboard │ │
│  │ 邮件列表  │  │ AI 对话窗口   │  │ 自定义组件 (UI State)    │ │
│  └────┬─────┘  └──────┬───────┘  └───────────┬─────────────┘ │
│       └────────────────┼──────────────────────┘               │
│                  WebSocket (ws://localhost:3000/ws)             │
└────────────────────────┬───────────────────────────────────────┘
                         │
┌────────────────────────┼───────────────────────────────────────┐
│                   Backend (Bun)                                │
│                                                                │
│  ┌─────────────────────▼──────────────────────────┐           │
│  │            WebSocketHandler                     │           │
│  │  · 路由消息 (chat/subscribe/execute_action)    │           │
│  │  · 广播 inbox_update / ui_state_update         │           │
│  │  · 创建 ActionContext                          │           │
│  └──────┬──────────┬──────────┬───────────────────┘           │
│         │          │          │                                │
│  ┌──────▼───┐ ┌────▼────┐ ┌──▼──────────────┐               │
│  │ Session  │ │ Actions │ │ UIStateManager   │               │
│  │ 会话管理  │ │ Manager │ │ 状态模板 + DB    │               │
│  │ 多轮对话  │ │ 动作管理 │ │ 热加载 + 实时推送 │               │
│  └──────┬───┘ └────┬────┘ └──┬──────────────┘               │
│         │          │         │                                │
│  ┌──────▼──────────▼─────────▼──────────────┐               │
│  │              AIClient                     │               │
│  │  · 封装 Claude Agent SDK query()          │               │
│  │  · 流式输出 → WebSocket 广播              │               │
│  │  · 自定义 MCP Server (email tools)        │               │
│  │  · Hooks: 限制脚本写入 custom_scripts/    │               │
│  └──────────────────────────────────────────┘               │
│                                                                │
│  ┌──────────────────────────────────────────┐                 │
│  │          ListenersManager                │                 │
│  │  · 加载 agent/custom_scripts/listeners/  │                 │
│  │  · 事件分发: email_received → handlers   │                 │
│  │  · 热加载 + 文件监控                      │                 │
│  └──────────────────────────────────────────┘                 │
│                                                                │
│  ┌──────────────────────────────────────────┐                 │
│  │     EmailSyncService + ImapManager       │                 │
│  │  · IMAP 连接 + IDLE 实时监控             │                 │
│  │  · 邮件同步 → SQLite 数据库              │                 │
│  │  · 同步后触发 ListenersManager           │                 │
│  └──────────────────────────────────────────┘                 │
│                                                                │
│  ┌──────────────────────────────────────────┐                 │
│  │          SQLite Database                 │                 │
│  │  · emails / recipients / attachments     │                 │
│  │  · ui_states / sync_metadata             │                 │
│  └──────────────────────────────────────────┘                 │
└────────────────────────────────────────────────────────────────┘
```

### 关键流程详解

#### 1. AI 对话流程（核心）

```
用户输入 → WebSocket {type:"chat", content:"找所有发票邮件"}
  → Session.addUserMessage()
    → AIClient.queryStream()
      → Claude Agent SDK query() 流式调用
        → Claude 决定调用 MCP tool: search_inbox
          → custom-tools.ts → EmailAPI → HTTP /api/emails/search
            → ImapManager.searchEmails() (IMAP 搜索)
          → 返回搜索结果给 Claude
        → Claude 生成回复（含 [email:ID] 引用）
      → 流式 SDKMessage → Session.broadcastToSubscribers()
        → WebSocket {type:"assistant_message"} → 前端渲染
```

**关键设计**：
- `AIClient` 使用 **Claude Agent SDK** 的 `query()` 函数，而非直接调 Anthropic API
- Agent 的 `cwd` 设为 `agent/` 目录，所以 Claude 可以读写 `custom_scripts/`
- 通过 **Hooks** 限制 Claude 只能往 `custom_scripts/` 写 `.ts/.js` 文件（安全沙箱）
- 通过 **MCP Server** 暴露 `search_inbox` 和 `read_emails` 两个工具
- 支持 **多轮对话**：`sdkSessionId` 记录会话，后续消息用 `resume` 参数续接

#### 2. 监听器（Listeners）流程

```
新邮件到达 → IMAP IDLE 事件
  → ImapManager.onNewEmailCallback()
    → EmailSyncService.handleIdleNewEmails()
      → syncEmails() → 存入 SQLite
        → listenersManager.checkEvent('email_received', email)
          → 遍历所有 enabled 的 listeners
            → 匹配 event === 'email_received'
              → 执行 handler(email, context)
                → context.notify() / context.starEmail() / context.callAgent()...
```

**现有 Listener 示例**：
- `todo-extractor.ts` - 从邮件中提取待办事项
- `finance-email-tracker.ts` - 追踪财务邮件
- `finance-email-labeler.ts` - 给财务邮件打标签

#### 3. 动作（Actions）流程

```
Claude 对话中发现用户需求 → Claude 调用 action-creator Skill
  → 生成 .ts 文件到 agent/custom_scripts/actions/
  → ActionsManager 热加载新模板

下次对话中:
  Claude 识别用户意图 → 创建 ActionInstance（填充参数）
  → 前端渲染为一键按钮
  → 用户点击 → WebSocket {type:"execute_action"}
    → WebSocketHandler.createActionContext()
    → ActionsManager.executeAction(instanceId, context)
      → template.handler(params, context)
        → context.sendEmail() / context.uiState.set()...
```

**现有 Action 示例**：
- `create-task.ts` - 创建任务到看板
- `add-expense.ts` / `add-income.ts` - 记录收支到财务面板
- `forward-bugs-to-engineering.ts` - 转发 bug 报告

#### 4. UI State + Component 流程

```
Action/Listener 修改状态:
  context.uiState.set('task_board', newTasks)
    → UIStateManager.setState()
      → SQLite 持久化 + JSONL 日志
      → notifyStateUpdate() → WebSocketHandler.broadcastUIStateUpdate()
        → 前端收到 {type:"ui_state_update", stateId, data}
          → React 组件重新渲染
```

**现有 UI 组件**：
- `task-board.ts` → `TaskBoardView` - 任务看板
- `financial-dashboard.ts` → `FinancialDashboardView` - 财务面板

### 目录结构总结

```
email-agent/
├── agent/                          # Claude Agent 的工作目录
│   ├── .claude/
│   │   ├── agents/inbox-searcher.md  # 子代理定义
│   │   └── skills/                   # Agent Skills
│   │       ├── action-creator/       # 创建 Action 的技能
│   │       └── listener-creator/     # 创建 Listener 的技能
│   ├── custom_scripts/              # ★ 用户自定义脚本（Agent 生成）
│   │   ├── actions/                 # 一键操作模板
│   │   ├── listeners/               # 事件监听脚本
│   │   ├── ui-states/               # UI 状态模板
│   │   └── types.ts                 # 共享类型定义
│   ├── email-api.ts                 # Agent 使用的邮件 API 客户端
│   └── CLAUDE.MD                    # Agent 行为指南
│
├── ccsdk/                           # ★ 核心框架层
│   ├── ai-client.ts                 # 封装 Claude Agent SDK
│   ├── session.ts                   # 会话管理 + 流式广播
│   ├── custom-tools.ts              # MCP Server (search_inbox, read_emails)
│   ├── email-agent-prompt.ts        # Agent 系统提示词
│   ├── websocket-handler.ts         # WebSocket 路由 + ActionContext
│   ├── actions-manager.ts           # Action 模板/实例管理
│   ├── listeners-manager.ts         # Listener 加载/事件分发
│   ├── ui-state-manager.ts          # UI 状态持久化 + 推送
│   ├── component-manager.ts         # 组件实例管理
│   └── message-queue.ts             # 消息队列
│
├── database/                        # ★ 数据层
│   ├── imap-manager.ts              # IMAP 连接/搜索/IDLE/操作
│   ├── email-sync.ts                # 邮件同步 + Listener 触发
│   ├── email-search.ts              # IMAP 搜索封装
│   ├── email-db.ts                  # SQLite 邮件 CRUD
│   ├── database-manager.ts          # DB 管理器 (含 ui_states 表)
│   ├── config.ts                    # 数据库路径配置
│   └── schema.sql                   # 表结构
│
├── server/                          # HTTP 服务
│   ├── server.ts                    # Bun 服务器 (WebSocket + REST API)
│   └── endpoints/                   # REST 端点实现
│
└── client/                          # React 前端
    ├── App.tsx                      # 主布局
    ├── components/                  # UI 组件
    │   ├── ChatInterface.tsx        # 对话界面
    │   ├── InboxView.tsx            # 邮件列表
    │   ├── views/                   # 视图组件
    │   └── custom/                  # 自定义组件注册
    ├── hooks/                       # React Hooks
    ├── store/                       # Jotai 状态管理
    └── context/                     # React Context
```

### 三大扩展机制对比

| | Listeners | Actions | UI State |
|---|---|---|---|
| **触发方式** | 事件驱动（自动） | 用户点击（手动） | 代码调用 |
| **存放目录** | `custom_scripts/listeners/` | `custom_scripts/actions/` | `custom_scripts/ui-states/` |
| **创建方式** | Agent 通过 listener-creator Skill | Agent 通过 action-creator Skill | Agent 写文件 |
| **生命周期** | 持续运行，监听事件 | 一次性执行 | 持久化在 SQLite |
| **典型场景** | 新邮件通知、自动归档 | 发催款邮件、转发 bug | 任务看板、财务面板 |

---

### 总结三点

1. **核心架构**：`Claude Agent SDK` 是大脑，通过 `query()` 流式调用驱动一切；`MCP Server` 提供邮件工具；`Hooks` 沙箱化脚本写入——Agent 在对话中动态生成 Listener/Action/UI State，无需改代码即可扩展能力
2. **数据流**：IMAP → SQLite → WebSocket → React，每个环节都有实时推送能力（IDLE 监控、事件分发、状态广播），确保 UI 始终最新
3. **扩展模式**：用户只需对 Agent 说需求（如"帮我监控老板紧急邮件"），Agent 就会自动创建对应的 `.ts` 脚本，`ListenersManager`/`ActionsManager` 热加载后立即生效——这是这个项目最有设计感的地方

---


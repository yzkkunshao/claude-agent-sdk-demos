# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime

必须使用 Bun（不是 Node）。所有命令：`bun run dev/build/test`。

## 常用命令

```bash
bun install              # 安装依赖
bun run dev              # 启动服务 (端口 3000, WebSocket /ws)
bun run build            # 构建前端 (client/index.tsx → dist/)
bun run test             # Jest + ts-jest，测试环境: node
bun run test:watch       # 测试 watch 模式
bun run test:coverage    # 测试覆盖率报告
bun run test -- --testPathPattern="filename"  # 运行单个测试文件
bun run knip             # 依赖/导出检查（未使用代码检测）
```

## 环境变量

复制 `.env.example` 到 `.env`，需要配置：
- `IMAP_HOST` / `IMAP_PORT` — IMAP 服务器地址
- `EMAIL_ADDRESS` — 邮箱地址
- `EMAIL_APP_PASSWORD` — 应用专用密码（Gmail 需开启 2FA 后生成）
- `ANTHROPIC_API_KEY` — Anthropic API 密钥

## 架构概览

```
Frontend (React + Jotai + Tailwind)
    ↕ WebSocket (ws://localhost:3000/ws)
Backend (Bun HTTP + WebSocket + REST API)
    ├── ccsdk/      核心框架层
    ├── database/   数据层 (SQLite + IMAP)
    └── agent/      Claude Agent SDK 工作目录
```

### 核心框架层 `ccsdk/`

| 文件 | 职责 |
|---|---|
| `ai-client.ts` | 封装 Claude Agent SDK `query()`，Agent cwd 设为 `agent/` |
| `session.ts` | 多轮会话管理，通过 `sdkSessionId` + `resume` 续接对话 |
| `custom-tools.ts` | MCP Server，暴露 `search_inbox` 和 `read_emails` 两个工具 |
| `websocket-handler.ts` | WebSocket 消息路由 (chat/subscribe/execute_action)，创建 ActionContext |
| `actions-manager.ts` | Action 模板加载、实例管理、热加载 |
| `listeners-manager.ts` | Listener 加载、事件分发、文件监控 |
| `ui-state-manager.ts` | UI 状态模板管理、SQLite 持久化、实时推送 |
| `component-manager.ts` | 自定义 UI 组件注册和管理 |

### AI 对话流程

```
用户输入 → WebSocket {type:"chat"}
  → Session.addUserMessage() → AIClient.queryStream()
    → Claude Agent SDK query() 流式调用
      → Claude 调用 MCP tool (search_inbox / read_emails)
        → custom-tools.ts → EmailAPI → HTTP /api/emails/search
          → ImapManager.searchEmails() (IMAP 搜索)
      → Claude 生成回复（含 [email:ID] 引用）
    → 流式 SDKMessage → Session.broadcastToSubscribers()
      → WebSocket → 前端渲染
```

关键设计：
- Agent 通过 Hooks 沙箱限制，只能往 `custom_scripts/` 写 `.ts/.js` 文件
- 子代理定义在 `agent/.claude/agents/`（目前仅 `inbox-searcher`）
- Agent Skills 在 `agent/.claude/skills/`（`action-creator`、`listener-creator`）

### 数据层 `database/`

- `schema.sql` — 表结构：emails、recipients、attachments、contacts，FTS5 全文搜索
- `imap-manager.ts` — IMAP 连接、搜索、IDLE 实时监控
- `email-sync.ts` — 邮件同步 + 同步后触发 ListenersManager
- `email-search.ts` — IMAP 搜索封装（支持 Gmail 语法）
- `database-manager.ts` — DB 管理器，含 ui_states 表操作

### 三大扩展机制

| | Listeners（监听器） | Actions（动作） | UI State（UI 状态） |
|---|---|---|---|
| **触发方式** | 事件驱动（新邮件到达自动触发） | 用户在聊天中点击按钮 | 代码调用 `context.uiState.set()` |
| **存放目录** | `agent/custom_scripts/listeners/` | `agent/custom_scripts/actions/` | `agent/custom_scripts/ui-states/` |
| **创建方式** | Agent 通过 listener-creator Skill | Agent 通过 action-creator Skill | Agent 写文件 |
| **生命周期** | 持续运行，监听事件 | 一次性执行 | 持久化在 SQLite |
| **热加载** | 文件监控自动重载 | ActionsManager 自动发现 | UIStateManager 自动发现 |

Listeners 事件类型：`email_received`、`email_sent`、`email_starred` 等。
Action 执行时通过 `ActionContext` 提供能力：`sendEmail()`、`uiState.set()`、`notify()` 等。

### 前端 `client/`

- React + Jotai 状态管理 + Tailwind CSS
- `ChatInterface.tsx` — AI 对话界面
- `InboxView.tsx` — 邮件列表
- `components/views/` — 视图组件（TaskBoard、FinancialDashboard 等自定义组件）
- `components/custom/` — 自定义组件自动注册
- 通过 WebSocket 实时接收 assistant_message、inbox_update、ui_state_update

### 服务端 `server/`

- `server.ts` — Bun HTTP 服务器，初始化所有 Manager，启动 WebSocket + REST API
- `endpoints/` — REST 端点：sync、emails（inbox/search/batch）、listeners、ui-states

### 子代理 `agent/.claude/agents/`

- `inbox-searcher.md` — 邮件搜索子代理，使用假设驱动搜索策略，输出 `[email:ID]` 格式的可点击引用

### Agent 自身指令

- `agent/CLAUDE.MD` — Agent 行为指南，指导 Agent 选择正确的子代理和输出格式
- `agent/custom_scripts/types.ts` — Actions/Listeners/UI States 共享类型定义

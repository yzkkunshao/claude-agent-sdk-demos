# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-08T14:05:37Z
**Commit:** 645449c
**Branch:** main

## OVERVIEW

Claude Agent SDK 驱动的 AI 邮件助手 — Bun HTTP + WebSocket 后端，React + Jotai + Tailwind 前端，SQLite + IMAP 数据层。Agent 通过 MCP tools 搜索/读取邮件，可自动创建 Listeners（事件驱动）和 Actions（用户点击执行）。

## STRUCTURE

```
email-agent/
├── ccsdk/          # 核心框架层（AI client, session, WebSocket, managers）
├── database/       # 数据层（SQLite schema, IMAP, 搜索, 同步）
├── server/         # Bun HTTP 服务器 + REST endpoints
├── client/         # React 前端（Jotai 状态管理, Tailwind CSS）
│   ├── components/ # UI 组件（ChatInterface, InboxView, Actions 等）
│   ├── hooks/      # 自定义 hooks（useWebSocket, useUIState 等）
│   ├── store/      # Jotai atoms
│   └── context/    # React Context（ScreenshotMode）
├── agent/          # Claude Agent SDK 工作目录（cwd for query()）
│   ├── .claude/    # Agent 配置（agents/, skills/）
│   ├── custom_scripts/  # Agent 生成的扩展脚本
│   │   ├── actions/     # Action 模板（用户点击触发）
│   │   ├── listeners/   # Listener 脚本（事件驱动）
│   │   ├── ui-states/   # UI 状态定义（SQLite 持久化）
│   │   ├── components/  # 自定义 UI 组件（空）
│   │   └── types.ts     # 共享类型定义（Actions/Listeners/UI States/Components）
│   ├── email-api.ts     # Agent 侧邮件 API（HTTP → 后端 REST）
│   └── CLAUDE.MD        # Agent 行为指南
├── docs/           # 文档（含嵌套 obsidian-notes 仓库，非项目代码）
├── dist/           # 前端构建产物
└── server.ts       # (package.json 入口) → server/server.ts
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 启动服务器 | `server/server.ts` | `bun run dev`，端口 3000 |
| AI 对话入口 | `ccsdk/ai-client.ts` | 封装 Agent SDK `query()`，cwd=`agent/` |
| WebSocket 路由 | `ccsdk/websocket-handler.ts` | chat/subscribe/execute_action 消息类型 |
| MCP Tools | `ccsdk/custom-tools.ts` | `search_inbox`, `read_emails` |
| 会话管理 | `ccsdk/session.ts` | 多轮对话，sdkSessionId + resume |
| Action 模板 | `agent/custom_scripts/actions/` | Agent 通过 action-creator Skill 创建 |
| Listener 脚本 | `agent/custom_scripts/listeners/` | Agent 通过 listener-creator Skill 创建 |
| UI 状态 | `agent/custom_scripts/ui-states/` | 持久化到 SQLite，WebSocket 实时推送 |
| 数据库 schema | `database/schema.sql` | emails, recipients, attachments, FTS5 |
| IMAP 操作 | `database/imap-manager.ts` | 连接、搜索、IDLE 实时监控 |
| REST endpoints | `server/endpoints/` | sync, emails, listeners, ui-states |
| 前端对话界面 | `client/components/ChatInterface.tsx` | 主 UI |
| 共享类型 | `agent/custom_scripts/types.ts` | ActionContext, ListenerContext 等 |
| Agent 子代理 | `agent/.claude/agents/inbox-searcher.md` | 假设驱动搜索策略 |
| Agent Skills | `agent/.claude/skills/` | action-creator, listener-creator |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| AIClient | class | ccsdk/ai-client.ts | Claude Agent SDK 封装 |
| Session | class | ccsdk/session.ts | 多轮会话管理 |
| WebSocketHandler | class | ccsdk/websocket-handler.ts | WS 消息路由 + ActionContext 创建 |
| ActionsManager | class | ccsdk/actions-manager.ts | Action 模板加载/执行/热加载 |
| ListenersManager | class | ccsdk/listeners-manager.ts | Listener 加载/事件分发/文件监控 |
| UIStateManager | class | ccsdk/ui-state-manager.ts | UI 状态模板/SQLite 持久化/推送 |
| ComponentManager | class | ccsdk/component-manager.ts | 自定义 UI 组件注册 |
| DatabaseManager | class | database/database-manager.ts | SQLite 管理器（singleton） |
| EmailDatabase | class | database/email-db.ts | 邮件 CRUD + FTS5 全文搜索 |
| EmailSearcher | class | database/email-search.ts | IMAP 搜索封装 |
| ImapManager | class | database/imap-manager.ts | IMAP 连接 + IDLE 监控 |

## CONVENTIONS

- **Runtime**: 必须用 Bun（非 Node）。所有命令 `bun run dev/build/test`
- **模块系统**: tsconfig 配置 CommonJS，但 Bun 原生支持 ESM
- **文件命名**: kebab-case (`actions-manager.ts`)
- **类命名**: PascalCase；方法/函数 camelCase
- **数据库列名**: snake_case（`message_id`）→ TypeScript 属性 camelCase（`messageId`），通过 `mapRowToEmailRecord()` 转换
- **SQL 参数**: `$paramName` 命名参数（better-sqlite3 风格）
- **单例模式**: DatabaseManager, ImapManager 使用 `getInstance()`
- **热加载**: 动态 `import(`${filePath}?t=${Date.now()}`)` + `fs.watch()`
- **注释**: 中英文混用（项目所有者用中文）
- **测试**: Jest + ts-jest 配置在 package.json，testEnvironment: node，但**零测试文件**
- **Lint/Format**: 无 ESLint、无 Prettier、无 .editorconfig

## ANTI-PATTERNS (THIS PROJECT)

- **死代码**: `ai-client.ts` 的 `querySingle()` 方法（标注 "死代码"）；`websocket-handler.ts` 的 `newConversation` 分支
- **ActionContext 桩方法**: `searchEmails()`, `searchWithGmailQuery()`, `addLabel()`, `removeLabel()`, `sendEmail()`, `addUserMessage()`, `addAssistantMessage()`, `addSystemMessage()` 均只 console.log 或返回空数组
- **12 个 TODO**: 集中在 `websocket-handler.ts`（9个）和 `actions-manager.ts`（1个）
- **不要新增 TODO 桩方法** — 要么完整实现，要么抛出 `throw new Error("Not implemented")`

## UNIQUE STYLES

- **Agent 作为代码生成器**: Claude Agent 通过 Skills（action-creator, listener-creator）动态生成 `.ts` 文件到 `agent/custom_scripts/`
- **双前端服务模式**: 生产用 Bun.serve 动态转译 TSX/CSS；开发可用 Vite dev server（`bun run dev:client`）
- **MCP Tool → HTTP 回环**: Agent MCP tools 调用 `agent/email-api.ts`，后者 HTTP 请求回后端 REST API
- **三大扩展机制**: Listeners（事件驱动）+ Actions（用户点击）+ UI State（持久化状态），统一类型定义在 `types.ts`
- **邮件引用格式**: `[email:MESSAGE_ID]` 可在前端点击
- **shadcn/ui 风格主题**: Tailwind CSS 变量系统，语义色彩（primary, destructive, muted 等）

## COMMANDS

```bash
bun run dev              # 启动服务 (端口 3000, WebSocket /ws)
bun run dev:client       # Vite 前端 dev server (端口 5173, proxy → 3000)
bun run build            # 构建前端 (client/index.tsx → dist/)
bun run test             # Jest + ts-jest（零测试文件，会直接通过）
bun run test:watch       # 测试 watch 模式
bun run test:coverage    # 覆盖率报告
bun run test -- --testPathPattern="filename"  # 单文件测试
bun run knip             # 依赖/导出检查
```

## NOTES

- `package.json` 包名 `"emailoauth"` 是早期遗留，实际项目名 email-agent
- `"main": "index.js"` 不存在，实际入口 `server/server.ts`
- 7 个 release 脚本引用不存在的 `release.js` / `generate-changelog.js`
- 同时存在 `bun.lock` 和 `package-lock.json`，应只用 `bun.lock`
- `tailwind.config.js` 是 v3 风格但项目用 Tailwind v4
- `requirements.txt` 是 Python 遗留，项目中无 Python 代码
- `.env.example` 变量名与 README 不一致（ADDRESS/APP_PASSWORD vs USER/PASSWORD）
- `docs/obsidian-notes/` 是嵌套的独立 git 仓库，不属于项目
- `server/server.ts` 30+ 路由内联在 fetch handler 中，未使用路由器
- 路由顺序敏感: listener logs endpoint 必须在 listener details 之前（`server.ts` L252）

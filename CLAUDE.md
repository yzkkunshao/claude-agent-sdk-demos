# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Anthropic 官方的 Claude Agent SDK 示例合集（monorepo），每个 demo 独立目录、独立依赖。所有 demo 都依赖 `@anthropic-ai/claude-agent-sdk`，需要 `ANTTHROPIC_API_KEY` 环境变量。

## Demo 启动命令速查

| Demo | Runtime | 启动命令 | 说明 |
|---|---|---|---|
| email-agent | Bun | `cd email-agent && bun install && bun run dev` | IMAP 邮件助手，端口 3000 |
| hello-world | Node | `cd hello-world && npm install && npx tsx hello-world.ts` | 入门示例 |
| hello-world-v2 | Node | `cd hello-world-v2 && npm install && npx tsx v2-examples.ts <command>` | V2 Session API 示例（basic/multi-turn/one-shot/resume） |
| excel-demo | Node+Electron | `cd excel-demo && npm install && npm start` | Electron 桌面应用 |
| research-agent | Python | `cd research-agent && pip install` | 多代理研究系统 |
| simple-chatapp | Node | `cd simple-chatapp && npm install && npm run dev` | React+Express 聊天应用，后端 3001、前端 5173 |
| resume-generator | Node | `cd resume-generator && npm install && npm start "姓名"` | 简历生成器 |
| ask-user-question-previews | Node | `cd ask-user-question-previews && npm install && npm run dev` | HTML 预览卡片 demo |

## Email-Agent 架构要点（最复杂的 demo）

- **Runtime**: 必须使用 Bun（`bun run dev/build/test`）
- **测试**: `bun run test`（Jest + ts-jest），`bun run test:watch`
- **依赖检查**: `bun run knip`
- **Agent 工作目录**: `agent/`，SDK 的 `query()` 以此为 cwd 运行
- **子代理定义**: `agent/.claude/agents/`
- **Agent Skills**: `agent/.claude/skills/`（action-creator、listener-creator）
- **自定义脚本**: `agent/custom_scripts/`（actions/、listeners/、ui-states/）
- **核心框架层**: `ccsdk/`（ai-client.ts、session.ts、websocket-handler.ts、custom-tools.ts 等）
- **数据层**: `database/`（SQLite + IMAP），schema 在 `schema.sql`
- **前端**: `client/`（React + Jotai + Tailwind）
- **服务端**: `server/server.ts`（Bun HTTP + WebSocket + REST API）

### Email-Agent 三大扩展机制

- **Listeners**（事件驱动）: `custom_scripts/listeners/`，新邮件到达时自动触发
- **Actions**（用户点击）: `custom_scripts/actions/`，Agent 通过 action-creator Skill 生成，前端渲染为按钮
- **UI State**（持久化状态）: `custom_scripts/ui-states/`，数据存 SQLite，通过 WebSocket 实时推送

### Email-Agent 关键依赖

- `@anthropic-ai/claude-agent-sdk` — Agent SDK 核心
- `node-imap` + `mailparser` — IMAP 邮件操作
- `better-sqlite3` — SQLite 数据库
- `react` + `jotai` — 前端状态管理

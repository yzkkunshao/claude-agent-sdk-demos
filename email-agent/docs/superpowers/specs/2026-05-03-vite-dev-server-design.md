# Vite 开发服务器集成设计

## Context

email-agent 的前端（React + Jotai + Tailwind CSS 4）目前由 Bun server 即时转译 TSX 并通过 PostCSS 处理 CSS，没有 HMR（热更新）。前端代码修改后需要手动刷新浏览器，开发体验较差。本设计引入 Vite 作为独立的前端开发服务器，通过代理模式与 Bun 后端协作。

## 方案：Vite 代理模式

### 架构

```
开发时（两个进程并行）:

  浏览器 → Vite dev server (localhost:5173)
              ├── 前端资源 → React Fast Refresh HMR
              ├── /ws      → 代理到 ws://localhost:3000
              └── /api/**  → 代理到 http://localhost:3000

  Bun server (localhost:3000)
              ├── REST API 端点
              ├── WebSocket /ws
              └── IMAP/数据库服务
```

### 新建文件

#### `client/vite.config.ts`

Vite 配置文件，核心内容：

- `root`: 指向 `client/` 目录（配置文件自身所在目录）
- `plugins`:
  - `react()` — `@vitejs/plugin-react`，启用 Fast Refresh
  - `tailwindcss()` — `@tailwindcss/vite`，Tailwind CSS 4 原生 Vite 插件
- `server.proxy`:
  - `/ws`: `{ target: 'ws://localhost:3000', ws: true }` — WebSocket 代理
  - `/api`: `{ target: 'http://localhost:3000' }` — REST API 代理

### 修改文件

#### `client/index.html`

- `<link>` CSS 路径从 `/client/globals.css` 改为 `./globals.css`（Vite 相对路径）
- `<script>` src 从 `/client/index.tsx` 改为 `./index.tsx`（Vite 相对路径）
- 添加 `<script type="module">` 的 Vite 客户端注入点（Vite 自动处理）

#### `client/index.tsx`

- 添加 React Fast Refresh 声明：在文件顶部添加 `// @ts-nocheck` 或确保 Fast Refresh 正常工作（`@vitejs/plugin-react` 自动处理，无需手动改动）

#### `package.json`

- `devDependencies` 添加：
  - `vite`
  - `@vitejs/plugin-react`
  - `@tailwindcss/vite`
- `scripts` 添加：
  - `"dev:client": "cd client && npx vite"` 或 `"dev:client": "vite --config client/vite.config.ts"`

### 不改动

- Bun server（`server/server.ts`）的静态文件服务、API 端点、WebSocket 逻辑保持不变
- 数据层、ccsdk 框架层、Agent 相关代码不动
- 原有 `bun run dev`（启动 Bun server）和 `bun run build`（生产构建）命令不受影响

### 开发工作流

```bash
# 终端 1: 启动后端
bun run dev

# 终端 2: 启动前端 Vite
bun run dev:client

# 浏览器访问 http://localhost:5173
```

### 验证方式

1. 启动 Bun server（`bun run dev`）
2. 启动 Vite（`bun run dev:client`）
3. 浏览器打开 `http://localhost:5173`，确认页面正常加载
4. 修改 `client/` 下任意 React 组件，确认 HMR 生效（无需刷新）
5. 确认 WebSocket 连接正常（聊天功能可用）
6. 确认 API 代理正常（邮件列表、搜索等功能可用）
7. 确认 Tailwind CSS 样式正确渲染

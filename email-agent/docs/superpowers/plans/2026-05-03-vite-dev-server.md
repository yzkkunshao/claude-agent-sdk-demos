# Vite 开发服务器集成 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 email-agent 的 React 前端添加 Vite 开发服务器，实现 HMR 热更新，通过代理模式与 Bun 后端协作。

**Architecture:** Vite 在 5173 端口提供前端开发服务（React Fast Refresh + Tailwind CSS 4），`/ws` 和 `/api` 请求代理到 Bun 后端 3000 端口。两个进程并行运行，互不干扰。

**Tech Stack:** Vite 6, @vitejs/plugin-react, @tailwindcss/vite, Bun

---

### Task 1: 安装 Vite 相关依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 devDependencies**

Run:
```bash
cd "/Users/yuzekun/iCloud云盘（归档）/Documents/claude-agent-sdk-demos/email-agent"
bun add -d vite @vitejs/plugin-react @tailwindcss/vite
```

Expected: 三个包安装成功，`package.json` 的 `devDependencies` 中出现 `vite`、`@vitejs/plugin-react`、`@tailwindcss/vite`。

- [ ] **Step 2: 添加 `dev:client` script**

在 `package.json` 的 `scripts` 中，在 `"dev"` 行之后添加：

```json
"dev:client": "vite --config client/vite.config.ts",
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "feat: add vite and related devDependencies for frontend HMR"
```

---

### Task 2: 创建 Vite 配置文件

**Files:**
- Create: `client/vite.config.ts`

- [ ] **Step 1: 创建 `client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
      },
    },
  },
});
```

说明：
- `root: __dirname` 确保 Vite 以 `client/` 为根目录（因为配置文件在 `client/` 内）
- `@tailwindcss/vite` 是 Tailwind CSS 4 的原生 Vite 插件，会自动处理 `@import "tailwindcss"`
- 代理配置将 `/ws` 和 `/api` 转发到 Bun 后端

- [ ] **Step 2: Commit**

```bash
git add client/vite.config.ts
git commit -m "feat: add vite config with React plugin, Tailwind CSS 4, and backend proxy"
```

---

### Task 3: 修改 index.html 适配 Vite

**Files:**
- Modify: `client/index.html`

当前内容：
```html
<link rel="stylesheet" href="/client/globals.css">
...
<script type="module" src="/client/index.tsx"></script>
```

- [ ] **Step 1: 修改资源路径为 Vite 相对路径**

将 `client/index.html` 改为：

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Inbox</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
</body>
</html>
```

关键改动：
- **删除** `<link rel="stylesheet" href="/client/globals.css">` — Tailwind CSS 4 通过 Vite 插件自动注入，`index.tsx` 中 import CSS 即可
- `<script>` src 从 `/client/index.tsx` 改为 `/index.tsx` — Vite 以 `client/` 为 root，`/` 对应 `client/`

- [ ] **Step 2: 在 index.tsx 中导入 CSS**

在 `client/index.tsx` 顶部添加 Tailwind CSS 导入。修改后的完整文件：

```tsx
import './globals.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(<App />);
```

- [ ] **Step 3: Commit**

```bash
git add client/index.html client/index.tsx
git commit -m "feat: adapt index.html and index.tsx for Vite dev server"
```

---

### Task 4: 修改 WebSocket URL 为相对路径

**Files:**
- Modify: `client/App.tsx:33`

当前代码中 WebSocket URL 是硬编码的：
```tsx
url: 'ws://localhost:3000/ws',
```

在 Vite 代理模式下，前端请求发到 5173，由 Vite 代理转发。如果直连 3000 则绕过了 Vite。

- [ ] **Step 1: 将 WebSocket URL 改为动态检测**

修改 `client/App.tsx` 中 `useWebSocket` 调用的 `url` 参数（约第 33 行）：

```tsx
const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
```

然后在 `useWebSocket` 调用中使用：

```tsx
const { isConnected, sendMessage, ws } = useWebSocket({
  url: wsUrl,
  onMessage: (message) => {
```

说明：
- 开发时（Vite 5173）: `ws://localhost:5173/ws` → Vite 代理 → `ws://localhost:3000/ws`
- 生产时（Bun 3000）: `ws://localhost:3000/ws` → 直连 Bun WebSocket
- HTTPS 环境自动使用 `wss://`

- [ ] **Step 2: Commit**

```bash
git add client/App.tsx
git commit -m "feat: use dynamic WebSocket URL for Vite proxy compatibility"
```

---

### Task 5: 端到端验证

无需提交，纯手动验证步骤。

- [ ] **Step 1: 启动后端**

```bash
cd "/Users/yuzekun/iCloud云盘（归档）/Documents/claude-agent-sdk-demos/email-agent"
bun run dev
```

Expected: `Server running at http://localhost:3000`

- [ ] **Step 2: 新终端启动 Vite**

```bash
cd "/Users/yuzekun/iCloud云盘（归档）/Documents/claude-agent-sdk-demos/email-agent"
bun run dev:client
```

Expected: `Local: http://localhost:5173/`

- [ ] **Step 3: 浏览器验证**

1. 打开 `http://localhost:5173`，确认页面正常渲染（Tailwind 样式、布局正确）
2. 修改 `client/App.tsx` 中任意文本（如 tab 名称），保存后确认 HMR 生效（浏览器自动更新，无需手动刷新）
3. 打开浏览器 DevTools → Network → WS，确认 WebSocket 连接成功（状态 101）
4. 测试聊天功能（如果配置了 API key 和 IMAP）

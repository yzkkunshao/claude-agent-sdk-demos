

## User

项目中是怎么把claude stdout数据流转为UI画面的?

---

## Assistant

我检测到**研究/解释**意图——用户想要理解 Claude 输出数据到 UI 渲染的完整流转链路。我的方法是：读取关键文件 → 追踪数据流 → 解释。



## Claude stdout → UI 画面的完整数据流

项目中有**两条并行的数据管道**，一条管"聊天消息"，一条管"UI 状态"。

### 一、聊天消息管道（主流程）

```
用户输入
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  ① 前端 App.tsx                                                   │
│  sendMessage({ type:'chat', content, sessionId })                  │
│  → WebSocket → ws://localhost:3000/ws                             │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  ② WebSocketHandler.onMessage()                                   │
│  解析 { type:'chat' } → getOrCreateSession() → session.subscribe(ws)│
│  → session.addUserMessage(content)                                │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  ③ Session.addUserMessage()                                       │
│  首次对话：直接调用                                                │
│  后续对话：{ resume: sdkSessionId } 续接                           │
│  → this.aiClient.queryStream(content, options)                    │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  ④ AIClient.queryStream()                                         │
│  for await (const message of query({ prompt, options }))          │
│  │                                                                 │
│  │  Claude Agent SDK 的 query() 返回 AsyncIterable<SDKMessage>     │
│  │  SDK 内部流程：                                                  │
│  │    Claude API → 生成文本/tool_use → 调用 MCP tool               │
│  │    → MCP Server (custom-tools.ts) → EmailAPI → IMAP            │
│  │    → tool_result → Claude 继续 → 最终回复                       │
│  │                                                                 │
│  │  yield message  (逐条产出 SDKMessage)                           │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼  每个 SDKMessage 立即流式产出
┌──────────────────────────────────────────────────────────────────┐
│  ⑤ Session.broadcastToSubscribers(message)                        │
│  将 SDKMessage 转译为前端友好的 WebSocket 消息格式：                │
│                                                                    │
│  SDKMessage.type        →  WS消息type        →  含义               │
│  ─────────────────────────────────────────────────────────         │
│  "assistant" + string   →  assistant_message   →  文本回复          │
│  "assistant" + text     →  assistant_message   →  文本块            │
│  "assistant" + tool_use →  tool_use           →  工具调用          │
│  "assistant" + tool_result → tool_result      →  工具结果          │
│  "result" (success)     →  result             →  对话结束(成功)     │
│  "result" (error)       →  result             →  对话结束(失败)     │
│  "system"               →  system             →  系统事件          │
│  "user"                 →  user_message        →  用户消息回显      │
│                                                                    │
│  → this.broadcast(wsMessage)                                       │
│    → 遍历 subscribers → client.send(JSON.stringify(wsMessage))     │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼  WebSocket 帧
┌──────────────────────────────────────────────────────────────────┐
│  ⑥ 前端 useWebSocket hook                                         │
│  ws.onmessage → JSON.parse(event.data) → onMessage?.(message)     │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  ⑦ App.tsx onMessage 回调                                         │
│  switch(message.type) 按类型拆分处理：                              │
│                                                                    │
│  'assistant_message' → 构造 AssistantMessage 对象                   │
│    { type:'assistant', content:[{ type:'text', text }] }           │
│    → setMessages(prev => [...prev, assistantMsg])                  │
│                                                                    │
│  'tool_use' → 构造 ToolUse 消息                                    │
│    { type:'assistant', content:[{ type:'tool_use', name, input }] }│
│    → setMessages(prev => [...prev, toolMsg])                       │
│                                                                    │
│  'result' → setIsLoading(false)                                    │
│  'error'  → 构造错误消息 → setMessages                             │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  ⑧ ChatInterface 渲染                                             │
│  messages.map(msg → <MessageRenderer message={msg} />)            │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  ⑨ MessageRenderer → 按消息类型分发                                │
│  message.type === 'user'      → <UserMessage>                     │
│  message.type === 'system'    → <SystemMessage>                   │
│  message.type === 'assistant' → <AssistantMessage>                │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  ⑩ AssistantMessage 渲染                                          │
│  遍历 message.content 数组，按 block.type 分发：                    │
│                                                                    │
│  block.type === 'text'                                             │
│    → <TextComponent>                                               │
│    → processContent() 解析 [email:ID] 和 [listener:ID] 引用       │
│    → 常规文本用 ReactMarkdown + remarkGfm 渲染                     │
│    → [email:ID]  → <EmailDisplay emailId={id} />                  │
│    → [listener:ID] → <ListenerDisplay listenerId={id} />          │
│                                                                    │
│  block.type === 'tool_use'                                         │
│    → <ToolUseComponent>                                            │
│    → 按 toolName 分发：Read/Write/Edit/Bash/Grep/Glob/...         │
│    → 每种工具各有专属的参数展示 UI                                   │
│    → 默认 fallback → JSON.stringify(input)                         │
│                                                                    │
│  message.actions  → <ActionButton> 渲染可点击按钮                  │
│  message.components → <ComponentRenderer> 渲染自定义组件           │
└──────────────────────────────────────────────────────────────────┘
```

### 二、UI 状态管道（独立于聊天）

```
Agent 写文件到 custom_scripts/ui-states/
  或 Action 执行时调用 context.uiState.set(stateId, data)
  │
  ▼
┌──────────────────────────────────────────────────────────────────┐
│  UIStateManager.setState()                                        │
│  1. db.setUIState(stateId, data)  → SQLite 持久化                 │
│  2. logStateUpdate()              → JSONL 审计日志                │
│  3. notifyStateUpdate(stateId, data)                              │
│     → 遍历 updateCallbacks → callback(stateId, data)              │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼  callback 注册于 WebSocketHandler.initUIStateWatcher()
┌──────────────────────────────────────────────────────────────────┐
│  WebSocketHandler.broadcastUIStateUpdate(stateId, data)           │
│  → JSON.stringify({ type:'ui_state_update', stateId, data })      │
│  → 遍历所有 clients → client.send(message)                        │
└──────────────────────────────────────────────────────────────────┘
  │
  ▼  WebSocket
┌──────────────────────────────────────────────────────────────────┐
│  前端 ComponentRenderer / TaskBoardView / FinancialDashboardView  │
│  监听 ui_state_update → 用 Jotai atom 或 useState 更新视图       │
└──────────────────────────────────────────────────────────────────┘
```

### 三、关键转换点总结

| 转换点 | 位置 | 输入格式 | 输出格式 |
|---|---|---|---|
| SDK → Session | `session.ts:88-169` | `SDKMessage`（SDK 原始类型） | 扁平化 WS JSON（`assistant_message` / `tool_use` / `result`） |
| WS → React State | `App.tsx:34-89` | WS JSON 消息 | `Message[]`（前端类型 `TextBlock | ToolUseBlock`） |
| State → JSX | `AssistantMessage.tsx` | `Message.content[]` blocks | `<TextComponent>` / `<ToolUseComponent>` / `<ActionButton>` |
| 文本 → 富渲染 | `TextComponent` | `string`（含 `[email:ID]` 引用） | `ReactMarkdown` + `<EmailDisplay>` 嵌入组件 |

### 四、两个值得注意的设计

- **内容块逐条广播**：`session.ts:100-130` 中，当 `message.message.content` 是数组时（Claude 返回多个 block），每个 block 单独广播一次。前端每次收到都 append 一条新 message，而非合并到同一条。这导致 Claude 的一次回复在前端会拆成多条独立气泡（文本一条、tool_use 一条、文本又一条……），而非一个气泡内多 block。

- **UI 状态和聊天消息是两条独立的推送管道**：UI 状态通过 `UIStateManager → WebSocketHandler.broadcastUIStateUpdate` 推送，不经过 `Session`。这意味着 Action 执行后产生的 UI 变化（如 dashboard 数据更新）和 Claude 的文本回复可以并行到达前端，互不阻塞。

---


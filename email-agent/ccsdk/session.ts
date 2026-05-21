import { Database } from "bun:sqlite";
import * as path from "path";
import type { WSClient, SDKMessage } from "./types";
import { AIClient } from "./ai-client";
import type { ActionsManager } from "./actions-manager";
import type { ActionInstance } from "../agent/custom_scripts/types";

// Session class to manage a single Claude conversation
export class Session {
  public readonly id: string;
  private queryPromise: Promise<void> | null = null;
  private subscribers: Set<WSClient> = new Set(); //订阅此会话的WSClient集合
  private db: Database;
  private messageCount = 0;
  private aiClient: AIClient;
  private sdkSessionId: string | null = null;
  private actionsManager?: ActionsManager;

  constructor(id: string, db: Database, actionsManager?: ActionsManager) {
    this.id = id;
    this.db = db;
    this.aiClient = new AIClient();
    this.actionsManager = actionsManager;
  }

  // Process a single user message
  async addUserMessage(content: string): Promise<void> {
    if (this.queryPromise) {
      // Queue is busy, wait for it
      await this.queryPromise;
    }

    this.messageCount++;
    console.log(`Processing message ${this.messageCount} in session ${this.id}`);

    this.queryPromise = (async () => {
      try {
        // Use resume for multi-turn, continue for first message
        const options = this.sdkSessionId
          ? { resume: this.sdkSessionId }
          : {};

        for await (const message of this.aiClient.queryStream(content, options)) {
          //console.log(message);
          this.broadcastToSubscribers(message);

          // Capture SDK session ID for multi-turn
          if (message.type === 'system' && message.subtype === 'init') {
            this.sdkSessionId = message.session_id;
            console.log(`Captured SDK session ID: ${this.sdkSessionId}`);
          }

          // Check if conversation ended with a result
          if (message.type === 'result') {
            console.log('Result received, ready for next user message');
          }
        }
      } catch (error) {
        console.error(`Error in session ${this.id}:`, error);
        this.broadcastError("Query failed: " + (error as Error).message);
      } finally {
        this.queryPromise = null;
      }
    })();

    await this.queryPromise;
  }

  // Subscribe a WebSocket client to this session
  subscribe(client: WSClient) {
    this.subscribers.add(client);
    client.data.sessionId = this.id;

    // Send session info to new subscriber
    client.send(JSON.stringify({
      type: 'session_info',
      sessionId: this.id,
      messageCount: this.messageCount,
      isActive: this.queryPromise !== null
    }));
  }

  // Unsubscribe a WebSocket client from this session
  unsubscribe(client: WSClient) {
    this.subscribers.delete(client);
  }

  // 路由Broadcast a message to all subscribers
  private broadcastToSubscribers(message: SDKMessage) {
    let wsMessage: any = null;

    if (message.type === "assistant") {
      // Stream assistant responses
      const content = message.message.content;
      if (typeof content === 'string') {
        wsMessage = {
          type: 'assistant_message',
          content: content,
          sessionId: this.id
        };
        this.broadcast(wsMessage);
        this.processActionsFromText(content);
        return;
      } else if (Array.isArray(content)) {
        // Handle content blocks
        let collectedText = '';
        for (const block of content) {
          if (block.type === 'text') {
            wsMessage = {
              type: 'assistant_message',
              content: block.text,
              sessionId: this.id
            };
            collectedText += block.text + '\n';
          } else if (block.type === 'tool_use') {
            wsMessage = {
              type: 'tool_use',
              toolName: block.name,
              toolId: block.id,
              toolInput: block.input,
              sessionId: this.id
            };
          } else if (block.type === 'tool_result') {
            wsMessage = {
              type: 'tool_result',
              toolUseId: block.tool_use_id,
              content: block.content,
              isError: block.is_error,
              sessionId: this.id
            };
          }
          if (wsMessage) {
            this.broadcast(wsMessage);
          }
        }
        if (collectedText.trim()) {
          this.processActionsFromText(collectedText);
        }
        return; // Already broadcasted block by block
      }
    } else if (message.type === "result") {
      if (message.subtype === "success") {
        wsMessage = {
          type: 'result',
          success: true,
          result: message.result,
          cost: message.total_cost_usd,
          duration: message.duration_ms,
          sessionId: this.id
        };
      } else {
        wsMessage = {
          type: 'result',
          success: false,
          error: message.subtype,
          sessionId: this.id
        };
      }
    } else if (message.type === "system") {
      wsMessage = {
        type: 'system',
        subtype: message.subtype,
        sessionId: this.id,
        data: message
      };
    } else if (message.type === "user") {
      // Echo user messages to subscribers
      wsMessage = {
        type: 'user_message',
        content: message.message.content,
        sessionId: this.id
      };
    }

    if (wsMessage) {
      this.broadcast(wsMessage);
    }
  }

  private broadcast(message: any) {
    const messageStr = JSON.stringify(message);
    for (const client of this.subscribers) {
      try {
        client.send(messageStr);
      } catch (error) {
        console.error('Error broadcasting to client:', error);
        this.subscribers.delete(client);
      }
    }
  }

  private broadcastError(error: string) {
    this.broadcast({
      type: 'error',
      error: error,
      sessionId: this.id
    });
  }

  // Check if session has any subscribers
  hasSubscribers(): boolean {
    return this.subscribers.size > 0;
  }

  // Clean up session
  async cleanup() {
    this.subscribers.clear();
  }

  // End current conversation (for starting fresh)
  endConversation() {
    this.sdkSessionId = null;
    this.queryPromise = null;
  }

  /**
   * 从 agent 文本响应中提取 actions JSON，注册实例并广播到前端
   * 支持两种格式：
   * 1. ```json 代码块中含 "actions" 键
   * 2. 行内 {"actions": [...]} JSON
   */
  private processActionsFromText(text: string) {
    if (!this.actionsManager) return;

    const actionDefs = this.parseActionsFromText(text);
    if (actionDefs.length === 0) return;

    const instances: ActionInstance[] = actionDefs.map((def: any) => {
      const instance: ActionInstance = {
        instanceId: `act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        templateId: def.templateId,
        label: def.label || def.templateId,
        description: def.description,
        params: def.params || {},
        style: def.style || "primary",
        sessionId: this.id,
        createdAt: new Date().toISOString(),
      };

      this.actionsManager!.registerInstance(instance);
      return instance;
    });

    console.log(`[Session] Parsed and registered ${instances.length} action instance(s)`);

    this.broadcast({
      type: 'action_instances',
      actions: instances,
      sessionId: this.id,
    });
  }

  /**
   * 正则解析 agent 文本中的 actions JSON 定义
   * 匹配 ```json 代码块 或 行内 JSON 中含 "actions" 数组的结构
   */
  private parseActionsFromText(text: string): any[] {
    const allActions: any[] = [];

    // 匹配 ```json ... ``` 代码块
    const codeBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      this.tryExtractActions(match[1], allActions);
    }

    // 匹配行内 {"actions": [...]}
    const inlineRegex = /\{"actions"\s*:\s*\[[\s\S]*?\]\s*\}/g;
    while ((match = inlineRegex.exec(text)) !== null) {
      this.tryExtractActions(match[0], allActions);
    }

    return allActions;
  }

  private tryExtractActions(jsonStr: string, collector: any[]) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.actions && Array.isArray(parsed.actions)) {
        collector.push(...parsed.actions);
      }
    } catch {
      // 非法 JSON 忽略
    }
  }
}
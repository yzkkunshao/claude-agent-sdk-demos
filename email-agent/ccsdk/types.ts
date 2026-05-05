import type { ServerWebSocket } from "bun";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// WebSocket client type
export type WSClient = ServerWebSocket<{ sessionId: string }>;

// Message types for WebSocket communication
export interface ChatMessage {
  type: "chat";
  content: string;
  sessionId?: string;
  newConversation?: boolean;
}

export interface SubscribeMessage {
  type: "subscribe";
  sessionId: string;
}

export interface UnsubscribeMessage {
  type: "unsubscribe";
  sessionId: string;
}

export interface RequestInboxMessage {
  type: "request_inbox";
}

export interface ExecuteActionMessage {
  type: "execute_action";
  instanceId: string;
  sessionId: string;
}

export type IncomingMessage = ChatMessage | SubscribeMessage | UnsubscribeMessage | RequestInboxMessage | ExecuteActionMessage;

// Re-export SDK types for convenience
export type { SDKMessage };
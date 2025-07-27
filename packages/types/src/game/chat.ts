import { PlayerId } from './core-type';

export type ChatMessageType = 'user' | 'system';

export interface ChatMessage {
  id: string;               // 唯一ID
  playerId: PlayerId;       // 发送者ID，系统消息为 'system'
  playerName: string;       // 发送者昵称，系统消息可为 '系统'
  content: string;          // 消息内容
  timestamp: number;        // 消息时间戳（ms）
  type: ChatMessageType;    // 消息类型：'user' | 'system'
}

// --- WebSocket 协议 ---

// 客户端 -> 服务端
export interface ChatSendMessageReq {
  type: 'send_message';
  content: string;
}

export interface ChatFetchRecentReq {
  type: 'fetch_recent';
  limit: number;
}

export interface ChatFetchHistoryReq {
  type: 'fetch_history';
  beforeId: string;
  limit: number;
}

// 服务端 -> 客户端
export interface ChatNewMessageEvt {
  type: 'new_message';
  message: ChatMessage;
}

export interface ChatMessagesBatchEvt {
  type: 'messages_batch';
  messages: ChatMessage[];
  isEnd: boolean;
}

export interface ChatSendResultEvt {
  type: 'send_result';
  status: 'success' | 'failed';
  messageId?: string;
  reason?: string;
}

// 联合类型
export type ChatClientToServer =
  | ChatSendMessageReq
  | ChatFetchRecentReq
  | ChatFetchHistoryReq;

export type ChatServerToClient =
  | ChatNewMessageEvt
  | ChatMessagesBatchEvt
  | ChatSendResultEvt;

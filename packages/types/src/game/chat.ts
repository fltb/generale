import type { PlayerId, TeamId } from "./core-type";
import type { PreGamePlayerStatus } from "./room/pre-game";

export type ChatMessageType = "user" | "system";
export type ChatMessageScope = "room" | "game" | "team";
export type ChatSenderPresence = "room" | "game" | "spectator";

export interface ChatSenderMeta {
  teamId?: TeamId;
  teamName?: string;
  teamMode?: "ffa" | "team";
  presence?: ChatSenderPresence;
  status?: PreGamePlayerStatus;
  tileColor?: number;
  avatarThumbUrl?: string;
  displayName?: string;
}

export interface ChatMessage {
  id: string; // 唯一ID
  playerId: PlayerId; // 发送者ID，系统消息为 'system'
  playerName: string; // 发送者昵称，系统消息可为 '系统'
  content: string; // 消息内容（向后兼容，若设定了 i18nKey 可以为空）
  timestamp: number; // 消息时间戳（ms）
  type: ChatMessageType; // 消息类型：'user' | 'system'
  scope?: ChatMessageScope; // 消息范围：房间 / 游戏 / 队伍
  meta?: ChatSenderMeta; // 发送时的展示元数据快照
  recipientIds?: PlayerId[]; // 小队消息的可见收件人快照
  i18nKey?: string; // 系统消息的 i18n 键
  i18nParams?: Record<string, string>; // i18n 替换参数
}

// --- WebSocket 协议 ---

// 客户端 -> 服务端
export interface ChatSendMessageReq {
  type: "send_message";
  content: string;
  scope?: ChatMessageScope;
}

export interface ChatFetchRecentReq {
  type: "fetch_recent";
  limit: number;
}

export interface ChatFetchHistoryReq {
  type: "fetch_history";
  beforeId: string;
  limit: number;
}

// 服务端 -> 客户端
export interface ChatNewMessageEvt {
  type: "new_message";
  message: ChatMessage;
}

export interface ChatMessagesBatchEvt {
  type: "messages_batch";
  messages: ChatMessage[];
  isEnd: boolean;
}

export interface ChatSendResultEvt {
  type: "send_result";
  status: "success" | "failed";
  messageId?: string;
  reason?: string;
}

// 联合类型
export type ChatClientToServer = ChatSendMessageReq | ChatFetchRecentReq | ChatFetchHistoryReq;

export type ChatServerToClient = ChatNewMessageEvt | ChatMessagesBatchEvt | ChatSendResultEvt;

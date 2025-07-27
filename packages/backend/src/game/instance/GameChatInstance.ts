import { PlayerId } from '@generale/types/src/game/core-type';
import {
  ChatMessage,
  ChatClientToServer,
  ChatServerToClient,
  ChatSendMessageReq
} from '@generale/types/src/game/chat';

/**
 * 依赖注入：ws sub-connector
 */
export interface GameChatConnector {
  onMessage(cb: (msg: ChatClientToServer) => void): void;
  send(msg: ChatServerToClient): void;
  close(): void;
}

export class GameChatInstance {
  private messages: ChatMessage[] = [];
  private connectors = new Map<PlayerId, GameChatConnector>();
  private playerNames = new Map<PlayerId, string>();
  private maxMessages = 100;
  private messageIdCounter = 0;

  constructor(maxMessages = 100) {
    this.maxMessages = maxMessages;
    this.addSystemMessage('游戏聊天已启动，欢迎大家！');
  }

  /** 玩家加入 */
  addPlayer(pid: PlayerId, name: string, connector: GameChatConnector) {
    this.playerNames.set(pid, name);
    this.connectors.set(pid, connector);
    connector.onMessage(msg => this.handleMessage(pid, msg));
    // 发送最近消息
    this.sendRecentMessages(pid, 30);
    this.addSystemMessage(`${name} 加入了游戏`);
  }

  /** 玩家离开 */
  removePlayer(pid: PlayerId) {
    this.connectors.get(pid)?.close();
    this.connectors.delete(pid);
    const name = this.playerNames.get(pid);
    if (name) this.addSystemMessage(`${name} 离开了游戏`);
    this.playerNames.delete(pid);
  }

  /** 处理 ws 消息 */
  private handleMessage(pid: PlayerId, msg: ChatClientToServer) {
    switch (msg.type) {
      case 'send_message':
        this.handleSendMessage(pid, msg);
        break;
      case 'fetch_recent':
        this.sendRecentMessages(pid, msg.limit);
        break;
      case 'fetch_history':
        this.sendHistoryMessages(pid, msg.beforeId, msg.limit);
        break;
      default:
        // ignore
        break;
    }
  }

  /** 处理用户发消息 */
  private handleSendMessage(pid: PlayerId, msg: ChatSendMessageReq) {
    const name = this.playerNames.get(pid) || `玩家${pid}`;
    const content = msg.content.trim();
    if (!content) {
      this.sendResult(pid, 'failed', undefined, '消息不能为空');
      return;
    }
    if (content.length > 500) {
      this.sendResult(pid, 'failed', undefined, '消息过长');
      return;
    }
    const chatMsg: ChatMessage = {
      id: this.generateMessageId(),
      playerId: pid,
      playerName: name,
      content,
      timestamp: Date.now(),
      type: 'user',
    };
    this.addMessage(chatMsg);
    this.broadcastNewMessage(chatMsg);
    this.sendResult(pid, 'success', chatMsg.id);
  }

  /** 添加系统消息 */
  private addSystemMessage(content: string) {
    const msg: ChatMessage = {
      id: this.generateMessageId(),
      playerId: 'system' as PlayerId,
      playerName: '系统',
      content,
      timestamp: Date.now(),
      type: 'system',
    };
    this.addMessage(msg);
    this.broadcastNewMessage(msg);
  }

  /** 添加消息到历史 */
  private addMessage(msg: ChatMessage) {
    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  /** 推送新消息给所有在线玩家 */
  private broadcastNewMessage(msg: ChatMessage) {
    for (const conn of this.connectors.values()) {
      conn.send({ type: 'new_message', message: msg });
    }
  }

  /** 发送最近 N 条消息 */
  private sendRecentMessages(pid: PlayerId, limit: number) {
    const msgs = this.messages.slice(-limit);
    this.connectors.get(pid)?.send({
      type: 'messages_batch',
      messages: msgs,
      isEnd: msgs.length === this.messages.length,
    });
  }

  /** 滚动历史加载 */
  private sendHistoryMessages(pid: PlayerId, beforeId: string, limit: number) {
    const idx = this.messages.findIndex(m => m.id === beforeId);
    if (idx === -1) {
      this.sendRecentMessages(pid, limit);
      return;
    }
    const msgs = this.messages.slice(Math.max(0, idx - limit), idx);
    this.connectors.get(pid)?.send({
      type: 'messages_batch',
      messages: msgs,
      isEnd: idx - limit <= 0,
    });
  }

  /** 发送操作结果 */
  private sendResult(pid: PlayerId, status: 'success' | 'failed', messageId?: string, reason?: string) {
    const evt: any = { type: 'send_result', status };
    if (messageId !== undefined) evt.messageId = messageId;
    if (reason !== undefined) evt.reason = reason;
    this.connectors.get(pid)?.send(evt);
  }

  /** 生成消息ID */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${++this.messageIdCounter}`;
  }
}
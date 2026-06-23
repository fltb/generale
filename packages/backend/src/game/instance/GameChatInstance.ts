import { PlayerId } from '@generale/types/src/game/core-type';
import {
  ChatMessage,
  ChatClientToServer,
  ChatServerToClient,
  ChatSendMessageReq,
  ChatSenderMeta
} from '@generale/types/src/game/chat';

/**
 * 依赖注入：ws sub-connector
 */
export type GameChatConnector = ServerSyncConnector<ChatClientToServer, ChatServerToClient>

import { IBaseInstance, IRoomRoster } from './interface';
import { ServerSyncConnector } from '@generale/types';

export class GameChatInstance implements IBaseInstance<ChatClientToServer, ChatServerToClient> {
  private messages: ChatMessage[] = [];
  private connectors = new Map<PlayerId, GameChatConnector>();
  private playerNames = new Map<PlayerId, string>();
  private maxMessages = 100;
  private messageIdCounter = 0;

  private _activeStageInstance: IRoomRoster | null = null;

  public set activeStageInstance(instance: IRoomRoster | null) {
    this._activeStageInstance = instance;
  }

  private destroyed: boolean = false;

  constructor(maxMessages = 100) {
    this.maxMessages = maxMessages;
    this.addSystemMessage('游戏聊天已启动，欢迎大家！');
  }


  
  public destroy(): void {
    this.destroyed = true;
    for (const connector of this.connectors.values()) {
      connector.close();
    }
    this._activeStageInstance = null;
    this.connectors.clear();
    this.playerNames.clear();
    this.messages = [];
  }

  public canJoin(id: PlayerId): { success: true } | { success: false; message: string } {
    if (this.destroyed) {
      const msg = `[GameChatInstance] Cannot add player to destroyed instance`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    if (this._activeStageInstance) {
      const res = this._activeStageInstance.canJoin(id);
      if (res.success) return { success: true };
      if (res.success === false) {
        return { success: false, message: `[GameChatInstance] Refused by active stage: ${res.message}` };
      }
    }
    return { success: false, message: '[GameChatInstance] No active stage instance, cannot join chat.' };
  }

  /** 玩家加入 */
  /** 动态添加玩家（用于 GameService） */
  public addPlayer(user: { id: PlayerId, name: string }, connector: ServerSyncConnector<ChatClientToServer, ChatServerToClient>): { success: true } | { success: false, message: string } {
    const pid = user.id;
    const name = user.name;
    const canJoin = this.canJoin(pid);

    // TODO::HACK:: host 或 stage 未 ready 时允许加入，因为房主进入聊天的时候 pregame 可能没有生成好，后续后端会进行重构，重新管理这几个 Instance 的生命周期
    const isHostLike = !this._activeStageInstance;

    if (canJoin.success === false && !isHostLike) {
      const msg = canJoin.message || `[GameChatInstance] Player ${pid} not allowed to join`;
      console.warn(msg);
      return { success: false, message: msg };
    }
    console.debug(`[GameChatInstance] user ${name}#${pid} joined chat.`)
    this.playerNames.set(pid, name);
    this.connectors.set(pid, connector);
    connector.onClientMessage(msg => this.handleMessage(pid, msg));
    // 发送最近消息
    this.sendRecentMessages(pid, 30);
    this.addSystemMessage(`${name} 加入了游戏`);
    return { success: true };
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
    const meta = this.getSenderMeta(pid);
    const scope = msg.scope === 'team' ? 'team' : (meta?.presence === 'game' ? 'game' : 'room');
    if (scope === 'team' && !this.canSendTeamMessage(pid, meta)) {
      this.sendResult(pid, 'failed', undefined, '当前不能发送小队消息');
      return;
    }
    const chatMsg: ChatMessage = {
      id: this.generateMessageId(),
      playerId: pid,
      playerName: name,
      content,
      timestamp: Date.now(),
      type: 'user',
      scope,
      ...(meta ? { meta } : {}),
      ...(scope === 'team' ? { recipientIds: this.getTeamRecipientIds(meta!.teamId!) } : {}),
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
      scope: 'room',
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
    for (const [pid, conn] of this.connectors) {
      if (!this.canReceiveMessage(pid, msg)) continue;
      conn.send({ type: 'new_message', message: msg });
    }
  }

  /** 发送最近 N 条消息 */
  private sendRecentMessages(pid: PlayerId, limit: number) {
    const visible = this.messages.filter(m => this.canReceiveMessage(pid, m));
    const msgs = visible.slice(-limit);
    this.connectors.get(pid)?.send({
      type: 'messages_batch',
      messages: msgs,
      isEnd: msgs.length === visible.length,
    });
  }

  /** 滚动历史加载 */
  private sendHistoryMessages(pid: PlayerId, beforeId: string, limit: number) {
    const visible = this.messages.filter(m => this.canReceiveMessage(pid, m));
    const idx = visible.findIndex(m => m.id === beforeId);
    if (idx === -1) {
      this.sendRecentMessages(pid, limit);
      return;
    }
    const msgs = visible.slice(Math.max(0, idx - limit), idx);
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

  private getSenderMeta(pid: PlayerId): ChatSenderMeta | undefined {
    return this._activeStageInstance?.getPlayerChatMeta(pid) ?? undefined;
  }

  private canSendTeamMessage(pid: PlayerId, meta?: ChatSenderMeta): boolean {
    const resolved = meta ?? this.getSenderMeta(pid);
    return !!resolved?.teamId
      && resolved.teamMode === 'team'
      && resolved.presence === 'game';
  }

  private canReceiveMessage(pid: PlayerId, msg: ChatMessage): boolean {
    if (msg.type === 'system' || msg.scope !== 'team') return true;
    if (msg.recipientIds?.includes(pid)) return true;
    const recipientMeta = this.getSenderMeta(pid);
    return !!recipientMeta?.teamId
      && recipientMeta.teamId === msg.meta?.teamId
      && recipientMeta.teamMode === 'team'
      && recipientMeta.presence === 'game';
  }

  private getTeamRecipientIds(teamId: string): PlayerId[] {
    const players = this._activeStageInstance?.getPlayersForTeamChat();
    if (!players || !Array.isArray(players)) {
      return Array.from(this.connectors.keys()).filter(pid => this.getSenderMeta(pid)?.teamId === teamId);
    }
    return players
      .filter(p => p.teamId === teamId && p.status === 'playing')
      .map(p => p.id);
  }
}

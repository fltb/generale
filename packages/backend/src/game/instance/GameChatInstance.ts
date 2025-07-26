import {
    PlayerId,
    GameId,
    SyncedStateServerEvent,
    SyncedStateServerEventType,
    SyncedStateServerStateUpdatePayloadType,
    ServerSyncConnector
} from '@generale/types';

export interface ChatMessage {
    id: string;
    playerId: PlayerId;
    playerName: string;
    content: string;
    timestamp: number;
    type: 'normal' | 'system' | 'whisper';
    targetPlayerId?: PlayerId; // 用于私聊
}

export interface ChatState {
    gameId: GameId;
    messages: ChatMessage[];
    players: Map<PlayerId, { name: string; isOnline: boolean }>;
    version: number;
    maxMessages: number;
}

export interface ChatClientAction {
    type: 'SEND_MESSAGE' | 'SYNC_REQUEST' | 'MARK_READ';
    payload?: any;
    optimisticId?: number;
}

export interface ChatConnectorManager {
    createSubConnector: (playerId: PlayerId) => Promise<ServerSyncConnector<ChatClientAction, SyncedStateServerEvent<ChatState>>>;
    removeSubConnector: (playerId: PlayerId) => Promise<void>;
}

/**
 * GameChatInstance - 游戏聊天管理器
 * 
 * 职责：
 * 1. 管理聊天消息的发送和接收
 * 2. 维护聊天历史记录
 * 3. 支持系统消息和私聊
 * 4. 处理玩家上线/下线状态
 * 5. 消息过滤和审核（可扩展）
 */
export class GameChatInstance {
    private state: ChatState;
    private connectors = new Map<PlayerId, ServerSyncConnector<ChatClientAction, SyncedStateServerEvent<ChatState>>>();
    private connectorManager: ChatConnectorManager;
    private messageIdCounter = 0;

    constructor(gameId: GameId, connectorManager: ChatConnectorManager) {
        this.connectorManager = connectorManager;
        
        this.state = {
            gameId,
            messages: [],
            players: new Map(),
            version: 0,
            maxMessages: 100 // 最多保留100条消息
        };

        // 发送欢迎消息
        this.addSystemMessage('游戏聊天已启动，欢迎大家！');
    }

    /**
     * 添加玩家
     */
    async addPlayer(playerId: PlayerId, playerName?: string): Promise<void> {
        // 添加玩家到状态
        this.state.players.set(playerId, {
            name: playerName || `Player_${playerId}`,
            isOnline: true
        });

        // 创建连接器
        const connector = await this.connectorManager.createSubConnector(playerId);
        this.connectors.set(playerId, connector);

        // 设置消息处理
        connector.onClientMessage((action) => {
            this.handlePlayerAction(playerId, action);
        });

        connector.onDisconnect(() => {
            this.handlePlayerDisconnect(playerId);
        });

        // 发送聊天历史
        this.sendStateToPlayer(playerId, 'snapshot');

        // 发送玩家加入系统消息
        const player = this.state.players.get(playerId);
        if (player) {
            this.addSystemMessage(`${player.name} 加入了游戏`);
        }
    }

    /**
     * 处理玩家重连
     */
    async handlePlayerReconnect(playerId: PlayerId): Promise<void> {
        const player = this.state.players.get(playerId);
        if (!player) {
            console.warn(`Player ${playerId} not in chat, re-adding player`);
            // 如果玩家不在状态中，重新添加
            await this.addPlayer(playerId);
            return;
        }

        // 标记为在线
        player.isOnline = true;

        // 重新创建连接器
        const connector = await this.connectorManager.createSubConnector(playerId);
        this.connectors.set(playerId, connector);

        // 设置消息处理
        connector.onClientMessage((action) => {
            this.handlePlayerAction(playerId, action);
        });

        connector.onDisconnect(() => {
            this.handlePlayerDisconnect(playerId);
        });

        // 发送当前聊天状态
        this.sendStateToPlayer(playerId, 'snapshot');

        // 发送重连系统消息
        this.addSystemMessage(`${player.name} 重新连接`);
    }

    /**
     * 处理玩家断开连接
     */
    handlePlayerDisconnect(playerId: PlayerId): void {
        const player = this.state.players.get(playerId);
        if (!player) return;

        // 标记为离线（但不删除，保留聊天历史中的用户信息）
        player.isOnline = false;
        this.connectors.delete(playerId);

        // 清理连接器
        this.connectorManager.removeSubConnector(playerId);

        // 发送断开连接系统消息
        this.addSystemMessage(`${player.name} 断开连接`);
    }

    /**
     * 完全移除玩家（游戏结束时调用）
     */
    removePlayer(playerId: PlayerId): void {
        const player = this.state.players.get(playerId);
        if (!player) return;

        this.state.players.delete(playerId);
        this.connectors.delete(playerId);
        this.connectorManager.removeSubConnector(playerId);

        // 发送离开游戏系统消息
        this.addSystemMessage(`${player.name} 离开了游戏`);
    }

    /**
     * 处理玩家操作
     */
    private handlePlayerAction(playerId: PlayerId, action: ChatClientAction): void {
        const player = this.state.players.get(playerId);
        if (!player) {
            console.warn(`Unknown player ${playerId} sent chat action`);
            return;
        }

        try {
            switch (action.type) {
                case 'SYNC_REQUEST':
                    this.handleSyncRequest(playerId, action);
                    break;
                    
                case 'SEND_MESSAGE':
                    this.handleSendMessage(playerId, action);
                    break;
                    
                case 'MARK_READ':
                    this.handleMarkRead(playerId, action);
                    break;
                    
                default:
                    console.warn(`Unknown chat action type: ${action.type}`);
            }
        } catch (error) {
            console.error(`Error handling chat action ${action.type} from ${playerId}:`, error);
            
            // 发送错误响应
            if (action.optimisticId) {
                this.sendActionResult(playerId, action.optimisticId, 'failed', (error as Error).message);
            }
        }
    }

    /**
     * 处理同步请求
     */
    private handleSyncRequest(playerId: PlayerId, action: ChatClientAction): void {
        const clientVersion = action.payload?.version || 0;
        
        if (clientVersion < this.state.version) {
            // 发送完整聊天历史
            this.sendStateToPlayer(playerId, 'snapshot');
        }
        
        if (action.optimisticId) {
            this.sendActionResult(playerId, action.optimisticId, 'success');
        }
    }

    /**
     * 处理发送消息
     */
    private handleSendMessage(playerId: PlayerId, action: ChatClientAction): void {
        const { content, type = 'normal', targetPlayerId } = action.payload;
        
        if (!content || typeof content !== 'string') {
            throw new Error('Invalid message content');
        }

        if (content.trim().length === 0) {
            throw new Error('Message cannot be empty');
        }

        if (content.length > 500) {
            throw new Error('Message too long (max 500 characters)');
        }

        const player = this.state.players.get(playerId);
        if (!player) {
            throw new Error('Player not found');
        }

        // 验证私聊目标
        if (type === 'whisper') {
            if (!targetPlayerId) {
                throw new Error('Whisper target not specified');
            }
            
            const targetPlayer = this.state.players.get(targetPlayerId);
            if (!targetPlayer) {
                throw new Error('Whisper target not found');
            }
        }

        // 创建消息
        const message: ChatMessage = {
            id: this.generateMessageId(),
            playerId,
            playerName: player.name,
            content: content.trim(),
            timestamp: Date.now(),
            type: type as ChatMessage['type'],
            targetPlayerId
        };

        // 添加到消息历史
        this.addMessage(message);

        // 根据消息类型决定发送范围
        if (type === 'whisper' && targetPlayerId) {
            // 私聊：只发送给发送者和目标
            this.sendMessageToPlayer(playerId, message);
            this.sendMessageToPlayer(targetPlayerId, message);
        } else {
            // 普通消息：广播给所有人
            this.broadcastMessage(message);
        }

        if (action.optimisticId) {
            this.sendActionResult(playerId, action.optimisticId, 'success');
        }
    }

    /**
     * 处理标记已读
     */
    private handleMarkRead(playerId: PlayerId, action: ChatClientAction): void {
        // 这里可以实现已读状态的逻辑
        // 暂时只是确认操作成功
        if (action.optimisticId) {
            this.sendActionResult(playerId, action.optimisticId, 'success');
        }
    }

    /**
     * 添加系统消息
     */
    private addSystemMessage(content: string): void {
        const message: ChatMessage = {
            id: this.generateMessageId(),
            playerId: 'system' as PlayerId,
            playerName: '系统',
            content,
            timestamp: Date.now(),
            type: 'system'
        };

        this.addMessage(message);
        this.broadcastMessage(message);
    }

    /**
     * 添加消息到历史记录
     */
    private addMessage(message: ChatMessage): void {
        this.state.messages.push(message);
        
        // 限制消息数量
        if (this.state.messages.length > this.state.maxMessages) {
            this.state.messages = this.state.messages.slice(-this.state.maxMessages);
        }
        
        this.incrementVersion();
    }

    /**
     * 向特定玩家发送消息
     */
    private sendMessageToPlayer(playerId: PlayerId, message: ChatMessage): void {
        const connector = this.connectors.get(playerId);
        if (!connector) return;

        connector.send({
            type: SyncedStateServerEventType.STATE_UPDATE,
            payload: {
                version: this.state.version,
                type: SyncedStateServerStateUpdatePayloadType.PATCH,
                data: {
                    type: 'new_message',
                    message
                },
                confirmedOp: 0
            }
        });
    }

    /**
     * 广播消息给所有在线玩家
     */
    private broadcastMessage(message: ChatMessage): void {
        for (const [playerId, player] of this.state.players) {
            if (player.isOnline) {
                this.sendMessageToPlayer(playerId, message);
            }
        }
    }

    /**
     * 向特定玩家发送完整状态
     */
    private sendStateToPlayer(playerId: PlayerId, type: 'snapshot' | 'patch'): void {
        const connector = this.connectors.get(playerId);
        if (!connector) return;

        const stateForClient = this.getStateForClient();
        
        if (type === 'snapshot') {
            connector.send({
                type: SyncedStateServerEventType.STATE_UPDATE,
                payload: {
                    version: this.state.version,
                    type: SyncedStateServerStateUpdatePayloadType.SNAPSHOT,
                    data: stateForClient,
                    confirmedOp: 0
                }
            });
        }
        // patch 类型在 broadcastMessage 中处理
    }

    /**
     * 发送操作结果
     */
    private sendActionResult(playerId: PlayerId, optimisticId: number, status: 'success' | 'failed', message?: string): void {
        const connector = this.connectors.get(playerId);
        if (!connector) return;

        connector.send({
            type: SyncedStateServerEventType.ACTION_RESULT,
            payload: {
                status,
                optimisticId,
                message
            }
        });
    }

    /**
     * 获取客户端状态
     */
    private getStateForClient(): any {
        return {
            gameId: this.state.gameId,
            messages: this.state.messages,
            players: Array.from(this.state.players.entries()).map(([id, player]) => ({
                playerId: id,
                ...player
            }))
        };
    }

    /**
     * 生成消息ID
     */
    private generateMessageId(): string {
        return `msg_${Date.now()}_${++this.messageIdCounter}`;
    }

    /**
     * 递增版本号
     */
    private incrementVersion(): void {
        this.state.version++;
    }

    /**
     * 销毁实例
     */
    destroy(): void {
        // 发送聊天结束系统消息
        this.addSystemMessage('游戏聊天已结束');

        // 关闭所有连接
        for (const [playerId, connector] of this.connectors) {
            connector.close();
            this.connectorManager.removeSubConnector(playerId);
        }

        this.connectors.clear();
        this.state.players.clear();
        this.state.messages = [];
    }

    /**
     * 获取当前状态（用于调试）
     */
    getState(): ChatState {
        return { ...this.state };
    }

    /**
     * 获取消息历史（用于持久化）
     */
    getMessageHistory(): ChatMessage[] {
        return [...this.state.messages];
    }

    /**
     * 清理旧消息（可定期调用）
     */
    cleanupOldMessages(maxAge: number = 24 * 60 * 60 * 1000): void {
        const now = Date.now();
        const cutoff = now - maxAge;
        
        const oldLength = this.state.messages.length;
        this.state.messages = this.state.messages.filter(msg => msg.timestamp > cutoff);
        
        if (this.state.messages.length !== oldLength) {
            this.incrementVersion();
            console.log(`Cleaned up ${oldLength - this.state.messages.length} old messages`);
        }
    }
}

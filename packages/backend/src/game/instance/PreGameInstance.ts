import {
    PlayerId,
    GameId,
    SyncedStateServerEvent,
    SyncedStateServerEventType,
    SyncedStateServerStateUpdatePayloadType,
    ServerSyncConnector
} from '@generale/types';
import { compare } from 'fast-json-patch';

export interface PreGameSettings {
    mapSize: 'small' | 'medium' | 'large';
    maxPlayers: number;
    gameMode: 'classic' | 'blitz' | 'custom';
    timeLimit?: number;
    customRules?: Record<string, any>;
}

export interface PlayerStatus {
    playerId: PlayerId;
    name: string;
    isReady: boolean;
    isHost: boolean;
    joinedAt: number;
}

export interface PreGameState {
    gameId: GameId;
    status: 'waiting' | 'starting' | 'cancelled';
    settings: PreGameSettings;
    players: Map<PlayerId, PlayerStatus>;
    hostId: PlayerId;
    version: number;
    canStart: boolean; // 是否满足开始游戏的条件
}

export interface PreGameClientAction {
    type: 'UPDATE_SETTINGS' | 'TOGGLE_READY' | 'KICK_PLAYER' | 'START_GAME' | 'SYNC_REQUEST';
    payload?: any;
    optimisticId?: number;
}

export interface PreGameConnectorManager {
    createSubConnector: (playerId: PlayerId) => Promise<ServerSyncConnector<PreGameClientAction, SyncedStateServerEvent<PreGameState>>>;
    removeSubConnector: (playerId: PlayerId) => Promise<void>;
    onGameStart: (settings: PreGameSettings, players: PlayerId[]) => Promise<void>;
}

/**
 * PreGameInstance - 游戏前准备阶段管理器
 * 
 * 职责：
 * 1. 管理房间设置（仅房主可修改）
 * 2. 管理玩家准备状态
 * 3. 处理玩家加入/退出
 * 4. 房主转移逻辑
 * 5. 开始游戏条件检查
 */
export class PreGameInstance {
    private state: PreGameState;
    private connectors = new Map<PlayerId, ServerSyncConnector<PreGameClientAction, SyncedStateServerEvent<PreGameState>>>();
    private connectorManager: PreGameConnectorManager;
    private startGameTimer?: NodeJS.Timeout;

    constructor(
        gameId: GameId,
        hostId: PlayerId,
        initialSettings: PreGameSettings,
        connectorManager: PreGameConnectorManager
    ) {
        this.connectorManager = connectorManager;
        
        this.state = {
            gameId,
            status: 'waiting',
            settings: { ...initialSettings },
            players: new Map(),
            hostId,
            version: 0,
            canStart: false
        };

        // 添加房主
        this.state.players.set(hostId, {
            playerId: hostId,
            name: `Player_${hostId}`, // 实际应该从用户系统获取
            isReady: false,
            isHost: true,
            joinedAt: Date.now()
        });

        this.updateCanStart();
    }

    /**
     * 添加玩家
     */
    async addPlayer(playerId: PlayerId): Promise<void> {
        if (this.state.players.has(playerId)) {
            console.warn(`Player ${playerId} already in pregame`);
            return;
        }

        if (this.state.players.size >= this.state.settings.maxPlayers) {
            throw new Error('Game is full');
        }

        // 添加玩家到状态
        this.state.players.set(playerId, {
            playerId,
            name: `Player_${playerId}`,
            isReady: false,
            isHost: false,
            joinedAt: Date.now()
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

        // 发送初始状态
        this.sendStateToPlayer(playerId, 'snapshot');
        
        // 广播玩家加入事件
        this.broadcastState('patch');
        this.updateCanStart();
    }

    /**
     * 处理玩家重连
     */
    async handlePlayerReconnect(playerId: PlayerId): Promise<void> {
        if (!this.state.players.has(playerId)) {
            console.warn(`Player ${playerId} not in pregame, re-adding player`);
            // 如果玩家不在状态中，重新添加
            await this.addPlayer(playerId);
            return;
        }

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

        // 发送当前完整状态
        this.sendStateToPlayer(playerId, 'snapshot');
    }

    /**
     * 处理玩家断开连接
     */
    handlePlayerDisconnect(playerId: PlayerId): void {
        const player = this.state.players.get(playerId);
        if (!player) return;

        // 如果是房主断开，需要转移房主
        if (player.isHost) {
            this.transferHost();
        }

        // 移除玩家
        this.state.players.delete(playerId);
        this.connectors.delete(playerId);

        // 清理连接器
        this.connectorManager.removeSubConnector(playerId);

        // 广播更新
        this.broadcastState('patch');
        this.updateCanStart();

        // 如果没有玩家了，可以考虑销毁实例
        if (this.state.players.size === 0) {
            this.destroy();
        }
    }

    /**
     * 处理玩家操作
     */
    private handlePlayerAction(playerId: PlayerId, action: PreGameClientAction): void {
        const player = this.state.players.get(playerId);
        if (!player) {
            console.warn(`Unknown player ${playerId} sent action`);
            return;
        }

        try {
            switch (action.type) {
                case 'SYNC_REQUEST':
                    this.handleSyncRequest(playerId, action);
                    break;
                    
                case 'UPDATE_SETTINGS':
                    this.handleUpdateSettings(playerId, action);
                    break;
                    
                case 'TOGGLE_READY':
                    this.handleToggleReady(playerId, action);
                    break;
                    
                case 'KICK_PLAYER':
                    this.handleKickPlayer(playerId, action);
                    break;
                    
                case 'START_GAME':
                    this.handleStartGame(playerId, action);
                    break;
                    
                default:
                    console.warn(`Unknown action type: ${action.type}`);
            }
        } catch (error) {
            console.error(`Error handling action ${action.type} from ${playerId}:`, error);
            
            // 发送错误响应
            if (action.optimisticId) {
                this.sendActionResult(playerId, action.optimisticId, 'failed', (error as Error).message);
            }
        }
    }

    /**
     * 处理同步请求
     */
    private handleSyncRequest(playerId: PlayerId, action: PreGameClientAction): void {
        const clientVersion = action.payload?.version || 0;
        
        if (clientVersion < this.state.version) {
            // 发送完整状态
            this.sendStateToPlayer(playerId, 'snapshot');
        }
        
        if (action.optimisticId) {
            this.sendActionResult(playerId, action.optimisticId, 'success');
        }
    }

    /**
     * 处理设置更新（仅房主）
     */
    private handleUpdateSettings(playerId: PlayerId, action: PreGameClientAction): void {
        const player = this.state.players.get(playerId);
        if (!player?.isHost) {
            throw new Error('Only host can update settings');
        }

        const { key, value } = action.payload;
        if (!(key in this.state.settings)) {
            throw new Error(`Invalid setting key: ${key}`);
        }

        // 更新设置
        (this.state.settings as any)[key] = value;
        this.incrementVersion();

        // 广播更新
        this.broadcastState('patch');
        this.updateCanStart();

        if (action.optimisticId) {
            this.sendActionResult(playerId, action.optimisticId, 'success');
        }
    }

    /**
     * 处理准备状态切换
     */
    private handleToggleReady(playerId: PlayerId, action: PreGameClientAction): void {
        const player = this.state.players.get(playerId);
        if (!player) {
            throw new Error('Player not found');
        }

        // 房主不需要准备，直接可以开始游戏
        if (player.isHost) {
            throw new Error('Host does not need to be ready');
        }

        player.isReady = !player.isReady;
        this.incrementVersion();

        // 广播更新
        this.broadcastState('patch');
        this.updateCanStart();

        if (action.optimisticId) {
            this.sendActionResult(playerId, action.optimisticId, 'success');
        }
    }

    /**
     * 处理踢出玩家（仅房主）
     */
    private handleKickPlayer(playerId: PlayerId, action: PreGameClientAction): void {
        const player = this.state.players.get(playerId);
        if (!player?.isHost) {
            throw new Error('Only host can kick players');
        }

        const targetPlayerId = action.payload?.targetPlayerId;
        if (!targetPlayerId || targetPlayerId === playerId) {
            throw new Error('Invalid kick target');
        }

        // 移除目标玩家
        this.handlePlayerDisconnect(targetPlayerId);

        if (action.optimisticId) {
            this.sendActionResult(playerId, action.optimisticId, 'success');
        }
    }

    /**
     * 处理开始游戏（仅房主）
     */
    private handleStartGame(playerId: PlayerId, action: PreGameClientAction): void {
        const player = this.state.players.get(playerId);
        if (!player?.isHost) {
            throw new Error('Only host can start game');
        }

        if (!this.state.canStart) {
            throw new Error('Cannot start game: not all players are ready');
        }

        if (this.state.status !== 'waiting') {
            throw new Error('Game is not in waiting status');
        }

        // 开始游戏
        this.startGame();

        if (action.optimisticId) {
            this.sendActionResult(playerId, action.optimisticId, 'success');
        }
    }

    /**
     * 开始游戏
     */
    private async startGame(): Promise<void> {
        this.state.status = 'starting';
        this.incrementVersion();
        
        // 广播游戏即将开始
        this.broadcastState('patch');

        // 给玩家一些时间准备，然后启动游戏
        this.startGameTimer = setTimeout(async () => {
            const players = Array.from(this.state.players.keys());
            await this.connectorManager.onGameStart(this.state.settings, players);
        }, 3000); // 3秒倒计时
    }

    /**
     * 转移房主
     */
    private transferHost(): void {
        // 找到下一个玩家作为房主
        const players = Array.from(this.state.players.values());
        const nextHost = players.find(p => !p.isHost);
        
        if (nextHost) {
            // 移除当前房主标记
            for (const player of this.state.players.values()) {
                player.isHost = false;
            }
            
            // 设置新房主
            nextHost.isHost = true;
            nextHost.isReady = false; // 新房主不需要准备状态
            this.state.hostId = nextHost.playerId;
            
            this.incrementVersion();
            this.updateCanStart();
        }
    }

    /**
     * 更新是否可以开始游戏
     */
    private updateCanStart(): void {
        const players = Array.from(this.state.players.values());
        const nonHostPlayers = players.filter(p => !p.isHost);
        
        // 至少需要2个玩家，且所有非房主玩家都准备好了
        this.state.canStart = 
            players.length >= 2 && 
            nonHostPlayers.every(p => p.isReady) &&
            this.state.status === 'waiting';
    }

    /**
     * 向特定玩家发送状态
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
                    confirmedOp: 0 // PreGame 阶段暂时不需要复杂的操作确认
                }
            });
        } else {
            // TODO: 实现 patch 逻辑
            // 暂时使用 snapshot
            this.sendStateToPlayer(playerId, 'snapshot');
        }
    }

    /**
     * 广播状态给所有玩家
     */
    private broadcastState(type: 'snapshot' | 'patch'): void {
        for (const playerId of this.connectors.keys()) {
            this.sendStateToPlayer(playerId, type);
        }
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
     * 获取客户端状态（可能需要过滤敏感信息）
     */
    private getStateForClient(): any {
        return {
            gameId: this.state.gameId,
            status: this.state.status,
            settings: this.state.settings,
            players: Array.from(this.state.players.values()),
            hostId: this.state.hostId,
            canStart: this.state.canStart
        };
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
        if (this.startGameTimer) {
            clearTimeout(this.startGameTimer);
        }

        // 关闭所有连接
        for (const [playerId, connector] of this.connectors) {
            connector.close();
            this.connectorManager.removeSubConnector(playerId);
        }

        this.connectors.clear();
        this.state.players.clear();
    }

    /**
     * 获取当前状态（用于调试）
     */
    getState(): PreGameState {
        return { ...this.state };
    }
}

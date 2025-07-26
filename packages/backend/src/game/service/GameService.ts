import { ElysiaWS } from 'elysia/ws';
import { PlayerId, GameId } from '@generale/types';
import { PreGameInstance } from '../instance/PreGameInstance';
import { GameInstance } from '../instance/GameInstance';
import { GameChatInstance } from '../instance/GameChatInstance';
import { SubConnector } from './SubConnector';

export interface GameServiceConfig {
    maxPlayersPerGame: number;
    gameTimeout: number;
    heartbeatInterval: number;
}

export interface PlayerConnection {
    playerId: PlayerId;
    ws: ElysiaWS;
    lastHeartbeat: number;
    subConnectors: Map<string, SubConnector>; // domain -> SubConnector
}

export interface GameSession {
    gameId: GameId;
    phase: 'pregame' | 'playing' | 'finished';
    preGameInstance?: PreGameInstance;
    gameInstance?: GameInstance;
    chatInstance: GameChatInstance;
    players: Set<PlayerId>;
    createdAt: number;
}

/**
 * GameService - 游戏服务中央管理器
 * 
 * 职责：
 * 1. 管理所有游戏会话的生命周期
 * 2. 为每个玩家维护 WebSocket 连接
 * 3. 创建和销毁各种游戏实例
 * 4. 处理连接的建立、断开和重连
 * 5. 路由消息到正确的实例
 */
export class GameService {
    private config: GameServiceConfig;
    private connections = new Map<PlayerId, PlayerConnection>();
    private sessions = new Map<GameId, GameSession>();
    private playerToGame = new Map<PlayerId, GameId>();
    private heartbeatTimer?: NodeJS.Timeout;

    constructor(config: GameServiceConfig) {
        this.config = config;
        this.startHeartbeat();
    }

    /**
     * 玩家连接到游戏服务
     */
    async connectPlayer(playerId: PlayerId, ws: ElysiaWS): Promise<void> {
        // 如果玩家已连接，先断开旧连接
        if (this.connections.has(playerId)) {
            await this.disconnectPlayer(playerId);
        }

        const connection: PlayerConnection = {
            playerId,
            ws,
            lastHeartbeat: Date.now(),
            subConnectors: new Map()
        };

        this.connections.set(playerId, connection);

        // 设置 WebSocket 事件处理
        ws.subscribe(`player-${playerId}`);
        
        ws.on('message', (message) => {
            this.handlePlayerMessage(playerId, message);
        });

        ws.on('close', () => {
            this.handlePlayerDisconnect(playerId);
        });

        // 检查玩家是否有正在进行的游戏
        const gameId = this.playerToGame.get(playerId);
        if (gameId) {
            await this.rejoinGame(playerId, gameId);
        }
    }

    /**
     * 玩家断开连接
     */
    async disconnectPlayer(playerId: PlayerId): Promise<void> {
        const connection = this.connections.get(playerId);
        if (!connection) return;

        // 关闭所有 sub connectors
        for (const [domain, subConnector] of connection.subConnectors) {
            subConnector.close();
        }

        // 通知相关游戏实例玩家断开
        const gameId = this.playerToGame.get(playerId);
        if (gameId) {
            const session = this.sessions.get(gameId);
            if (session) {
                session.preGameInstance?.handlePlayerDisconnect(playerId);
                session.gameInstance?.handlePlayerDisconnect(playerId);
                session.chatInstance.handlePlayerDisconnect(playerId);
            }
        }

        this.connections.delete(playerId);
    }

    /**
     * 创建新游戏
     */
    async createGame(hostPlayerId: PlayerId, settings: any): Promise<GameId> {
        const gameId = this.generateGameId();
        
        // 创建聊天实例（贯穿整个游戏生命周期）
        const chatInstance = new GameChatInstance(gameId, {
            createSubConnector: (playerId) => this.createSubConnector(playerId, 'chat'),
            removeSubConnector: (playerId) => this.removeSubConnector(playerId, 'chat')
        });

        // 创建预游戏实例
        const preGameInstance = new PreGameInstance(gameId, hostPlayerId, settings, {
            createSubConnector: (playerId) => this.createSubConnector(playerId, 'pregame'),
            removeSubConnector: (playerId) => this.removeSubConnector(playerId, 'pregame'),
            onGameStart: (finalSettings, players) => this.startGame(gameId, finalSettings, players)
        });

        const session: GameSession = {
            gameId,
            phase: 'pregame',
            preGameInstance,
            chatInstance,
            players: new Set([hostPlayerId]),
            createdAt: Date.now()
        };

        this.sessions.set(gameId, session);
        this.playerToGame.set(hostPlayerId, gameId);

        // 为房主创建连接
        await this.createSubConnector(hostPlayerId, 'pregame');
        await this.createSubConnector(hostPlayerId, 'chat');

        return gameId;
    }

    /**
     * 玩家加入游戏
     */
    async joinGame(playerId: PlayerId, gameId: GameId): Promise<void> {
        const session = this.sessions.get(gameId);
        if (!session) {
            throw new Error('Game not found');
        }

        // 检查游戏是否满员（使用游戏实例的设置）
        let maxPlayers = this.config.maxPlayersPerGame;
        if (session.phase === 'pregame' && session.preGameInstance) {
            maxPlayers = session.preGameInstance.getState().settings.maxPlayers;
        }
        
        if (session.players.size >= maxPlayers) {
            throw new Error('Game is full');
        }

        session.players.add(playerId);
        this.playerToGame.set(playerId, gameId);

        // 根据游戏阶段创建相应的连接
        if (session.phase === 'pregame' && session.preGameInstance) {
            await this.createSubConnector(playerId, 'pregame');
            session.preGameInstance.addPlayer(playerId);
        } else if (session.phase === 'playing' && session.gameInstance) {
            await this.createSubConnector(playerId, 'game');
            session.gameInstance.addPlayer(playerId);
        }

        // 总是创建聊天连接
        await this.createSubConnector(playerId, 'chat');
        session.chatInstance.addPlayer(playerId);
    }

    /**
     * 玩家重新加入游戏（断线重连）
     */
    private async rejoinGame(playerId: PlayerId, gameId: GameId): Promise<void> {
        const session = this.sessions.get(gameId);
        if (!session || !session.players.has(playerId)) {
            this.playerToGame.delete(playerId);
            return;
        }

        // 重新创建连接
        if (session.phase === 'pregame' && session.preGameInstance) {
            await this.createSubConnector(playerId, 'pregame');
            session.preGameInstance.handlePlayerReconnect(playerId);
        } else if (session.phase === 'playing' && session.gameInstance) {
            await this.createSubConnector(playerId, 'game');
            session.gameInstance.handlePlayerReconnect(playerId);
        }

        await this.createSubConnector(playerId, 'chat');
        session.chatInstance.handlePlayerReconnect(playerId);
    }

    /**
     * 开始游戏（从预游戏阶段转换到游戏阶段）
     */
    private async startGame(gameId: GameId, settings: any, players: PlayerId[]): Promise<void> {
        const session = this.sessions.get(gameId);
        if (!session) return;

        // 销毁预游戏实例和相关连接
        if (session.preGameInstance) {
            for (const playerId of players) {
                await this.removeSubConnector(playerId, 'pregame');
            }
            session.preGameInstance.destroy();
            session.preGameInstance = undefined;
        }

        // 创建游戏实例
        session.gameInstance = new GameInstance(gameId, settings, players, {
            createSubConnector: (playerId) => this.createSubConnector(playerId, 'game'),
            removeSubConnector: (playerId) => this.removeSubConnector(playerId, 'game'),
            onGameEnd: (result) => this.endGame(gameId, result)
        });

        // 为所有玩家创建游戏连接
        for (const playerId of players) {
            await this.createSubConnector(playerId, 'game');
        }

        session.phase = 'playing';
    }

    /**
     * 结束游戏
     */
    private async endGame(gameId: GameId, result: any): Promise<void> {
        const session = this.sessions.get(gameId);
        if (!session) return;

        // 清理所有连接
        for (const playerId of session.players) {
            if (session.gameInstance) {
                await this.removeSubConnector(playerId, 'game');
            }
            await this.removeSubConnector(playerId, 'chat');
            this.playerToGame.delete(playerId);
        }

        // 销毁实例
        session.gameInstance?.destroy();
        session.chatInstance.destroy();

        session.phase = 'finished';
        
        // 可选：保留一段时间供查看结果，然后删除
        setTimeout(() => {
            this.sessions.delete(gameId);
        }, 300000); // 5分钟后删除
    }

    /**
     * 创建子连接器
     */
    private async createSubConnector(playerId: PlayerId, domain: string): Promise<SubConnector> {
        const connection = this.connections.get(playerId);
        if (!connection) {
            throw new Error('Player not connected');
        }

        // 如果已存在，先关闭
        const existing = connection.subConnectors.get(domain);
        if (existing) {
            existing.close();
        }

        const subConnector = new SubConnector(playerId, domain, connection.ws);
        connection.subConnectors.set(domain, subConnector);

        // 发送初始同步消息
        await this.sendInitialSync(playerId, domain);

        return subConnector;
    }

    /**
     * 发送初始同步消息
     */
    private async sendInitialSync(playerId: PlayerId, domain: string): Promise<void> {
        const gameId = this.playerToGame.get(playerId);
        if (!gameId) return;
        
        const session = this.sessions.get(gameId);
        if (!session) return;
        
        const connection = this.connections.get(playerId);
        if (!connection) return;
        
        const subConnector = connection.subConnectors.get(domain);
        if (!subConnector) return;
        
        // 根据域发送相应的初始同步消息
        try {
            if (domain === 'pregame' && session.preGameInstance) {
                // 发送游戏设置和玩家状态
                subConnector.send({
                    type: 'SETTINGS_UPDATED',
                    payload: {
                        settings: session.preGameInstance.getState().settings,
                        version: session.preGameInstance.getState().version
                    }
                });
            } else if (domain === 'chat' && session.chatInstance) {
                // 发送欢迎消息
                subConnector.send({
                    type: 'WELCOME',
                    payload: {
                        message: 'Welcome to the game chat!',
                        timestamp: Date.now()
                    }
                });
            }
        } catch (error) {
            console.warn(`Failed to send initial sync for ${domain}:`, error);
        }
    }

    /**
     * 移除子连接器
     */
    private async removeSubConnector(playerId: PlayerId, domain: string): Promise<void> {
        const connection = this.connections.get(playerId);
        if (!connection) return;

        const subConnector = connection.subConnectors.get(domain);
        if (subConnector) {
            subConnector.close();
            connection.subConnectors.delete(domain);
        }
    }

    /**
     * 处理玩家消息
     */
    private handlePlayerMessage(playerId: PlayerId, message: any): void {
        try {
            // 检查消息是否有效
            if (!message || typeof message !== 'object') {
                console.warn(`Invalid message from player ${playerId}:`, message);
                return;
            }
            
            const { domain, ...rest } = message;
            const connection = this.connections.get(playerId);
            
            if (!connection) return;

            const subConnector = connection.subConnectors.get(domain);
            if (subConnector) {
                subConnector.handleMessage(rest);
            }

            // 更新心跳
            connection.lastHeartbeat = Date.now();
        } catch (error) {
            console.error('Error handling player message:', error);
        }
    }

    /**
     * 处理玩家断开连接
     */
    private handlePlayerDisconnect(playerId: PlayerId): void {
        // 标记为断开，但不立即清理（允许重连）
        const connection = this.connections.get(playerId);
        if (connection) {
            // 可以设置一个延迟清理的定时器
            setTimeout(() => {
                if (this.connections.get(playerId) === connection) {
                    this.disconnectPlayer(playerId);
                }
            }, 30000); // 30秒后清理
        }
    }

    /**
     * 心跳检测
     */
    private startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            const now = Date.now();
            const timeout = this.config.heartbeatInterval * 3; // 3倍心跳间隔作为超时

            for (const [playerId, connection] of this.connections) {
                if (now - connection.lastHeartbeat > timeout) {
                    this.handlePlayerDisconnect(playerId);
                }
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * 生成游戏ID
     */
    private generateGameId(): GameId {
        return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as GameId;
    }

    /**
     * HTTP API Methods - Required by routes
     */
    
    /**
     * Create a new game (HTTP API version)
     */
    async createGameForAPI(hostPlayerId: PlayerId, playerName: string, settings?: any): Promise<GameId> {
        const gameId = this.generateGameId();
        
        // Create game session
        const session: GameSession = {
            gameId,
            phase: 'pregame',
            chatInstance: new GameChatInstance(gameId, {
                createSubConnector: (playerId) => this.createSubConnector(playerId, 'chat'),
                removeSubConnector: (playerId) => this.removeSubConnector(playerId, 'chat')
            }),
            players: new Set([hostPlayerId]),
            createdAt: Date.now()
        };
        
        // Create PreGameInstance
        session.preGameInstance = new PreGameInstance(gameId, hostPlayerId, settings || {}, {
            createSubConnector: (playerId) => this.createSubConnector(playerId, 'pregame'),
            removeSubConnector: (playerId) => this.removeSubConnector(playerId, 'pregame'),
            onGameStart: (gameSettings, players) => this.startGame(gameId, gameSettings, players)
        });
        
        this.sessions.set(gameId, session);
        this.playerToGame.set(hostPlayerId, gameId);
        
        return gameId;
    }
    
    /**
     * Join an existing game (HTTP API version)
     */
    async joinGameForAPI(gameId: GameId, playerId: PlayerId, playerName: string, password?: string): Promise<boolean> {
        const session = this.sessions.get(gameId);
        if (!session || session.phase !== 'pregame') {
            return false;
        }
        
        if (session.players.size >= this.config.maxPlayersPerGame) {
            return false;
        }
        
        // Add player to session
        session.players.add(playerId);
        this.playerToGame.set(playerId, gameId);
        
        // Add player to PreGameInstance (assuming it has an addPlayer method)
        if (session.preGameInstance) {
            // Note: This assumes PreGameInstance has an addPlayer method
            // If not, we'll handle it in the WebSocket connection phase
        }
        
        return true;
    }
    
    /**
     * Get game information
     */
    async getGameInfo(gameId: GameId): Promise<any | null> {
        const session = this.sessions.get(gameId);
        if (!session) {
            return null;
        }
        
        return {
            gameId,
            phase: session.phase,
            playerCount: session.players.size,
            maxPlayers: this.config.maxPlayersPerGame,
            createdAt: session.createdAt,
            canJoin: session.phase === 'pregame' && session.players.size < this.config.maxPlayersPerGame
        };
    }
    
    /**
     * List active games
     */
    async listActiveGames(options: { includePrivate?: boolean; limit?: number } = {}): Promise<any[]> {
        const games = [];
        const limit = options.limit || 20;
        
        for (const [gameId, session] of this.sessions.entries()) {
            if (session.phase === 'finished') continue;
            if (games.length >= limit) break;
            
            games.push({
                gameId,
                phase: session.phase,
                playerCount: session.players.size,
                maxPlayers: this.config.maxPlayersPerGame,
                createdAt: session.createdAt,
                canJoin: session.phase === 'pregame' && session.players.size < this.config.maxPlayersPerGame
            });
        }
        
        return games;
    }
    
    /**
     * Check if player can connect to game
     */
    async canPlayerConnect(gameId: GameId, playerId: PlayerId): Promise<boolean> {
        const session = this.sessions.get(gameId);
        if (!session) {
            return false;
        }
        
        return session.players.has(playerId);
    }
    
    /**
     * Leave game
     */
    async leaveGame(gameId: GameId, playerId: PlayerId): Promise<boolean> {
        const session = this.sessions.get(gameId);
        if (!session || !session.players.has(playerId)) {
            return false;
        }
        
        // Remove player from session
        session.players.delete(playerId);
        this.playerToGame.delete(playerId);
        
        // Remove from PreGameInstance
        if (session.preGameInstance) {
            session.preGameInstance.removePlayer(playerId);
        }
        
        // If no players left, clean up the game
        if (session.players.size === 0) {
            this.cleanupSession(gameId);
        }
        
        return true;
    }
    
    /**
     * WebSocket message handlers
     */
    
    handleDisconnect(playerId: PlayerId): void {
        this.handlePlayerDisconnect(playerId);
    }
    
    handleSync(playerId: PlayerId, gameId: GameId, version: number): void {
        // Implementation for sync handling
        const connection = this.connections.get(playerId);
        if (!connection) return;
        
        // Send current state based on version
        this.sendInitialSync(playerId, 'game');
    }
    
    handleAction(playerId: PlayerId, gameId: GameId, actionEnvelope: any): void {
        // Implementation for action handling
        const session = this.sessions.get(gameId);
        if (!session) return;
        
        // Route to appropriate instance based on game phase
        if (session.phase === 'pregame' && session.preGameInstance) {
            session.preGameInstance.handleAction(playerId, actionEnvelope);
        } else if (session.phase === 'playing' && session.gameInstance) {
            session.gameInstance.handleAction(playerId, actionEnvelope);
        }
    }
    
    handleChatAction(playerId: PlayerId, gameId: GameId, chatAction: any): void {
        const session = this.sessions.get(gameId);
        if (!session) return;
        
        session.chatInstance.handleAction(playerId, chatAction);
    }
    
    updateHeartbeat(playerId: PlayerId): void {
        const connection = this.connections.get(playerId);
        if (connection) {
            connection.lastHeartbeat = Date.now();
        }
    }
    
    /**
     * Sub-connector management methods
     */
    
    handleSubConnectorOpen(playerId: PlayerId, domain: string, subConnector: any): void {
        const connection = this.connections.get(playerId);
        if (!connection) {
            console.warn(`No connection found for player ${playerId}`);
            return;
        }
        
        // Store the sub-connector reference
        connection.subConnectors.set(domain, subConnector);
        
        // Handle domain-specific initialization
        const gameId = this.playerToGame.get(playerId);
        if (gameId) {
            const session = this.sessions.get(gameId);
            if (session) {
                switch (domain) {
                    case 'game':
                    case 'pregame':
                        // Initialize game-related sub-connector
                        this.initializeGameSubConnector(playerId, gameId, domain, subConnector);
                        break;
                    case 'chat':
                        // Initialize chat sub-connector
                        this.initializeChatSubConnector(playerId, gameId, subConnector);
                        break;
                    default:
                        console.warn(`Unknown domain: ${domain}`);
                }
            }
        }
        
        console.log(`Sub-connector opened for player ${playerId}, domain: ${domain}`);
    }
    
    handleSubConnectorClose(playerId: PlayerId, domain: string): void {
        const connection = this.connections.get(playerId);
        if (!connection) {
            return;
        }
        
        const subConnector = connection.subConnectors.get(domain);
        if (subConnector) {
            // Clean up sub-connector
            connection.subConnectors.delete(domain);
            console.log(`Sub-connector closed for player ${playerId}, domain: ${domain}`);
        }
    }
    
    handleSubConnectorMessage(playerId: PlayerId, domain: string, payload: any): void {
        const gameId = this.playerToGame.get(playerId);
        if (!gameId) {
            console.warn(`No game found for player ${playerId}`);
            return;
        }
        
        const session = this.sessions.get(gameId);
        if (!session) {
            console.warn(`No session found for game ${gameId}`);
            return;
        }
        
        // Route message based on domain
        switch (domain) {
            case 'pregame':
                if (session.preGameInstance) {
                    // Handle pregame messages (e.g., ready status, settings changes)
                    this.handlePreGameMessage(playerId, payload);
                }
                break;
            case 'game':
                if (session.gameInstance) {
                    // Handle game messages (e.g., moves, actions)
                    this.handleGameMessage(playerId, payload);
                }
                break;
            case 'chat':
                // Handle chat messages
                this.handleChatMessage(playerId, gameId, payload);
                break;
            default:
                console.warn(`Unknown domain: ${domain}`);
        }
    }
    
    private initializeGameSubConnector(playerId: PlayerId, gameId: GameId, domain: string, subConnector: any): void {
        // Send initial game state or pregame state to the player
        const session = this.sessions.get(gameId);
        if (!session) return;
        
        if (domain === 'pregame' && session.preGameInstance) {
            // Send pregame state
            subConnector.send({
                type: 'state_sync',
                payload: {
                    phase: 'pregame',
                    players: Array.from(session.players),
                    // Add more pregame state as needed
                }
            });
        } else if (domain === 'game' && session.gameInstance) {
            // Send game state
            subConnector.send({
                type: 'state_sync',
                payload: {
                    phase: 'playing',
                    // Add game state as needed
                }
            });
        }
    }
    
    private initializeChatSubConnector(playerId: PlayerId, gameId: GameId, subConnector: any): void {
        // Send recent chat history or initialize chat
        subConnector.send({
            type: 'chat_init',
            payload: {
                gameId,
                playerId,
                // Add chat history as needed
            }
        });
    }
    
    private handlePreGameMessage(playerId: PlayerId, payload: any): void {
        // Handle pregame-specific messages
        console.log(`Pregame message from ${playerId}:`, payload);
        // TODO: Implement pregame message handling
    }
    
    private handleGameMessage(playerId: PlayerId, payload: any): void {
        // Handle game-specific messages
        console.log(`Game message from ${playerId}:`, payload);
        // TODO: Implement game message handling
    }
    
    private handleChatMessage(playerId: PlayerId, gameId: GameId, payload: any): void {
        // Handle chat messages
        console.log(`Chat message from ${playerId} in game ${gameId}:`, payload);
        const session = this.sessions.get(gameId);
        if (session && session.chatInstance) {
            // Forward to chat instance
            // TODO: Implement chat message forwarding
        }
    }
    
    private cleanupSession(gameId: GameId): void {
        const session = this.sessions.get(gameId);
        if (!session) return;
        
        // Clean up instances
        session.preGameInstance?.destroy();
        session.gameInstance?.destroy();
        session.chatInstance.destroy();
        
        // Remove session
        this.sessions.delete(gameId);
    }

    /**
     * 销毁服务，清理所有资源
     */
    destroy(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        for (const session of this.sessions.values()) {
            session.preGameInstance?.destroy();
            session.gameInstance?.destroy();
            session.chatInstance.destroy();
        }
    }
}

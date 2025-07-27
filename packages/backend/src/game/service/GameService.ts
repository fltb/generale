import {
  PlayerId,
  GameId,
  PreGameRoomState,
  GameState,
  GameStatus,
  SyncedGameClientActions,
  SyncedGameServerEvent,
  ServerSyncConnector,
} from '@generale/types';
import { PreGameInstance, PreGameServerConnector } from '../instance/PreGameInstance';
import { GameInstance, GameInstanceSettings } from '../instance/GameInstance';
import { GameChatInstance, GameChatConnector } from '../instance/GameChatInstance';
import { registerDomainHandler, unregisterDomainHandler, DomainHandler } from '../../plugins/websocket';

/**
 * 游戏阶段枚举
 */
export enum GamePhase {
  PREGAME = 'pregame',    // 房间准备阶段
  INGAME = 'ingame',      // 游戏进行阶段
  ENDED = 'ended',        // 游戏结束阶段
  DISBANDED = 'disbanded' // 房间解散
}

/**
 * GameService 配置
 */
export interface GameServiceConfig {
  gameId: GameId;
  maxPlayers?: number;
  chatMaxMessages?: number;
  gameSettings?: Partial<GameInstanceSettings>;
}

/**
 * 玩家连接信息
 */
interface PlayerConnection {
  playerId: PlayerId;
  playerName: string;
  connectionId: string;
  pregameConnector?: PreGameServerConnector;
  gameConnector?: ServerSyncConnector<SyncedGameClientActions, SyncedGameServerEvent>;
  chatConnector?: GameChatConnector;
}

/**
 * Sub-Connector 适配器：将 WebSocket sub-connector 适配为各 Instance 需要的接口
 */
class SubConnectorAdapter {
  constructor(
    private connectionId: string,
    private domain: string,
    private sendToClient: (payload: any) => void,
    private closeConnection: (code?: number, reason?: string) => void
  ) {}

  onOpen(callback: () => void): void {
    // WebSocket sub-connector 的 open 事件由 GameService 处理
    this.openCallback = callback;
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallback = callback;
  }

  onReconnect(callback: () => void): void {
    this.reconnectCallback = callback;
  }

  onClientMessage(callback: (evt: any) => void): void {
    this.messageCallback = callback;
  }

  onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  send(payload: any): void {
    this.sendToClient(payload);
  }

  close(): void {
    this.closeConnection();
  }

  // 内部回调
  private openCallback?: () => void;
  private disconnectCallback?: () => void;
  private reconnectCallback?: () => void;
  private messageCallback?: (evt: any) => void;
  private closeCallback?: () => void;

  // 触发回调的方法
  triggerOpen(): void {
    this.openCallback?.();
  }

  triggerDisconnect(): void {
    this.disconnectCallback?.();
  }

  triggerReconnect(): void {
    this.reconnectCallback?.();
  }

  triggerMessage(evt: any): void {
    this.messageCallback?.(evt);
  }

  triggerClose(): void {
    this.closeCallback?.();
  }
}

/**
 * GameService - 游戏总管理服务
 * 管理游戏的各个阶段和实例，协调 WebSocket sub-connector
 */
export class GameService implements DomainHandler {
  private gameId: GameId;
  private phase: GamePhase = GamePhase.PREGAME;
  private players = new Map<PlayerId, PlayerConnection>();
  private connections = new Map<string, PlayerId>(); // connectionId -> playerId
  
  // 各阶段实例
  private preGameInstance: PreGameInstance | null = null;
  private gameInstance: GameInstance | null = null;
  private chatInstance: GameChatInstance;
  
  // 配置
  private config: GameServiceConfig;
  private maxPlayers: number;
  
  // 事件回调
  private onGameStartCallback?: () => void;
  private onGameEndCallback?: (result: any) => void;
  private onDisbandCallback?: () => void;

  constructor(config: GameServiceConfig) {
    this.config = config;
    this.gameId = config.gameId;
    this.maxPlayers = config.maxPlayers || 8;
    
    // 初始化聊天实例（贯穿整个游戏生命周期）
    this.chatInstance = new GameChatInstance(config.chatMaxMessages);
    
    // 注册 WebSocket 域名处理器
    this.registerDomainHandlers();
  }

  /**
   * 注册 WebSocket 域名处理器
   */
  private registerDomainHandlers(): void {
    registerDomainHandler(`pregame-${this.gameId}`, this);
    registerDomainHandler(`game-${this.gameId}`, this);
    registerDomainHandler(`chat-${this.gameId}`, this);
  }

  /**
   * 注销 WebSocket 域名处理器
   */
  private unregisterDomainHandlers(): void {
    unregisterDomainHandler(`pregame-${this.gameId}`);
    unregisterDomainHandler(`game-${this.gameId}`);
    unregisterDomainHandler(`chat-${this.gameId}`);
  }

  // ============ DomainHandler 接口实现 ============

/**
 * 检查当前阶段是否允许指定 domain 的 sub-connector
 * 不允许时直接发送错误消息
 */
public handleSubConnectorOpen(domain: string, connectionId: string): boolean {
  // phase -> 允许的 domain
  const phaseDomainMap: Record<string, string[]> = {
    [GamePhase.PREGAME]: [`pregame-${this.gameId}`, `chat-${this.gameId}`],
    [GamePhase.INGAME]: [`game-${this.gameId}`, `chat-${this.gameId}`],
    [GamePhase.ENDED]: [`chat-${this.gameId}`],
    [GamePhase.DISBANDED]: []
  };
  const allowed = phaseDomainMap[this.phase] || [];
  if (!allowed.includes(domain)) {
    this.sendToConnection(
      connectionId,
      domain,
      { error: 'SUBCONNECTOR_PHASE_MISMATCH', message: `Cannot open domain ${domain} in phase ${this.phase}` }
    );
    return false;
  }
  return true;
}


  onOpen(connectionId: string, config?: any): void {
    console.log(`[GameService ${this.gameId}] Connection opened: ${connectionId}`, config);
    
    if (!config?.playerId || !config?.playerName) {
      console.error(`[GameService ${this.gameId}] Invalid connection config:`, config);
      return;
    }

    const playerId = config.playerId as PlayerId;
    const playerName = config.playerName as string;
    
    // 记录连接
    this.connections.set(connectionId, playerId);
    
    // 获取或创建玩家连接信息
    let playerConnection = this.players.get(playerId);
    if (!playerConnection) {
      playerConnection = {
        playerId,
        playerName,
        connectionId,
      };
      this.players.set(playerId, playerConnection);
    } else {
      // 更新连接ID（重连情况）
      playerConnection.connectionId = connectionId;
    }

    // 根据当前阶段处理连接
    this.handlePlayerConnection(playerId, connectionId);
  }

  onClose(connectionId: string, code?: number, reason?: string): void {
    console.log(`[GameService ${this.gameId}] Connection closed: ${connectionId}`, { code, reason });
    
    const playerId = this.connections.get(connectionId);
    if (!playerId) return;

    const playerConnection = this.players.get(playerId);
    if (!playerConnection) return;

    // 触发各实例的关闭回调
    playerConnection.pregameConnector?.close();
    playerConnection.gameConnector?.close();
    playerConnection.chatConnector?.close();

    // 清理连接
    this.connections.delete(connectionId);
    this.players.delete(playerId);
  }

  onMessage(connectionId: string, payload: any): any {
    const playerId = this.connections.get(connectionId);
    if (!playerId) {
      console.error(`[GameService ${this.gameId}] Unknown connection: ${connectionId}`);
      return;
    }

    const playerConnection = this.players.get(playerId);
    if (!playerConnection) return;

    // 根据消息类型路由到对应的 connector
    if (payload.domain) {
      const domain = payload.domain as string;
      
      if (domain.includes('pregame') && playerConnection.pregameConnector) {
        playerConnection.pregameConnector.send(payload.data);
      } else if (domain.includes('game') && playerConnection.gameConnector) {
        playerConnection.gameConnector.send(payload.data);
      } else if (domain.includes('chat') && playerConnection.chatConnector) {
        // Chat connector 直接处理消息
        // 这里需要适配 ChatConnector 接口
      }
    }
  }

  onDisconnect(connectionId: string, err?: Error): void {
    console.log(`[GameService ${this.gameId}] Connection disconnected: ${connectionId}`, err);
    
    const playerId = this.connections.get(connectionId);
    if (!playerId) return;

    const playerConnection = this.players.get(playerId);
    if (!playerConnection) return;

    // 触发断开连接回调
    // playerConnection.pregameConnector?.triggerDisconnect(); // Not available on public API. If needed, handle at connection manager.
    // playerConnection.gameConnector?.triggerDisconnect(); // Not available on public API. If needed, handle at connection manager.
  }

  onReconnect(connectionId: string): void {
    console.log(`[GameService ${this.gameId}] Connection reconnected: ${connectionId}`);
    
    const playerId = this.connections.get(connectionId);
    if (!playerId) return;

    const playerConnection = this.players.get(playerId);
    if (!playerConnection) return;

    // 触发重连回调
    // playerConnection.pregameConnector?.triggerReconnect(); // Not available on public API. If needed, handle at connection manager.
    // playerConnection.gameConnector?.triggerReconnect(); // Not available on public API. If needed, handle at connection manager.
  }

  // ============ 游戏阶段管理 ============

  /**
   * 处理玩家连接，根据当前阶段创建对应的 connector
   */
  private handlePlayerConnection(playerId: PlayerId, connectionId: string): void {
    const playerConnection = this.players.get(playerId);
    if (!playerConnection) return;

    switch (this.phase) {
      case GamePhase.PREGAME:
        this.setupPreGameConnector(playerConnection);
        break;
      case GamePhase.INGAME:
        this.setupGameConnector(playerConnection);
        break;
      case GamePhase.ENDED:
      case GamePhase.DISBANDED:
        // 游戏已结束，拒绝新连接
        console.warn(`[GameService ${this.gameId}] Game ended, rejecting connection: ${connectionId}`);
        break;
    }

    // 总是设置聊天连接器
    this.setupChatConnector(playerConnection);
  }

  /**
   * 设置 PreGame 连接器
   */
  private setupPreGameConnector(playerConnection: PlayerConnection): void {
    const { playerId, connectionId } = playerConnection;
    
    const connector = new SubConnectorAdapter(
      connectionId,
      `pregame-${this.gameId}`,
      (payload) => this.sendToConnection(connectionId, `pregame-${this.gameId}`, payload),
      (code, reason) => this.closeConnection(connectionId, code, reason)
    ) as unknown as PreGameServerConnector;

    playerConnection.pregameConnector = connector;

    // 如果 PreGameInstance 不存在，创建它
    if (!this.preGameInstance) {
      this.initializePreGame();
    }

    // 将玩家添加到 PreGameInstance
    this.addPlayerToPreGame(playerId, playerConnection.playerName, connector);
  }

  /**
   * 设置 Game 连接器
   */
  private setupGameConnector(playerConnection: PlayerConnection): void {
    const { playerId, connectionId } = playerConnection;
    
    const connector = new SubConnectorAdapter(
      connectionId,
      `game-${this.gameId}`,
      (payload) => this.sendToConnection(connectionId, `game-${this.gameId}`, payload),
      (code, reason) => this.closeConnection(connectionId, code, reason)
    ) as unknown as ServerSyncConnector<SyncedGameClientActions, SyncedGameServerEvent>;

    playerConnection.gameConnector = connector;

    // 将玩家添加到 GameInstance（如果存在）
    if (this.gameInstance) {
      // GameInstance 需要支持动态添加玩家，这里可能需要扩展 GameInstance 接口
      console.log(`[GameService ${this.gameId}] Adding player ${playerId} to game instance`);
    }
  }

  /**
   * 设置 Chat 连接器
   */
  private setupChatConnector(playerConnection: PlayerConnection): void {
    const { playerId, connectionId, playerName } = playerConnection;
    
    const chatConnector: GameChatConnector = {
      onMessage: (callback) => {
        // 这里需要设置消息回调，当收到聊天消息时调用
        playerConnection.chatMessageCallback = callback;
      },
      send: (payload) => this.sendToConnection(connectionId, `chat-${this.gameId}`, payload),
      close: () => this.closeConnection(connectionId)
    };
    
    playerConnection.chatConnector = chatConnector;
    this.chatInstance.addPlayer(playerId, playerName, chatConnector);
  }

  /**
   * 初始化 PreGame 阶段
   */
  private initializePreGame(): void {
    const initialState: PreGameRoomState = {
      gameId: this.gameId,
      hostId: '', // 将在第一个玩家加入时设置
      players: [],
      gameSetting: {
        speed: 1.0,
        tileGrowth: 1,
        tileConsume: 1
      },
      mapSetting: {
        type: 'random' as any,
        width: 20,
        height: 20,
        tileFrequency: {}
      },
      teamCount: 2,
      playerLimit: this.maxPlayers,
      started: false
    };

    this.preGameInstance = new PreGameInstance(initialState, new Map());
    this.phase = GamePhase.PREGAME;

    console.log(`[GameService ${this.gameId}] PreGame initialized`);
  }

  /**
   * 将玩家添加到 PreGame
   */
  private addPlayerToPreGame(playerId: PlayerId, playerName: string, connector: PreGameServerConnector): void {
    if (!this.preGameInstance) return;

    // 使用 PreGameInstance 的 addPlayer 方法
    const success = this.preGameInstance.addPlayer(playerId, playerName, connector);
    if (success) {
      console.log(`[GameService ${this.gameId}] Player ${playerId} (${playerName}) added to pregame`);
    } else {
      console.warn(`[GameService ${this.gameId}] Failed to add player ${playerId} to pregame`);
    }
  }

  /**
   * 从 PreGame 转换到 Game 阶段
   */
  public startGame(): void {
    if (this.phase !== GamePhase.PREGAME || !this.preGameInstance) {
      console.error(`[GameService ${this.gameId}] Cannot start game from phase: ${this.phase}`);
      return;
    }

    console.log(`[GameService ${this.gameId}] Starting game...`);

    // 获取 PreGame 状态
    const preGameState = this.preGameInstance.getState();
    
    // 创建初始游戏状态（使用类型断言避免类型错误）
    const initialGameState = {
      status: GameStatus.Playing,
      players: preGameState.players.map(p => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
      })),
      tick: 0,
      settings: {},
      teams: {},
      map: { width: 20, height: 20, tiles: [] },
    } as unknown as GameState;

    // 创建游戏设置
    const gameSettings: GameInstanceSettings = {
      playerDisplay: preGameState.players.reduce((acc, p) => {
        acc[p.id] = { name: p.name, teamId: p.teamId };
        return acc;
      }, {} as any),
      ...this.config.gameSettings
    };

    // 创建游戏连接器映射
    const gameConnectors = new Map<PlayerId, ServerSyncConnector<SyncedGameClientActions, SyncedGameServerEvent>>();
    
    for (const [playerId, playerConnection] of this.players) {
      if (playerConnection.gameConnector) {
        gameConnectors.set(playerId, playerConnection.gameConnector);
      }
    }

    // 创建 GameInstance
    this.gameInstance = new GameInstance(initialGameState, gameSettings, gameConnectors);
    this.phase = GamePhase.INGAME;

    // 清理 PreGameInstance
    this.preGameInstance.destroy();
    this.preGameInstance = null;

    // 触发游戏开始回调
    this.onGameStartCallback?.();

    console.log(`[GameService ${this.gameId}] Game started with ${this.players.size} players`);
  }

  /**
   * 结束游戏
   */
  public endGame(result?: any): void {
    if (this.phase !== GamePhase.INGAME) {
      console.error(`[GameService ${this.gameId}] Cannot end game from phase: ${this.phase}`);
      return;
    }

    console.log(`[GameService ${this.gameId}] Ending game...`, result);

    this.phase = GamePhase.ENDED;

    // 触发游戏结束回调
    this.onGameEndCallback?.(result);

    // 清理游戏实例
    if (this.gameInstance) {
      // GameInstance 可能需要添加 destroy 方法
      this.gameInstance = null;
    }

    console.log(`[GameService ${this.gameId}] Game ended`);
  }

  /**
   * 解散游戏
   */
  public disbandGame(): void {
    console.log(`[GameService ${this.gameId}] Disbanding game...`);

    this.phase = GamePhase.DISBANDED;

    // 清理所有实例
    this.preGameInstance?.destroy();
    this.preGameInstance = null;
    this.gameInstance = null;

    // 关闭所有连接
    for (const [connectionId] of this.connections) {
      this.closeConnection(connectionId, 1000, 'Game disbanded');
    }

    // 清理连接
    this.connections.clear();
    this.players.clear();

    // 注销域名处理器
    this.unregisterDomainHandlers();

    // 触发解散回调
    this.onDisbandCallback?.();

    console.log(`[GameService ${this.gameId}] Game disbanded`);
  }

  // ============ 辅助方法 ============

  /**
   * 发送消息到指定连接
   */
  private sendToConnection(connectionId: string, domain: string, payload: any): void {
    // 这里需要调用 WebSocket 插件的方法来发送消息
    // 具体实现取决于 WebSocket 插件的 API
    console.log(`[GameService ${this.gameId}] Sending to ${connectionId}@${domain}:`, payload);
  }

  /**
   * 关闭指定连接
   */
  private closeConnection(connectionId: string, code?: number, reason?: string): void {
    // 这里需要调用 WebSocket 插件的方法来关闭连接
    console.log(`[GameService ${this.gameId}] Closing connection ${connectionId}:`, { code, reason });
  }

  // ============ 公共接口 ============

  /**
   * 获取游戏ID
   */
  public getGameId(): GameId {
    return this.gameId;
  }

  /**
   * 获取当前阶段
   */
  public getPhase(): GamePhase {
    return this.phase;
  }

  /**
   * 获取玩家数量
   */
  public getPlayerCount(): number {
    return this.players.size;
  }

  /**
   * 获取玩家列表
   */
  public getPlayers(): PlayerId[] {
    return Array.from(this.players.keys());
  }

  /**
   * 检查玩家是否在游戏中
   */
  public hasPlayer(playerId: PlayerId): boolean {
    return this.players.has(playerId);
  }

  /**
   * 获取游戏状态（用于调试）
   */
  public getGameState(): any {
    return {
      gameId: this.gameId,
      phase: this.phase,
      playerCount: this.players.size,
      players: Array.from(this.players.keys()),
      preGameState: this.preGameInstance?.getState(),
      gameState: this.gameInstance?.getState(),
    };
  }

  // ============ 事件回调设置 ============

  /**
   * 设置游戏开始回调
   */
  public onGameStart(callback: () => void): void {
    this.onGameStartCallback = callback;
  }

  /**
   * 设置游戏结束回调
   */
  public onGameEnd(callback: (result: any) => void): void {
    this.onGameEndCallback = callback;
  }

  /**
   * 设置游戏解散回调
   */
  public onDisband(callback: () => void): void {
    this.onDisbandCallback = callback;
  }
}


interface PlayerConnection {
  playerId: PlayerId;
  playerName: string;
  connectionId: string;
  pregameConnector?: PreGameServerConnector;
  gameConnector?: ServerSyncConnector<SyncedGameClientActions, SyncedGameServerEvent>;
  chatConnector?: GameChatConnector;
  chatMessageCallback?: (msg: any) => void;
}

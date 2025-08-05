import {
  PlayerCore, TeamCore, TeamId, GameSettings, GameMap, PlayerStatus, SyncedGameState, PreGameMapType,
  PlayerId,
  GameId,
  PreGameRoomState,
  GameState,
  GameStatus,
  SyncedGameClientActions,
  SyncedGameServerEvent,
  SyncedPreGameClientActions,
  SyncedPreGameServerEvent,
  ChatClientToServer,
  ChatServerToClient,
  ServerSyncConnector,
} from '@generale/types';
import { PreGameInstance, PreGameServerConnector } from '../instance/PreGameInstance';
import { GameInstance, GameInstanceSettings } from '../instance/GameInstance';
import { GameChatInstance, GameChatConnector } from '../instance/GameChatInstance';
import { registerDomainHandler, unregisterDomainHandler, DomainHandler, SubConnector } from '../../plugins/websocket';
import { generateMap } from '../core/map-gen';

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
  gameTimeout?: number;          // Optional: game timeout in ms
  heartbeatInterval?: number;    // Optional: heartbeat interval in ms
  gameSettings?: Partial<GameInstanceSettings>;
}


/**
 * GameService - 游戏总管理服务
 * 管理游戏的各个阶段和实例，协调 WebSocket sub-connector
 */
export class GameService {
  // ...existing fields...
  /** Tick timer ID for scheduled game advancement */
  private tickTimerId: NodeJS.Timeout | null = null;

  private gameId: GameId;
  private phase: GamePhase = GamePhase.PREGAME;

  // 各阶段实例
  private preGameInstance: PreGameInstance | null = null;
  private gameInstance: GameInstance | null = null;
  private chatInstance: GameChatInstance;

  // 配置
  private config: GameServiceConfig;

  // 事件回调
  private onGameStartCallback?: () => void;
  private onGameEndCallback?: (result: any) => void;
  private onDisbandCallback?: () => void;

  constructor(config: GameServiceConfig) {
    this.config = config;
    this.gameId = config.gameId;

    // 初始化聊天实例（贯穿整个游戏生命周期）
    this.chatInstance = new GameChatInstance(config.chatMaxMessages);

    // 注册 WebSocket 域名处理器
    this.registerDomainHandlers();
  }

  /**
   * 注册 WebSocket 域名处理器
   */
  private registerDomainHandlers(): void {
    // 注册 pregame 域名处理器
    registerDomainHandler('pregame-' + this.gameId, this.createPregameDomainHandler());

    // 注册 game 域名处理器
    registerDomainHandler('game-' + this.gameId, this.createGameDomainHandler());

    // 注册 chat 域名处理器
    registerDomainHandler('chat-' + this.gameId, this.createChatDomainHandler());
  }

  /**
   * 注销 WebSocket 域名处理器
   */
  private unregisterDomainHandlers(): void {
    unregisterDomainHandler(`pregame-${this.gameId}`);
    unregisterDomainHandler(`game-${this.gameId}`);
    unregisterDomainHandler(`chat-${this.gameId}`);
  }

  // ============ DomainHandler 创建方法 ============

  /**
   * 创建 Pregame 域名处理器
   */
  private createPregameDomainHandler(): DomainHandler<SyncedPreGameClientActions, SyncedPreGameServerEvent> {
    return (connector: SubConnector<SyncedPreGameClientActions, SyncedPreGameServerEvent>) => {
      const ctx = connector.context;
      const { userid, username } = ctx;

      if (!userid || !username) {
        connector.close(4001, 'Missing userid or username');
        return;
      }

      // 检查阶段是否允许 pregame 连接
      if (this.phase !== GamePhase.PREGAME) {
        connector.close(4002, 'Invalid phase for pregame');
        return;
      }

      // 初始化 PreGameInstance（如果不存在）
      if (!this.preGameInstance) {
        this.initializePreGame();
      }

      // 将玩家添加到 PreGameInstance
      if (this.preGameInstance) {
        const result = this.preGameInstance.addPlayer({ id: userid, name: username }, this.adaptToPregameConnector(connector));
        if (!result.success) {
          connector.close(4003, 'Failed to add to pregame');
          return;
        }
      }
    };
  }

  /**
   * 创建 Game 域名处理器
   */
  private createGameDomainHandler(): DomainHandler<SyncedGameClientActions, SyncedGameServerEvent> {
    return (connector: SubConnector<SyncedGameClientActions, SyncedGameServerEvent>) => {
      const ctx = connector.context;
      const { userid, username } = ctx;

      if (!userid || !username) {
        connector.close(4001, 'Missing userid or username');
        return;
      }

      // 检查阶段是否允许 game 连接
      if (this.phase !== GamePhase.INGAME) {
        connector.close(4002, 'Invalid phase for game');
        return;
      }

      // 新接口：动态绑定 GameInstance connector
      if (this.gameInstance) {
        const res = this.gameInstance.addPlayer({ id: userid, name: username }, this.adaptToGameConnector(connector));
        if (!res.success) {
          connector.close(4003, res.message);
          return;
        }
      }
    };
  }

  /**
   * 创建 Chat 域名处理器
   */
  private createChatDomainHandler(): DomainHandler<ChatClientToServer, ChatServerToClient> {
    return (connector: SubConnector<ChatClientToServer, ChatServerToClient>) => {
      const ctx = connector.context;
      const { userid, username } = ctx;

      if (!userid || !username) {
        connector.close(4001, 'Missing userid or username');
        return;
      }

      // Chat 在所有阶段都可用（除了 DISBANDED）
      if (this.phase === GamePhase.DISBANDED) {
        connector.close(4004, 'Game disbanded');
        return;
      }

      // 获取玩家连接
      // 将玩家添加到 ChatInstance
      const res = this.chatInstance.addPlayer({ id: userid, name: username }, this.adaptToChatConnector(connector));
      if (!res.success) {
        connector.close(4003, res.message);
        return;
      }
    };
  }

  // ============ Connector 适配方法 ============

  /**
   * 将 SubConnector<SyncedPreGameClientActions, SyncedPreGameServerEvent, { playerId: PlayerId; playerName: string }> 适配为 PreGameServerConnector
   */
  private adaptToPregameConnector(connector: SubConnector<SyncedPreGameClientActions, SyncedPreGameServerEvent>): PreGameServerConnector {
    return connector;
  }

  /**
   * 将 SubConnector<SyncedPreGameClientActions, SyncedPreGameServerEvent, { playerId: PlayerId; playerName: string }> 适配为 ServerSyncConnector
   */
  private adaptToGameConnector(connector: SubConnector<SyncedGameClientActions, SyncedGameServerEvent>): ServerSyncConnector<SyncedGameClientActions, SyncedGameServerEvent> {
    return connector;
  }

  /**
   * 将 SubConnector<SyncedPreGameClientActions, SyncedPreGameServerEvent, { playerId: PlayerId; playerName: string }> 适配为 GameChatConnector
   */
  private adaptToChatConnector(connector: SubConnector<ChatClientToServer, ChatServerToClient>): GameChatConnector {
    return connector;
  }

  // ============ 游戏阶段管理 ============

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
        tileGrow: {
          PLAIN:   { duration: 40,      growth: 1 },
          THRONE:  { duration: 1,       growth: 1 },
          BARRACKS:{ duration: 1,       growth: 1 },
          MOUNTAIN:{ duration: 1e10,    growth: 0 },
          SWAMP:   { duration: 1,       growth: -1 },
          FOG:     { duration: 1e10,    growth: 0 },
        },
        afkThreshold: 30,
      },
      mapSetting: {
        type: PreGameMapType.Random,
        width: 20,
        height: 20,
        tileFrequency: {}
      },
      teamCount: 2,
      playerLimit: this.config.maxPlayers ?? 8,
      started: false
    };

    this.preGameInstance = new PreGameInstance(initialState, new Map());
    this.phase = GamePhase.PREGAME;
    this.chatInstance.activeStageInstance = this.preGameInstance;

    this.preGameInstance.onStartGame(this.startGame.bind(this));

    console.log(`[GameService ${this.gameId}] PreGame initialized`);
  }

  /**
   * 从 PreGame 转换到 Game 阶段
   */
  public startGame(state: PreGameRoomState): void {


    if (this.phase !== GamePhase.PREGAME || !this.preGameInstance) {
      console.error(`[GameService ${this.gameId}] Cannot start game from phase: ${this.phase}`);
      return;
    }

    console.log(`[GameService ${this.gameId}] Starting game...`);

    // 直接使用传入的 PreGame 状态
    const preGameState = state;

    // 创建初始游戏状态
    const nowTick = 0;

    // 构建 players
    const players: Record<PlayerId, PlayerCore> = {};
    for (const p of preGameState.players) {
      players[p.id] = {
        id: p.id,
        status: PlayerStatus.Playing,
        army: 0,
        land: 0,
        lastActiveTick: nowTick,
        teamId: p.teamId,
      };
    }

    // 构建 teams
    const teams: Record<TeamId, TeamCore> = {};
    for (const p of preGameState.players) {
      if (!teams[p.teamId]) {
        teams[p.teamId] = {
          id: p.teamId,
          memberIds: [],
          status: PlayerStatus.Playing,
        };
      }
      teams[p.teamId]!.memberIds.push(p.id);
    }

    // 直接透传 PreGameGameSetting（已兼容 GameSettings）
    const settings: GameSettings = preGameState.gameSetting;

    // 构建 map（根据 mapSetting 生成地图）
    const map: GameMap = generateMap(preGameState.mapSetting, preGameState.players);

    const initialGameState: GameState = {
      status: GameStatus.Playing,
      tick: nowTick,
      players,
      teams,
      settings,
      map,
    };

    // 分配专属颜色：假设玩家都有合法的颜色
    const gameInstanceSettings: GameInstanceSettings = {
      playerDisplay: preGameState.players.reduce(
        (acc, p) => {
          acc[p.id] = { tileColor: p.tileColor };
          return acc;
        },
        {} as SyncedGameState["playerDisplay"]
      )
    }

    // 创建 GameInstance
    const playerIds = Array.from(preGameState.players.map(p => p.id));
    this.gameInstance = new GameInstance(initialGameState, gameInstanceSettings, playerIds);
    this.phase = GamePhase.INGAME;
    this.chatInstance.activeStageInstance = this.gameInstance;

    // 开始调度 Tick（必须在 phase 设置为 INGAME 且 gameInstance 创建后）
    this.scheduleGameTicks(state.gameSetting?.speed ?? 1.0);

    // 清理 PreGameInstance
    this.preGameInstance.destroy();
    this.preGameInstance =  null;

    // 触发游戏开始回调
    this.onGameStartCallback?.();

    console.log(`[GameService ${this.gameId}] Game started with ${playerIds.length} players`);
  }

  /**
   * 结束游戏
   */
  public endGame(result?: any): void {
    // Clear tick timer on game end
    this.clearTickTimer();

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
      this.gameInstance = null;
    }

    console.log(`[GameService ${this.gameId}] Game ended`);
  }

  /**
   * 解散游戏
   */
  public disbandGame(): void {
    // Clear tick timer on disband
    this.clearTickTimer();

    console.log(`[GameService ${this.gameId}] Disbanding game...`);

    this.phase = GamePhase.DISBANDED;

    // 清理所有实例
    this.preGameInstance?.destroy();
    this.preGameInstance = null;
    this.gameInstance?.destroy();
    this.gameInstance = null;
    this.chatInstance.destroy();

    // 注销域名处理器
    this.unregisterDomainHandlers();

    // 触发解散回调
    this.onDisbandCallback?.();

    console.log(`[GameService ${this.gameId}] Game disbanded`);
  }
  // ============ Tick Scheduling ============

  /**
   * Schedule game ticks according to speed, with initial delay.
   * @param speed Game speed factor (default 1.0)
   */
  private scheduleGameTicks(speed: number) {
    this.clearTickTimer(); // Prevent double scheduling
    if (this.phase !== GamePhase.INGAME || !this.gameInstance) return;

    const initialDelayMs = 5000; // 5 seconds before first tick
    const tickIntervalMs = Math.max(250, Math.floor(1000 / (speed || 1.0))); // Minimum 250ms interval

    console.log(`[GameService ${this.gameId}] Scheduling first tick in ${initialDelayMs}ms, interval: ${tickIntervalMs}ms`);

    // Start after initial delay
    this.tickTimerId = setTimeout(() => {
      this.runTickLoop(tickIntervalMs);
    }, initialDelayMs);
  }

  /**
   * Internal tick loop: advances game and reschedules next tick.
   */
  private runTickLoop(tickIntervalMs: number) {
    if (this.phase !== GamePhase.INGAME || !this.gameInstance) {
      this.clearTickTimer();
      return;
    }
    try {
      this.gameInstance.advance();
    } catch (err) {
      console.error(`[GameService ${this.gameId}] Error during game tick:`, err);
    }
    // If game still running, schedule next tick
    if (this.phase === GamePhase.INGAME && this.gameInstance) {
      this.tickTimerId = setTimeout(() => this.runTickLoop(tickIntervalMs), tickIntervalMs);
    } else {
      this.clearTickTimer();
    }
  }

  /**
   * Clears the tick timer if set.
   */
  private clearTickTimer() {
    if (this.tickTimerId) {
      clearTimeout(this.tickTimerId);
      this.tickTimerId = null;
      console.log(`[GameService ${this.gameId}] Cleared tick timer.`);
    }
  }

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
  /**
   * 获取玩家数量（自动根据阶段判断）
   */
  public getPlayerCount(): number {
    if (this.phase === GamePhase.PREGAME && this.preGameInstance) {
      return this.preGameInstance.getState().players.length;
    }
    if (this.phase === GamePhase.INGAME && this.gameInstance) {
      return Object.keys(this.gameInstance.getState().players).length;
    }
    return 0;
  }

  /**
   * 获取玩家列表（自动根据阶段判断）
   */
  public getPlayers(): PlayerId[] {
    if (this.phase === GamePhase.PREGAME && this.preGameInstance) {
      return this.preGameInstance.getState().players.map(p => p.id);
    }
    if (this.phase === GamePhase.INGAME && this.gameInstance) {
      return Object.keys(this.gameInstance.getState().players);
    }
    return [];
  }

  /**
   * 检查玩家是否在游戏中（自动根据阶段判断）
   */
  public hasPlayer(playerId: PlayerId): boolean {
    if (this.phase === GamePhase.PREGAME && this.preGameInstance) {
      return this.preGameInstance.getState().players.some(p => p.id === playerId);
    }
    if (this.phase === GamePhase.INGAME && this.gameInstance) {
      return !!this.gameInstance.getState().players[playerId];
    }
    return false;
  }

  /**
   * 获取游戏状态（用于调试）
   */
  public getGameState(): any {
    return {
      gameId: this.gameId,
      phase: this.phase,
      playerCount: this.getPlayerCount(),
      players: this.getPlayers(),
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

  // ============ HTTP API 支持方法 ============

  /**
   * 创建游戏（HTTP API）
   */
  public static createGameForAPI(config: GameServiceConfig): GameService {
    return new GameService(config);
  }

  /**
   * 加入游戏（HTTP API）
   */
  /**
   * 加入游戏（HTTP API）
   */
  public joinGameForAPI(playerId: PlayerId): { success: false; message: string } | { success: true; domains: any } {
    // 仅允许 PREGAME 阶段加入
    if (this.phase !== GamePhase.PREGAME) {
      return { success: false, message: `Cannot join game in phase ${this.phase}` };
    }

    // 动态获取当前玩家列表和最大人数
    const preGameState = this.preGameInstance?.getState();
    const players = preGameState?.players ?? [];
    const maxPlayers = preGameState?.playerLimit ?? this.config.maxPlayers ?? 8;

    if (players.find(p => p.id === playerId)) {
      return { success: false, message: 'Player already in game' };
    }

    if (players.length >= maxPlayers) {
      return { success: false, message: 'Game is full' };
    }

    // 预注册玩家（实际连接通过 WebSocket 建立）
    // 这里只做逻辑校验，不做真正添加
    // domains 可根据需要返回
    return { success: true, domains: { pregame: true } };
  }

  /**
   * 获取游戏信息（HTTP API）
   */
  /**
   * 获取游戏信息（HTTP API）
   */
  public getGameInfo(): any {
    let players: any[] = [];
    let maxPlayers = this.config.maxPlayers ?? 8;
    if (this.phase === GamePhase.PREGAME && this.preGameInstance) {
      const state = this.preGameInstance.getState();
      players = state.players.map(p => ({
        playerId: p.id,
        playerName: p.name,
        connected: {
          pregame: true,
          game: false,
          chat: false
        },
        teamId: p.teamId,
        tileColor: p.tileColor,
        isHost: p.isHost
      }));
      maxPlayers = state.playerLimit ?? maxPlayers;
    } else if (this.phase === GamePhase.INGAME && this.gameInstance) {
      const state = this.gameInstance.getState();
      players = Object.values(state.players).map((p: any) => ({
        playerId: p.id,
        playerName: '', // 可补充
        connected: {
          pregame: false,
          game: true,
          chat: false
        },
        teamId: p.teamId
      }));
      maxPlayers = Object.keys(state.players).length;
    }
    return {
      gameId: this.gameId,
      phase: this.phase,
      playerCount: players.length,
      maxPlayers,
      players,
      preGameState: this.preGameInstance?.getState(),
      gameState: this.gameInstance?.getState()
    };
  }
}
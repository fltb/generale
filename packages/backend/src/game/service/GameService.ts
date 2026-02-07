import {
  PlayerCore, TeamCore, TeamId, GameMap, PlayerStatus, SyncedGameState, PreGameMapType,
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
  GameSettings,
  GamePhase
} from '@generale/types';
import { PreGameInstance, PreGameServerConnector } from '../instance/PreGameInstance';
import { GameInstance, GameInstanceSettings } from '../instance/GameInstance';
import { GameChatInstance, GameChatConnector } from '../instance/GameChatInstance';
import { registerDomainHandler, unregisterDomainHandler, DomainHandler, SubConnector } from '../../plugins/websocket';
import { generateMap } from '../core/map-gen';
import { GameInfoSuccessResp } from '@generale/types/dist/api';



/**
 * GameService 配置
 */
export type GameServiceConfig = {
  gameId: GameId;
  roomName: string;
  maxPlayers?: number;
  chatMaxMessages?: number;
  gameTimeout?: number;
  heartbeatInterval?: number;
  // optional: raw incoming gameSettings (from create request). Prefer normalized mapSize in gameConfig.mapSizeNormalized below
  gameSettings?: Partial<GameInstanceSettings>;
} & ({
  // discriminant if provided
  type: "custom";
  // if caller provided numeric map size, place here; prefer numeric for runtime
  mapSize: { width: number; height: number };

} | {
  // discriminant if provided
  type: "standard";
  // if caller provided numeric map size, place here; prefer numeric for runtime
  mapSize: "small" | "medium" | "large";

})
export type ConnectionInfo = {
  phase: GamePhase;
  domains: { primary: string; chat: string };
};

export type ConnectionResult =
  | { success: true; data: ConnectionInfo }
  | { success: false; reason: 'NOT_AUTHORIZED' | 'GAME_UNAVAILABLE' | 'INVALID_STATE'; message: string; };

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

  private roomUpdateEmitter?: (gameId: GameId) => void;
  private pregameUpdateFilters: Array<(prev?: PreGameRoomState, curr?: PreGameRoomState) => boolean> = [];
  private lastPregameSnapshot?: PreGameRoomState;
  // 保存从 pregame 启动游戏前的快照（用于游戏结束后恢复房间）
  private lastPreGameSnapshot?: PreGameRoomState;

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

      if (!userid) {
        connector.close(4001, 'Missing userid');
        return;
      }

      if (!username) {
        connector.close(4001, 'Missing username');
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
        console.debug(`[GameService]: Adding player: ${userid} ${username} to preGameInstance`)
        const result = this.preGameInstance.addPlayer({ id: userid, name: username }, this.adaptToPregameConnector(connector));
        if (!result.success) {
          connector.close(4003, result.message || 'Failed to add to pregame');
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

      if (!userid) {
        connector.close(4001, 'Missing userid');
        return;
      }

      if (!username) {
        connector.close(4001, 'Missing username');
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

      if (!userid) {
        connector.close(4001, 'Missing userid');
        return;
      }

      if (!username) {
        connector.close(4001, 'Missing username');
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

  private addPreGameUpdateFilter(
    fn: (prev?: PreGameRoomState, curr?: PreGameRoomState) => boolean
  ): () => void {
    this.pregameUpdateFilters.push(fn);
    return () => {
      const i = this.pregameUpdateFilters.indexOf(fn);
      if (i >= 0) this.pregameUpdateFilters.splice(i, 1);
    };
  }
  // ============ 游戏阶段管理 ============

  /**
   * 初始化 PreGame 阶段
   */
  private initializePreGame(): void {
    // determine default map width/height from config
    let defaultWidth = 20;
    let defaultHeight = 20;

    // if config.mapSize provided as numeric object, use it
    if (this.config.mapSize && typeof this.config.mapSize === "object") {
      defaultWidth = Math.max(10, Math.min(500, Math.floor(this.config.mapSize.width)));
      defaultHeight = Math.max(10, Math.min(500, Math.floor(this.config.mapSize.height)));
    } else if (this.config.mapSize && typeof this.config.mapSize === "string") {
      // mapSize could be small/medium/large -> map to numeric values (adjust as you wish)
      const m = this.config.mapSize;
      if (m === "small") { defaultWidth = 10; defaultHeight = 10; }
      else if (m === "large") { defaultWidth = 40; defaultHeight = 40; }
      else { defaultWidth = 20; defaultHeight = 20; }
    }

    const initialState: PreGameRoomState = {
      gameId: this.gameId,
      hostId: '',
      players: [],
      gameSetting: {
        speed: 1.0,
        tileGrow: { /* same as before */
          PLAIN: { duration: 40, growth: 1 },
          THRONE: { duration: 1, growth: 1 },
          BARRACKS: { duration: 1, growth: 1 },
          MOUNTAIN: { duration: 1e10, growth: 0 },
          SWAMP: { duration: 1, growth: -1 },
          FOG: { duration: 1e10, growth: 0 },
        },
        afkThreshold: 30,
      },
      mapSetting: {
        type: (this.config.type === "standard" ? PreGameMapType.Random : PreGameMapType.Custom),
        width: defaultWidth,
        height: defaultHeight,
        tileFrequency: {}
      },
      teams: [
        { id: "team1", name: "Team 1" },
        { id: "team2", name: "Team 2" }
      ],
      teamCount: 2,
      playerLimit: this.config.maxPlayers ?? 8,
      started: false
    };

    this.preGameInstance = new PreGameInstance(initialState, new Map());
    this.preGameInstance.onDisband(() => {
      this.disbandGame();
    });
    this.phase = GamePhase.PREGAME;
    this.chatInstance.activeStageInstance = this.preGameInstance;

    this.preGameInstance.onStartGame(this.startGame.bind(this));

    this.lastPregameSnapshot = structuredClone(this.preGameInstance.getState());

    // 过滤器：玩家数量变更
    const playerCountChanged = (prev?: PreGameRoomState, curr?: PreGameRoomState) =>
      (prev?.players.length ?? 0) !== (curr?.players.length ?? 0);

    // 过滤器：主持人（host）变化
    const hostChanged = (prev?: PreGameRoomState, curr?: PreGameRoomState) =>
      (prev?.hostId ?? '') !== (curr?.hostId ?? '');

    // 过滤器：房间开始标志 changed
    const startedChanged = (prev?: PreGameRoomState, curr?: PreGameRoomState) =>
      (prev?.started ?? false) !== (curr?.started ?? false);

    // 组合示例：只在上面任一情况发生时上报
    const significantChange = (prev?: PreGameRoomState, curr?: PreGameRoomState) =>
      playerCountChanged(prev, curr) || hostChanged(prev, curr) || startedChanged(prev, curr);

    this.addPreGameUpdateFilter(significantChange);

    this.preGameInstance.onStateChange((newState) => {
      const prev = this.lastPregameSnapshot;
      this.lastPregameSnapshot = structuredClone(newState);

      let shouldEmit = false;

      // 如果没有任何过滤器，默认上报（往 manager 发送）
      if (this.pregameUpdateFilters.length === 0) {
        shouldEmit = true;
      } else {
        for (const filter of this.pregameUpdateFilters) {
          try {
            if (filter(prev, newState)) {
              shouldEmit = true;
              break;
            }
          } catch (err) {
            console.error('[GameService] pregame update filter error', err);
          }
        }
      }

      if (shouldEmit) {
        this.emitRoomUpdatedToManager();
      }
    });
    console.log(`[GameService ${this.gameId}] PreGame initialized`);
  }

  private emitRoomUpdatedToManager() {
    try { this.roomUpdateEmitter?.(this.gameId); } catch (err) { console.error('[GameService] emitRoomUpdatedToManager', err); }
  }

  public setRoomUpdateEmitter(cb: (gameId: GameId) => void) {
    this.roomUpdateEmitter = cb;
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
    const preGameState = structuredClone(state);
    this.lastPreGameSnapshot = structuredClone(preGameState);

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
          acc[p.id] = { tileColor: p.tileColor, name: p.name };
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
    this.gameInstance.onEndGame(this.endGame.bind(this));

    // 开始调度 Tick（必须在 phase 设置为 INGAME 且 gameInstance 创建后）
    this.scheduleGameTicks(state.gameSetting?.speed ?? 1.0);

    // 清理 PreGameInstance
    this.preGameInstance.destroy();
    this.preGameInstance = null;

    // 触发游戏开始回调
    this.onGameStartCallback?.();
    this.emitRoomUpdatedToManager();

    console.log(`[GameService ${this.gameId}] Game started with ${playerIds.length} players`);
  }

  /**
   * 结束游戏
   */
  public endGame(result?: any): void {
    // 清理 tick timer
    this.clearTickTimer();

    if (this.phase !== GamePhase.INGAME) {
      console.error(`[GameService ${this.gameId}] Cannot end game from phase: ${this.phase}`);
      return;
    }

    console.log(`[GameService ${this.gameId}] Ending game...`, result);

    // 调用结束回调（保留给上层使用，例如统计）
    this.onGameEndCallback?.(result);

    // 清理游戏实例（销毁内部资源）
    if (this.gameInstance) {
      try {
        this.gameInstance.destroy();
      } catch (err) {
        console.warn(`[GameService ${this.gameId}] Error destroying gameInstance:`, err);
      }
      this.gameInstance = null;
    }

    // 恢复为 PREGAME：使用 lastPreGameSnapshot（优先），如果没有则从旧的 gameState 尝试构建一个基本的 pregame 状态
    let restoredPreGameState: PreGameRoomState | null = null;

    if (this.lastPreGameSnapshot) {
      restoredPreGameState = structuredClone(this.lastPreGameSnapshot);
    } else {
      // 尝试从 gameInstance 的残留数据构造（降级方案）
      console.error(`[GameService ${this.gameId}] Failed to build fallback pregame state, disbanding game`);
      this.disbandGame();
      return;
    }

    // 将房间恢复到 pregame：创建新的 PreGameInstance（connectors 传空 map，客户端连接时会重新打开 pregame 域并加入）
    this.preGameInstance = new PreGameInstance(restoredPreGameState, new Map());
    this.phase = GamePhase.PREGAME;
    this.chatInstance.activeStageInstance = this.preGameInstance;

    // 重新注册 startGame 回调和 pregame -> manager 转发
    this.preGameInstance.onStartGame(this.startGame.bind(this));
    this.preGameInstance.onStateChange(() => {
      this.emitRoomUpdatedToManager();
    });
    this.preGameInstance.onDisband(() => {
      this.disbandGame();
    })
    // 通知 manager 房间已变更（从 INGAME -> PREGAME）
    this.emitRoomUpdatedToManager();

    console.log(`[GameService ${this.gameId}] Game ended and room restored to pregame with ${this.preGameInstance.getState().players.length} players`);
  }

  public forceDispose():void {
    if (this.phase === GamePhase.DISBANDED) return;

        // Clear tick timer on disband
    this.clearTickTimer();

    console.log(`[GameService ${this.gameId}] disposing game...`);

    this.phase = GamePhase.DISBANDED;
    this.preGameInstance?.destroy();
    this.preGameInstance = null;
    this.gameInstance?.destroy();
    this.gameInstance = null;
    this.chatInstance.destroy();
    // 注销域名处理器
    this.unregisterDomainHandlers();

    console.log(`[GameService ${this.gameId}] Game disposed`);
  }

  /**
   * 解散游戏
   */
  private disbandGame(): void {
    if (this.phase === GamePhase.DISBANDED) return;

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
    this.emitRoomUpdatedToManager();

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
   * 为指定玩家准备 WebSocket 连接信息。
   * 这个方法会进行授权检查并返回连接所需的 domains。
   * @param playerId 要连接的玩家ID
   * @returns ConnectionResult 包含连接信息或错误原因
   */
  public prepareConnectionForPlayer(playerId: PlayerId): ConnectionResult {
    const phase = this.getPhase();
    let primary = null;

    switch (phase) {
      case GamePhase.PREGAME:
        if (this.getPlayerCount() >= (this.config.maxPlayers ?? 8)) {
          return { success: false, reason: 'GAME_UNAVAILABLE', message: 'Game is full. Cannot connect.' };
        }

        primary = `pregame-${this.gameId}`;
        break;

      case GamePhase.INGAME:
        if (!this.hasPlayer(playerId)) {
          return {
            success: false,
            reason: 'NOT_AUTHORIZED',
            message: 'Player not found in this game.'
          };
        }

        primary = `game-${this.gameId}`;
        break;

      case GamePhase.ENDED:
      case GamePhase.DISBANDED:
        return {
          success: false,
          reason: 'GAME_UNAVAILABLE',
          message: 'Game has been disbanded'
        };
    }

    // 检查是否有可用的 domain
    if (primary === null) {
      return {
        success: false,
        reason: 'INVALID_STATE',
        message: `Game is in a state (${phase}) that cannot be connected to.`
      };
    }

    // 返回成功结果
    return {
      success: true,
      data: {
        phase,
        domains: {
          primary,
          chat: `chat-${this.gameId}`
        },
      }
    };
  }

  /**
   * 获取游戏信息（HTTP API）
   */
  /**
   * 获取游戏信息（HTTP API）
   */
  public getGameInfo(): GameInfoSuccessResp["data"] {
    const phase = this.phase;

    // --- 1. status (schema requires: lobby | in-progress | finished) ---
    let status: "lobby" | "in-progress" | "finished";
    switch (phase) {
      case GamePhase.PREGAME:
        status = "lobby";
        break;
      case GamePhase.INGAME:
        status = "in-progress";
        break;
      case GamePhase.ENDED:
      case GamePhase.DISBANDED:
        status = "finished";
        break;
      default:
        status = "lobby";
    }

    // --- 2. players (convert your internal structure into schema format) ---
    let players: Array<{
      id: string;
      name: string;
      isHost: boolean;
    }> = [];

    let maxPlayers = this.config.maxPlayers ?? 8;

    if (phase === GamePhase.PREGAME && this.preGameInstance) {
      const state = this.preGameInstance.getState();

      players = state.players.map((p) => ({
        id: String(p.id),
        name: "",
        isHost: Boolean(p.isHost),
      }));

      maxPlayers = state.playerLimit ?? maxPlayers;
    }

    else if (phase === GamePhase.INGAME && this.gameInstance) {
      const state = this.gameInstance.getState();

      players = Object.values(state.players).map((p) => ({
        id: String(p.id),
        name: "",   // TODO:: get name in userService
        isHost: false,
      }));

      maxPlayers = Object.keys(state.players).length;
    }

    const playerCount = players.length;

    // --- 3. settings (schema requires object, all fields optional except maxPlayers) ---

    // --- 4. hasPassword ---
    const hasPassword = false; // TODO:: add password

    // --- 5. hostId ---
    // Pregame 阶段有 host
    let hostId = "";
    if (phase === GamePhase.PREGAME && this.preGameInstance) {
      hostId = this.preGameInstance.getState().hostId;
    }

    return {
      id: this.gameId,
      hostId,
      players,
      settings: {
        maxPlayers,
        mapSize: this.config.mapSize,
        type: this.config.type,
      },
      status,
      playerCount,
      maxPlayers,
      hasPassword,
    };
  }
}
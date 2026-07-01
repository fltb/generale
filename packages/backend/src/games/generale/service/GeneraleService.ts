import {
  type ChatClientToServer,
  type ChatServerToClient,
  type GameId,
  type GameInfoSuccessResp,
  type GameMap,
  GamePhase,
  type GameSettings,
  type GameState,
  GameStatus,
  type PlayerCore,
  type PlayerId,
  PlayerStatus,
  PRESET_SIZES,
  PreGameMapType,
  PreGamePlayerStatus,
  type PreGameRoomState,
  type PreGameTeamMode,
  type SyncedGameClientActions,
  type SyncedGameServerEvent,
  type SyncedGameState,
  type SyncedPreGameClientActions,
  type SyncedPreGameServerEvent,
  type TeamCore,
  type TeamId,
} from "@generale/types";
import type { GameEndResult } from "../instance/GeneraleGame";
import {
  type DomainHandler,
  registerDomainHandler,
  type SubConnector,
  unregisterDomainHandler,
} from "../../../plugins/websocket";
import { generateMap } from "../core/map-gen";
import { GameChatInstance } from "../../../game/instance/GameChatInstance";
import { GeneraleGame, type GeneraleGameSettings } from "../instance/GeneraleGame";
import { GeneraleRoom } from "../instance/GeneraleRoom";
import { buildGameInfo } from "./units/GameInfoPresenter";
import { RoomUpdateFilter } from "./units/RoomUpdateFilter";

/**
 * GeneraleService 配置
 */
export type GeneraleServiceConfig = {
  gameId: GameId;
  roomName: string;
  maxPlayers?: number;
  chatMaxMessages?: number;
  gameTimeout?: number;
  heartbeatInterval?: number;
  /** 队伍模式：ffa（默认）/ team。在 initializeRoom 时写入 initialState */
  teamMode?: PreGameTeamMode;
  /** 可选的房间密码 */
  password?: string;
  /** 创建者 userId，用于确保第一个加入的就是房主 */
  creatorId?: PlayerId;
  /** 可选：自定义地图 ID（从地图工坊选取），游戏开始时加载此地图 */
  customMapId?: string;
  // optional: raw incoming gameSettings (from create request). Prefer normalized mapSize in gameConfig.mapSizeNormalized below
  gameSettings?: Partial<GeneraleGameSettings>;
} & (
  | {
      // discriminant if provided
      type: "custom";
      // if caller provided numeric map size, place here; prefer numeric for runtime
      mapSize: { width: number; height: number };
    }
  | {
      // discriminant if provided
      type: "standard";
      // if caller provided numeric map size, place here; prefer numeric for runtime
      mapSize: "small" | "medium" | "large";
    }
);
export type ConnectionInfo = {
  phase: GamePhase;
  domains: { primary: string; room?: string; chat: string };
  hasPassword: boolean;
};

export type ConnectionResult =
  | { success: true; data: ConnectionInfo }
  | { success: false; reason: "NOT_AUTHORIZED" | "GAME_UNAVAILABLE" | "INVALID_STATE"; message: string };

/**
 * GeneraleService - 游戏总管理服务
 * 管理游戏的各个阶段和实例，协调 WebSocket sub-connector
 */
export class GeneraleService {
  private gameId: GameId;
  private phase: GamePhase = GamePhase.PREGAME;

  // 各阶段实例
  private roomInstance: GeneraleRoom | null = null;
  private gameInstance: GeneraleGame | null = null;
  private chatInstance: GameChatInstance;

  // 配置
  private config: GeneraleServiceConfig;

  private onGameStartCallback?: () => void;
  private onGameEndCallback?: (result: GameEndResult) => void;
  private onDisbandCallback?: () => void;

  private roomUpdateEmitter?: (gameId: GameId) => void;
  private roomUpdateFilter!: RoomUpdateFilter;

  constructor(config: GeneraleServiceConfig) {
    this.config = config;
    this.gameId = config.gameId;

    this.roomUpdateFilter = new RoomUpdateFilter(this.gameId, (id) => this.roomUpdateEmitter?.(id));

    // 初始化聊天实例（贯穿整个游戏生命周期）
    this.chatInstance = new GameChatInstance(config.chatMaxMessages);

    // 注册 WebSocket 域名处理器
    this.registerDomainHandlers();
  }

  /**
   * 注册 WebSocket 域名处理器
   */
  private registerDomainHandlers(): void {
    // 注册 room 域名处理器
    registerDomainHandler(`room-${this.gameId}`, this.createRoomDomainHandler());

    // 注册 game 域名处理器
    registerDomainHandler(`game-${this.gameId}`, this.createGameDomainHandler());

    // 注册 chat 域名处理器
    registerDomainHandler(`chat-${this.gameId}`, this.createChatDomainHandler());
  }

  /**
   * 注销 WebSocket 域名处理器
   */
  private unregisterDomainHandlers(): void {
    unregisterDomainHandler(`room-${this.gameId}`);
    unregisterDomainHandler(`game-${this.gameId}`);
    unregisterDomainHandler(`chat-${this.gameId}`);
  }

  // ============ DomainHandler 创建方法 ============

  /**
   * 创建 Room 域名处理器
   */
  private createRoomDomainHandler(): DomainHandler<SyncedPreGameClientActions, SyncedPreGameServerEvent> {
    return (connector: SubConnector<SyncedPreGameClientActions, SyncedPreGameServerEvent>) => {
      const ctx = connector.context;
      const { userid, username } = ctx;

      if (!userid) {
        connector.close(4001, "Missing userid");
        return;
      }

      if (!username) {
        connector.close(4001, "Missing username");
        return;
      }

      // 检查阶段是否允许 room 连接
      // if (this.phase !== GamePhase.PREGAME) {
      //   connector.close(4002, 'Invalid phase for room');
      //   return;
      // }

      // room domain 在 PREGAME 与 INGAME 期间都允许连接，为了方便恢复房间
      if (this.phase === GamePhase.DISBANDED) {
        connector.close(4004, "Game disbanded");
        return;
      }

      // 初始化 GeneraleRoom（如果不存在）
      if (!this.roomInstance) {
        this.initializeRoom();
      }

      // 将玩家添加到 GeneraleRoom
      if (this.roomInstance) {
        console.debug(`[GeneraleService]: Adding player: ${userid} ${username} to roomInstance`);
        const result = this.roomInstance.addPlayer(
          {
            id: userid,
            name: username,
            ...(ctx.displayName ? { displayName: ctx.displayName } : {}),
            ...(ctx.avatarThumbUrl ? { avatarThumbUrl: ctx.avatarThumbUrl } : {}),
            ...(ctx.password ? { password: ctx.password } : {}),
          },
          connector,
        );
        if (!result.success) {
          connector.close(4003, result.message || "Failed to add to room");
          return;
        }
      }
    };
  }

  /**
   * 创建 Game 域名处理器
   *
   * 玩家在 Room 状态决定连接形式：
   *   - Playing  -> 正常作为对局参与者接入（addPlayer）
   *   - Spectating -> 作为观战者接入（addSpectator，只读不发 action）
   *   - 其它（包括 Room 实例不存在或玩家不在状态里）-> 4003 拒绝
   */
  private createGameDomainHandler(): DomainHandler<SyncedGameClientActions, SyncedGameServerEvent> {
    return (connector: SubConnector<SyncedGameClientActions, SyncedGameServerEvent>) => {
      const ctx = connector.context;
      const { userid, username } = ctx;

      if (!userid) {
        connector.close(4001, "Missing userid");
        return;
      }

      if (!username) {
        connector.close(4001, "Missing username");
        return;
      }

      // 检查阶段是否允许 game 连接
      if (this.phase !== GamePhase.INGAME) {
        connector.close(4002, "Invalid phase for game");
        return;
      }

      if (!this.gameInstance) {
        connector.close(4002, "No game instance");
        return;
      }

      // 区分玩家 / 观战者：以 GeneraleRoom 中的 status 为准
      const roomState = this.roomInstance?.getState();
      const playerEntry = roomState?.players.find((p) => p.id === userid);
      const isSpectator = playerEntry?.status === PreGamePlayerStatus.Spectating;

      if (isSpectator) {
        const res = this.gameInstance.addSpectator({ id: userid, name: username }, connector);
        if (!res.success) {
          connector.close(4003, res.message);
          return;
        }
        return;
      }

      const res = this.gameInstance.addPlayer({ id: userid, name: username }, connector);
      if (!res.success) {
        connector.close(4003, res.message);
        return;
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
        connector.close(4001, "Missing userid");
        return;
      }

      if (!username) {
        connector.close(4001, "Missing username");
        return;
      }

      // Chat 在所有阶段都可用（除了 DISBANDED）
      if (this.phase === GamePhase.DISBANDED) {
        connector.close(4004, "Game disbanded");
        return;
      }

      // 获取玩家连接
      // 将玩家添加到 ChatInstance
      const res = this.chatInstance.addPlayer({ id: userid, name: username }, connector);
      if (!res.success) {
        connector.close(4003, res.message);
        return;
      }
    };
  }

  // ============ 游戏阶段管理 ============

  private initializeRoom(): void {
    const initialState = this.buildInitialRoomState();
    this.roomInstance = new GeneraleRoom(initialState, new Map());
    if (this.config.password) this.roomInstance.setPassword(this.config.password);
    if (this.config.creatorId) this.roomInstance.setCreatorId(this.config.creatorId);
    this.wireRoomInstance();
    this.phase = GamePhase.PREGAME;
    this.chatInstance.activeStageInstance = this.roomInstance;
    this.roomUpdateFilter.attach(this.roomInstance);
    console.log(`[GeneraleService ${this.gameId}] Room initialized`);
  }

  private resolveMapDimensions(): { width: number; height: number; sizeLabel?: "small" | "medium" | "large" } {
    const ms = this.config.mapSize;
    if (ms && typeof ms === "object") {
      return {
        width: Math.max(10, Math.min(500, Math.floor(ms.width))),
        height: Math.max(10, Math.min(500, Math.floor(ms.height))),
      };
    }
    if (ms && typeof ms === "string") {
      const dims = PRESET_SIZES[ms as "small" | "medium" | "large"];
      return { width: dims.width, height: dims.height, sizeLabel: ms as "small" | "medium" | "large" };
    }
    return { width: 20, height: 20 };
  }

  private buildInitialRoomState(): PreGameRoomState {
    const { width, height, sizeLabel } = this.resolveMapDimensions();
    const isStandard = this.config.type === "standard";
    const teamMode: PreGameTeamMode = this.config.teamMode ?? "ffa";
    const hasCustomMap = !isStandard && !!this.config.customMapId;

    return {
      gameId: this.gameId,
      roomType: isStandard ? "standard" : "custom",
      teamMode,
      hostId: "",
      players: [],
      gameSetting: {
        speed: 1.0,
        tileGrow: {
          PLAIN: { duration: 10, growth: 1 },
          THRONE: { duration: 1, growth: 1 },
          BARRACKS: { duration: 1, growth: 1 },
          MOUNTAIN: { duration: 1e10, growth: 0 },
          SWAMP: { duration: 1, growth: -1 },
          FOG: { duration: 1e10, growth: 0 },
        },
        afkThreshold: 30,
      },
      mapSetting: {
        type: hasCustomMap ? PreGameMapType.Imported : isStandard ? PreGameMapType.Random : PreGameMapType.Custom,
        width,
        height,
        tileFrequency: {},
        ...(isStandard && sizeLabel ? { sizeLabel } : {}),
        ...(hasCustomMap ? { customMapId: this.config.customMapId } : {}),
      } as PreGameRoomState["mapSetting"],
      teams: [],
      teamCount: 0,
      playerLimit: this.config.maxPlayers ?? 8,
      started: false,
    };
  }

  private wireRoomInstance() {
    this.roomInstance?.onDisband(() => this.disbandGame());
    this.roomInstance?.onStartGame(this.startGame.bind(this));
  }

  private emitRoomUpdated() {
    try {
      this.roomUpdateEmitter?.(this.gameId);
    } catch (err) {
      console.error("[GeneraleService] emitRoomUpdated", err);
    }
  }

  public setRoomUpdateEmitter(cb: (gameId: GameId) => void) {
    this.roomUpdateEmitter = cb;
  }

  /**
   * 从 Room 转换到 Game 阶段
   */
  public async startGame(state: PreGameRoomState): Promise<void> {
    if (this.phase !== GamePhase.PREGAME || !this.roomInstance) {
      console.error(`[GeneraleService ${this.gameId}] Cannot start game from phase: ${this.phase}`);
      return;
    }

    console.log(`[GeneraleService ${this.gameId}] Starting game...`);

    // 直接使用传入的 Room 状态
    const roomState = structuredClone(state);

    // 创建初始游戏状态
    const nowTick = 0;

    // 构建 players
    const players: Record<PlayerId, PlayerCore> = {};
    for (const p of roomState.players) {
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
    for (const p of roomState.players) {
      if (!teams[p.teamId]) {
        teams[p.teamId] = {
          id: p.teamId,
          memberIds: [],
          status: PlayerStatus.Playing,
        };
      }
      teams[p.teamId]?.memberIds.push(p.id);
    }

    // 直接透传 RoomGameSetting（已兼容 GameSettings）
    const settings: GameSettings = roomState.gameSetting;

    // 构建 map（根据 mapSetting 生成地图）
    const map: GameMap = await generateMap(roomState.mapSetting, roomState.players);

    const initialGameState: GameState = {
      status: GameStatus.Playing,
      tick: nowTick,
      players,
      teams,
      settings,
      map,
    };

    // 分配专属颜色：假设玩家都有合法的颜色
    const gameInstanceSettings: GeneraleGameSettings = {
      playerDisplay: roomState.players.reduce(
        (acc, p) => {
          acc[p.id] = {
            tileColor: p.tileColor,
            name: p.name,
            ...(p.displayName ? { displayName: p.displayName } : {}),
            ...(p.avatarThumbUrl ? { avatarThumbUrl: p.avatarThumbUrl } : {}),
          };
          return acc;
        },
        {} as SyncedGameState["playerDisplay"],
      ),
    };

    // 创建 GeneraleGame
    const playerIds = Array.from(roomState.players.map((p) => p.id));
    this.gameInstance = new GeneraleGame(initialGameState, gameInstanceSettings, playerIds);
    this.phase = GamePhase.INGAME;
    this.gameInstance.onEndGame(this.endGame.bind(this));
    this.gameInstance.startTicking(state.gameSetting?.speed ?? 1.0);
    this.onGameStartCallback?.();
    this.emitRoomUpdated();

    console.log(`[GeneraleService ${this.gameId}] Game started with ${playerIds.length} players`);
  }

  public endGame(result?: GameEndResult): void {
    // 清理 tick timer
    this.gameInstance?.stopTicking();

    if (this.phase !== GamePhase.INGAME) {
      console.error(`[GeneraleService ${this.gameId}] Cannot end game from phase: ${this.phase}`);
      return;
    }

    console.log(`[GeneraleService ${this.gameId}] Ending game...`, result);

    // 调用结束回调（保留给上层使用，例如统计）
    if (result) this.onGameEndCallback?.(result);

    // 清理游戏实例（销毁内部资源）
    if (this.gameInstance) {
      try {
        this.gameInstance.destroy();
      } catch (err) {
        console.warn(`[GeneraleService ${this.gameId}] Error destroying gameInstance:`, err);
      }
      this.gameInstance = null;
    }

    // 先在 room 域广播一次 GAME_ENDED，再 resume()。
    // 顺序很关键：客户端的 RoomWithSync 必须先收到 GAME_ENDED（让路由记下"刚结束"标记，
    // 维持游戏结算 UI），再收到 resume 后的 room state（status: Playing/Spectating -> Lobby）。
    // 否则 selfStatus 翻位会让 Match 立刻 unmount GameWithSync，玩家来不及看输赢。
    if (this.roomInstance) {
      this.roomInstance.broadcastGameEnded(Date.now());
      this.roomInstance.resume();
    } else {
      // 解散房间（降级方案）
      console.error(`[GeneraleService ${this.gameId}] Failed to build fallback room state, disbanding game`);
      this.disbandGame();
      return;
    }

    this.phase = GamePhase.PREGAME;

    // 因为是 resume，所以无需处理
    // this.roomInstance.onStartGame(this.startGame.bind(this));
    // this.roomInstance.onStateChange(() => {
    //   this.emitRoomUpdated();
    // });
    // this.roomInstance.onDisband(() => {
    //   this.disbandGame();
    // })
    // 通知 manager 房间已变更（从 INGAME -> PREGAME）
    this.emitRoomUpdated();

    console.log(
      `[GeneraleService ${this.gameId}] Game ended and room restored to room with ${this.roomInstance.getState().players.length} players`,
    );
  }

  public forceDispose(): void {
    this.cleanupAndSetDisbanded();
    console.log(`[GeneraleService ${this.gameId}] Game force disposed`);
  }

  private disbandGame(): void {
    this.cleanupAndSetDisbanded();
    this.onDisbandCallback?.();
    this.emitRoomUpdated();
    console.log(`[GeneraleService ${this.gameId}] Game disbanded`);
  }

  private cleanupAndSetDisbanded(): void {
    if (this.phase === GamePhase.DISBANDED) return;

    this.gameInstance?.stopTicking();
    this.roomUpdateFilter.detach();
    this.phase = GamePhase.DISBANDED;
    this.roomInstance?.destroy();
    this.roomInstance = null;
    this.gameInstance?.destroy();
    this.gameInstance = null;
    this.chatInstance.destroy();
    this.unregisterDomainHandlers();
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
   * 获取玩家数量。
   * GeneraleRoom 全程存活，始终是玩家名册的权威数据源。
   */
  public getPlayerCount(): number {
    return this.roomInstance?.getState().players.length ?? 0;
  }

  /**
   * 获取玩家列表。
   */
  public getPlayers(): PlayerId[] {
    return this.roomInstance?.getState().players.map((p) => p.id) ?? [];
  }

  /**
   * 检查玩家是否在对局中（INGAME 阶段查 gameInstance，其他阶段查 roomInstance）。
   * 用于 prepareConnectionForPlayer 区分"对局参与者"与"房间内旁观/大厅玩家"。
   */
  public hasPlayer(playerId: PlayerId): boolean {
    if (this.phase === GamePhase.INGAME && this.gameInstance) {
      return !!this.gameInstance.getState().players[playerId];
    }
    return this.roomInstance?.getState().players.some((p) => p.id === playerId) ?? false;
  }

  public getGameState(): unknown {
    return {
      gameId: this.gameId,
      phase: this.phase,
      playerCount: this.getPlayerCount(),
      players: this.getPlayers(),
      roomState: this.roomInstance?.getState(),
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

  public onGameEnd(callback: (result: GameEndResult) => void): void {
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
          return { success: false, reason: "GAME_UNAVAILABLE", message: "Game is full. Cannot connect." };
        }

        primary = `room-${this.gameId}`;
        break;

      case GamePhase.INGAME: {
        // 1) 已在游戏中的玩家 -> game 域（作为对局参与者）
        // 2) Room state 里标为 Spectating 的玩家 -> game 域（作为观战者，addSpectator）
        // 3) 其它（Lobby / 未在房间里）-> room 域，作为 Lobby 进房间
        if (this.hasPlayer(playerId)) {
          primary = `game-${this.gameId}`;
          break;
        }
        const roomSelf = this.roomInstance?.getState().players.find((p) => p.id === playerId);
        if (roomSelf?.status === PreGamePlayerStatus.Spectating) {
          primary = `game-${this.gameId}`;
        } else {
          primary = `room-${this.gameId}`;
        }
        break;
      }

      case GamePhase.ENDED:
      case GamePhase.DISBANDED:
        return {
          success: false,
          reason: "GAME_UNAVAILABLE",
          message: "Game has been disbanded",
        };
    }

    // 检查是否有可用的 domain
    if (primary === null) {
      return {
        success: false,
        reason: "INVALID_STATE",
        message: `Game is in a state (${phase}) that cannot be connected to.`,
      };
    }

    // 返回成功结果
    return {
      success: true,
      data: {
        phase,
        // 已在房间内的玩家（包括房主）不需要再输入密码
        hasPassword: !!this.roomInstance?.getPassword() && (this.roomInstance?.getState().players.length ?? 0) > 0,
        domains: {
          primary,
          room: `room-${this.gameId}`,
          chat: `chat-${this.gameId}`,
        },
      },
    };
  }

  public getGameInfo(): GameInfoSuccessResp["data"] {
    return buildGameInfo({
      gameId: this.gameId,
      roomName: this.config.roomName ?? "",
      phase: this.phase,
      maxPlayers: this.config.maxPlayers ?? 8,
      roomType: this.config.type,
      mapSizeConfig: this.config.mapSize,
      roomInstance: this.roomInstance,
      gameInstance: this.gameInstance,
    });
  }
}

import {
  PlayerId,
  PreGameRoomState,
  SyncedPreGameClientActions,
  SyncedPreGameServerEvent,
  SyncedPreGameClientActionTypes,
  SyncedPreGameServerEventType,
  SyncedPreGameServerStateUpdatePayloadType,
  ServerSyncConnector,
  SyncedPreGameState,
  PlayerColor,
  SyncedPreGameServerEventPayloadType,
  TeamId,
  PreGameMapType,
  PRESET_SIZES,
  PreGameStandardSizeLabel,
  PreGameRoomType,
  PreGamePlayerStatus,
} from '@generale/types';
import { compare } from 'fast-json-patch';

// 类型别名，便于引用
export type PreGameServerConnector = ServerSyncConnector<SyncedPreGameClientActions, SyncedPreGameServerEvent>;

/**
 * PreGameInstance - 游戏房间阶段实例
 * 负责房主、设置、准备、队伍、同步等管理
 */
import { IBaseInstance } from './interface';

export class PreGameInstance implements IBaseInstance<SyncedPreGameClientActions, SyncedPreGameServerEvent> {
  private state: PreGameRoomState;
  /**
   * 处理客户端 action（带乐观编号幂等）
   */
  private syncData: Map<PlayerId, { lastConfirmedOp: number }> = new Map();

  private connectors: Map<PlayerId, PreGameServerConnector> = new Map();
  private prevSentState: Map<PlayerId, SyncedPreGameState> = new Map();
  private version = 0;
  private destroyed = false;
  private onStateChangeCallbacks: Array<(state: PreGameRoomState) => void> = [];

  private bannedUntil: Map<PlayerId, number> = new Map();
  private DEFAULT_KICK_BAN_MS = 60 * 1000; // 1 minute, 可改
  // PreGameInstance: 增加 onDestroy 回调支持
  private onDisbandCallbacks: Array<() => void> = [];
  private disbanded = false;

  private nextTeamSeq = 1; // 用于自动生成 team id
  private readonly MIN_TEAMS = 2;

  private suspended = false;

  // 防重入/防重复移除标记
  private removing: Set<PlayerId> = new Set();

  // 记录在 suspend 期间断开的玩家（保留其 player entry，但 connector 被移除）
  private disconnectedDuringSuspend: Set<PlayerId> = new Set();

  constructor(initialState: PreGameRoomState, initialConnectors: Map<PlayerId, PreGameServerConnector>) {
    this.state = structuredClone(initialState);
    this.nextTeamSeq = 1;
    for (const t of this.state.teams) {
      const m = /^team(\d+)$/.exec(t.id);
      if (m) {
        const n = Number(m[1]);
        if (!Number.isNaN(n)) this.nextTeamSeq = Math.max(this.nextTeamSeq, n + 1);
      }
    }
    this.connectors = new Map(initialConnectors);

    for (const [pid, conn] of this.connectors) {
      conn.onOpen(() => this.sendState(pid, true));
      conn.onDisconnect(() => this.handleDisconnect(pid, conn));
      conn.onReconnect(() => this.sendState(pid, true));
      conn.onClientMessage(evt => this.handleClientAction(pid, evt));
      conn.onClose(() => this.handleDisconnect(pid, conn));
    }
  }

  /** Helper: create a new team id (unique) */
  private createTeamId(proposed?: TeamId): TeamId {
    if (proposed && !this.state.teams.find(t => t.id === proposed)) return proposed;
    // find next free teamN
    while (true) {
      const id: TeamId = `team${this.nextTeamSeq++}`;
      if (!this.state.teams.find(t => t.id === id)) return id;
    }
  }

  /**
   * ensure team exists
   *
   * 改动点（更保守的策略）：
   * - 如果没有传 teamId（undefined/null），则在 server 端创建一个新队（原有行为）
   * - 如果传入 teamId 且服务端存在：返回该 teamId
   * - 如果传入 teamId 且服务端**不存在**：**不再隐式创建**，返回 null（调用方需处理失败）
   */
  private ensureTeamExists(teamId?: TeamId, name?: string): TeamId | null {
    if (!teamId) {
      const id = this.createTeamId();
      this.state.teams.push({ id, name: name ?? id });
      this.state.teamCount = this.state.teams.length;
      return id;
    }
    const found = this.state.teams.find(t => t.id === teamId);
    if (found) return found.id;

    // PROTECTION: do NOT silently create when client asked for an unknown team.
    console.warn(`[PreGameInstance] ensureTeamExists: proposed teamId "${teamId}" not found. refusing to create implicitly.`);
    return null;
  }

  /**
   * Remove any teams that have zero members, but keep at least MIN_TEAMS teams.
   *
   * NOTE: This was previously called automatically on many operations.
   *       Per new requirement, we only call this when the game is about to start
   *       (or any other explicit time you want to clean empty teams).
   */
  private removeEmptyTeams() {
    // compute counts
    const counts = new Map<string, number>();
    for (const t of this.state.teams) counts.set(t.id, 0);
    for (const p of this.state.players) {
      if (p.teamId) counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1);
    }
    // filter out empty teams
    const newTeams = this.state.teams.filter(t => (counts.get(t.id) ?? 0) > 0);
    // ensure min teams
    while (newTeams.length < this.MIN_TEAMS) {
      const id = this.createTeamId();
      newTeams.push({ id, name: id });
    }
    this.state.teams = newTeams;
    this.state.teamCount = newTeams.length;
  }

  /**
   * 清除某个 pid 的 per-connection 服务端状态：connector / prevSentState / syncData。
   * 保留 player entry 本身（是否保留由调用方决定）。
   * 不清这些会导致：
   *  - prevSentState 残留 → 重连首帧服务端发 PATCH 而不是 SNAPSHOT，客户端 patch 失败
   *  - syncData.lastConfirmedOp 残留 → 新 connection 从 optimisticId=0 计数时被
   *    服务端误判为过期 action 丢弃
   */
  private clearPerConnectionState(pid: PlayerId) {
    const conn = this.connectors.get(pid);
    if (conn) {
      try { conn.close(); } catch { }
      this.connectors.delete(pid);
    }
    this.prevSentState.delete(pid);
    this.syncData.delete(pid);
  }

  /**
   * 专门的 disconnect 处理函数，供 connector.onDisconnect / onClose 使用。
   *
   * `source` 是触发本次回调的 connector。如果当前 this.connectors[pid] 已经
   * 不是 source（说明同一个 pid 后来有了新连接，旧的 onClose 才迟到地跑），
   * 直接忽略——否则会把无辜的新 connector 关掉、把刚回来的 Playing 玩家又翻成 Disconnected。
   *
   * 没传 source 的旧调用路径（罕见）退化为不检查，保留原行为。
   */
  private handleDisconnect(pid: PlayerId, source?: PreGameServerConnector) {
    if (source && this.connectors.get(pid) !== source) {
      console.debug(`[PreGameInstance] stale onClose/onDisconnect for ${pid} ignored (connector replaced)`);
      return;
    }

    const player = this.state.players.find(p => p.id === pid);
    if (!player) {
      this.clearPerConnectionState(pid);
      return;
    }

    // Playing 玩家断开 -> 标记 Disconnected，保留座位等待 game 结束回收
    if (player.status === PreGamePlayerStatus.Playing) {
      this.clearPerConnectionState(pid);
      player.status = PreGamePlayerStatus.Disconnected;
      console.debug(`[PreGameInstance] Playing player ${pid} -> Disconnected (slot held)`);
      this.broadcastState();
      return;
    }

    // Disconnected 玩家重复断开 -> 幂等，no-op
    if (player.status === PreGamePlayerStatus.Disconnected) {
      this.clearPerConnectionState(pid);
      return;
    }

    // Lobby / Spectating 玩家断开：按正常流程移除（即使 suspended=true 也直接走，
    // 因为他不在游戏里，保留座位没意义）
    this.removePlayer(pid, /*forceRemove=*/ true);
  }

  /**
   * 判断这个 action 当前是否被允许。
   * 规则：
   * - destroyed 直接拒
   * - Playing/Disconnected 玩家在 pregame 域不能做任何写操作
   * - Spectating 玩家在 pregame 域只允许 LEAVE_SPECTATE / LEAVE_ROOM / CHANGE_TEAM
   * - Lobby 玩家：
   *    * 非 suspended 期间一切放行
   *    * suspended 期间只允许 CHANGE_TEAM / LEAVE_ROOM / ENTER_SPECTATE
   * - KICK_PLAYER / START_GAME 等只允许在 PREGAME（!suspended）期间
   */
  private actionAllowed(player: { status: PreGamePlayerStatus }, evtType: SyncedPreGameClientActionTypes): boolean {
    if (
      player.status === PreGamePlayerStatus.Playing ||
      player.status === PreGamePlayerStatus.Disconnected
    ) {
      // 这些玩家应通过 game 域操作，不允许在 pregame 域改任何东西
      return false;
    }

    if (player.status === PreGamePlayerStatus.Spectating) {
      switch (evtType) {
        case SyncedPreGameClientActionTypes.LEAVE_SPECTATE:
        case SyncedPreGameClientActionTypes.LEAVE_ROOM:
          return true;
        default:
          return false;
      }
    }

    // 剩下的就是 Lobby
    if (!this.suspended) {
      // 非 suspended 时 ENTER_SPECTATE 无意义，拒掉
      if (evtType === SyncedPreGameClientActionTypes.ENTER_SPECTATE) return false;
      // LEAVE_SPECTATE 对 Lobby 玩家也无意义
      if (evtType === SyncedPreGameClientActionTypes.LEAVE_SPECTATE) return false;
      return true;
    }

    // suspended 期间 Lobby 玩家只允许的有限动作
    switch (evtType) {
      case SyncedPreGameClientActionTypes.CHANGE_TEAM:
      case SyncedPreGameClientActionTypes.LEAVE_ROOM:
      case SyncedPreGameClientActionTypes.ENTER_SPECTATE:
        return true;
      default:
        return false;
    }
  }

  private handleClientAction(pid: PlayerId, evt: SyncedPreGameClientActions) {
    if (this.destroyed) return;
    const player = this.state.players.find(p => p.id === pid);
    if (!player) return;

    // 幂等乐观编号判断
    let synced = this.syncData.get(pid);
    if (!synced) {
      synced = { lastConfirmedOp: -1 };
      this.syncData.set(pid, synced);
    }
    if (typeof evt.optimisticId === 'number' && synced.lastConfirmedOp >= evt.optimisticId) {
      return;
    }

    if (!this.actionAllowed(player, evt.type)) {
      console.debug(`[PreGameInstance] action rejected (status=${player.status}, suspended=${this.suspended}) from ${pid}:`, evt.type);
      if (typeof evt.optimisticId === 'number') {
        synced.lastConfirmedOp = evt.optimisticId;
      }
      return;
    }

    console.debug("pregame recv evt", evt);

    switch (evt.type) {
      case SyncedPreGameClientActionTypes.READY:
        this.setReady(pid, true); break;
      case SyncedPreGameClientActionTypes.UNREADY:
        this.setReady(pid, false); break;
      case SyncedPreGameClientActionTypes.CHANGE_SETTING:
        this.changeSetting(pid, evt.payload); break;
      case SyncedPreGameClientActionTypes.CHANGE_MAP:
        this.changeMap(pid, evt.payload); break;
      case SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE:
        this.changeRoomType(pid, evt.payload.roomType); break;
      case SyncedPreGameClientActionTypes.CHANGE_TEAM:
        this.changeTeam(pid, evt.payload.teamId, evt.payload.playerId); break;
      case SyncedPreGameClientActionTypes.KICK_PLAYER:
        // KICK 只在 PREGAME（非 suspended）期间允许，且目标必须是 Lobby 玩家
        this.kickPlayer(pid, evt.payload.playerId); break;
      case SyncedPreGameClientActionTypes.LEAVE_ROOM:
        this.removePlayer(pid); break;
      case SyncedPreGameClientActionTypes.START_GAME:
        this.tryStartGame(pid); break;
      case SyncedPreGameClientActionTypes.TRANSFER_HOST:
        this.transferHost(pid, evt.payload.newHostId); break;
      case SyncedPreGameClientActionTypes.DISBAND_ROOM:
        this.disbandRoom(pid); break;
      case SyncedPreGameClientActionTypes.CREATE_TEAM:
        this.createTeam(pid, evt.payload.name); break;
      case SyncedPreGameClientActionTypes.RENAME_TEAM:
        this.renameTeam(pid, evt.payload.teamId, evt.payload.name); break;
      case SyncedPreGameClientActionTypes.DELETE_TEAM:
        this.deleteTeam(pid, evt.payload.teamId); break;
      case SyncedPreGameClientActionTypes.ENTER_SPECTATE:
        this.enterSpectate(pid); break;
      case SyncedPreGameClientActionTypes.LEAVE_SPECTATE:
        this.leaveSpectate(pid); break;
      default:
        // ignore
        break;
    }
    this.version++;
    // 更新 lastConfirmedOp
    if (typeof evt.optimisticId === 'number') {
      synced.lastConfirmedOp = evt.optimisticId;
    }
    this.broadcastState();
  }

  /** 设置准备状态 */
  private setReady(pid: PlayerId, ready: boolean) {
    console.log("set ready to", ready)
    const p = this.state.players.find(p => p.id === pid);
    if (p && !p.isHost) p.ready = ready ? 1 : 0;
  }

  /**
   * Lobby -> Spectating
   * 前提：当前必须 suspended（INGAME），玩家必须是 Lobby。actionAllowed 已经守住，
   * 这里再做一次防御性检查。
   * 注意：不真正打开 game 域连接 —— 那是客户端拿到状态后自己去开 game-${id} sub
   * 的事。我们只翻状态位 + 广播。
   */
  private enterSpectate(pid: PlayerId) {
    if (!this.suspended) return;
    const p = this.state.players.find(p => p.id === pid);
    if (!p) return;
    if (p.status !== PreGamePlayerStatus.Lobby) return;
    p.status = PreGamePlayerStatus.Spectating;
    p.ready = 0;
    console.debug(`[PreGameInstance] ${pid} Lobby -> Spectating`);
  }

  /**
   * Spectating -> Lobby
   * 任何时刻都可以退（包括游戏已结束的边界情况）。
   */
  private leaveSpectate(pid: PlayerId) {
    const p = this.state.players.find(p => p.id === pid);
    if (!p) return;
    if (p.status !== PreGamePlayerStatus.Spectating) return;
    p.status = PreGamePlayerStatus.Lobby;
    console.debug(`[PreGameInstance] ${pid} Spectating -> Lobby`);
  }

  /** 修改房间设置（仅房主） */
  private changeSetting(pid: PlayerId, patch: Partial<PreGameRoomState['gameSetting']>) {
    if (pid !== this.state.hostId) return;
    Object.assign(this.state.gameSetting, patch);
  }

  /** 切换房间模式（仅房主）
   *
   * - custom → standard：把 mapSetting 重置为 PRESET_SIZES.medium 的 Random 地图，清空 tileFrequency。
   *   用户在 custom 模式下的自定义尺寸/地形频率/customData 将丢失（这是 standard 的语义约束）。
   * - standard → custom：保留当前宽高，地图类型切换为 Custom，并清掉 sizeLabel。
   * - 相同 → 相同：no-op。
   */
  private changeRoomType(pid: PlayerId, next: PreGameRoomType) {
    if (pid !== this.state.hostId) return;
    if (next !== "standard" && next !== "custom") return;
    if (this.state.roomType === next) return;

    if (next === "standard") {
      const defaultLabel: PreGameStandardSizeLabel = "medium";
      const dims = PRESET_SIZES[defaultLabel];
      this.state.mapSetting = {
        type: PreGameMapType.Random,
        width: dims.width,
        height: dims.height,
        tileFrequency: {},
        sizeLabel: defaultLabel,
      };
    } else {
      const ms: any = this.state.mapSetting;
      const w = typeof ms?.width === "number" ? ms.width : 20;
      const h = typeof ms?.height === "number" ? ms.height : 20;
      this.state.mapSetting = {
        type: PreGameMapType.Custom,
        width: w,
        height: h,
        tileFrequency: {},
        customData: "",
      };
    }
    this.state.roomType = next;
  }

  /** 修改地图设置（仅房主）
   *
   * standard 房间只接受合法的 sizeLabel（small/medium/large），并由服务端
   *   按 PRESET_SIZES 回填 width/height，地图类型固定为 Random，tileFrequency 清空。
   *   其余字段（不同 map type / 自定义尺寸 / tileFrequency）一律拒绝。
   * custom 房间：原样写入。
   */
  private changeMap(pid: PlayerId, mapSetting: PreGameRoomState['mapSetting']) {
    if (pid !== this.state.hostId) return;

    if (this.state.roomType === "standard") {
      const incoming: any = mapSetting;
      const label = incoming?.sizeLabel as PreGameStandardSizeLabel | undefined;
      if (!label || !(label in PRESET_SIZES)) {
        console.warn(`[PreGameInstance] standard room rejects CHANGE_MAP without valid sizeLabel:`, mapSetting);
        return;
      }
      const dims = PRESET_SIZES[label];
      this.state.mapSetting = {
        type: PreGameMapType.Random,
        width: dims.width,
        height: dims.height,
        tileFrequency: {},
        sizeLabel: label,
      };
      return;
    }

    this.state.mapSetting = mapSetting;
  }

  /** 换队
   *
   * NOTE: 不再自动删除空队（allow empty teams to remain).
   * 空队会在 tryStartGame 前统一清理。
   *
   * 改动点：
   * - 当 client 请求加入一个服务端不存在的 teamId 时，拒绝并通知该玩家（不会隐式创建）
   */
  private changeTeam(pid: PlayerId, teamId: TeamId | undefined, targetPlayerId?: PlayerId) {
    // 默认 target 为 requester（即玩家修改自己）
    const targetId = targetPlayerId ?? pid;
    // permission: only host can change others
    if (targetId !== pid && this.state.hostId !== pid) {
      console.warn(`[PreGameInstance] Player ${pid} tried to change team for ${targetId} but is not host`);
      return;
    }
    const target = this.state.players.find(p => p.id === targetId);
    if (!target) {
      console.warn(`[PreGameInstance] changeTeam: target ${targetId} not found`);
      return;
    }

    // If teamId is falsy (empty string / undefined), interpret as "join default team"
    if (!teamId) {
      // prefer existing first team; if none, create one
      const firstTeam = (this.state.teams && this.state.teams[0]) ? this.state.teams[0].id : this.ensureTeamExists();
      if (!firstTeam) {
        // Shouldn't happen because ensureTeamExists() without param will create,
        // but guard anyway.
        console.warn("[PreGameInstance] changeTeam: cannot determine fallback team");
        return;
      }
      target.teamId = firstTeam;
      return;
    } else {
      // ensure team exists (DO NOT create if not found)
      const realTeamId = this.ensureTeamExists(teamId);
      if (!realTeamId) {
        console.warn(`[PreGameInstance] changeTeam: requested unknown team "${teamId}", rejected.`);
        return;
      }
      target.teamId = realTeamId;
    }

    // NOTE: 不在此处自动删除空队，保留空队以便后续加入或房主管理。
  }

  private createTeam(pid: PlayerId, name: string) {
    if (pid !== this.state.hostId) return;

    const id = this.createTeamId();
    this.state.teams.push({ id, name });

    this.state.teamCount = this.state.teams.length;
  }

  private renameTeam(pid: PlayerId, teamId: TeamId, name: string) {
    if (pid !== this.state.hostId) return;

    const team = this.state.teams.find(t => t.id === teamId);
    if (!team) return;

    team.name = name;
  }

  private deleteTeam(pid: PlayerId, teamId: TeamId) {
    if (pid !== this.state.hostId) return;

    if (this.state.teams.length <= this.MIN_TEAMS) return;

    // 找到目标队伍
    const team = this.state.teams.find(t => t.id === teamId);
    if (!team) return;

    // 把该队伍玩家移动到第一个队伍
    const fallback = this.state.teams.find(t => t.id !== teamId);
    if (!fallback) return;

    for (const p of this.state.players) {
      if (p.teamId === teamId) {
        p.teamId = fallback.id;
      }
    }

    this.state.teams = this.state.teams.filter(t => t.id !== teamId);
    this.state.teamCount = this.state.teams.length;
  }


  /** 踢人（仅房主，且只在 PREGAME 阶段、只能踢 Lobby 玩家） */
  private kickPlayer(requester: PlayerId, target: PlayerId) {
    if (requester !== this.state.hostId) return;
    if (this.suspended) {
      console.warn(`[PreGameInstance] kickPlayer rejected: game in progress`);
      return;
    }
    const targetPlayer = this.state.players.find(p => p.id === target);
    if (!targetPlayer) return;
    if (targetPlayer.status !== PreGamePlayerStatus.Lobby) {
      console.warn(`[PreGameInstance] kickPlayer rejected: target ${target} is ${targetPlayer.status}`);
      return;
    }
    if (target === this.state.hostId) {
      console.warn(`[PreGameInstance] kickPlayer rejected: cannot kick host`);
      return;
    }

    // set ban
    const until = Date.now() + this.DEFAULT_KICK_BAN_MS;
    this.bannedUntil.set(target, until);

    // send kicked event (so client can show reason)
    this.sendKickEvent(target, 'You have been kicked from the room.');

    // ensure we close their connector and remove player
    try {
      const conn = this.connectors.get(target);
      if (conn) {
        try { conn.close(4000, "kicked"); } catch { }
      }
      // forceRemove=true: 已是 Lobby 玩家，无论 suspended 与否都直接移除
      this.removePlayer(target, true);
    } catch (e) {
      console.warn('[PreGameInstance] kickPlayer removal error', e);
    }
  }

  private sendKickEvent(pid: PlayerId, reason: string) {
    this.connectors.get(pid)?.send({
      type: SyncedPreGameServerEventType.CUSTOM,
      payload: {
        type: SyncedPreGameServerEventPayloadType.KICKED,
        reason
      }
    });
  }

  /** 离开房间/断开
   *
   * 幂等且防重入：
   * - removing guard 防重入
   * - Playing 玩家若 forceRemove=false：转交给 handleDisconnect 标 Disconnected，不在此处删
   * - 否则按 Lobby/Disconnected/Playing(force) 流程删除 player 与 connector
   *
   * forceRemove=true 表示要彻底回收（resume 后清理 Disconnected、kick、destroy 等场景）
   */
  private removePlayer(pid: PlayerId, forceRemove: boolean = false) {
    if (this.removing.has(pid)) return;
    this.removing.add(pid);

    try {
      const conn = this.connectors.get(pid);
      const player = this.state.players.find(p => p.id === pid);

      if (!conn && !player) return;

      // Playing 玩家在非 force 路径下不要直接删 —— 走 handleDisconnect 转 Disconnected
      if (player && player.status === PreGamePlayerStatus.Playing && !forceRemove) {
        this.clearPerConnectionState(pid);
        player.status = PreGamePlayerStatus.Disconnected;
        this.broadcastState();
        return;
      }

      // 彻底回收：connector + 同步状态 + player entry 全清
      this.clearPerConnectionState(pid);

      if (player) {
        this.state.players = this.state.players.filter(p => p.id !== pid);
        if (this.state.hostId === pid) {
          this.autoTransferHost();
        }

        if (this.state.players.length === 0) {
          console.debug("[PreGameInstance] all players left, auto destroy")
          this.destroy();
          return;
        } else {
          this.broadcastState();
        }
      }
    } finally {
      this.removing.delete(pid);
    }
  }

  /** 房主转让 */
  private transferHost(pid: PlayerId, newHostId: PlayerId) {
    if (pid !== this.state.hostId) return;
    const newHost = this.state.players.find(p => p.id === newHostId);
    if (!newHost) return;
    this.state.players.forEach(p => (p.isHost = false));
    newHost.isHost = true;
    this.state.hostId = newHostId;
  }

  /** 自动转让房主：优先 Lobby 玩家，其次 Playing，最后任意；都没有则 hostId 置空 */
  private autoTransferHost() {
    // 先清掉所有 isHost 标记，避免残留
    for (const p of this.state.players) p.isHost = false;

    const candidate =
      this.state.players.find(p => p.status === PreGamePlayerStatus.Lobby) ??
      this.state.players.find(p => p.status === PreGamePlayerStatus.Playing) ??
      this.state.players[0];

    if (candidate) {
      candidate.isHost = true;
      this.state.hostId = candidate.id;
    } else {
      this.state.hostId = '';
    }
  }

  /** 解散房间（仅房主） */
  private disbandRoom(pid: PlayerId) {
    if (pid !== this.state.hostId) return;

    this.disbanded = true;

    for (const [_pid, conn] of this.connectors) {
      conn.send({
        type: SyncedPreGameServerEventType.CUSTOM,
        payload: {
          type: SyncedPreGameServerEventPayloadType.DISBANDED,
          reason: 'Room has been disbanded.'
        }
      });
      try { conn.close(); } catch (e) { /* ignore */ }
    }
    // notify listeners
    for (const cb of this.onDisbandCallbacks) {
      try { cb(); } catch (err) { console.error('[PreGameInstance] onDisband callback error', err); }
    }
    this.onDisbandCallbacks = [];

    this.destroy();
  }

  private onStartGameCallbacks: Array<(state: PreGameRoomState) => void> = [];
  /** 注册游戏开始回调 */
  public onStartGame(callback: (state: PreGameRoomState) => void) {
    this.onStartGameCallbacks.push(callback);
  }

  /** 检查是否可开始游戏并广播 */
  private tryStartGame(pid: PlayerId) {
    if (pid !== this.state.hostId) return;

    // 在真正开始游戏之前，清理空队伍，保证开始时 teams 数量和非空队伍一致
    this.removeEmptyTeams();

    const res = this.canStart();
    if (!res.ok) {
      const conn = this.connectors.get(pid);
      conn?.send({
        type: SyncedPreGameServerEventType.CUSTOM,
        payload: {
          type: SyncedPreGameServerEventPayloadType.START_REJECTED,
          reason: res.reason
        }
      });
      return;
    }
    // 把当前所有 Lobby 玩家锁入游戏
    for (const p of this.state.players) {
      if (p.status === PreGamePlayerStatus.Lobby) {
        p.status = PreGamePlayerStatus.Playing;
      }
    }
    this.state.started = true;
    // 广播游戏开始事件
    const startedAt = Date.now();
    for (const conn of this.connectors.values()) {
      conn.send({
        type: SyncedPreGameServerEventType.CUSTOM,
        payload: {
          type: SyncedPreGameServerEventPayloadType.GAME_STARTED,
          startedAt
        }
      });
    }
    // 触发回调（GameService 会基于此时 status===Playing 的玩家构建 GameInstance）
    for (const callback of this.onStartGameCallbacks) {
      callback(this.state);
    }
  }

  /** 判断是否所有非房主都准备好且人数足够 */
  private canStart(): { ok: false, reason: string } | { ok: true } {
    const readyPlayers = this.state.players.filter(p => !p.isHost && p.ready === 1);

    // count non-empty teams via teams array
    const teamMemberCounts = new Map<string, number>();
    for (const t of this.state.teams) teamMemberCounts.set(t.id, 0);
    for (const p of this.state.players) {
      if (p.teamId) teamMemberCounts.set(p.teamId, (teamMemberCounts.get(p.teamId) ?? 0) + 1);
    }
    const nonEmptyTeamCount = Array.from(teamMemberCounts.values()).filter(n => n > 0).length;

    if (this.state.players.length < 2) {
      return { ok: false, reason: "No enough players to start the game." };
    }
    if (readyPlayers.length !== this.state.players.length - 1) {
      return { ok: false, reason: "Not all players are ready or insufficient players to start the game." };
    }
    if (nonEmptyTeamCount < this.MIN_TEAMS) {
      return { ok: false, reason: "No enough teams to start the game" };
    }
    return { ok: true };
  }

  /** 全量同步/patch同步 */
  private sendState(pid: PlayerId, forceSnapshot = false) {
    const conn = this.connectors.get(pid);
    if (!conn) return;
    const prev = this.prevSentState.get(pid);
    const foundSelf = this.state.players.find(p => p.id === pid);
    const curr: SyncedPreGameState = foundSelf
      ? { room: this.state, selfId: pid, self: foundSelf }
      : { room: this.state, selfId: pid };

    const confirmedOp = this.syncData.get(pid)?.lastConfirmedOp ?? 0;
    if (!prev || forceSnapshot) {
      console.debug("sent state", {
        type: SyncedPreGameServerEventType.STATE_UPDATE,
        payload: {
          type: SyncedPreGameServerStateUpdatePayloadType.SNAPSHOT,
          version: this.version,
          confirmedOp,
          payload: curr,
        },
      })
      conn.send({
        type: SyncedPreGameServerEventType.STATE_UPDATE,
        payload: {
          type: SyncedPreGameServerStateUpdatePayloadType.SNAPSHOT,
          version: this.version,
          confirmedOp,
          payload: curr,
        },
      });
      this.prevSentState.set(pid, structuredClone(curr));
      return;
    }
    const patches = compare(prev, curr);
    if (patches.length > 1000) {
      console.debug("sent state", {
        type: SyncedPreGameServerEventType.STATE_UPDATE,
        payload: {
          type: SyncedPreGameServerStateUpdatePayloadType.SNAPSHOT,
          version: this.version,
          confirmedOp,
          payload: curr,
        },
      })

      conn.send({
        type: SyncedPreGameServerEventType.STATE_UPDATE,
        payload: {
          type: SyncedPreGameServerStateUpdatePayloadType.SNAPSHOT,
          version: this.version,
          confirmedOp,
          payload: curr,
        },
      });
    } else {
      console.debug("sent state", {
        type: SyncedPreGameServerEventType.STATE_UPDATE,
        payload: {
          type: SyncedPreGameServerStateUpdatePayloadType.PATCH,
          version: this.version,
          confirmedOp,
          payload: patches,
        },
      })


      conn.send({
        type: SyncedPreGameServerEventType.STATE_UPDATE,
        payload: {
          type: SyncedPreGameServerStateUpdatePayloadType.PATCH,
          version: this.version,
          confirmedOp,
          payload: patches,
        },
      });
    }
    this.prevSentState.set(pid, structuredClone(curr));
  }

  /** 广播同步 */
  private broadcastState(forceSnapshot = false) {
    for (const pid of this.connectors.keys()) {
      this.sendState(pid, forceSnapshot);
    }
    // after sending to all connectors, notify subscribers about a room-level update
    for (const cb of this.onStateChangeCallbacks) {
      try { cb(this.state); } catch (err) { console.error('[PreGameInstance] onStateChange callback error', err); }
    }
  }

  private getAvailableTileColor(): PlayerColor {
    const usedColors = this.state.players.map(p => p.tileColor);
    const color = Object.values(PlayerColor).find(color => !usedColors.includes(color as PlayerColor));
    return color as PlayerColor;
  }

  /** 主动销毁实例 */
  public destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    // 只有在显式 disband 或房间已无人时才通知 onDisband
    const shouldNotifyDisband = this.disbanded || (Array.isArray(this.state.players) && this.state.players.length === 0);

    if (shouldNotifyDisband) {
      for (const cb of this.onDisbandCallbacks) {
        try { cb(); } catch (err) { console.error('[PreGameInstance] onDisband callback error', err); }
      }
      this.onDisbandCallbacks = [];
      this.disbanded = true;
      console.debug('[PreGameInstance] notified onDisband callbacks during destroy');
    } else {
      // 不将普通的 destroy 视为 disband —— 只是清理回调列表避免内存泄露
      this.onDisbandCallbacks = [];
      console.debug('[PreGameInstance] destroy without disband (normal lifecycle transition)');
    }
    for (const [_pid, conn] of this.connectors) {
      try { conn.close(); } catch (e) { /* ignore */ }
    }
    this.connectors.clear();
    this.state.players = [];
    this.onStateChangeCallbacks = [];
  }

  public onDisband(cb: () => void): () => void {
    this.onDisbandCallbacks.push(cb);
    return () => {
      const i = this.onDisbandCallbacks.indexOf(cb);
      if (i >= 0) this.onDisbandCallbacks.splice(i, 1);
    };
  }

  public onStateChange(callback: (state: PreGameRoomState) => void): () => void {
    this.onStateChangeCallbacks.push(callback);
    return () => {
      const idx = this.onStateChangeCallbacks.indexOf(callback);
      if (idx >= 0) this.onStateChangeCallbacks.splice(idx, 1);
    };
  }

  /** 获取当前房间状态 */
  public getState(): PreGameRoomState {
    return this.state;
  }

  public canJoin(playerId: PlayerId): { success: true } | { success: false, message: string } {
    if (this.destroyed) {
      const msg = `[PreGameInstance] Cannot add player to destroyed instance`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    // ban check
    const now = Date.now();
    const until = this.bannedUntil.get(playerId);
    if (until && now < until) {
      const remain = Math.ceil((until - now) / 1000);
      const msg = `[PreGameInstance] Player ${playerId} is temporarily banned (${remain}s left)`;
      console.warn(msg);
      return { success: false, message: `You were kicked. Please try again in ${remain} seconds.` };
    }

    const existing = this.state.players.find(p => p.id === playerId);
    // Disconnected 玩家允许重连（座位本来就给他留着的）
    if (existing && existing.status === PreGamePlayerStatus.Disconnected) {
      return { success: true };
    }
    if (existing) {
      const msg = `[PreGameInstance] Player ${playerId} already in room`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    if (this.state.players.length >= this.state.playerLimit) {
      const msg = `[PreGameInstance] Room is full, cannot add player ${playerId}`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    return { success: true };
  }
  /** 动态添加玩家（用于 GameService） */
  public addPlayer(user: { id: PlayerId, name: string }, connector: PreGameServerConnector): { success: true } | { success: false, message: string } {
    const playerId = user.id;
    const playerName = user.name;

    const res = this.canJoin(playerId);
    if (!res.success) {
      return res;
    }

    // —— 重连分支：Disconnected 玩家回来了，恢复为 Playing，复用原座位 ——
    const existing = this.state.players.find(p => p.id === playerId);
    if (existing && existing.status === PreGamePlayerStatus.Disconnected) {
      existing.status = PreGamePlayerStatus.Playing;
      // 如果旧 connector 还残留在 map 里（不应该发生，但兜底），先关掉避免漏 socket
      const stale = this.connectors.get(playerId);
      if (stale && stale !== connector) {
        try { stale.close(); } catch { }
      }
      this.connectors.set(playerId, connector);
      connector.onOpen(() => this.sendState(playerId, true));
      connector.onDisconnect(() => this.handleDisconnect(playerId, connector));
      connector.onReconnect(() => this.sendState(playerId, true));
      connector.onClientMessage(evt => this.handleClientAction(playerId, evt));
      connector.onClose(() => this.handleDisconnect(playerId, connector));
      this.version++;
      this.broadcastState();
      console.log(`[PreGameInstance] Player ${playerId} reconnected (Disconnected -> Playing)`);
      return { success: true };
    }

    // 如果是第一个玩家，设为房主
    const isHost = this.state.players.length === 0;
    if (isHost) {
      this.state.hostId = playerId;
    }

    // 如果当前 teams 数量 < MIN_TEAMS，则为本次加入的玩家创建一个新的队伍并把玩家放入该队。
    if (!this.state.teams) this.state.teams = [];
    let defaultTeamId: TeamId | undefined = undefined;

    if (this.state.teams.length < this.MIN_TEAMS) {
      const newTeamId = this.createTeamId();
      this.state.teams.push({ id: newTeamId, name: newTeamId });
      this.state.teamCount = this.state.teams.length;
      defaultTeamId = newTeamId;
    } else {
      defaultTeamId = (this.state.teams && this.state.teams[0]) ? this.state.teams[0].id : (this.ensureTeamExists() ?? undefined);
    }

    // 添加玩家到状态（默认 Lobby）
    this.state.players.push({
      id: playerId,
      name: playerName,
      isHost,
      ready: isHost ? 1 : 0,
      teamId: defaultTeamId!,
      tileColor: this.getAvailableTileColor(),
      status: PreGamePlayerStatus.Lobby,
    });

    // 设置连接器
    this.connectors.set(playerId, connector);

    // 设置连接器回调
    connector.onOpen(() => this.sendState(playerId, true));
    connector.onDisconnect(() => this.handleDisconnect(playerId, connector));
    connector.onReconnect(() => this.sendState(playerId, true));
    connector.onClientMessage(evt => this.handleClientAction(playerId, evt));
    connector.onClose(() => this.handleDisconnect(playerId, connector));

    // 更新版本并广播状态
    this.version++;
    this.broadcastState();

    console.log(`[PreGameInstance] Player ${playerId} (${playerName}) added to room, isHost: ${isHost}, assignedTeam: ${defaultTeamId}`);
    return { success: true };
  }
  /** 移除玩家（用于 GameService） */
  public removePlayerById(playerId: PlayerId): void {
    this.removePlayer(playerId);
  }

  /** 获取玩家数量 */
  public getPlayerCount(): number {
    return this.state.players.length;
  }

  /** 检查是否可以开始游戏 */
  public canStartGame(): boolean {
    return this.canStart().ok;
  }

  public suspend() {
    if (this.suspended) return;
    this.suspended = true;
    // optional: avoid emitting onStateChangeCallbacks
    try {
      this.prevSentState.clear();
    } catch (e) {
      // ignore
    }
    // keep current host fixed — no extra action needed, state.hostId 保持不变
    console.debug('[PreGameInstance] suspended: state locked, client modifications will be ignored.');
  }

  public resume() {
    if (!this.suspended) return;
    this.suspended = false;

    // 1. 把 Playing 和 Spectating 的玩家都归位到 Lobby
    //    （Spectating 也是房间里的人，游戏结束后回归大厅；
    //    Playing 先归位是为了让 step 2 触发的 autoTransferHost 候选优先来自 Lobby）
    for (const p of this.state.players) {
      if (
        p.status === PreGamePlayerStatus.Playing ||
        p.status === PreGamePlayerStatus.Spectating
      ) {
        p.status = PreGamePlayerStatus.Lobby;
        p.ready = 0;
      }
    }

    // 2. 回收 Disconnected 玩家（游戏中断线没回来的）
    const toRecycle: PlayerId[] = this.state.players
      .filter(p => p.status === PreGamePlayerStatus.Disconnected)
      .map(p => p.id);
    for (const pid of toRecycle) {
      console.debug(`[PreGameInstance] resume: recycling Disconnected player ${pid}`);
      this.removePlayer(pid, /*forceRemove=*/ true);
    }

    // 3. host 兜底：若 host 已不在或没连接，再选一个
    const hostId = this.state.hostId;
    const hostPlayer = this.state.players.find(p => p.id === hostId);
    if (!hostPlayer || !this.connectors.has(hostId)) {
      console.debug(`[PreGameInstance] resume: host ${hostId} unavailable -> autoTransfer`);
      this.autoTransferHost();
    }

    // safety: 旧字段不再使用，残留清干净
    this.disconnectedDuringSuspend.clear();

    this.state.started = false;
    this.version++;
    this.broadcastState(true);
    console.debug('[PreGameInstance] resumed: state unlocked and snapshot broadcasted.');
  }
}
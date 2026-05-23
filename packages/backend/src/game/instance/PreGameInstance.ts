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
      conn.onDisconnect(() => this.removePlayer(pid));
      conn.onReconnect(() => this.sendState(pid, true));
      conn.onClientMessage(evt => this.handleClientAction(pid, evt));
      // 使用 handleDisconnect 作为 onClose 也更合理（onClose 本质是连接断开）
      conn.onClose(() => this.handleDisconnect(pid));
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

  // 专门的 disconnect 处理函数，供 connector.onDisconnect / onClose 使用
  private handleDisconnect(pid: PlayerId) {
    // 如果 suspended -> 延迟删除（保留 player 记录），否则按正常流程删除
    if (this.suspended) {
      // remove connector but keep player entry
      const conn = this.connectors.get(pid);
      if (conn) {
        try { conn.close(); } catch { }
        this.connectors.delete(pid);
      }
      // mark as disconnectedDuringSuspend (removePlayer would have done same)
      if (this.state.players.some(p => p.id === pid)) {
        this.disconnectedDuringSuspend.add(pid);
        console.debug(`[PreGameInstance] player ${pid} disconnected during suspend (kept in state).`);
      }
      // don't call autoTransferHost or broadcast now
    } else {
      // normal immediate removal
      this.removePlayer(pid, /*forceRemove=*/ true);
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

    // If suspended: ignore client modification events (but keep lastConfirmedOp to avoid client-side stuck)
    if (this.suspended) {
      console.debug(`[PreGameInstance] Ignoring client action during suspend from ${pid}:`, evt.type);
      // update lastConfirmedOp so client's optimistic queue can advance (optional but usually helpful)
      if (typeof evt.optimisticId === 'number') {
        synced.lastConfirmedOp = evt.optimisticId;
      }
      // do not change version / broadcast / apply any state mutation while suspended
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
      case SyncedPreGameClientActionTypes.CHANGE_TEAM:
        this.changeTeam(pid, evt.payload.teamId, evt.payload.playerId); break;
      case SyncedPreGameClientActionTypes.KICK_PLAYER:
        this.kickPlayer(evt.payload.playerId); break;
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

  /** 修改房间设置（仅房主） */
  private changeSetting(pid: PlayerId, patch: Partial<PreGameRoomState['gameSetting']>) {
    if (pid !== this.state.hostId) return;
    Object.assign(this.state.gameSetting, patch);
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


  /** 踢人（仅房主） */
  private kickPlayer(target: PlayerId) {
    // set ban
    const until = Date.now() + this.DEFAULT_KICK_BAN_MS;
    this.bannedUntil.set(target, until);

    // send kicked event (so client can show reason)
    this.sendKickEvent(target, 'You have been kicked from the room.');

    // ensure we close their connector and remove player
    try {
      // try to close connector (if exists)
      const conn = this.connectors.get(target);
      if (conn) {
        try { conn.close(4000, "kicked"); } catch { }
        // connector close will call removePlayer via handlers (idempotent)
      }
      // defensively remove player now
      this.removePlayer(target);
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
   * 这一方法现在是幂等且防重入的：
   * - 开始时检查是否正在移除中，若是则直接返回
   * - 如果 player 不存在且 connector 也不存在，直接返回
   * - 会安全地关闭 connector（若存在），并删除 connector 与 player
   * - 当 suspended 且 forceRemove === false 时，**不**从 state.players 中删除玩家，仅移除 connector 并将其标记为 disconnectedDuringSuspend
   */
  private removePlayer(pid: PlayerId, forceRemove: boolean = false) {
    // 防重入：如果已经在移除流程中，直接返回
    if (this.removing.has(pid)) return;
    this.removing.add(pid);

    try {
      const conn = this.connectors.get(pid);
      const playerExists = this.state.players.some(p => p.id === pid);

      // If nothing to do (no connector and no player) => already removed
      if (!conn && !playerExists) {
        return;
      }

      // Close connector if present (closing may trigger onClose, but removePlayer is guarded by `removing`)
      if (conn) {
        try { conn.close(); } catch (e) { /* ignore */ }
        this.connectors.delete(pid);
      }

      // If we're suspended and not forcing removal -> keep player in state but mark as disconnected
      if (this.suspended && !forceRemove) {
        if (playerExists) {
          // mark as disconnected during suspend (we don't remove the player object)
          this.disconnectedDuringSuspend.add(pid);
          console.debug(`[PreGameInstance] removePlayer deferred due to suspend: ${pid}`);
          // do NOT auto transfer host or broadcast state now
          return;
        } else {
          // no player entry, nothing more to do
          return;
        }
      }

      // 正常移除流程（非 suspended 或 forceRemove 为 true）
      if (playerExists) {
        this.state.players = this.state.players.filter(p => p.id !== pid);
        // 如果房主离开，自动转让
        if (this.state.hostId === pid) {
          this.autoTransferHost();
        }

        // NOTE: 不在此处自动清理空队，空队应当保留直到游戏开始时统一清理

        if (this.state.players.length === 0) {
          console.debug("[PreGameInstance] all players left, auto destory")
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

  /** 自动转让房主 */
  private autoTransferHost() {
    const candidate = this.state.players[0];
    if (candidate) {
      candidate.isHost = true;
      this.state.hostId = candidate.id;
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
    // 可扩展: 通知 GameService 切换为正式游戏阶段
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
    // 触发回调
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

    if (this.state.players.length >= this.state.playerLimit) {
      const msg = `[PreGameInstance] Room is full, cannot add player ${playerId}`;
      console.warn(msg);
      return { success: false, message: msg };
    }

    if (this.state.players.find(p => p.id === playerId)) {
      const msg = `[PreGameInstance] Player ${playerId} already in room`;
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

    // 如果是第一个玩家，设为房主
    const isHost = this.state.players.length === 0;
    if (isHost) {
      this.state.hostId = playerId;
    }

    // 如果当前 teams 数量 < MIN_TEAMS，则为本次加入的玩家创建一个新的队伍并把玩家放入该队。
    if (!this.state.teams) this.state.teams = [];
    let defaultTeamId: TeamId | undefined = undefined;

    if (this.state.teams.length < this.MIN_TEAMS) {
      // 为当前加入的玩家创建一个专属队伍（id 由 createTeamId 生成）
      const newTeamId = this.createTeamId();
      // 队伍名使用 id 作为默认名（可以改为 `${playerName}'s Team`）
      this.state.teams.push({ id: newTeamId, name: newTeamId });
      this.state.teamCount = this.state.teams.length;
      defaultTeamId = newTeamId;
    } else {
      // 正常逻辑：把玩家放到第一个队，或保持既有队列行为
      defaultTeamId = (this.state.teams && this.state.teams[0]) ? this.state.teams[0].id : (this.ensureTeamExists() ?? undefined);
      // ensureTeamExists() without param will create one if needed; guard with ??
    }

    // 添加玩家到状态
    this.state.players.push({
      id: playerId,
      name: playerName,
      isHost,
      ready: isHost ? 1 : 0, // 房主默认准备
      teamId: defaultTeamId!,
      tileColor: this.getAvailableTileColor(), // 默认队伍
    });

    // 设置连接器
    this.connectors.set(playerId, connector);

    // 设置连接器回调
    connector.onOpen(() => this.sendState(playerId, true));
    connector.onDisconnect(() => this.removePlayer(playerId));
    connector.onReconnect(() => this.sendState(playerId, true));
    connector.onClientMessage(evt => this.handleClientAction(playerId, evt));
    // 统一使用 removePlayer 作为 onClose 回调
    connector.onClose(() => this.removePlayer(playerId));

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

    // 主机恢复时检查 host 是否仍然在线（有 connector）
    const hostId = this.state.hostId;
    if (hostId) {
      const hostConnected = this.connectors.has(hostId);
      if (!hostConnected) {
        console.debug(`[PreGameInstance] resume: host ${hostId} not connected -> transferring host`);
        this.autoTransferHost();
      } else {
        // 如果 host 重新连接并存在 connector，则保持 host
        console.debug(`[PreGameInstance] resume: host ${hostId} still connected, keep host`);
      }
    } else {
      // safety: 如果没有 hostId，自动选人
      this.autoTransferHost();
    }

    // 清理 disconnectedDuringSuspend（这里选择不强制删除玩家，仅清空标记）
    this.disconnectedDuringSuspend.clear();

    // 因为 resume 是需要恢复到开始之前的状态
    this.state.started = false;
    // broadcast snapshot to all connectors so clients in pregame get consistent view
    this.version++;
    this.broadcastState(true);
    console.debug('[PreGameInstance] resumed: state unlocked and snapshot broadcasted.');
  }
}
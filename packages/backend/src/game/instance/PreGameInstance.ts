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
  SyncedPreGameServerEventPayloadType
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


  constructor(initialState: PreGameRoomState, initialConnectors: Map<PlayerId, PreGameServerConnector>) {
    this.state = structuredClone(initialState);
    this.connectors = new Map(initialConnectors);

    for (const [pid, conn] of this.connectors) {
      conn.onOpen(() => this.sendState(pid, true));
      conn.onDisconnect(() => this.removePlayer(pid));
      conn.onReconnect(() => this.sendState(pid, true));
      conn.onClientMessage(evt => this.handleClientAction(pid, evt));
      conn.onClose(() => this.removePlayer(pid));
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

    console.log("pregame recv evt", evt);

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
        this.changeTeam(pid, evt.payload.teamId); break;
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

  /** 修改地图设置（仅房主） */
  private changeMap(pid: PlayerId, mapSetting: PreGameRoomState['mapSetting']) {
    if (pid !== this.state.hostId) return;
    this.state.mapSetting = mapSetting;
  }

  /** 换队 */
  private changeTeam(pid: PlayerId, teamId: string) {
    const p = this.state.players.find(p => p.id === pid);
    if (p) p.teamId = teamId;
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
        // connector close will call handleDisconnect/removePlayer via handlers (idempotent)
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

  /** 离开房间/断开 */
  private removePlayer(pid: PlayerId) {
    this.connectors.get(pid)?.close();
    this.connectors.delete(pid);
    this.state.players = this.state.players.filter(p => p.id !== pid);
    // 如果房主离开，自动转让
    if (this.state.hostId === pid) {
      this.autoTransferHost();
    }
    if (this.state.players.length === 0) {
      console.debug("[PreGameInstance] all players left, auto destory")
      this.destroy();
    } else {
      this.broadcastState();
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
      conn.close();
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
    if (!this.canStart()) return;
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
  private canStart(): boolean {
    const readyPlayers = this.state.players.filter(p => !p.isHost && p.ready === 1);
    return (
      this.state.players.length >= 2 &&
      readyPlayers.length === this.state.players.length - 1
    );
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
    if (!this.disbanded) {
      for (const cb of this.onDisbandCallbacks) {
        try { cb(); } catch (err) { console.error('[PreGameInstance] onDisband callback error', err); }
      }
      this.onDisbandCallbacks = [];
      this.disbanded = true;
    }
    for (const [_pid, conn] of this.connectors) conn.close();
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

    // 添加玩家到状态
    this.state.players.push({
      id: playerId,
      name: playerName,
      isHost,
      ready: isHost ? 1 : 0, // 房主默认准备
      teamId: 'team1', // 默认队伍
      tileColor: this.getAvailableTileColor(), // 默认队伍
    });

    // 设置连接器
    this.connectors.set(playerId, connector);

    // 设置连接器回调
    connector.onOpen(() => this.sendState(playerId, true));
    connector.onDisconnect(() => this.removePlayer(playerId));
    connector.onReconnect(() => this.sendState(playerId, true));
    connector.onClientMessage(evt => this.handleClientAction(playerId, evt));
    connector.onClose(() => this.connectors.delete(playerId));

    // 更新版本并广播状态
    this.version++;
    this.broadcastState();

    console.log(`[PreGameInstance] Player ${playerId} (${playerName}) added to room, isHost: ${isHost}`);
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
    return this.canStart();
  }
}

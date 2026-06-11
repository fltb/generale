import {
    GameState,
    MaskedGameState,
    PlayerActionQueues,
    PlayerId,
    SyncedGameServerEvent,
    SyncedGameServerStateUpdatePayloadType,
    SyncedGameServerEventType,
    ServerSyncConnector,
    SyncedGameClientActions,
    SyncedGameState,
    SyncedGameClientActionTypes,
    SyncedPreGameServerEventPayloadType
} from '@generale/types';
import { tick, mask } from '../core';
import { playerDefeatedBy, autoJudge } from '../core/game-utils';
import { GameStatus, PlayerStatus } from '@generale/types';
import { compare } from 'fast-json-patch';

type GameServerConnector = ServerSyncConnector<SyncedGameClientActions, SyncedGameServerEvent>;

export interface GameInstanceSettings {
    playerDisplay: SyncedGameState['playerDisplay'];
}

export interface SyncEntry {
    lastConfirmedOp: number;
    syncedState: SyncedGameState;
}

/**
 * 管理多玩家游戏实例，自动根据差异推送全量或增量，并跟踪 confirmedOp
 */
import { IBaseInstance } from './interface';

export interface GameEndResult {
    winnerId: PlayerId;
    reason: string;
    [key: string]: any;
}

export class GameInstance implements IBaseInstance<SyncedGameClientActions, SyncedGameServerEvent> {
    private state: GameState;
    private version: number;
    private settings: GameInstanceSettings;
    private connectors = new Map<PlayerId, GameServerConnector>();
    private syncData = new Map<PlayerId, SyncEntry>();
    private prevSentState = new Map<PlayerId, SyncedGameState>();
    private disconnected = new Set<PlayerId>();
    private destroyed: boolean = false;

    /**
     * 观战 connector：与 `connectors` 同形，但 key 是 spectatorId（在 GameInstance 视角下不是
     * 游戏内 player，不会出现在 `state.players` 里）。每次 advance / sendState 同步给他们的是
     * 未 mask 的完整 state。spectator 发来的任何 client action 都直接丢弃。
     *
     * spectatorPrevSentState 用于增量同步（patch vs snapshot）的对比，独立于 player 的 prevSent。
     */
    private spectatorConnectors = new Map<PlayerId, GameServerConnector>();
    private spectatorPrevSentState = new Map<PlayerId, SyncedGameState>();
    private spectatorDisconnected = new Set<PlayerId>();

    private onEndGameCallbacks: Array<(result: GameEndResult) => void> = [];

    /** 注册游戏结束回调 */
    public onEndGame(callback: (result: GameEndResult) => void) {
        this.onEndGameCallbacks.push(callback);
    }

    /** 触发所有结束回调 */
    private triggerEndGame(result: GameEndResult) {
        for (const callback of this.onEndGameCallbacks) {
            try { callback(result); } catch (e) { console.error("[GameInstance] onEndGame callback error", e); }
        }
    }

    constructor(
        initialState: GameState,
        settings: GameInstanceSettings,
        playerIds: PlayerId[]
    ) {
        this.state = structuredClone(initialState);
        this.settings = settings;
        this.version = 0;
        // 初始化所有玩家的同步状态（无 connector）
        for (const pid of playerIds) {
            const masked = mask(this.state, pid);
            this.syncData.set(pid, {
                lastConfirmedOp: 0,
                syncedState: {
                    ...masked,
                    playerDisplay: this.settings.playerDisplay,
                    playerOperationQueue: [],
                }
            });
        }
    }

    public destroy() {
        this.destroyed = true;
        for (const [_pid, connector] of this.connectors) {
            try { connector.close(); } catch { }
        }
        for (const [_sid, connector] of this.spectatorConnectors) {
            try { connector.close(); } catch { }
        }
        this.connectors.clear();
        this.spectatorConnectors.clear();
        this.spectatorPrevSentState.clear();
        this.spectatorDisconnected.clear();
        this.syncData.clear();
        this.prevSentState.clear();
        this.disconnected.clear();
        // release state reference
        // @ts-ignore
        this.state = null;
        this.version = 0;
    }

    public canJoin(id: PlayerId): { success: true; } | { success: false; message: string; } {
        if (this.destroyed) {
            const msg = `[GameInstance] Cannot add player to destroyed instance`;
            console.warn(msg);
            return { success: false, message: msg };
        }

        if (!(id in this.state.players)) {
            const msg = `[GameInstance] Player ${id} not in room`;
            console.warn(msg);
            return { success: false, message: msg };
        }

        return { success: true };
    }

    /**
     * 确保 syncData 存在（late-join / reconnect 场景）
     */
    private ensureSyncEntry(pid: PlayerId) {
        if (this.syncData.has(pid)) return this.syncData.get(pid)!;
        const masked = mask(this.state, pid);
        const entry: SyncEntry = {
            lastConfirmedOp: 0,
            syncedState: {
                ...masked,
                playerDisplay: this.settings.playerDisplay,
                playerOperationQueue: [],
            }
        };
        this.syncData.set(pid, entry);
        return entry;
    }

    /**
     * 动态绑定/替换某个玩家的 connector
     */
    public addPlayer(user: { id: PlayerId, name: string }, connector: GameServerConnector): { success: true } | { success: false, message: string } {
        const playerId = user.id;
        const res = this.canJoin(playerId);
        if (!res.success) {
            return res;
        }

        // 关键：先把新 connector 写入 map，再 close 旧的。
        // 顺序保证旧 connector.onClose 跑 removeConnector 时，map 里已经是新的，
        // source guard (`this.connectors.get(pid) !== connector`) 会把它弹掉，
        // 不会把刚接进来的新 connector 误删。
        // 触发场景：用户在另一端重新登录，旧 game-* sub 还活着；新端走到这里替换。
        const stale = this.connectors.get(playerId);
        this.connectors.set(playerId, connector);
        if (stale && stale !== connector) {
            // 通知旧 sub 它被替换了；前端 GameWithSync 会显示"被另一个标签页/设备接管"
            try {
                stale.send({
                    type: SyncedGameServerEventType.CUSTOM,
                    payload: { type: SyncedPreGameServerEventPayloadType.DISPLACED },
                });
            } catch { /* ignore */ }
            try { stale.close(); } catch { /* ignore */ }
        }

        // ensure we have a sync entry for this player (in case they were not in initial playerIds)
        const entry = this.ensureSyncEntry(playerId);

        // 关键：用当前 this.state 重算一次 masked 视图，覆盖 entry.syncedState。
        // 否则重连后 sendState 会把"该玩家断线那一帧冻结的 syncedState"当成快照发回，
        // 客户端基于过期视图操作会被服务端 validateMove 拒掉但 lastConfirmedOp 仍推进，
        // 表现为"乐观队列里有 move op 但格子没动、一帧后 op 消失"。
        //
        // 同时把 lastConfirmedOp 也归零：新 tab 页面刚加载，模块级 optimisticIdCounter
        // 从 0 重新计数；如果服务端这边还停在旧值（比如 50），新 client 头 N 条 action
        // 会被 `lastConfirmedOp >= optimisticId` 误判为过期直接丢，玩家体验为"前几下
        // 移动指令没反应、几秒后才开始正常"。
        // 自然断连路径上 removeConnector 已经做了重置；displacement 路径走 source guard
        // 短路，不会经过 removeConnector，所以这里必须显式置 0。
        entry.lastConfirmedOp = 0;
        const masked = mask(this.state, playerId);
        entry.syncedState = {
            ...entry.syncedState,
            ...masked,
            playerDisplay: this.settings.playerDisplay,
            playerOperationQueue: [], // 重连不继承旧的操作队列
        };
        // prevSentState 也需要清掉，让首帧确实走 SNAPSHOT 而不是 PATCH against 旧基线
        this.prevSentState.delete(playerId);

        // register connector callbacks
        connector.onOpen(() => {
            try {
                // mark as connected
                this.disconnected.delete(playerId);
                // Always send a forced snapshot on open to ensure the client gets authoritative state
                this.sendState(playerId, true);
            } catch (e) {
                console.warn(`[GameInstance] onOpen sendState error for ${playerId}`, e);
            }
        });

        connector.onDisconnect(() => {
            // mark as disconnected; do not remove sync data
            this.disconnected.add(playerId);
        });

        connector.onReconnect(() => {
            try {
                this.disconnected.delete(playerId);
                // send forced snapshot on reconnect
                this.sendState(playerId, true);
            } catch (e) {
                console.warn(`[GameInstance] onReconnect sendState error for ${playerId}`, e);
            }
        });

        connector.onClientMessage(evt => {
            try {
                this.handleClientEvent(playerId, evt);
            } catch (e) {
                console.warn(`[GameInstance] handleClientEvent error for ${playerId}`, e);
            }
        });

        connector.onClose(() => {
            // 防 stale onClose 误删后继 connector：只在当前 map 项就是我们的 connector 时才删。
            // 触发场景：玩家关 tab + 立刻重进，旧 WS 的 onClose 可能晚于新 addPlayer 执行。
            if (this.connectors.get(playerId) !== connector) return;
            this.removeConnector(playerId);
        });

        // Immediately attempt to send a snapshot (in case connection is already open)
        // Use microtask so that if connector is still initializing we avoid racing issues.
        Promise.resolve().then(() => {
            try {
                this.sendState(playerId, true);
            } catch (e) {
                // ignore — onOpen will try again
            }
        });

        return { success: true };
    }

    /**
     * 移除某个玩家的 connector。
     *
     * 同时清理：
     *  - prevSentState[pid] —— 不清会导致重连首帧服务端发 PATCH 而不是 SNAPSHOT，
     *    客户端 patch 失败
     *  - syncData[pid].lastConfirmedOp —— 不清会让新 session 从 optimisticId=0
     *    计数时被服务端误判为过期 action 丢弃。
     *
     * 注意：syncData 整条记录保留，因为里面的 syncedState 是该玩家在游戏中
     * 累计的状态（advance 写过 masked state），重连时 ensureSyncEntry 会复用
     * 这条记录继续推送当前世界状态。
     */
    public removeConnector(playerId: PlayerId) {
        this.connectors.delete(playerId);
        this.prevSentState.delete(playerId);
        this.disconnected.delete(playerId);
        const entry = this.syncData.get(playerId);
        if (entry) entry.lastConfirmedOp = 0;
    }

    private handleClientEvent(pid: PlayerId, evt: SyncedGameClientActions) {
        const synced = this.ensureSyncEntry(pid);
        console.debug(`[GameInstance] recv event from ${pid}`, evt);

        // robust optimisticId check
        const optimisticId = (evt && typeof (evt as any).optimisticId === 'number') ? (evt as any).optimisticId : undefined;
        if (typeof optimisticId === 'number' && synced.lastConfirmedOp >= optimisticId) {
            console.debug(`[GameInstance] drop stale evt from ${pid} optimisticId=${optimisticId} lastConfirmedOp=${synced.lastConfirmedOp}`);
            return;
        }

        switch (evt.type) {
            case SyncedGameClientActionTypes.PUSH: {
                const ops = evt.payload ?? [];
                synced.syncedState.playerOperationQueue = [...(synced.syncedState.playerOperationQueue ?? []), ...ops];
                console.debug(`[GameInstance] ${pid} queued ops ->`, synced.syncedState.playerOperationQueue);
            } break;
            case SyncedGameClientActionTypes.CLEAN_ALL: {
                synced.syncedState.playerOperationQueue = [];
                console.debug(`[GameInstance] ${pid} cleared ops`);
            } break;
            case SyncedGameClientActionTypes.SURRENDER: {
                this.handleSurrender(pid);
            } break;
            default:
                console.debug(`[GameInstance] unknown client action type from ${pid}`, evt);
                break;
        }

        // update lastConfirmedOp if optimisticId provided
        if (typeof optimisticId === 'number') {
            synced.lastConfirmedOp = optimisticId;
        }
    }

    /**
     * 游戏结束时，给所有玩家 connector 推一帧未 mask 的完整 SyncedGameState，
     * 让客户端结算 UI 下面显示全局视野（throne/barracks/对手领土等都可见）。
     * 观战者一直收 unmasked，无需重复推。
     */
    private pushFinalUnmaskedSnapshotToPlayers(): void {
        for (const pid of this.connectors.keys()) {
            const synced = this.ensureSyncEntry(pid);
            synced.syncedState = {
                ...synced.syncedState,
                ...structuredClone(this.state),
            };
            try {
                this.sendState(pid, /*forceSnapshot=*/ true);
            } catch (e) {
                console.warn(`[GameInstance] pushFinalUnmaskedSnapshotToPlayers error for ${pid}`, e);
            }
        }
    }

    /**
     * 投降：把发起者标为 Defeated，立刻判断游戏是否结束并广播。
     * 不要求 destroyed 状态；幂等：已不在 Playing 的玩家忽略。
     */
    private handleSurrender(pid: PlayerId) {
        if (this.destroyed) return;
        if (this.state.status === GameStatus.Ended) return;
        const player = this.state.players[pid];
        if (!player) return;
        if (player.status !== PlayerStatus.Playing) return;

        console.log(`[GameInstance] player ${pid} surrendered`);
        playerDefeatedBy(this.state, pid, null);
        autoJudge(this.state);
        this.version++;

        // 广播 masked 状态给所有人，确保对手地图立刻看到他领土被收归中立
        for (const targetPid of this.connectors.keys()) {
            const entry = this.ensureSyncEntry(targetPid);
            const masked = mask(this.state, targetPid);
            entry.syncedState = { ...entry.syncedState, ...masked };
            try { this.sendState(targetPid); } catch { /* swallow */ }
        }
        for (const sid of this.spectatorConnectors.keys()) {
            try { this.sendSpectatorState(sid); } catch { /* swallow */ }
        }

        // 如果 autoJudge 已经把游戏判结束了，立刻走结束流程
        // (cast because TS narrowed status after the early `=== Ended` check above)
        if ((this.state.status as GameStatus) === GameStatus.Ended) {
            this.pushFinalUnmaskedSnapshotToPlayers();
            const winnerTeam = Object.values(this.state.teams).find(team => team.status === PlayerStatus.Won);
            const winnerId = (winnerTeam && winnerTeam.memberIds[0]) ? winnerTeam.memberIds[0] : '';
            this.broadcastGameEnded();
            this.triggerEndGame({ winnerId, reason: 'Game ended (surrender)' });
        }
    }

    /**
     * 根据情况向客户端发送 this.syncData.get(pid)
     * 以 snapshot 或者 patch 的形式
     * forceSnapshot: 是否强制发送全量
     */
    private sendState(pid: PlayerId, forceSnapshot = false) {
        if (this.disconnected.has(pid)) {
            // client currently disconnected — skip send
            return;
        }
        const conn = this.connectors.get(pid);
        if (!conn) {
            // no connector available
            return;
        }

        // ensure we have an entry
        const entry = this.ensureSyncEntry(pid);
        const current = entry.syncedState;

        const payloadBase = {
            version: this.version,
            confirmedOp: entry.lastConfirmedOp
        };

        // if no prevSent or forced snapshot -> send snapshot
        if (!this.prevSentState.has(pid) || forceSnapshot) {
            try {
                conn.send({
                    type: SyncedGameServerEventType.STATE_UPDATE,
                    payload: {
                        type: SyncedGameServerStateUpdatePayloadType.SNAPSHOT,
                        ...payloadBase,
                        payload: current
                    }
                });
                this.prevSentState.set(pid, structuredClone(current));
            } catch (e) {
                console.warn(`[GameInstance] failed to send snapshot to ${pid}`, e);
            }
            return;
        }

        const prev = this.prevSentState.get(pid)!;
        const patches = compare(prev, current);

        // heuristics: if many patches, send snapshot
        if (patches.length > 1000) {
            try {
                conn.send({
                    type: SyncedGameServerEventType.STATE_UPDATE,
                    payload: {
                        type: SyncedGameServerStateUpdatePayloadType.SNAPSHOT,
                        ...payloadBase,
                        payload: current
                    }
                });
            } catch (e) {
                console.warn(`[GameInstance] failed to send large snapshot to ${pid}`, e);
            }
        } else {
            try {
                conn.send({
                    type: SyncedGameServerEventType.STATE_UPDATE,
                    payload: {
                        type: SyncedGameServerStateUpdatePayloadType.PATCH,
                        ...payloadBase,
                        payload: patches
                    }
                });
            } catch (e) {
                console.warn(`[GameInstance] failed to send patch to ${pid}`, e);
            }
        }

        // update prevSentState copy
        this.prevSentState.set(pid, structuredClone(current));
    }

    private broadcastGameEnded(): void {
        const msg = {
            type: SyncedGameServerEventType.CUSTOM,
            payload: {
                type: SyncedPreGameServerEventPayloadType.GAME_ENDED,
                endedAt: Date.now()
            }
        } as const;
        for (const conn of this.connectors.values()) {
            try { conn.send(msg); } catch (e) { console.warn("[GameInstance] broadcastGameEnded send error", e); }
        }
        for (const conn of this.spectatorConnectors.values()) {
            try { conn.send(msg); } catch (e) { console.warn("[GameInstance] broadcastGameEnded spectator send error", e); }
        }
    }

    // ============ 观战支持 ============

    /**
     * 构造观战者看到的 SyncedGameState：未 mask 的完整 state + playerDisplay + 空 op queue
     */
    private buildSpectatorState(): SyncedGameState {
        return {
            ...this.state,
            playerDisplay: this.settings.playerDisplay,
            playerOperationQueue: [],
        };
    }

    private sendSpectatorState(sid: PlayerId, forceSnapshot = false): void {
        if (this.spectatorDisconnected.has(sid)) return;
        const conn = this.spectatorConnectors.get(sid);
        if (!conn) return;

        const current = this.buildSpectatorState();
        const payloadBase = {
            version: this.version,
            confirmedOp: 0, // 观战者不发 action，confirmedOp 永远 0
        };

        if (!this.spectatorPrevSentState.has(sid) || forceSnapshot) {
            try {
                conn.send({
                    type: SyncedGameServerEventType.STATE_UPDATE,
                    payload: {
                        type: SyncedGameServerStateUpdatePayloadType.SNAPSHOT,
                        ...payloadBase,
                        payload: current
                    }
                });
                this.spectatorPrevSentState.set(sid, structuredClone(current));
            } catch (e) {
                console.warn(`[GameInstance] failed to send spectator snapshot to ${sid}`, e);
            }
            return;
        }

        const prev = this.spectatorPrevSentState.get(sid)!;
        const patches = compare(prev, current);
        try {
            if (patches.length > 1000) {
                conn.send({
                    type: SyncedGameServerEventType.STATE_UPDATE,
                    payload: {
                        type: SyncedGameServerStateUpdatePayloadType.SNAPSHOT,
                        ...payloadBase,
                        payload: current
                    }
                });
            } else {
                conn.send({
                    type: SyncedGameServerEventType.STATE_UPDATE,
                    payload: {
                        type: SyncedGameServerStateUpdatePayloadType.PATCH,
                        ...payloadBase,
                        payload: patches
                    }
                });
            }
        } catch (e) {
            console.warn(`[GameInstance] failed to send spectator update to ${sid}`, e);
        }
        this.spectatorPrevSentState.set(sid, structuredClone(current));
    }

    /**
     * 动态绑定/替换一个观战者的 connector。
     * spectatorId 必须不在 state.players（否则就是真玩家，应走 addPlayer）。
     * 收到的任何 client message 都会被丢弃。
     */
    public addSpectator(
        user: { id: PlayerId; name: string },
        connector: GameServerConnector
    ): { success: true } | { success: false; message: string } {
        if (this.destroyed) {
            return { success: false, message: '[GameInstance] cannot add spectator to destroyed instance' };
        }
        const sid = user.id;
        if (sid in this.state.players) {
            // 同时是玩家不应该走观战路径
            return { success: false, message: '[GameInstance] player already in game; should connect as player not spectator' };
        }

        // 替换旧的（重连 / 同 user 另一个 tab）
        const existing = this.spectatorConnectors.get(sid);
        // 先入 map 再 close 旧，让旧 sub 的 onClose source guard 短路
        this.spectatorConnectors.set(sid, connector);
        this.spectatorPrevSentState.delete(sid);
        this.spectatorDisconnected.delete(sid);
        if (existing && existing !== connector) {
            // 通知旧观战 sub 它被替换；前端会显示"被另一个标签页/设备接管"
            try {
                existing.send({
                    type: SyncedGameServerEventType.CUSTOM,
                    payload: { type: SyncedPreGameServerEventPayloadType.DISPLACED },
                });
            } catch { /* ignore */ }
            try { existing.close(); } catch { /* ignore */ }
        }

        connector.onOpen(() => {
            try {
                this.spectatorDisconnected.delete(sid);
                this.sendSpectatorState(sid, true);
            } catch (e) {
                console.warn(`[GameInstance] spectator onOpen sendState error for ${sid}`, e);
            }
        });
        connector.onDisconnect(() => {
            this.spectatorDisconnected.add(sid);
        });
        connector.onReconnect(() => {
            try {
                this.spectatorDisconnected.delete(sid);
                this.sendSpectatorState(sid, true);
            } catch (e) {
                console.warn(`[GameInstance] spectator onReconnect sendState error for ${sid}`, e);
            }
        });
        connector.onClientMessage(_evt => {
            // 观战者不允许发送 action，直接丢弃
        });
        connector.onClose(() => {
            // 防 stale onClose 误删后继 spectator connector
            if (this.spectatorConnectors.get(sid) !== connector) return;
            this.removeSpectator(sid);
        });

        // 立刻推一次（连接已经 open 时 onOpen 不会再触发）
        Promise.resolve().then(() => {
            try { this.sendSpectatorState(sid, true); } catch { /* ignore */ }
        });

        return { success: true };
    }

    /** 移除观战者（关 connector 并清理状态） */
    public removeSpectator(sid: PlayerId): void {
        const conn = this.spectatorConnectors.get(sid);
        if (conn) {
            try { conn.close(); } catch { }
        }
        this.spectatorConnectors.delete(sid);
        this.spectatorPrevSentState.delete(sid);
        this.spectatorDisconnected.delete(sid);
    }

    /** 推进游戏并触发同步 */
    public advance() {
        if (this.state.status === GameStatus.Ended) {
            return;
        }

        // build queues from syncData
        const queues: PlayerActionQueues = {};
        for (const [pid, synced] of this.syncData) {
            queues[pid] = synced.syncedState.playerOperationQueue;
        }

        const { state: newState, queue } = tick(this.state, queues);
        this.state = newState;
        this.version++;

        // for each connected player update their per-player syncedState (masked) and queued ops
        for (const pid of this.connectors.keys()) {
            const synced = this.ensureSyncEntry(pid);
            synced.syncedState.playerOperationQueue = queue[pid] ?? [];
            const masked = mask(this.state, pid);
            // merge masked fields into synced.syncedState but preserve client-specific fields
            synced.syncedState = {
                ...synced.syncedState,
                ...masked,
            };
        }

        // send state to all connectors
        for (const pid of this.connectors.keys()) {
            try {
                this.sendState(pid);
            } catch (e) {
                console.warn(`[GameInstance] sendState error for ${pid}`, e);
            }
        }

        // 同步给所有观战者（未 mask 的完整 state）
        for (const sid of this.spectatorConnectors.keys()) {
            try {
                this.sendSpectatorState(sid);
            } catch (e) {
                console.warn(`[GameInstance] sendSpectatorState error for ${sid}`, e);
            }
        }

        if (this.state.status === GameStatus.Ended) {
            this.pushFinalUnmaskedSnapshotToPlayers();
            const winnerTeam = Object.values(this.state.teams).find(team => team.status === PlayerStatus.Won);
            let winnerId: string = '';
            if (winnerTeam && Array.isArray(winnerTeam.memberIds) && winnerTeam.memberIds.length > 0) {
                winnerId = winnerTeam.memberIds[0] ?? '';
            }
            const result: GameEndResult = {
                winnerId,
                reason: 'Game ended',
            };
            this.broadcastGameEnded();
            this.triggerEndGame(result);
        }
    }

    /** 获取当前服务端全局 state */
    public getState(): GameState {
        return this.state;
    }

    /** 获取指定玩家视角 */
    public getMaskedState(pid: PlayerId): MaskedGameState {
        return mask(this.state, pid);
    }
}
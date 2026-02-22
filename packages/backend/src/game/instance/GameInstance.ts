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
        this.connectors.clear();
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

        // set connector
        this.connectors.set(playerId, connector);

        // ensure we have a sync entry for this player (in case they were not in initial playerIds)
        this.ensureSyncEntry(playerId);

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
            // remove connector but keep syncData for resume
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
     * 移除某个玩家的 connector（不删除 syncData）
     */
    public removeConnector(playerId: PlayerId) {
        this.connectors.delete(playerId);
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
        for (const conn of this.connectors.values()) {
            try {
                conn.send({
                    type: SyncedGameServerEventType.CUSTOM,
                    payload: {
                        type: SyncedPreGameServerEventPayloadType.GAME_ENDED,
                        endedAt: Date.now()
                    }
                });
            } catch (e) {
                console.warn("[GameInstance] broadcastGameEnded send error", e);
            }
        }
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

        if (this.state.status === GameStatus.Ended) {
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
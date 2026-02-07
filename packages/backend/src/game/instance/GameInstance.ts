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
            callback(result);
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
            connector.close();
        }
        this.connectors.clear();
        this.syncData.clear();
        this.prevSentState.clear();
        this.disconnected.clear();
        this.state = null as any;
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
     * 动态绑定/替换某个玩家的 connector
     */
    /** 动态添加玩家（用于 GameService） */
    public addPlayer(user: { id: PlayerId, name: string }, connector: GameServerConnector): { success: true } | { success: false, message: string } {
        const playerId = user.id;
        const res = this.canJoin(playerId);
        if (!res.success) {
            return res;
        }
        this.connectors.set(playerId, connector);
        connector.onOpen(() => this.sendState(playerId, true));
        connector.onDisconnect(() => this.disconnected.add(playerId));
        connector.onReconnect(() => {
            this.disconnected.delete(playerId);
            this.sendState(playerId, true);
        });
        connector.onClientMessage(evt => this.handleClientEvent(playerId, evt));
        connector.onClose(() => this.removeConnector(playerId));
        return { success: true };
    }

    /**
     * 移除某个玩家的 connector
     */
    public removeConnector(playerId: PlayerId) {
        this.connectors.delete(playerId);
    }

    private handleClientEvent(pid: PlayerId, evt: SyncedGameClientActions) {
        const synced = this.syncData.get(pid)!;
        console.debug(`[game instance (pid: ${pid})] recv event`, evt);
        if (synced.lastConfirmedOp >= evt.optimisticId) {
            console.debug(`[game instance (pid: ${pid})] lastConfirmedOp(${synced.lastConfirmedOp}) >= evt.optimisticId(${evt.optimisticId}), giveup`);
            return;
        }
        switch (evt.type) {
            case SyncedGameClientActionTypes.PUSH: {
                synced.syncedState.playerOperationQueue = [...synced.syncedState.playerOperationQueue, ...evt.payload];
                console.debug(`[game instance (pid: ${pid})] set playerOperationQueue to`, synced.syncedState.playerOperationQueue);
            } break;
            case SyncedGameClientActionTypes.CLEAN_ALL: {
                synced.syncedState.playerOperationQueue = [];
                console.debug(`[game instance (pid: ${pid})] clear playerOperationQueue to`, synced.syncedState.playerOperationQueue);
            } break;
        }
        synced.lastConfirmedOp = evt.optimisticId;
    }

    /**
     * 根据情况向客户端发送 this.syncData.get(pid)
     * 以 snapshot 或者 patch 的形式
     * forceSnapshot: 是否强制发送全量
     */
    private sendState(pid: PlayerId, forceSnapshot = false) {
        if (this.disconnected.has(pid)) return;
        const conn = this.connectors.get(pid);
        if (!conn) return;

        const entry = this.syncData.get(pid)!;
        const current = entry.syncedState;

        const payloadBase = {
            version: this.version,
            confirmedOp: entry.lastConfirmedOp
        };

        // 如果没有 prevSentState 或者强制 snapshot，就直接发全量
        if (!this.prevSentState.has(pid) || forceSnapshot) {
            conn.send({
                type: SyncedGameServerEventType.STATE_UPDATE,
                payload: {
                    type: SyncedGameServerStateUpdatePayloadType.SNAPSHOT,
                    ...payloadBase,
                    payload: current
                }
            });
            // 记录下来，供下次 diff
            this.prevSentState.set(pid, structuredClone(current));
            return;
        }

        const prev = this.prevSentState.get(pid)!;
        // 否则走 diff 流程
        const patches = compare(prev, current);

        // 临时的判断，以后会根据经验参数之类的方式判断是否发 snapshot
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
            console.debug(`[game instance (pid: ${pid})] send update patch: `, patches)
            conn.send({
                type: SyncedGameServerEventType.STATE_UPDATE,
                payload: {
                    type: SyncedGameServerStateUpdatePayloadType.PATCH,
                    ...payloadBase,
                    payload: patches
                }
            });
        }

        // 更新 prevSentState
        this.prevSentState.set(pid, structuredClone(current));
    }

    private broadcastGameEnded(): void {
        for (const conn of this.connectors.values()) {
            conn.send({
                type: SyncedGameServerEventType.CUSTOM,
                payload: {
                    type: SyncedPreGameServerEventPayloadType.GAME_ENDED,
                    endedAt: Date.now()
                }
            })
        }
    }

    /** 推进游戏并触发同步 */
    public advance() {
        if (this.state.status === GameStatus.Ended) {
            return;
        }
        const queues: PlayerActionQueues = {};
        for (const [pid, synced] of this.syncData) {
            queues[pid] = synced.syncedState.playerOperationQueue;
        }
        const { state: newState, queue } = tick(this.state, queues);
        this.state = newState;
        this.version++;

        // 对所有玩家发送状态
        for (const pid of this.connectors.keys()) {
            const synced = this.syncData.get(pid)!;
            synced.syncedState.playerOperationQueue = queue[pid] ?? [];
            const masked = mask(this.state, pid);
            synced.syncedState = {
                ...synced.syncedState,
                ...masked,
            };
        }

        for (const pid of this.connectors.keys()) {
            this.sendState(pid);
        }

        if (this.state.status === GameStatus.Ended) {
            // 构造 GameEndResult 对象，winnerId/原因等可根据 state 计算
            // 只查找 status === PlayerStatus.Won 的队伍
            const winnerTeam = Object.values(this.state.teams).find(team => team.status === PlayerStatus.Won);
            let winnerId: string = '';
            if (winnerTeam && Array.isArray(winnerTeam.memberIds) && winnerTeam.memberIds.length > 0) {
                winnerId = winnerTeam.memberIds[0] ?? '';
            }
            const result = {
                winnerId,
                reason: 'Game ended',
                // 可扩展更多字段
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

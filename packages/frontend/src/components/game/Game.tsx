import { type Component, createSignal, createEffect, Show, onCleanup } from "solid-js";
import { useSyncedState } from "~/hooks/useSyncedState";
import {
    type SyncedGameState,
    type SyncedGameClientActions,
    SyncedGameClientActionTypes,
    type SyncedGameServerEvent,
    type SyncedPreGameServerEventPayload,
    SyncedGameServerEventType,
    SyncedGameServerStateUpdatePayloadType,
    GamePhase,
    type PlayerOperation,
    type PlayerId,
    type GameId,
} from "@generale/types";
import { MapRender } from "../MapRender";
import { Application } from "solid-pixi";

/**
 * Props:
 * - domain, gameId, playerId, ...
 * - onPhaseChange: 当子组件从 subconnection 收到 server 自定义事件（如 GAME_ENDED/DISBANDED）
 *                  或首次连接确认后，调用这个回调以通知父层更改 phase（父层负责切换 UI）。
 * - onStateUpdate: （可选）把同步后的 SyncedGameState 发给父层（用于展示/调试）
 */
export interface GameWithSyncProps {
    domain: string;
    gameId: GameId;
    playerId: PlayerId;
    autoOpen?: boolean;
    onStateUpdate?: (payload: { event?: SyncedPreGameServerEventPayload }) => void;
}

export const GameWithSync: Component<GameWithSyncProps> = (props) => {
    const [notice, setNotice] = createSignal<string | null>(null);

    // minimal initial game state fallback (masked shape)
    const emptyState: SyncedGameState = {
        status: undefined as any,
        tick: 0,
        map: { width: 0, height: 0, tiles: [] } as any,
        players: {},
        teams: {},
        settings: {} as any,
        playerDisplay: {},
        playerOperationQueue: [],
    };

    // handler for server custom events (and notify parent)
    function handleCustomEvent(evt: SyncedPreGameServerEventPayload): void {
        try {
            // common patterns:
            //  - { type: 'GAME_ENDED', ... }
            //  - { type: 'DISBANDED', ... }
            //  - { type: 'game_ended' } etc.

            // just notify parent with ingame phase and the event
            props.onStateUpdate?.({ event: evt });
        } catch (e) {
            console.warn("GameWithSync handleCustomEvent error", e, evt);
        }
    }

    // useSyncedState for game domain
    const synced = useSyncedState<SyncedGameState, SyncedGameClientActions, SyncedPreGameServerEventPayload>({
        domain: props.domain,
        initialState: emptyState,
        initialVersion: 0,
        // just apply move event to show arrows
        applyEvent: (s, a) => {
            switch (a.type) {
                case SyncedGameClientActionTypes.PUSH: {
                    const ops = a.payload ?? [];
                    return {
                        ...s,
                        playerOperationQueue: [...(s.playerOperationQueue ?? []), ...ops],
                    };
                }
                case SyncedGameClientActionTypes.CLEAN_ALL: {
                    return {
                        ...s,
                        playerOperationQueue: [],
                    };
                }
                default:
                    return s;
            }
        },
        onCustomEvent: handleCustomEvent,
        context: { userid: props.playerId },
        autoOpen: false,
    });

    // auto connect when domain + playerId available
    createEffect(() => {
        if (props.domain && props.playerId) {
            try {
                synced.connect();
            } catch (e) {
                console.warn("GameWithSync connect error", e);
            }
        }
    });

    // MapRender -> onOperationQueued => dispatch PUSH action
    function handleOperationQueued(op: PlayerOperation) {
        try {
            const action = {
                type: SyncedGameClientActionTypes.PUSH,
                payload: [op],
            };
            synced.dispatch(action);
        } catch (e) {
            console.warn("Gamreturn synced.stateeWithSync handleOperationQueued dispatch error", e, op);
        }
    }

    // helper: clear all pending ops locally & send CLEAN_ALL
    function handleClearQueue() {
        try {
            const action = { type: SyncedGameClientActionTypes.CLEAN_ALL } as any;
            synced.dispatch(action);
        } catch (e) {
            console.warn("GameWithSync clear queue error", e);
        }
    }

    // leave game: disconnect sub; do NOT unilaterally change server phase.
    // we notify parent that client disconnected and *suggest* returning to pregame,
    // but final authority is server -> parent should rely on server push.
    function handleLeave() {
        try {
            synced.disconnect();
        } catch (e) {
            console.warn("GameWithSync leave disconnect error", e);
        }
    }

    onCleanup(() => {
        try {
            synced.disconnect();
        } catch { }
    });

    // Render: basic HUD + MapRender (MapRender uses the masked, merged state)
    const mergedState = () => {
        try {
            return synced.state();
        } catch {
            return emptyState;
        }
    };

    return (
        <div class="p-4">
            <div class="card bg-base-200 p-3 mb-3 flex items-center justify-between">
                <div>
                    <div class="text-lg font-semibold">游戏中 — {props.gameId}</div>
                    <div class="text-sm opacity-70">Tick: {mergedState()?.tick ?? 0}</div>
                </div>

                <div class="flex items-center gap-2">
                    <button class="btn btn-sm" onClick={handleClearQueue}>清空操作队列</button>
                    <button class="btn btn-sm btn-ghost" onClick={handleLeave}>离开游戏</button>
                </div>
            </div>

            <div class="card bg-base-200 p-3">
                <Application
                    background="#1099bb"
                    resizeTo={window}
                    resolution={window.devicePixelRatio}
                    autoDensity={true}
                    antialias={true}
                >

                    <MapRender state={mergedState()} onOperationQueued={handleOperationQueued} />
                 </Application>
            </div>

            <div class="card bg-base-200 p-3 mt-3">
                <div>通知：{notice()}</div>
            </div>
        </div>
    );
};

export default GameWithSync;

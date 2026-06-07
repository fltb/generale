import { type Component, createSignal, createEffect, Show, onCleanup, createMemo, onMount } from "solid-js";
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
    SyncedPreGameServerEventPayloadType,
} from "@generale/types";
import { MapRender } from "../MapRender";
import { Application } from "solid-pixi";
import PlayerList from "./PlayerList";
import { useNavigate } from "@solidjs/router";

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
    const [gameEndedInfo, setGameEndedInfo] = createSignal<SyncedPreGameServerEventPayload | null>(null);
    const navigate = useNavigate();

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

            switch (evt.type) {
                case SyncedPreGameServerEventPayloadType.GAME_ENDED:
                    console.debug("[GameWithSync] Game ended");
                    setGameEndedInfo(evt);
                    break;
                default:
                    props.onStateUpdate?.({ event: evt });
                    break;
            }

        } catch (e) {
            console.warn("GameWithSync handleCustomEvent error", e, evt);
        }
    }

    function handleBackToRoom(): void {
        const evt = gameEndedInfo();
        if (!evt) {
            return;
        }
        props.onStateUpdate?.({ event: evt });
    }

    function handleReturnToLobby(): void {
        const evt = gameEndedInfo();
        if (!evt) {
            return;
        }
        props.onStateUpdate?.({ event: evt });
        navigate('/');
    }

    // useSyncedState for game domain
    const synced = useSyncedState<SyncedGameState, SyncedGameClientActions, SyncedPreGameServerEventPayload>({
        domain: props.domain,
        initialState: emptyState,
        initialVersion: 0,
        // just apply move event to show arrows
        applyEvent: (s, a) => {
            const base = structuredClone(s);
            switch (a.type) {
                case SyncedGameClientActionTypes.PUSH: {
                    const ops = a.payload ?? [];
                    base.playerOperationQueue = [...(base.playerOperationQueue ?? []), ...ops]
                    console.debug(`[game: apply useSynced]: push`, ops, base.playerOperationQueue);
                    return base;
                }
                case SyncedGameClientActionTypes.CLEAN_ALL: {
                    base.playerOperationQueue = [];
                    console.debug(`[game: apply useSynced]: clean all`, base.playerOperationQueue);
                    return base;
                }
                default:
                    return base;
            }
        },
        onCustomEvent: handleCustomEvent,
        context: { userid: props.playerId },
        autoOpen: false,
    });


    createEffect(() => {
        const evt = gameEndedInfo();
        if (!evt) return;

        console.log("Game ended -> show result UI");

        setTimeout(() => {
            handleBackToRoom();
        }, 5000);
    });

    // auto connect when domain + playerId available
    onMount(async () => {
        try {
            await synced.connect();
            // TODO:: HACK:: 临时发送一个 CLEAN_ALL 来同步，因为不发送一个 action 会导致状态不和后端同步，原因还在排查，先 hack
            const action = { type: SyncedGameClientActionTypes.CLEAN_ALL };
            synced.dispatch(action);
        } catch (e) {
            console.warn("GameWithSync connect error", e);
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
            const action = { type: SyncedGameClientActionTypes.CLEAN_ALL };
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

    // 投降：发 SURRENDER action 给服务端，本地不做乐观更新
    // （服务端会把玩家标 Defeated 并立刻判断游戏是否结束并广播）
    function handleSurrender() {
        if (!confirm("确定投降吗？")) return;
        try {
            synced.dispatch({ type: SyncedGameClientActionTypes.SURRENDER });
        } catch (e) {
            console.warn("GameWithSync surrender dispatch error", e);
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

    const prettyState = createMemo(() =>
        JSON.stringify(mergedState().playerOperationQueue, null, 2)
    );
    return (
        <div class="p-4">
            <div class="card bg-base-200 p-3 mb-3 flex items-center justify-between">
                <div>
                    <div class="text-lg font-semibold">游戏中 — {props.gameId}</div>
                    <div class="text-sm opacity-70">Tick: {mergedState()?.tick}</div>
                </div>

                <div class="flex items-center gap-2">
                    <button class="btn btn-sm" onClick={handleClearQueue}>清空操作队列</button>
                    <button class="btn btn-sm btn-warning" onClick={handleSurrender}>投降</button>
                    <button class="btn btn-sm btn-ghost" onClick={handleLeave}>离开游戏</button>
                </div>
            </div>

            <PlayerList state={synced.state} />

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

            <Show when={gameEndedInfo()}>
                <div class="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-white">

                    <h1 class="text-4xl font-bold mb-4">
                        游戏结束
                    </h1>

                    <p class="mb-4">
                        5 秒后返回房间
                    </p>

                    <div class="flex gap-4">
                        <button class="btn btn-primary" onClick={handleBackToRoom}>
                            回到房间
                        </button>

                        <button class="btn btn-secondary" onClick={handleReturnToLobby}>
                            返回大厅
                        </button>
                    </div>
                </div>

            </Show>

            <div class="card bg-base-200 p-3">
                <div class="font-semibold mb-2">
                    SyncedGameState（实时）
                </div>
                <pre class="text-xs bg-base-300 p-2 rounded overflow-auto max-h-[400px]">
                    {prettyState()}
                </pre>
            </div>


            <div class="card bg-base-200 p-3 mt-3">
                <div>通知：{notice()}</div>
            </div>
        </div>
    );
};

export default GameWithSync;

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
    PlayerStatus,
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
    /**
     * 观战模式：connector 走的是同一个 game-* 域，但服务端会把这个连接接到
     * GameInstance.addSpectator 而非 addPlayer。客户端在这个模式下：
     * - 不发 PUSH / CLEAN_ALL / SURRENDER
     * - 隐藏操作按钮，"离开游戏" 替换成 "退出观战"（dispatch 到 pregame 域的 LEAVE_SPECTATE）
     * - MapRender 收到的 state 是未 mask 的完整地图
     *
     * 注意：LEAVE_SPECTATE 必须通过 pregame 域 dispatch。Game.tsx 自己不连 pregame，
     * 所以这里通过 onLeaveSpectate 回调把意图上报给父级（routes/room.tsx）路由处理。
     */
    spectate?: boolean;
    onStateUpdate?: (payload: { event?: SyncedPreGameServerEventPayload }) => void;
    onLeaveSpectate?: () => void;
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
            // 仅对真实玩家发送 sync HACK；观战者不应该发任何 action
            if (!props.spectate) {
                // TODO:: HACK:: 临时发送一个 CLEAN_ALL 来同步，因为不发送一个 action 会导致状态不和后端同步，原因还在排查，先 hack
                const action = { type: SyncedGameClientActionTypes.CLEAN_ALL };
                synced.dispatch(action);
            }
        } catch (e) {
            console.warn("GameWithSync connect error", e);
        }
    });

    // MapRender -> onOperationQueued => dispatch PUSH action
    // 观战者点格子也不发；服务端会丢弃，但客户端层面提前阻断更省事
    function handleOperationQueued(op: PlayerOperation) {
        if (props.spectate) return;
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

    /**
     * 结算面板用：从最终（未 mask）的 state 计算
     *  - 自己赢/输（spectator 没有自己，返回 null）
     *  - 获胜队伍名 + 队员名字
     *  - 失败队伍列表（队员名字，按队伍分组）
     */
    const endgameResult = createMemo(() => {
        if (!gameEndedInfo()) return null;
        const s = mergedState();
        const players = s?.players ?? {};
        const teams = s?.teams ?? {};
        const display = s?.playerDisplay ?? {};

        const selfPlayer = players[props.playerId];
        const selfOutcome: "won" | "lost" | null = !selfPlayer
            ? null
            : selfPlayer.status === PlayerStatus.Won
                ? "won"
                : selfPlayer.status === PlayerStatus.Defeated
                    ? "lost"
                    : null;

        const teamLabel = (memberIds: PlayerId[]) =>
            memberIds
                .map(id => display[id]?.name ?? id)
                .filter(Boolean)
                .join("、");

        const winnerTeam = Object.values(teams).find(
            t => (t as any).status === PlayerStatus.Won
        ) as { id: string; memberIds: PlayerId[] } | undefined;
        const loserTeams = Object.values(teams).filter(
            t => (t as any).status === PlayerStatus.Defeated
        ) as Array<{ id: string; memberIds: PlayerId[] }>;

        return {
            selfOutcome,
            winnerLabel: winnerTeam ? teamLabel(winnerTeam.memberIds) : null,
            loserLabels: loserTeams.map(t => teamLabel(t.memberIds)).filter(s => s.length > 0),
        };
    });
    return (
        <div class="p-4">
            <div class="card bg-base-200 p-3 mb-3 flex items-center justify-between">
                <div>
                    <div class="text-lg font-semibold">游戏中 — {props.gameId}</div>
                    <div class="text-sm opacity-70">Tick: {mergedState()?.tick}</div>
                </div>

                <div class="flex items-center gap-2">
                    <Show when={!props.spectate} fallback={
                        <>
                            <span class="badge badge-info">观战中</span>
                            <button class="btn btn-sm btn-ghost" onClick={() => props.onLeaveSpectate?.()}>退出观战</button>
                        </>
                    }>
                        <button class="btn btn-sm" onClick={handleClearQueue}>清空操作队列</button>
                        <button class="btn btn-sm btn-warning" onClick={handleSurrender}>投降</button>
                        <button class="btn btn-sm btn-ghost" onClick={handleLeave}>离开游戏</button>
                    </Show>
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

                    <MapRender
                        state={mergedState()}
                        onOperationQueued={handleOperationQueued}
                        selfId={props.spectate ? undefined : props.playerId}
                        onClearQueue={props.spectate ? undefined : handleClearQueue}
                    />
                </Application>
            </div>

            <Show when={gameEndedInfo()}>
                {/* fixed + z-50：相对视口铺满，覆盖在房间组件、chat 浮窗等之上。
                    用 absolute 会受外层无 position 的祖先 / pixi Application 容器影响导致覆盖不全。 */}
                <div class="fixed inset-0 z-50 bg-black/70 flex flex-col items-center justify-center text-white px-6">
                    <Show
                        when={endgameResult()?.selfOutcome === "won"}
                        fallback={
                            <Show
                                when={endgameResult()?.selfOutcome === "lost"}
                                fallback={<h1 class="text-4xl font-bold mb-4">游戏结束</h1>}
                            >
                                <h1 class="text-5xl font-bold mb-4 text-rose-300">你输了</h1>
                            </Show>
                        }
                    >
                        <h1 class="text-5xl font-bold mb-4 text-amber-300">你赢了</h1>
                    </Show>

                    <Show when={endgameResult()?.winnerLabel}>
                        <p class="mb-2 text-lg">
                            获胜：<span class="font-semibold">{endgameResult()!.winnerLabel}</span>
                        </p>
                    </Show>

                    <Show when={(endgameResult()?.loserLabels ?? []).length > 0}>
                        <p class="mb-4 text-sm opacity-80">
                            失败：{(endgameResult()!.loserLabels).join(" / ")}
                        </p>
                    </Show>

                    <p class="mb-4 opacity-70">
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

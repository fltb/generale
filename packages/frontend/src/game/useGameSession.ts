import {
  type GameId,
  type PlayerId,
  type PlayerOperation,
  type SyncedGameClientActions,
  SyncedGameClientActionTypes,
  type SyncedGameClientPlayerOperationPushAction,
  type SyncedGameState,
  type SyncedPreGameServerEventPayload,
  SyncedPreGameServerEventPayloadType,
} from "@generale/types";
import { createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { useSyncedState } from "~/hooks/useSyncedState";
import { confirmDialog } from "~/ui/dialogs";
import { makeEmptyGameState } from "./defaults";
import { applyGameEventLocal } from "./gameReducer";
import { computeEndgameResult } from "./selectors";
import bridge from "~/testBridge";

export interface UseGameSessionParams {
  domain: string;
  gameId: GameId;
  playerId: PlayerId;
  spectate?: boolean;
  onStateUpdate?: (payload: { event?: SyncedPreGameServerEventPayload }) => void;
  onDismissGameEnd?: () => void;
}

/** 结算后自动回房间的延迟（毫秒） */
const GAME_END_AUTO_DISMISS_MS = 5000;

/**
 * 对局（game 域）的连接 + 状态 + 动作控制器。
 * 把原先内联在 game/Game.tsx 里的同步接线、操作处理、结算推导和计时器下沉到这里。
 */
export function useGameSession(params: UseGameSessionParams) {
  const [notice] = createSignal<string | null>(null);
  const [gameEndedInfo, setGameEndedInfo] = createSignal<SyncedPreGameServerEventPayload | null>(null);
  // 同 user 另一个 sub 接管了 game 域，本端不再权威；用 overlay 挡住交互
  const [displaced, setDisplaced] = createSignal(false);

  const emptyState = makeEmptyGameState();

  function handleCustomEvent(evt: SyncedPreGameServerEventPayload): void {
    try {
      switch (evt.type) {
        case SyncedPreGameServerEventPayloadType.GAME_ENDED:
          console.debug("[GameWithSync] Game ended");
          setGameEndedInfo(evt);
          break;
        case SyncedPreGameServerEventPayloadType.DISPLACED:
          // 另一个 sub 接管 game 域。本端 dispatch 也已不会被服务端处理；
          // 用 overlay 把整个游戏 UI 盖住，明确告知用户。
          setDisplaced(true);
          break;
        default:
          params.onStateUpdate?.({ event: evt });
          break;
      }
    } catch (e) {
      console.warn("GameWithSync handleCustomEvent error", e, evt);
    }
  }

  function handleBackToRoom(): void {
    if (!gameEndedInfo()) return;
    params.onDismissGameEnd?.();
  }

  const synced = useSyncedState<SyncedGameState, SyncedGameClientActions, SyncedPreGameServerEventPayload>({
    domain: params.domain,
    initialState: emptyState,
    initialVersion: 0,
    applyEvent: applyGameEventLocal,
    onCustomEvent: handleCustomEvent,
    openPayload: {},
    autoOpen: false,
  });

  createEffect(() => {
    const evt = gameEndedInfo();
    if (!evt) return;
    console.log("Game ended -> show result UI");
    setTimeout(() => {
      handleBackToRoom();
    }, GAME_END_AUTO_DISMISS_MS);
  });

  // 同步看门狗：进场后若地图迟迟为空（连接/快照竞态，表现为"只剩蓝底没有地图，刷新就好"），
  // 自动重发 sync nudge —— 等价于用户手动刷新，把概率性卡进场救回来。地图一旦就绪就停。
  let resyncInterval: ReturnType<typeof setInterval> | null = null;
  function stopResyncWatchdog() {
    if (resyncInterval) {
      clearInterval(resyncInterval);
      resyncInterval = null;
    }
  }
  onCleanup(stopResyncWatchdog);

  onMount(async () => {
    try {
      await synced.connect();
      // 仅对真实玩家发送 sync HACK；观战者不应该发任何 action
      if (!params.spectate) {
        // TODO:: HACK:: 临时发送一个 CLEAN_ALL 来同步，因为不发送一个 action 会导致状态不和后端同步，原因还在排查，先 hack
        synced.dispatch({ type: SyncedGameClientActionTypes.CLEAN_ALL });

        // 看门狗：最多重试若干次，地图就绪即止
        let attempts = 0;
        resyncInterval = setInterval(() => {
          const ready = (mergedState()?.map?.width ?? 0) > 0;
          if (ready || attempts >= 5) {
            stopResyncWatchdog();
            return;
          }
          attempts++;
          console.warn(`[game] map still empty after connect, resync attempt ${attempts}`);
          try {
            synced.dispatch({ type: SyncedGameClientActionTypes.CLEAN_ALL });
          } catch {}
        }, 1000);
      }
    } catch (e) {
      console.warn("GameWithSync connect error", e);
    }
  });

  // 测试桥：同步游戏状态和操作函数到全局 bridge
  createEffect(() => {
    const s = mergedState();
    if (s?.map && s.map.width > 0) {
      bridge.gameState = s;
    }
  });
  createEffect(() => {
    bridge.onOperationQueued = params.spectate ? null : handleOperationQueued;
  });
  bridge.onClearQueue = params.spectate ? null : handleClearQueue;

  // MapRender -> onOperationQueued => dispatch PUSH action
  // 观战者点格子也不发；服务端会丢弃，但客户端层面提前阻断更省事
  function handleOperationQueued(op: PlayerOperation) {
    if (params.spectate) return;
    try {
      synced.dispatch({ type: SyncedGameClientActionTypes.PUSH, payload: [op] } as Omit<
        SyncedGameClientPlayerOperationPushAction,
        "optimisticId"
      >);
    } catch (e) {
      console.warn("GameWithSync handleOperationQueued dispatch error", e, op);
    }
  }

  // helper: clear all pending ops locally & send CLEAN_ALL
  function handleClearQueue() {
    try {
      synced.dispatch({ type: SyncedGameClientActionTypes.CLEAN_ALL });
    } catch (e) {
      console.warn("GameWithSync clear queue error", e);
    }
  }

  // leave game: disconnect sub; do NOT unilaterally change server phase.
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
    if (!confirmDialog("确定投降吗？")) return;
    try {
      synced.dispatch({ type: SyncedGameClientActionTypes.SURRENDER });
    } catch (e) {
      console.warn("GameWithSync surrender dispatch error", e);
    }
  }

  onCleanup(() => {
    try {
      synced.disconnect();
    } catch {}
  });

  const mergedState = () => {
    try {
      return synced.state();
    } catch {
      return emptyState;
    }
  };

  const endgameResult = createMemo(() => {
    if (!gameEndedInfo()) return null;
    return computeEndgameResult(mergedState(), params.playerId);
  });

  return {
    state: synced.state,
    mergedState,
    notice,
    gameEndedInfo,
    displaced,
    endgameResult,
    handleOperationQueued,
    handleClearQueue,
    handleSurrender,
    handleLeave,
    handleBackToRoom,
  };
}

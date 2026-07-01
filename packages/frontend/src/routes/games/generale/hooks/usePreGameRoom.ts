import {
  type GameId,
  type PlayerColor,
  type PlayerId,
  PreGamePlayerStatus,
  type PreGameRoomState,
  type SyncedPreGameClientActions,
  SyncedPreGameClientActionTypes,
  type SyncedPreGameClientChangeSettingAction,
  type SyncedPreGameClientKickPlayerAction,
  type SyncedPreGameClientTransferHostAction,
  type SyncedPreGameClientChangeMapAction,
  type SyncedPreGameClientChangeRoomTypeAction,
  type SyncedPreGameClientChangeTeamModeAction,
  type SyncedPreGameClientChangeTeamAction,
  type SyncedPreGameChangeColorAction,
  type SyncedPreGameCreateTeamAction,
  type SyncedPreGameRenameTeamAction,
  type SyncedPreGameDeleteTeamAction,
  type SyncedPreGameServerEventPayload,
  SyncedPreGameServerEventPayloadType,
  type SyncedPreGameState,
} from "@generale/types";
import { createT } from "@generale/i18n";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useSyncedState } from "~/hooks/useSyncedState";

const t = createT("en");
import { makeEmptyRoom } from "./defaults";
import { applyPregameEventLocal } from "./pregameReducer";
import { isGameInProgress } from "./selectors";

export interface UsePreGameRoomParams {
  domain: string;
  playerId: PlayerId;
  gameId: GameId;
  /** 房间是否可见（用于在可见时清掉过时 notice） */
  visible?: boolean;
  /** 房间密码（用于加入有密码的房间时传给 WS open payload） */
  password?: string;
  onStateUpdate?: (payload: { event?: SyncedPreGameServerEventPayload }) => void;
  onSelfStatusChange?: (status: PreGamePlayerStatus) => void;
  onRoomStateChange?: (room: PreGameRoomState) => void;
  onGameEndedReceived?: () => void;
  onExposeApi?: (api: { leaveSpectate: () => void } | null) => void;
}

export type PregameController = ReturnType<typeof usePreGameRoom>;

/**
 * 房间（pregame 域）的连接 + 状态 + 动作控制器。
 *
 * 把原先内联在 room/Room.tsx 里的同步接线、custom event 处理、所有 dispatch 处理器
 * 和派生 accessor 全部下沉到这里，使 Room 组件只负责渲染。
 */
export function usePreGameRoom(params: UsePreGameRoomParams) {
  const [notice, setNotice] = createSignal<string | null>(null);
  const [isKicked, setIsKicked] = createSignal(false);
  // 同一 user 的另一个标签页/设备接管了这个 pregame sub。收到 DISPLACED 之后
  // 这个 sub 不再收 server 事件，本地操作也没意义。给用户一个明确提示，盖住操作。
  const [displaced, setDisplaced] = createSignal(false);

  const initialSyncedState: SyncedPreGameState = {
    room: makeEmptyRoom(params.gameId),
    selfId: params.playerId,
  };

  // handle custom events (and notify parent)
  function handleCustomEvent(evt: SyncedPreGameServerEventPayload) {
    try {
      const evtType = evt.type;
      switch (evtType) {
        case SyncedPreGameServerEventPayloadType.KICKED:
          setNotice(evt.reason ?? t("You have been kicked from the room"));
          setIsKicked(true);
          params.onStateUpdate?.({ event: evt });
          break;
        case SyncedPreGameServerEventPayloadType.DISBANDED:
          setNotice(evt.reason ?? t("The room has been disbanded"));
          params.onStateUpdate?.({ event: evt });
          break;
        case SyncedPreGameServerEventPayloadType.GAME_STARTED:
          setNotice(t("The game has started"));
          // 当收到 GAME_STARTED 时，告知父组件 phase 已切为 INGAME（由服务器权威决定）
          params.onStateUpdate?.({ event: evt });
          break;
        case SyncedPreGameServerEventPayloadType.GAME_ENDED:
          // pregame 域的 GAME_ENDED：服务端 endGame 在 resume 之前发它。
          // 走专用 onGameEndedReceived，让路由进入"结算窗口"维持 GameWithSync 挂载。
          // 不在这里 setNotice，避免在房间页弹出 raw 通知。
          params.onGameEndedReceived?.();
          break;
        case SyncedPreGameServerEventPayloadType.START_REJECTED:
          // 显示原因（通常只由 host 收到），不需要向上传递
          setNotice(evt.reason ?? t("Start rejected — team or ready conditions not met"));
          break;
        case SyncedPreGameServerEventPayloadType.DISPLACED:
          // 同 user 的另一个 sub 已经接管 pregame 域。后续 server 事件都走那边，
          // 这边不再处理任何 state；只显示提示挡住操作。
          setDisplaced(true);
          break;
        default:
          setNotice(JSON.stringify(evt));
          params.onStateUpdate?.({ event: evt });
      }
    } catch (e) {
      console.warn("handleCustomEvent error", e, evt);
    }
  }

  const synced = useSyncedState<SyncedPreGameState, SyncedPreGameClientActions, SyncedPreGameServerEventPayload>({
    domain: params.domain,
    initialState: initialSyncedState,
    initialVersion: 0,
    applyEvent: applyPregameEventLocal,
    onCustomEvent: handleCustomEvent,
    openPayload: params.password ? { password: params.password } : {},
    onConnectionClosed: ({ code, reason }) => {
      console.warn("connection closed", code, reason);
      if (code === 4003 && reason === "Wrong password") {
        sessionStorage.removeItem("room-invite-pw");
        sessionStorage.setItem("room-wrong-pw", "1");
        window.location.reload();
      } else if (code === 4003) {
        handleCustomEvent({
          type: SyncedPreGameServerEventPayloadType.KICKED,
          reason: reason || t("Cannot join the room"),
        });
      }
    },
    autoOpen: false,
  });

  onMount(() => {
    try {
      synced.connect();
    } catch (e) {
      console.warn("RoomWithSync connect error", e);
    }
    console.debug("[Preagame room]: mounted and connected");
  });

  onCleanup(() => {
    try {
      synced.disconnect();
    } catch {}
    console.debug("[Preagame room]: cleanup and disconnected");
  });

  createEffect(() => {
    // 房间可见时清掉过时的 notice（避免切回房间页仍挂着旧提示）
    if (params.visible) {
      setNotice(null);
    }
  });

  const syncedState = () => {
    try {
      return synced.state();
    } catch {
      return initialSyncedState;
    }
  };

  const room = () => syncedState().room;
  const selfId = () => syncedState().selfId;
  const isHost = () => (room()?.hostId ?? "") === selfId();

  const getSelfPlayer = () => {
    const players = room()?.players ?? [];
    return players.find((p) => p.id === selfId());
  };
  const selfReady = () => getSelfPlayer()?.ready === 1;
  const selfStatus = () => getSelfPlayer()?.status ?? PreGamePlayerStatus.Lobby;

  // 把 self.status 上报给父级路由组件，让它据此决定显示 Room 还是 Game
  createEffect(() => {
    params.onSelfStatusChange?.(selfStatus());
  });

  createEffect(() => {
    params.onRoomStateChange?.(room());
  });

  // ---------------- dispatch 处理器 ----------------

  const onSettingChange = (nextSetting: Partial<PreGameRoomState["gameSetting"]>) => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.CHANGE_SETTING, payload: nextSetting } as Omit<
      SyncedPreGameClientChangeSettingAction,
      "optimisticId"
    >);
  };

  const onToggleReadyForSelf = (ready: boolean) => {
    const actionType = ready ? SyncedPreGameClientActionTypes.READY : SyncedPreGameClientActionTypes.UNREADY;
    synced.dispatch({ type: actionType });
  };

  const onToggleReadyForPlayer = (playerId: string, ready: boolean) => {
    if (playerId === synced.state().selfId) {
      onToggleReadyForSelf(ready);
    } else {
      console.warn("Attempted to toggle ready for other player (ignored):", playerId);
    }
  };

  const onKick = (playerId: string) => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.KICK_PLAYER, payload: { playerId } } as Omit<
      SyncedPreGameClientKickPlayerAction,
      "optimisticId"
    >);
  };

  const onTransferHost = (playerId: string) => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.TRANSFER_HOST, payload: { newHostId: playerId } } as Omit<
      SyncedPreGameClientTransferHostAction,
      "optimisticId"
    >);
  };

  const onStartGame = () => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.START_GAME });
  };

  const onLeave = () => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.LEAVE_ROOM });
    synced.disconnect();
  };

  const onDisband = () => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.DISBAND_ROOM });
  };

  const onMapChange = (nextMapSetting: PreGameRoomState["mapSetting"]) => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.CHANGE_MAP, payload: nextMapSetting } as Omit<
      SyncedPreGameClientChangeMapAction,
      "optimisticId"
    >);
  };

  const onRoomTypeChange = (nextRoomType: "standard" | "custom") => {
    synced.dispatch({
      type: SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE,
      payload: { roomType: nextRoomType },
    } as Omit<SyncedPreGameClientChangeRoomTypeAction, "optimisticId">);
  };

  const onTeamModeChange = (nextTeamMode: "ffa" | "team") => {
    synced.dispatch({
      type: SyncedPreGameClientActionTypes.CHANGE_TEAM_MODE,
      payload: { teamMode: nextTeamMode },
    } as Omit<SyncedPreGameClientChangeTeamModeAction, "optimisticId">);
  };

  // 进入观战 / 退出观战。actionAllowed 在服务端做严格判断；前端只在 UI 层做按钮可见性控制。
  const onEnterSpectate = () => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.ENTER_SPECTATE });
  };
  const onLeaveSpectate = () => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.LEAVE_SPECTATE });
  };

  // 把 leaveSpectate 暴露给父级（GameWithSync 在观战模式下需要它）。
  // onMount 注册、onCleanup 注销，避免 stale 引用。
  onMount(() => {
    params.onExposeApi?.({ leaveSpectate: onLeaveSpectate });
  });
  onCleanup(() => {
    params.onExposeApi?.(null);
  });

  // ---------------- color handler ----------------

  const onChangeColor = (tileColor: PlayerColor) => {
    synced.dispatch({
      type: SyncedPreGameClientActionTypes.CHANGE_COLOR,
      payload: { tileColor },
    } as Omit<SyncedPreGameChangeColorAction, "optimisticId">);
  };

  // ---------------- team related handlers ----------------

  // join/move to team (playerId optional - if undefined, server should interpret as self)
  const onChangeTeam = (playerId: string | undefined, teamId: string) => {
    const payload: { teamId: string; playerId?: string } = { teamId };
    if (playerId) payload.playerId = playerId;
    synced.dispatch({ type: SyncedPreGameClientActionTypes.CHANGE_TEAM, payload } as Omit<
      SyncedPreGameClientChangeTeamAction,
      "optimisticId"
    >);
  };

  // create team (only host UI will call) -> server will create real id. optimistic displayed locally.
  const onCreateTeam = (name?: string) => {
    synced.dispatch({
      type: SyncedPreGameClientActionTypes.CREATE_TEAM,
      payload: { name: name ?? undefined },
    } as Omit<SyncedPreGameCreateTeamAction, "optimisticId">);
  };

  const onRenameTeam = (teamId: string, name: string) => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.RENAME_TEAM, payload: { teamId, name } } as Omit<
      SyncedPreGameRenameTeamAction,
      "optimisticId"
    >);
  };

  const onDeleteTeam = (teamId: string) => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.DELETE_TEAM, payload: { teamId } } as Omit<
      SyncedPreGameDeleteTeamAction,
      "optimisticId"
    >);
  };

  // ---------------- 派生 UI 状态 ----------------

  // 房间是否处于"游戏进行中"状态（房间里有人正在游戏）。
  const gameInProgress = () => isGameInProgress(room()?.players);
  const isLobby = () => selfStatus() === PreGamePlayerStatus.Lobby;
  const isSpectating = () => selfStatus() === PreGamePlayerStatus.Spectating;

  return {
    // state accessors
    notice,
    isKicked,
    displaced,
    room,
    selfId,
    isHost,
    selfReady,
    selfStatus,
    gameInProgress,
    isLobby,
    isSpectating,
    // actions
    onSettingChange,
    onToggleReadyForSelf,
    onToggleReadyForPlayer,
    onKick,
    onTransferHost,
    onStartGame,
    onLeave,
    onDisband,
    onMapChange,
    onRoomTypeChange,
    onTeamModeChange,
    onEnterSpectate,
    onLeaveSpectate,
    onChangeTeam,
    onCreateTeam,
    onRenameTeam,
    onDeleteTeam,
    onChangeColor,
  };
}

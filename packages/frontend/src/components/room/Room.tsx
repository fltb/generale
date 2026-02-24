import { type Component, createSignal, createEffect, Show, onCleanup, onMount } from "solid-js";
import {
  type SyncedPreGameState,
  type SyncedPreGameServerEventPayload,
  type SyncedPreGameClientActions,
  SyncedPreGameClientActionTypes,
  type PreGameRoomState,
  PreGameMapType,
  SyncedPreGameServerEventPayloadType,
  type GameId,
  type PlayerId,
  GamePhase,
  type TeamId,
} from "@generale/types";
import { PreGameRoomStateFrom } from "./StateForm";
import { PlayerList } from "./PlayerList";
import { PreGameControls } from "./PreGameControls";
import { PreGameMapSettingForm } from "./PreGameMapSettingForm";
import { useSyncedState } from "~/hooks/useSyncedState";

export interface RoomWithSyncProps {
  domain: string;
  playerId: PlayerId;
  gameId: GameId;
  playerName: string;
  autoOpen?: boolean;
  /**
   * visible: 控制 UI 显示（true 显示；false 隐藏但保持挂载）
   * 这样可以避免组件被销毁，从而避免 websocket 重连 / pregame instance 被误销毁的问题。
   */
  suspended?: boolean;
  /**
   * 父级回调：RoomWithSync 会在本地 state 更新 / server custom event 等场景调用此回调
   * 参数示例:
   * { phase: GamePhase.PREGAME, state: SyncedPreGameState }
   * { phase: GamePhase.INGAME, event: { type: 'GAME_STARTED', payload: {...} } }
   */
  onStateUpdate?: (payload: {
    event?: SyncedPreGameServerEventPayload;
  }) => void;
}

/** 提供一个 minimal empty PreGameRoomState，供初始 state 使用 */
const makeEmptyRoom = (gameId = ""): PreGameRoomState => ({
  gameId,
  hostId: "",
  players: [],
  mapSetting: { type: PreGameMapType.Random, width: 20, height: 20, tileFrequency: {} },
  gameSetting: {
    speed: 1,
    tileGrow: {
      PLAIN: { duration: 40, growth: 1 },
      THRONE: { duration: 1, growth: 1 },
      BARRACKS: { duration: 1, growth: 1 },
      MOUNTAIN: { duration: 1e10, growth: 0 },
      SWAMP: { duration: 1, growth: -1 },
      FOG: { duration: 1e10, growth: 0 },
    },
    afkThreshold: 30,
  },
  teams: [
    { id: "team1", name: "Team 1" },
    { id: "team2", name: "Team 2" }
  ],
  teamCount: 2,
  playerLimit: 8,
  started: false,
});

/**
 * 本地乐观 applyEvent（给 useVersionedOptimisticState 用）
 * 支持：ready/unready/change-setting/change-map/change-team 
 *      /create-team / rename-team / delete-team 的本地显示
 */
function applyPregameEventLocal(state: SyncedPreGameState | null, action: SyncedPreGameClientActions | any): SyncedPreGameState {
  const base: SyncedPreGameState = structuredClone(state ?? { room: makeEmptyRoom(""), selfId: "" });
  const type = action.type;

  try {
    switch (type) {
      case SyncedPreGameClientActionTypes.READY: {
        const pid = base.selfId;
        if (base?.room?.players) {
          const p = base.room.players.find((x: any) => x.id === pid);
          if (p && !p.isHost) p.ready = 1;
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.UNREADY: {
        const pid = base.selfId;
        if (base?.room?.players) {
          const p = base.room.players.find((x: any) => x.id === pid);
          if (p && !p.isHost) p.ready = 0;
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.CHANGE_SETTING: {
        if (base?.room?.gameSetting && action.payload && typeof action.payload === "object") {
          base.room.gameSetting = { ...base.room.gameSetting, ...action.payload };
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.CHANGE_MAP: {
        base.room.mapSetting = action.payload;
        return base;
      }
      // ---------------- 新增本地乐观：创建 / 重命名 / 删除 队伍 ----------------
      case SyncedPreGameClientActionTypes.CHANGE_TEAM: {
        // payload: { name?: string }
        return base;
      }
      case SyncedPreGameClientActionTypes.RENAME_TEAM: {
        // payload: { teamId, name }
        const { teamId, name } = action.payload ?? {};
        if (teamId && base.room.teams) {
          const t = base.room.teams.find(tt => tt.id === teamId);
          if (t && typeof name === 'string') t.name = name.slice(0, 60);
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.DELETE_TEAM: {
        // payload: { teamId }
        const { teamId } = action.payload ?? {};
        if (teamId && base.room.teams) {
          // Only remove if no members here (local check). Server will authoritative decide.
          const memberCount = base.room.players.filter(p => p.teamId === teamId).length;
          if (memberCount === 0) {
            base.room.teams = base.room.teams.filter(t => t.id !== teamId);
            base.room.teamCount = base.room.teams.length;
          }
        }
        return base;
      }
      // --------------------------------------------------------------------
      default:
        return base;
    }
  } catch (err) {
    console.error("[applyPregameEventLocal] error", err, action);
    return state ?? base;
  }
}

/**
 * Room component using useSyncedState internally
 */
export const RoomWithSync: Component<RoomWithSyncProps> = (props) => {
  const [notice, setNotice] = createSignal<string | null>(null);
  const [isKicked, setIsKicked] = createSignal(false);

  const initialSyncedState: SyncedPreGameState = {
    room: makeEmptyRoom(props.gameId),
    selfId: props.playerId,
  };

  // handle custom events (and notify parent)
  function handleCustomEvent(evt: SyncedPreGameServerEventPayload) {
    try {
      const t = evt.type;
      switch (t) {
        case SyncedPreGameServerEventPayloadType.KICKED:
          setNotice(evt.reason ?? "你已被踢出房间");
          setIsKicked(true);
          // notify parent
          props.onStateUpdate?.({ event: evt });
          break;
        case SyncedPreGameServerEventPayloadType.DISBANDED:
          setNotice(evt.reason ?? "房间已被解散");
          props.onStateUpdate?.({ event: evt });
          break;
        case SyncedPreGameServerEventPayloadType.GAME_STARTED:
          setNotice("游戏已开始");
          // 当收到 GAME_STARTED 时，告知父组件 phase 已切为 INGAME（由服务器权威决定）
          props.onStateUpdate?.({ event: evt });
          break;
        case SyncedPreGameServerEventPayloadType.START_REJECTED:
          // 显示原因（通常只由 host 收到），不需要向上传递
          setNotice(evt.reason ?? "开始被拒绝，队伍或准备条件不满足");
          break;
        default:
          setNotice(JSON.stringify(evt));
          props.onStateUpdate?.({ event: evt });
      }
    } catch (e) {
      console.warn("handleCustomEvent error", e, evt);
    }
  }

  // useSyncedState hook
  const synced = useSyncedState<SyncedPreGameState, SyncedPreGameClientActions, SyncedPreGameServerEventPayload>({
    domain: props.domain,
    initialState: initialSyncedState,
    initialVersion: 0,
    applyEvent: applyPregameEventLocal,
    onCustomEvent: handleCustomEvent,
    context: { userid: props.playerId, username: props.playerName },
    onConnectionClosed: ({ code, reason }) => {
      console.warn("connection closed", code, reason);
      if (code === 4003) {
        handleCustomEvent({
          type: SyncedPreGameServerEventPayloadType.KICKED,
          reason: reason || "无法加入房间",
        });
      }
    },
    autoOpen: false,
  });

  // auto connect when domain + playerId available
  onMount(() => {
    try {
      synced.connect();
    } catch (e) {
      console.warn("RoomWithSync connect error", e);
    }
    console.debug("[Preagame room]: mounted and connected")
  });

  onCleanup(() => {
    try {
      synced.disconnect();
    } catch { }
    console.debug("[Preagame room]: cleanup and disconnected")
  });

  createEffect(() =>{
    if (props.suspended)  {
      setNotice(null);
    }
  })

  const getSelfPlayer = () => {
    const players = room()?.players ?? [];
    return players.find(p => p.id === selfId());
  };
  const selfReady = () => (getSelfPlayer()?.ready === 1);

  const onSettingChange = (nextSetting: Partial<PreGameRoomState["gameSetting"]>) => {
    const action = { type: SyncedPreGameClientActionTypes.CHANGE_SETTING, payload: nextSetting };
    synced.dispatch(action);
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
    const action = { type: SyncedPreGameClientActionTypes.KICK_PLAYER, payload: { playerId } }
    synced.dispatch(action);
  };

  const onTransferHost = (playerId: string) => {
    const action = { type: SyncedPreGameClientActionTypes.TRANSFER_HOST, payload: { newHostId: playerId } }
    synced.dispatch(action);
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
    synced.dispatch({ type: SyncedPreGameClientActionTypes.CHANGE_MAP, payload: nextMapSetting } as any);
  };

  // ---------------- team related handlers ----------------

  // join/move to team (playerId optional - if undefined, server should interpret as self)
  const onChangeTeam = (playerId: string | undefined, teamId: string) => {
    const payload: any = { teamId };
    if (playerId) payload.playerId = playerId;
    const action = {
      type: SyncedPreGameClientActionTypes.CHANGE_TEAM,
      payload,
    };
    synced.dispatch(action);
  };

  // create team (only host UI will call) -> server will create real id. optimistic displayed locally.
  const onCreateTeam = (name?: string) => {
    const action = {
      type: SyncedPreGameClientActionTypes.CREATE_TEAM,
      payload: { name: name ?? undefined }
    };
    synced.dispatch(action);
  };

  // rename team
  const onRenameTeam = (teamId: string, name: string) => {
    const action = { type: SyncedPreGameClientActionTypes.RENAME_TEAM, payload: { teamId, name } };
    synced.dispatch(action);
  };

  // delete team (local check done in UI; server is authoritative)
  const onDeleteTeam = (teamId: string) => {
    const action = { type: SyncedPreGameClientActionTypes.DELETE_TEAM, payload: { teamId } };
    synced.dispatch(action);
  };

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

  // Render: control visibility via root wrapper style so component never unmounts
  const wrapperStyle: Record<string, string> = {
    display: props.suspended === false ? "none" : "block",
  };

  onCleanup(() => {
    try {
      console.debug("[pregame room]: on cleanup disconnected")
      synced.disconnect();
    } catch { }
  });

  return (
    <div style={wrapperStyle} class="p-6" aria-hidden={props.suspended === false}>
      <div class="card bg-base-200 p-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-lg font-semibold">房间信息</div>
            <div class="text-sm opacity-70">Game ID: {room()?.gameId}</div>
          </div>
          <div>
            <div class="opacity-70 text-sm">
              玩家上限 {room()?.playerLimit} · 队伍数 {room()?.teamCount}
            </div>
          </div>
        </div>
      </div>

      <div class="card bg-base-200 p-4">
        <div class="text-md font-medium mb-2">玩家列表</div>
        <PlayerList
          players={room()?.players ?? []}
          selfId={selfId()}
          hostId={room()?.hostId ?? ""}
          teamCount={room()?.teamCount ?? 2}
          teams={room()?.teams ?? []}
          onToggleReady={(playerId, ready) => onToggleReadyForPlayer(playerId, ready)}
          onKick={isHost() ? onKick : undefined}
          onTransferHost={isHost() ? onTransferHost : undefined}
          onChangeTeam={(playerId, teamId) => {
            // playerId here is target player id (for joining, pass undefined to mean self)
            // We map PlayerList's join-click behaviour:
            if (!playerId || playerId === selfId()) {
              // normal "join team" by clicking header -> move self
              onChangeTeam(undefined, teamId);
            } else {
              // host moving other player
              onChangeTeam(playerId, teamId);
            }
          }}
          onCreateTeam={isHost() ? onCreateTeam : undefined}
          onRenameTeam={isHost() ? onRenameTeam : undefined}
          onDeleteTeam={isHost() ? onDeleteTeam : undefined}
        />
      </div>

      <div class="card bg-base-200 p-4">
        <div class="text-lg font-semibold mb-2">房间设置</div>
        <PreGameRoomStateFrom
          state={room()?.gameSetting ?? (makeEmptyRoom().gameSetting)}
          map={room()?.mapSetting ?? (makeEmptyRoom().mapSetting)}
          onChange={(s) => onSettingChange(s)}
        />
      </div>

      <div class="card bg-base-200 p-4">
        <div class="text-md font-medium mb-2">地图设置</div>
        <PreGameMapSettingForm
          setting={room()?.mapSetting ?? (makeEmptyRoom().mapSetting)}
          onChange={(next) => onMapChange(next)}
        />
      </div>


      <div class="card bg-base-200 p-4">
        <div class="text-md font-medium mb-2">操作</div>
        <PreGameControls
          isHost={isHost()}
          started={room()?.started ?? false}
          ready={selfReady()}
          onReadyToggle={(ready: boolean) => onToggleReadyForSelf(ready)}
          onStartGame={isHost() ? onStartGame : undefined}
          onLeave={onLeave}
          onDisband={isHost() ? onDisband : undefined}
        />
      </div>

      <div class="alert alert-info shadow-lg">
        <div>
          Notice:
          <span>{notice()}</span>
        </div>
      </div>
    </div>
  );
};

export default RoomWithSync;

// src/components/RoomWithSync.tsx
import { type Component, createSignal, createEffect, Show } from "solid-js";
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
  autoOpen?: boolean; // 是否自动 open domain（默认 true）
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
  teamCount: 2,
  playerLimit: 8,
  started: false,
});

/**
 * 本地乐观 applyEvent（给 useVersionedOptimisticState 用）
 * 只做常见修改：ready/unready/change-setting/change-map/change-team 等
 */
function applyPregameEventLocal(state: SyncedPreGameState | null, action: SyncedPreGameClientActions): SyncedPreGameState {
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
      case SyncedPreGameClientActionTypes.CHANGE_TEAM: {
        if (action.payload?.teamId && base?.room?.players) {
          const p = base.room.players.find((x: any) => x.id === base.selfId);
          if (p) p.teamId = action.payload.teamId;
        }
        return base;
      }
      // 其他类型不在本地乐观更改
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

  // initial synced state: a minimal SyncedPreGameState with empty room
  const initialSyncedState: SyncedPreGameState = {
    room: makeEmptyRoom(props.gameId),
    selfId: props.playerId,
  };

  // onCustomEvent handler (server CUSTOM events)
  function handleCustomEvent(evt: SyncedPreGameServerEventPayload) {
    try {
      const t = evt.type;
      switch (t) {
        case SyncedPreGameServerEventPayloadType.KICKED:
          setNotice(evt.reason ?? "你已被踢出房间");
          setIsKicked(true);
          break;
        case SyncedPreGameServerEventPayloadType.DISBANDED:
          setNotice(evt.reason ?? "房间已被解散");
          break;
        case SyncedPreGameServerEventPayloadType.GAME_STARTED:
          setNotice("游戏已开始");
          break;
        default:
          // fallback: show generic custom payload
          setNotice(JSON.stringify(evt));
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
    autoOpen: false, // we'll call connect() below
  });

  // auto connect when domain + playerId available
  createEffect(() => {
    if (props.domain && props.playerId) {
      try {
        synced.connect();
      } catch (e) {
        console.warn("RoomWithSync connect error", e);
      }
    }
  });

  // UI callbacks adapted from original Room implementation
  const onSettingChange = (nextSetting: Partial<PreGameRoomState["gameSetting"]>) => {
    const action = { type: SyncedPreGameClientActionTypes.CHANGE_SETTING, payload: nextSetting };
    synced.dispatch(action);
  };

  // ready toggles for self
  const onToggleReadyForSelf = (ready: boolean) => {
    const actionType = ready ? SyncedPreGameClientActionTypes.READY : SyncedPreGameClientActionTypes.UNREADY;
    synced.dispatch({ type: actionType });
  };

  // called by PlayerList when a player's ready button is clicked.
  // In our UI only the self player's ready button is shown, so only handle self here.
  const onToggleReadyForPlayer = (playerId: string, ready: boolean) => {
    if (playerId === synced.state().selfId) {
      onToggleReadyForSelf(ready);
    } else {
      // not allowed in-client to change other players' ready state;
      // optionally we could send a server request if protocol supports it.
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
    // optionally close sub
    synced.disconnect();
  };

  const onDisband = () => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.DISBAND_ROOM });
  };

  // map change -> dispatch CHANGE_MAP
  const onMapChange = (nextMapSetting: PreGameRoomState["mapSetting"]) => {
    synced.dispatch({ type: SyncedPreGameClientActionTypes.CHANGE_MAP, payload: nextMapSetting } as any);
  };

  // derived values
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

  return (
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
      <div class="md:col-span-1 space-y-4">
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
            onToggleReady={(playerId, ready) => onToggleReadyForPlayer(playerId, ready)}
            onKick={isHost() ? onKick : undefined}
            onTransferHost={isHost() ? onTransferHost : undefined}
          />
        </div>

        <div class="card bg-base-200 p-4">
          <div class="text-md font-medium mb-2">操作</div>
          <PreGameControls
            isHost={isHost()}
            started={room()?.started ?? false}
            onReadyToggle={(ready: boolean) => onToggleReadyForSelf(ready)}
            onStartGame={isHost() ? onStartGame : undefined}
            onLeave={onLeave}
            onDisband={isHost() ? onDisband : undefined}
          />
        </div>
      </div>

      <div class="md:col-span-2 space-y-4">
        <div class="card bg-base-200 p-4">
          <div class="text-lg font-semibold mb-2">房间设置</div>
          <PreGameRoomStateFrom
            state={room()?.gameSetting ?? (makeEmptyRoom().gameSetting)}
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

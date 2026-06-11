import { type Component, createSignal, createEffect, Show, onCleanup, onMount } from "solid-js";
import {
  type SyncedPreGameState,
  type SyncedPreGameServerEventPayload,
  type SyncedPreGameClientActions,
  SyncedPreGameClientActionTypes,
  type PreGameRoomState,
  PreGameMapType,
  PreGamePlayerStatus,
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
   * visible: 控制 UI 显示（true 或缺省 显示；false 隐藏但保持挂载）。
   * 隐藏而非 unmount 是为了避免 websocket 重连 / pregame instance 被误销毁。
   */
  visible?: boolean;
  /**
   * 父级回调：RoomWithSync 会在本地 state 更新 / server custom event 等场景调用此回调。
   * 注意 GAME_ENDED 不再走这里，而是通过专用 onGameEndedReceived。
   */
  onStateUpdate?: (payload: {
    event?: SyncedPreGameServerEventPayload;
  }) => void;
  /**
   * 当 self.status 变化时上报给父级——父级用这个决定显示房间还是游戏。
   * 缺省视为 Lobby（与服务端 enum 默认一致）。
   */
  onSelfStatusChange?: (status: PreGamePlayerStatus) => void;
  /**
   * 服务端 pregame 域的 GAME_ENDED 到达时调用。父级据此进入"结算窗口"维持
   * GameWithSync 挂载。和"用户 dismiss 结算 UI"是两条独立信号。
   */
  onGameEndedReceived?: () => void;
  /**
   * 暴露房间内部的几个 dispatcher 给父级，便于 GameWithSync（观战）等其它子组件
   * 触发 pregame 域的 action。只在挂载/卸载时调用一次。
   */
  onExposeApi?: (api: { leaveSpectate: () => void } | null) => void;
}

/** 提供一个 minimal empty PreGameRoomState，供初始 state 使用 */
const makeEmptyRoom = (gameId = ""): PreGameRoomState => ({
  gameId,
  roomType: "standard",
  teamMode: "ffa",
  hostId: "",
  players: [],
  mapSetting: { type: PreGameMapType.Random, width: 20, height: 20, tileFrequency: {}, sizeLabel: "medium" },
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
  teams: [],
  teamCount: 0,
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
      case SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE: {
        // 与服务端 changeRoomType 镜像：切换 roomType 并联动重置 mapSetting
        const next = action.payload?.roomType;
        if (next !== "standard" && next !== "custom") return base;
        if (base.room.roomType === next) return base;
        if (next === "standard") {
          base.room.mapSetting = {
            type: PreGameMapType.Random,
            width: 20,
            height: 20,
            tileFrequency: {},
            sizeLabel: "medium",
          } as any;
        } else {
          const ms: any = base.room.mapSetting;
          const w = typeof ms?.width === "number" ? ms.width : 20;
          const h = typeof ms?.height === "number" ? ms.height : 20;
          base.room.mapSetting = {
            type: PreGameMapType.Custom,
            width: w,
            height: h,
            tileFrequency: {},
            customData: "",
          } as any;
        }
        base.room.roomType = next;
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
  // 同一 user 的另一个标签页/设备接管了这个 pregame sub。收到 DISPLACED 之后
  // 这个 sub 不再收 server 事件，本地操作也没意义。给用户一个明确提示，盖住操作。
  const [displaced, setDisplaced] = createSignal(false);

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
        case SyncedPreGameServerEventPayloadType.GAME_ENDED:
          // pregame 域的 GAME_ENDED：服务端 endGame 在 resume 之前发它。
          // 走专用 onGameEndedReceived，让路由进入"结算窗口"维持 GameWithSync 挂载。
          // 不在这里 setNotice，避免在房间页弹出 raw 通知。
          props.onGameEndedReceived?.();
          break;
        case SyncedPreGameServerEventPayloadType.START_REJECTED:
          // 显示原因（通常只由 host 收到），不需要向上传递
          setNotice(evt.reason ?? "开始被拒绝，队伍或准备条件不满足");
          break;
        case SyncedPreGameServerEventPayloadType.DISPLACED:
          // 同 user 的另一个 sub 已经接管 pregame 域。后续 server 事件都走那边，
          // 这边不再处理任何 state；只显示提示挡住操作。
          setDisplaced(true);
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
    // 房间可见时清掉过时的 notice（避免切回房间页仍挂着旧提示）
    if (props.visible) {
      setNotice(null);
    }
  })

  const getSelfPlayer = () => {
    const players = room()?.players ?? [];
    return players.find(p => p.id === selfId());
  };
  const selfReady = () => (getSelfPlayer()?.ready === 1);
  const selfStatus = () => getSelfPlayer()?.status ?? PreGamePlayerStatus.Lobby;

  // 把 self.status 上报给父级路由组件，让它据此决定显示 Room 还是 Game
  createEffect(() => {
    props.onSelfStatusChange?.(selfStatus());
  });

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

  const onRoomTypeChange = (nextRoomType: "standard" | "custom") => {
    synced.dispatch({
      type: SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE,
      payload: { roomType: nextRoomType },
    } as any);
  };

  const onTeamModeChange = (nextTeamMode: "ffa" | "team") => {
    synced.dispatch({
      type: SyncedPreGameClientActionTypes.CHANGE_TEAM_MODE,
      payload: { teamMode: nextTeamMode },
    } as any);
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
    props.onExposeApi?.({ leaveSpectate: onLeaveSpectate });
  });
  onCleanup(() => {
    props.onExposeApi?.(null);
  });

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

  // Render: control visibility via root wrapper style so component never unmounts.
  // 用 accessor 包裹保持响应性：直接 const wrapperStyle = {...} 会在组件初始化时
  // 把 props.visible 锁死，phase 切换时 display 不会更新。
  // visible 缺省视为 true（向后兼容：不传也算可见）。
  const wrapperStyle = (): Record<string, string> => ({
    display: props.visible === false ? "none" : "block",
  });

  onCleanup(() => {
    try {
      console.debug("[pregame room]: on cleanup disconnected")
      synced.disconnect();
    } catch { }
  });

  // 房间是否处于"游戏进行中"状态（房间里有人正在游戏）。
  // 用于决定是否显示横幅 + 观战入口
  const gameInProgress = () =>
    (room()?.players ?? []).some(p => p.status === PreGamePlayerStatus.Playing);

  // 仅当自己是 Lobby（在大厅围观）时才显示"进入观战"按钮；
  // Spectating 状态下显示"退出观战"按钮（注意：Spectating 玩家在路由层
  // 实际渲染的是 GameWithSync 而不是 Room，但 wrapper 仍挂载着 Room；
  // 这里保留入口便于将来场景，如父级也允许在房间页同时显示时退出）
  const isLobby = () => selfStatus() === PreGamePlayerStatus.Lobby;
  const isSpectating = () => selfStatus() === PreGamePlayerStatus.Spectating;

  return (
    <div style={wrapperStyle()} class="p-6" aria-hidden={props.visible === false}>
      {/* 被同 user 另一个 sub 接管：盖一层模态挡住操作 */}
      <Show when={displaced()}>
        <div class="fixed inset-0 z-50 bg-black/60 flex flex-col items-center justify-center text-white px-6">
          <h2 class="text-3xl font-bold mb-3">该页面已被接管</h2>
          <p class="opacity-80 mb-4 text-center max-w-md">
            你的账号在另一个标签页或设备上打开了这个房间，所有操作都将在那一边进行。
          </p>
          <p class="text-sm opacity-60">关掉这个页面或刷新可重新接管</p>
        </div>
      </Show>

      <Show when={gameInProgress()}>
        <div class="alert alert-info shadow-sm mb-3">
          <div class="flex items-center justify-between w-full gap-3">
            <div>
              <div class="font-medium">游戏进行中</div>
              <div class="text-sm opacity-70">
                <Show when={isLobby()} fallback={"你正在观战中。"}>
                  你可以在大厅等待本局结束，或进入观战。
                </Show>
              </div>
            </div>
            <Show when={isLobby()}>
              <button class="btn btn-sm btn-primary" onClick={onEnterSpectate}>
                进入观战
              </button>
            </Show>
            <Show when={isSpectating()}>
              <button class="btn btn-sm btn-ghost" onClick={onLeaveSpectate}>
                退出观战
              </button>
            </Show>
          </div>
        </div>
      </Show>

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
          teamMode={room()?.teamMode ?? "ffa"}
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
        <div class="text-md font-medium mb-2">房间模式</div>
        <div class="flex items-center gap-3 mb-3">
          <div class="btn-group">
            <button
              class={`btn btn-sm ${(room()?.roomType ?? "standard") === "standard" ? "btn-active" : ""}`}
              disabled={!isHost()}
              onClick={() => onRoomTypeChange("standard")}
            >Standard</button>
            <button
              class={`btn btn-sm ${(room()?.roomType ?? "standard") === "custom" ? "btn-active" : ""}`}
              disabled={!isHost()}
              onClick={() => onRoomTypeChange("custom")}
            >Custom</button>
          </div>
          <span class="text-xs opacity-60">
            {(room()?.roomType ?? "standard") === "standard"
              ? "仅可选 small / medium / large 预设"
              : "可自定义地图尺寸、地形频率等"}
          </span>
        </div>

        <div class="flex items-center gap-3">
          <div class="btn-group">
            <button
              class={`btn btn-sm ${(room()?.teamMode ?? "ffa") === "ffa" ? "btn-active" : ""}`}
              disabled={!isHost()}
              onClick={() => onTeamModeChange("ffa")}
            >单人</button>
            <button
              class={`btn btn-sm ${(room()?.teamMode ?? "ffa") === "team" ? "btn-active" : ""}`}
              disabled={!isHost()}
              onClick={() => onTeamModeChange("team")}
            >组队</button>
          </div>
          <span class="text-xs opacity-60">
            {(room()?.teamMode ?? "ffa") === "ffa"
              ? "每人一队，前端隐藏队伍信息"
              : "可自由组队、换队、重命名"}
          </span>
        </div>
      </div>

      <div class="card bg-base-200 p-4">
        <div class="text-md font-medium mb-2">地图设置</div>
        <PreGameMapSettingForm
          setting={room()?.mapSetting ?? (makeEmptyRoom().mapSetting)}
          roomType={room()?.roomType ?? "standard"}
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

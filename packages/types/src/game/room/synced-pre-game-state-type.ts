import type { SyncedStateClientGenericSyncAction, SyncedStateServerEvent } from "../../connection/sync-store-type";
import type { PlayerId, TeamId } from "../core-type";
import type { PlayerColor } from "./player-colors";
import type { PreGamePlayerInfo, PreGameRoomState, PreGameRoomType, PreGameTeamMode } from "./pre-game";

/**
 * 用于前端同步的房间状态（全量同步，类似于 SyncedGameState）
 */
export interface SyncedPreGameState {
  room: PreGameRoomState;
  selfId: PlayerId;
  /**
   * 可选：为当前玩家定制的视角（如只显示自己的准备按钮等）
   */
  self?: PreGamePlayerInfo;
}

// --- 客户端 action 类型 ---
export enum SyncedPreGameClientActionTypes {
  READY = "player-ready",
  UNREADY = "player-unready",
  CHANGE_SETTING = "change-room-setting",
  CHANGE_MAP = "change-room-map",
  CHANGE_ROOM_TYPE = "change-room-type",
  CHANGE_TEAM_MODE = "change-team-mode",
  CHANGE_TEAM = "change-team",
  KICK_PLAYER = "kick-player",
  LEAVE_ROOM = "leave-room",
  START_GAME = "start-game",
  TRANSFER_HOST = "transfer-host", // 房主转让
  DISBAND_ROOM = "disband-room", // 房间解散
  CREATE_TEAM = "create-team",
  RENAME_TEAM = "rename-team",
  DELETE_TEAM = "delete-team",
  ENTER_SPECTATE = "enter-spectate", // Lobby -> Spectating（仅 INGAME 期间）
  LEAVE_SPECTATE = "leave-spectate", // Spectating -> Lobby
  CHANGE_COLOR = "change-player-color", // 玩家选择地块颜色
}

export type SyncedPreGameClientReadyAction = SyncedStateClientGenericSyncAction<SyncedPreGameClientActionTypes.READY>;

export type SyncedPreGameClientUnreadyAction =
  SyncedStateClientGenericSyncAction<SyncedPreGameClientActionTypes.UNREADY>;

export type SyncedPreGameClientChangeSettingAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_SETTING,
  Partial<PreGameRoomState["gameSetting"]>
>;

export type SyncedPreGameClientChangeMapAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_MAP,
  PreGameRoomState["mapSetting"]
>;

export type SyncedPreGameClientChangeRoomTypeAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE,
  { roomType: PreGameRoomType }
>;

export type SyncedPreGameClientChangeTeamModeAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_TEAM_MODE,
  { teamMode: PreGameTeamMode }
>;

export type SyncedPreGameClientChangeTeamAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_TEAM,
  { teamId: TeamId; playerId?: PlayerId } // playerId 可选：仅当 host 想改别人的队伍才会提供
>;

export type SyncedPreGameClientKickPlayerAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.KICK_PLAYER,
  { playerId: PlayerId }
>;

export type SyncedPreGameClientLeaveRoomAction =
  SyncedStateClientGenericSyncAction<SyncedPreGameClientActionTypes.LEAVE_ROOM>;

export type SyncedPreGameClientStartGameAction =
  SyncedStateClientGenericSyncAction<SyncedPreGameClientActionTypes.START_GAME>;

export type SyncedPreGameClientTransferHostAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.TRANSFER_HOST,
  { newHostId: PlayerId }
>;

export type SyncedPreGameClientDisbandRoomAction =
  SyncedStateClientGenericSyncAction<SyncedPreGameClientActionTypes.DISBAND_ROOM>;

export type SyncedPreGameCreateTeamAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CREATE_TEAM,
  { name: string }
>;

export type SyncedPreGameRenameTeamAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.RENAME_TEAM,
  { teamId: TeamId; name: string }
>;

export type SyncedPreGameDeleteTeamAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.DELETE_TEAM,
  { teamId: TeamId }
>;

export type SyncedPreGameEnterSpectateAction =
  SyncedStateClientGenericSyncAction<SyncedPreGameClientActionTypes.ENTER_SPECTATE>;

export type SyncedPreGameLeaveSpectateAction =
  SyncedStateClientGenericSyncAction<SyncedPreGameClientActionTypes.LEAVE_SPECTATE>;

export type SyncedPreGameChangeColorAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_COLOR,
  { tileColor: PlayerColor }
>;

export type SyncedPreGameClientActions =
  | SyncedPreGameClientReadyAction
  | SyncedPreGameClientUnreadyAction
  | SyncedPreGameClientChangeSettingAction
  | SyncedPreGameClientChangeMapAction
  | SyncedPreGameClientChangeRoomTypeAction
  | SyncedPreGameClientChangeTeamModeAction
  | SyncedPreGameClientChangeTeamAction
  | SyncedPreGameClientKickPlayerAction
  | SyncedPreGameClientLeaveRoomAction
  | SyncedPreGameClientStartGameAction
  | SyncedPreGameClientTransferHostAction
  | SyncedPreGameClientDisbandRoomAction
  | SyncedPreGameCreateTeamAction
  | SyncedPreGameRenameTeamAction
  | SyncedPreGameDeleteTeamAction
  | SyncedPreGameEnterSpectateAction
  | SyncedPreGameLeaveSpectateAction
  | SyncedPreGameChangeColorAction;

export enum SyncedPreGameServerEventPayloadType {
  KICKED = "kicked",
  DISBANDED = "disbanded",
  GAME_STARTED = "gamestarted",
  GAME_ENDED = "gameended",
  START_REJECTED = "startrejected",
  /**
   * 当前 sub-connector 被同 user 的另一个连接（另一个 tab / 另一台设备登录）替换。
   * 服务端关旧 sub 之前会先发这条事件；客户端收到之后应：
   *  - 提示"此页面已被另一个标签页/设备接管"
   *  - 阻止本地继续触发 action（反正服务端也不会再处理该 sub 的 action）
   */
  DISPLACED = "displaced",
}

// --- 服务端事件类型 ---
export interface SyncedPreGameServerKickedPayload {
  type: SyncedPreGameServerEventPayloadType.KICKED;
  reason?: string;
}
export interface SyncedPreGameServerDisbandedPayload {
  type: SyncedPreGameServerEventPayloadType.DISBANDED;
  reason?: string;
}

export interface SyncedPreGameServerGameStartedPayload {
  type: SyncedPreGameServerEventPayloadType.GAME_STARTED;
  startedAt: number; // 时间戳，游戏开始时间
}

export interface SyncedPreGameServerGameEndedPayload {
  type: SyncedPreGameServerEventPayloadType.GAME_ENDED;
  endedAt?: number;
}

export interface SyncedPreGameServerStartRejectedPayload {
  type: SyncedPreGameServerEventPayloadType.START_REJECTED;
  reason?: string;
}

export interface SyncedPreGameServerDisplacedPayload {
  type: SyncedPreGameServerEventPayloadType.DISPLACED;
  reason?: string;
}

export type SyncedPreGameServerEventPayload =
  | SyncedPreGameServerKickedPayload
  | SyncedPreGameServerDisbandedPayload
  | SyncedPreGameServerGameStartedPayload
  | SyncedPreGameServerGameEndedPayload
  | SyncedPreGameServerStartRejectedPayload
  | SyncedPreGameServerDisplacedPayload;

export type SyncedPreGameServerEvent = SyncedStateServerEvent<SyncedPreGameState, SyncedPreGameServerEventPayload>;

export {
  SyncedStateServerEventType as SyncedPreGameServerEventType,
  SyncedStateServerStateUpdatePayloadType as SyncedPreGameServerStateUpdatePayloadType,
} from "../../connection/sync-store-type";

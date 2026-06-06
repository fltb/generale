import type { SyncedStateClientGenericSyncAction, SyncedStateServerEvent } from '../../connection/sync-store-type';
import type { PreGameRoomState, PreGamePlayerInfo, PreGameRoomType } from './pre-game';
import type { PlayerId, TeamId } from '../core-type';

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
  READY = 'player-ready',
  UNREADY = 'player-unready',
  CHANGE_SETTING = 'change-room-setting',
  CHANGE_MAP = 'change-room-map',
  CHANGE_ROOM_TYPE = 'change-room-type',
  CHANGE_TEAM = 'change-team',
  KICK_PLAYER = 'kick-player',
  LEAVE_ROOM = 'leave-room',
  START_GAME = 'start-game',
  TRANSFER_HOST = 'transfer-host', // 房主转让
  DISBAND_ROOM = 'disband-room',   // 房间解散
  CREATE_TEAM = 'create-team',
  RENAME_TEAM = 'rename-team',
  DELETE_TEAM = 'delete-team',
}

export type SyncedPreGameClientReadyAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.READY
>;

export type SyncedPreGameClientUnreadyAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.UNREADY
>;

export type SyncedPreGameClientChangeSettingAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_SETTING,
  Partial<PreGameRoomState['gameSetting']>
>;

export type SyncedPreGameClientChangeMapAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_MAP,
  PreGameRoomState['mapSetting']
>;

export type SyncedPreGameClientChangeRoomTypeAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE,
  { roomType: PreGameRoomType }
>;

export type SyncedPreGameClientChangeTeamAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_TEAM,
  { teamId: TeamId; playerId?: PlayerId } // playerId 可选：仅当 host 想改别人的队伍才会提供
>;

export type SyncedPreGameClientKickPlayerAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.KICK_PLAYER,
  { playerId: PlayerId }
>;

export type SyncedPreGameClientLeaveRoomAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.LEAVE_ROOM
>;

export type SyncedPreGameClientStartGameAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.START_GAME
>;

export type SyncedPreGameClientTransferHostAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.TRANSFER_HOST,
  { newHostId: PlayerId }
>;

export type SyncedPreGameClientDisbandRoomAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.DISBAND_ROOM
>;

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


export type SyncedPreGameClientActions =
  | SyncedPreGameClientReadyAction
  | SyncedPreGameClientUnreadyAction
  | SyncedPreGameClientChangeSettingAction
  | SyncedPreGameClientChangeMapAction
  | SyncedPreGameClientChangeRoomTypeAction
  | SyncedPreGameClientChangeTeamAction
  | SyncedPreGameClientKickPlayerAction
  | SyncedPreGameClientLeaveRoomAction
  | SyncedPreGameClientStartGameAction
  | SyncedPreGameClientTransferHostAction
  | SyncedPreGameClientDisbandRoomAction
  | SyncedPreGameCreateTeamAction
  | SyncedPreGameRenameTeamAction
  | SyncedPreGameDeleteTeamAction;

export enum SyncedPreGameServerEventPayloadType {
  KICKED = "kicked",
  DISBANDED = "disbanded",
  GAME_STARTED = "gamestarted",
  GAME_ENDED = "gameended",
  START_REJECTED = "startrejected"
}


// --- 服务端事件类型 ---
export interface SyncedPreGameServerKickedPayload {
  type: SyncedPreGameServerEventPayloadType.KICKED,
  reason?: string;
}
export interface SyncedPreGameServerDisbandedPayload {
  type: SyncedPreGameServerEventPayloadType.DISBANDED,
  reason?: string;
}

export interface SyncedPreGameServerGameStartedPayload {
  type: SyncedPreGameServerEventPayloadType.GAME_STARTED,
  startedAt: number; // 时间戳，游戏开始时间
}

export interface SyncedPreGameServerGameEndedPayload {
  type: SyncedPreGameServerEventPayloadType.GAME_ENDED,
  endedAt?: number;
}

export interface SyncedPreGameServerStartRejectedPayload {
  type: SyncedPreGameServerEventPayloadType.START_REJECTED;
  reason?: string;
}

export type SyncedPreGameServerEventPayload =
  | SyncedPreGameServerKickedPayload
  | SyncedPreGameServerDisbandedPayload
  | SyncedPreGameServerGameStartedPayload
  | SyncedPreGameServerGameEndedPayload
  | SyncedPreGameServerStartRejectedPayload;

export type SyncedPreGameServerEvent = SyncedStateServerEvent<SyncedPreGameState, SyncedPreGameServerEventPayload>

export { SyncedStateServerEventType as SyncedPreGameServerEventType } from '../../connection/sync-store-type';
export { SyncedStateServerStateUpdatePayloadType as SyncedPreGameServerStateUpdatePayloadType } from '../../connection/sync-store-type';

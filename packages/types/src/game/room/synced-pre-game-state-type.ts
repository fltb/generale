import type { SyncedStateClientGenericSyncAction, SyncedStateServerEvent } from '../../connection/sync-store-type';
import type { PreGameRoomState, PreGamePlayerInfo } from './pre-game';
import type { PlayerId } from '../core-type';

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
  CHANGE_TEAM = 'change-team',
  KICK_PLAYER = 'kick-player',
  LEAVE_ROOM = 'leave-room',
  START_GAME = 'start-game',
  TRANSFER_HOST = 'transfer-host', // 房主转让
  DISBAND_ROOM = 'disband-room',   // 房间解散
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

export type SyncedPreGameClientChangeTeamAction = SyncedStateClientGenericSyncAction<
  SyncedPreGameClientActionTypes.CHANGE_TEAM,
  { teamId: string }
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

export type SyncedPreGameClientActions =
  | SyncedPreGameClientReadyAction
  | SyncedPreGameClientUnreadyAction
  | SyncedPreGameClientChangeSettingAction
  | SyncedPreGameClientChangeMapAction
  | SyncedPreGameClientChangeTeamAction
  | SyncedPreGameClientKickPlayerAction
  | SyncedPreGameClientLeaveRoomAction
  | SyncedPreGameClientStartGameAction
  | SyncedPreGameClientTransferHostAction
  | SyncedPreGameClientDisbandRoomAction;

export enum SyncedPreGameServerEventPayloadType {
  KICKED = "kicked",
  DISBANDED = "disbanded",
  GAME_STARTED = "gamestarted"
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


export type SyncedPreGameServerEventPayload = SyncedPreGameServerKickedPayload | SyncedPreGameServerDisbandedPayload | SyncedPreGameServerGameStartedPayload;

export type SyncedPreGameServerEvent = SyncedStateServerEvent<SyncedPreGameState, SyncedPreGameServerEventPayload>

export { SyncedStateServerEventType as SyncedPreGameServerEventType } from '../../connection/sync-store-type';
export { SyncedStateServerStateUpdatePayloadType as SyncedPreGameServerStateUpdatePayloadType } from '../../connection/sync-store-type';

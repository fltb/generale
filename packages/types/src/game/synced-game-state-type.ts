import type { SyncedStateClientGenericSyncAction, SyncedStateServerEvent } from "../connection/sync-store-type";
import type { MaskedGameState, PlayerId, PlayerOperation } from "./core-type";
import type { SyncedPreGameServerEventPayload } from "./room/synced-pre-game-state-type";

export interface SyncedGameState extends MaskedGameState {
    playerDisplay: {
        [k: PlayerId]: {
            tileColor: number; // hex color value
            name: string; // username 兜底
            displayName?: string; // profile 昵称
            avatarThumbUrl?: string; // 缩略头像，用于游戏内 PlayerList
        }
    },
    playerOperationQueue: PlayerOperation[];
}

export enum SyncedGameClientActionTypes {
    PUSH = "player-operation-push",
    CLEAN_ALL = "player-operation-clean-all",
    SURRENDER = "player-surrender",
}

export type SyncedGameClientPlayerOperationPushAction = SyncedStateClientGenericSyncAction<
    SyncedGameClientActionTypes.PUSH,
    PlayerOperation[]
>;

export type SyncedGameClientPlayerOperationClancelAllAction = SyncedStateClientGenericSyncAction<
    SyncedGameClientActionTypes.CLEAN_ALL
>;

export type SyncedGameClientSurrenderAction = SyncedStateClientGenericSyncAction<
    SyncedGameClientActionTypes.SURRENDER
>;

export type SyncedGameClientActions =
    | SyncedGameClientPlayerOperationPushAction
    | SyncedGameClientPlayerOperationClancelAllAction
    | SyncedGameClientSurrenderAction;

export type SyncedGameServerEvent = SyncedStateServerEvent<SyncedGameState, SyncedPreGameServerEventPayload>;
export { SyncedStateServerEventType as SyncedGameServerEventType } 
  from '../connection/sync-store-type';

export { SyncedStateServerStateUpdatePayloadType as SyncedGameServerStateUpdatePayloadType } 
  from '../connection/sync-store-type';
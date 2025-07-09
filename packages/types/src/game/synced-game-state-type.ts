import { SyncedStateClientGenericSyncAction, SyncedStateServerEvent } from "../connection/sync-store-type";
import { MaskedGameState, PlayerId, PlayerOperation } from "./core-type";

export interface SyncedGameState extends MaskedGameState {
    playerDisplay: {
        [k: PlayerId]: {
            tileColor: number; // hex color value
        }
    },
    playerOperationQueue: PlayerOperation[];
}

export enum SyncedGameClientActionTypes {
    PUSH = "player-operation-push",
    CLEAN_ALL = "player-operation-clean-all"
}

export type SyncedGameClientPlayerOperationPushAction = SyncedStateClientGenericSyncAction<
    SyncedGameClientActionTypes.PUSH,
    PlayerOperation[]
>;

export type SyncedGameClientPlayerOperationClancelAllAction = SyncedStateClientGenericSyncAction<
    SyncedGameClientActionTypes.CLEAN_ALL
>;

export type SyncedGameClientActions =
    | SyncedGameClientPlayerOperationPushAction
    | SyncedGameClientPlayerOperationClancelAllAction;

export type SyncedGameServerEvent = SyncedStateServerEvent<SyncedGameState>;
export { SyncedStateServerEventType as SyncedGameServerEventType } 
  from '../connection/sync-store-type';

export { SyncedStateServerStateUpdatePayloadType as SyncedGameServerStateUpdatePayloadType } 
  from '../connection/sync-store-type';
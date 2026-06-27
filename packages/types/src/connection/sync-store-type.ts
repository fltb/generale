// src/types.ts
import type { Operation } from "fast-json-patch";
import type { SyncedGameServerEventType } from "../game";

/**
 * Full synchronization mechanism explanation:
 *
 * 1. Client initialization:
 *    - Call useSyncedState({ connector, initialState, initialVersion, applyEvent })
 *    - Internally uses useVersionedOptimisticState to establish local state (base) and optimistic update queue.
 *
 * 2. Connection establishment:
 *    - When connector.onOpen triggers, client sends sync_request (with current version).
 *    - Automatically resends all unconfirmed optimistic events to ensure uninterrupted operations.
 *
 * 3. Server response:
 *    - Based on client version, returns SyncedStateServerEvent with snapshot or patches:
 *      - Snapshot event: Sends complete state data T.
 *      - Patch event: Sends array of patches Patch<T>[] on T.
 *    - Message includes version (latest version), confirmedOp (confirmed optimistic ID).
 *    - Or return result of an pending action.
 *
 * 4. Client application:
 *    - onMessage processes SyncedStateServerEvent:
 *      - Snapshot branch: Uses payload as new base.
 *      - Patch branch: Updates base via applyPatches.
 *      - Action result branch: clean success or failed action, and deal with commit(action).
 *    - Updates version and clears optimistic queue before confirmedOp.
 *
 * 5. Optimistic operations:
 *    - dispatch/commit(action):
 *      - Locally inserts into queue and updates UI via dispatchOptimisticEvent.
 *      - Sends SyncedStateClientAction with optimisticId.
 *
 * 6. Confirmation & timeout:
 *    - Subsequent state_update includes confirmedOp for Promise resolution.
 *    - commit rejects after timeout, ensuring calling side can catch errors.
 *
 * 7. Reconnection:
 *    - When underlying connector reconnects successfully, triggers onOpen again, executing "resend pending".
 *    - Maintains consistency between client and server states.
 */

/** Backend-pushed synchronization event types to client */
export enum SyncedStateServerStateUpdatePayloadType {
  /** Complete snapshot */
  SNAPSHOT = "snapshot",
  /** Differential update (Patch array) */
  PATCH = "patch",
}

/**
 * Server -> Client synchronization event
 * @template T Complete state type
 */
export type SyncedStateServerStateUpdatePayload<T> =
  | {
      /**
       * Complete snapshot event
       * - type = Snapshot
       * - payload is complete state T
       */
      type: SyncedStateServerStateUpdatePayloadType.SNAPSHOT;
      /** Current version number */
      version: number;
      /** Latest confirmed optimistic operation ID */
      confirmedOp: number;
      /** Complete state data */
      payload: T;
    }
  | {
      /**
       * Differential update event
       * - type = Patch
       * - payload is array of patches against T
       */
      type: SyncedStateServerStateUpdatePayloadType.PATCH;
      /** Current version number */
      version: number;
      /** Latest confirmed optimistic operation ID */
      confirmedOp: number;
      /** Patch array */
      payload: Operation[];
    };

export enum SyncedStateServerEventType {
  STATE_UPDATE = "state-update",
  ACTION_RESULT = "action-result",
  CUSTOM = "custom",
}

export type SyncedStateServerEvent<T, CUSTOM> =
  | {
      type: SyncedStateServerEventType.STATE_UPDATE;
      payload: SyncedStateServerStateUpdatePayload<T>;
    }
  | {
      type: SyncedStateServerEventType.ACTION_RESULT;
      payload: {
        /**
         * Success or failure
         * Note: Server must ensure that async success requests immediately delete the operation client-side,
         * so the server must guarantee this operation won't corrupt the local optimistic update state view
         */
        status: "success" | "failed";
        /** Response optimistic operation ID */
        optimisticId: number;
        /** Optional message */
        message?: string;
      };
    }
  | {
      type: SyncedGameServerEventType.CUSTOM;
      payload: CUSTOM;
    };

export enum SyncedStateClientBaseActionType {
  SYNC_ACTION = "sync-action",
}

/**
 * Client -> Server operation event
 * @template T Basic operation type name
 * @template P operation payload type
 * - optimisticId: Unique optimistic update identifier for confirmation/rollback
 */
export type SyncedStateClientGenericSyncAction<T extends string, P = undefined> = {
  readonly optimisticId: number;
  readonly type: T;
} & (P extends undefined ? object : { readonly payload: P });

// Currently unused
// /**
//  * Client -> Server synchronization request event, used for version synchronization during initial connection/reconnection
//  */
// export type SyncedStateClientSyncAction = SyncedStateClientGenericSyncAction<
//     SyncedStateClientBaseActionType.SYNC_ACTION,
//     { version: number }
// >;

// export type SyncedStateClientBaseActions;

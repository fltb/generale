import { createStore, reconcile, unwrap } from "solid-js/store";
import { createMemo, type Accessor } from "solid-js";
import { applyPatch } from "fast-json-patch";
import {
  type SyncedStateServerStateUpdatePayload,
  SyncedStateServerStateUpdatePayloadType,
} from "@generale/types";

let optimisticIdCounter = 0;

export function useVersionedOptimisticState<
  T,
  E extends { readonly optimisticId: number; readonly type: string }
>(
  initialState: T,
  initialVersion: number = 0,
  applyEvent: (state: T, event: E) => T
) {
  const [state, setState] = createStore({
    version: initialVersion,
    base: initialState as unknown as T,
    optimisticQueue: [] as { id: number; event: E }[],
  });

const mergedState = createMemo(() => {
  const base = unwrap(state.base);
  const queue = unwrap(state.optimisticQueue);
  let cur = structuredClone(base);
  for (const item of queue) cur = applyEvent(cur, item.event);
  return cur;
});
  /** 发送本地事件（乐观更新） */
  function dispatchOptimisticEvent(event: Omit<E, "optimisticId">): number {
    const newId = ++optimisticIdCounter;
    const safeEvent = { ...event, optimisticId: newId } as E;
    console.groupCollapsed(
      `%c[useVersionedOptimisticState] SEND optimistic event #${newId}`,
      "color:#4CAF50; font-weight:bold;"
    );
    console.log("Event:", safeEvent);
    console.groupEnd();

    setState("optimisticQueue", (q) => [...q, { id: newId, event: safeEvent }]);
    return newId;
  }

  /**
   * 从服务器同步（快照或补丁）
   * payload.type === 'snapshot' -> payload.payload 是完整状态
   * payload.type === 'patch' -> payload.payload 是 fast-json-patch 的 Operation[]
   */
  function reconcileFromServer(
    payload: SyncedStateServerStateUpdatePayload<T>
  ) {
    console.groupCollapsed(
      `%c[useVersionedOptimisticState] RECEIVE server update (type=${payload?.type})`,
      "color:#2196F3; font-weight:bold;"
    );
    console.log("Payload:", payload);
    console.groupEnd();

    let newBase: T;
    try {
      if (!payload || typeof payload !== "object") {
        console.warn(
          "[useVersionedOptimisticState] reconcileFromServer: invalid payload",
          payload
        );
        return;
      }

      if (payload.type === SyncedStateServerStateUpdatePayloadType.SNAPSHOT) {
        console.log("[useVersionedOptimisticState] Applying full snapshot");
        newBase = payload.payload;
      } else if (
        payload.type === SyncedStateServerStateUpdatePayloadType.PATCH
      ) {
        console.log(
          "[useVersionedOptimisticState] Applying patch set:",
          payload.payload
        );
        const patches = payload.payload;
        const baseClone = structuredClone(state.base);
        const res = applyPatch(baseClone, patches, true, false);
        newBase = res?.newDocument ?? (baseClone as T);
      } else {
        console.warn(
          "[useVersionedOptimisticState] Unknown payload shape",
          payload
        );
        return;
      }
    } catch (err) {
      console.error(
        "[useVersionedOptimisticState] reconcileFromServer: applying patch/snapshot failed",
        err,
        payload
      );
      return;
    }

    try {
      setState("base", reconcile(newBase, { merge: true }));
    } catch {
      setState("base", newBase);
    }

    if (typeof payload.version === "number") {
      console.log(
        "[useVersionedOptimisticState] Updated version ->",
        payload.version
      );
      setState("version", payload.version);
    }

    if (typeof payload.confirmedOp === "number") {
      console.log(
        "[useVersionedOptimisticState] Confirmed op ->",
        payload.confirmedOp
      );
      setState("optimisticQueue", (q) =>
        q.filter((item) => item.id > payload.confirmedOp)
      );
    }

    console.log("[useVersionedOptimisticState] New base state:", newBase);
  }

  function getPendingEvents() {
    return state.optimisticQueue.map((item) => ({
      ...item.event,
      optimisticId: item.id,
    }));
  }

  return {
    mergedState,
    version: () => state.version,
    getPendingEvents,
    dispatchOptimisticEvent,
    reconcileFromServer,
  };
}

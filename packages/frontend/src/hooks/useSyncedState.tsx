import type { SubConnectorClient } from "~/ws/manager";

import { onMount, onCleanup } from "solid-js";
import { useWS } from "./useWebsocket";
import { useVersionedOptimisticState } from "./useVersionedOptimisticState";
import {
  SyncedStateServerEventType,
  type SyncedStateServerEvent,
} from "@generale/types";

export function useSyncedState<
  TState,
  TAction extends { readonly optimisticId: number; readonly type: string },
  Custom extends unknown
>({
  domain,
  initialState,
  initialVersion = 0,
  applyEvent,
  context = {},
  onCustomEvent = () => {},
  onConnectionClosed = () => {},
  autoOpen = true,
}: {
  domain: string;
  initialState: TState;
  initialVersion?: number;
  applyEvent: (state: TState, event: TAction) => TState;
  onCustomEvent?: (event: Custom) => void;
  context?: Record<string, any>;
  onConnectionClosed?: (info: { code?: number; reason?: string }) => void;
  autoOpen?: boolean;
}) {
  // manager from hook (the ClientConnectionManager)
  const wsMgr = useWS(); /* ClientConnectionManager<any> */

  const stateManager = useVersionedOptimisticState<TState, TAction>(
    initialState,
    initialVersion,
    applyEvent
  );

  // NOTE: we no longer use useSubConnector hook here.
  // We'll create/attach the sub via wsMgr.getOrCreateSub when connecting.
  let sub: SubConnectorClient | null = null;

  // buffer outgoing messages while sub isn't ready
  const pendingOut: any[] = [];

  const pendingRequests = new Map<
    number,
    { resolve: (v: any) => void; reject: (e?: any) => void; timeoutId: number }
  >();

  // ---- helper: ensure we have local sub and attach handlers ----
  function ensureSubAndAttach() {
    console.debug("try ensure sub and attatch", wsMgr, JSON.stringify(sub));
    if (!wsMgr) return;
    if (!sub) {
      // create / reuse a local sub object
      sub = wsMgr.getOrCreateSub(domain, context);

      // attach handlers once
      sub.onOpen(() => {
        try {
          _onOpen();
        } catch (e) {
          console.error(`[useSyncedState:${domain}] onOpen handler error`, e);
        }
      });
      console.debug(`[REGISTER ONMESSAGE:${domain}] onMessage handler recv`);
      sub.onMessage((m: any) => {
        try {
          _onMessage(m);
        } catch (e) {
          console.error(
            `[useSyncedState:${domain}] onMessage handler error`,
            e
          );
        }
      });
      sub.onDisconnect((err?: Error) => {
        try {
          _onDisconnect(err);
        } catch (e) {
          console.error(
            `[useSyncedState:${domain}] onDisconnect handler error`,
            e
          );
        }
      });
      sub.onClose((code?: number, reason?: string) => {
        try {
          _onClose(code, reason);
        } catch (e) {
          console.error(`[useSyncedState:${domain}] onClose handler error`, e);
        }
      });

      if (!sub.ready) {
        wsMgr.openDomain(domain, context);
      }
    }
  }

  function _sendOrBuffer(obj: any) {
    console.debug(
      `[useSyncedState:${domain}] Try send`,
      obj,
      "subReady=",
      !!sub && !!sub.ready
    );
    // ensure there's a sub (so the manager has the local object and callbacks attached)
    try {
      ensureSubAndAttach();
    } catch (e) {
      console.warn("ensureSubAndAttach failed", e);
    }

    if (sub && sub.ready) {
      try {
        sub.send(obj);
        console.debug(`[useSyncedState:${domain}] Sending`, obj);
      } catch (e) {
        console.warn(`[useSyncedState:${domain}] send failed, buffering`, e);
        pendingOut.push(obj);
      }
    } else {
      // if websocket is connected but domain not yet opened, trigger openDomain as a fallback
      try {
        if (wsMgr && wsMgr.isConnected) {
          console.debug(
            `[useSyncedState:${domain}] socket connected but sub not ready — requesting domain open`
          );
          wsMgr.openDomain(domain, context);
        }
      } catch (e) {
        console.warn(`[useSyncedState:${domain}] auto openDomain failed`, e);
      }
      pendingOut.push(obj);
    }
  }

  function _flushPendingOut() {
    while (pendingOut.length > 0) {
      const p = pendingOut.shift();
      try {
        if (sub && sub.ready) {
          sub.send(p);
          console.debug(`[useSyncedState:${domain}] flushed pending`, p);
        } else {
          // cannot send yet, push back and stop
          pendingOut.unshift(p);
          break;
        }
      } catch (e) {
        // push back and stop
        pendingOut.unshift(p);
        break;
      }
    }
  }

  // ---- message / lifecycle handlers used by sub callbacks ----
  function _onMessage(msg: SyncedStateServerEvent<TState, Custom>) {
    if (!msg) return;
    console.debug("got msg from server", msg);

    if (msg.type === SyncedStateServerEventType.STATE_UPDATE) {
      stateManager.reconcileFromServer(msg.payload);
      if (typeof msg.payload.confirmedOp === "number") {
        for (const [id, rec] of Array.from(pendingRequests.entries())) {
          if (id <= msg.payload.confirmedOp) {
            clearTimeout(rec.timeoutId);
            rec.resolve({ status: "success", optimisticId: id });
            pendingRequests.delete(id);
          }
        }
      }
      return;
    }

    if (msg.type === SyncedStateServerEventType.ACTION_RESULT) {
      const p = msg.payload;
      const optimisticId = p.optimisticId;
      if (
        typeof optimisticId === "number" &&
        pendingRequests.has(optimisticId)
      ) {
        const rec = pendingRequests.get(optimisticId)!;
        clearTimeout(rec.timeoutId);
        if (p.status === "success" || msg.type === "action-result")
          rec.resolve(p);
        else rec.reject(new Error(p.message ?? "action failed"));
        pendingRequests.delete(optimisticId);
      }
      return;
    }

    if (msg.type === SyncedStateServerEventType.CUSTOM) {
      onCustomEvent(msg.payload);
    }

    console.debug(`[useSyncedState:${domain}] unrecognized sub message`, msg);
  }

  function _onOpen() {
    // sub ready — flush pending & send sync request
    _flushPendingOut();
    _sendOrBuffer({
      type: "sync_request",
      version: stateManager.version?.() ?? 0,
    });
  }

  function _onDisconnect(err?: Error) {
    // keep optimistic queue for now
    console.debug(
      `[useSyncedState:${domain}] sub disconnected`,
      err?.message ?? ""
    );
  }

  function _onClose(code?: number, reason?: string) {
    console.debug(`[useSyncedState:${domain}] sub closed`, code, reason);
    onConnectionClosed({ code, reason });
  }

  // mount: if sub already exists (unlikely), attach handlers; else do nothing here.
  onMount(() => {
    try {
      // If wsMgr already created a sub earlier (rare), attach handlers
      if (wsMgr) {
        // try to find an existing sub without creating open
        ensureSubAndAttach();
      }
    } catch (e) {
      console.error(
        `[useSyncedState:${domain}] attach handlers failed on mount`,
        e
      );
    }
  });

  onCleanup(() => {
    // reject outstanding pending commit promises
    for (const [, rec] of pendingRequests.entries()) {
      clearTimeout(rec.timeoutId);
      rec.reject(new Error("unmounted"));
    }
    pendingRequests.clear();
  });

  // public APIs

  function dispatch(action: Omit<TAction, "optimisticId">) {
    const optimisticId = stateManager.dispatchOptimisticEvent(action);
    const out = {
      optimisticId,
      ...action,
    };
    _sendOrBuffer(out);
    return optimisticId;
  }

  function commit(
    action: Omit<TAction, "optimisticId">,
    timeoutMs = 10000
  ): Promise<any> {
    const optimisticId = stateManager.dispatchOptimisticEvent(action);
    const out = {
      optimisticId,
      ...action,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        pendingRequests.delete(optimisticId);
        reject(new Error("timeout"));
      }, timeoutMs);
      pendingRequests.set(optimisticId, { resolve, reject, timeoutId });
      _sendOrBuffer(out);
    });
  }

  // helper: wait for manager to be connected (timeoutMs default 3s)
  function waitForManagerConnected(timeoutMs = 3000): Promise<void> {
    return new Promise((resolve) => {
      if (!wsMgr) {
        // nothing can be done
        return resolve();
      }
      if (wsMgr.isConnected) return resolve();

      // poll small interval until connected or timeout
      let done = false;
      const start = Date.now();
      const iv = window.setInterval(() => {
        if (wsMgr.isConnected) {
          done = true;
          clearInterval(iv);
          return resolve();
        }
        if (Date.now() - start > timeoutMs) {
          done = true;
          clearInterval(iv);
          return resolve();
        }
      }, 50);
    });
  }

  // make connect async
  async function connect() {
    try {
      // ensure websocket connection (may kick off async connect)
      if (!wsMgr || !wsMgr.isConnected) {
        wsMgr.connect(true);
      }

      // wait until underlying socket is connected (short polling)
      await waitForManagerConnected(5000);

      // create local sub and attach handlers BEFORE requesting open (this is critical)
      ensureSubAndAttach();

      // now request server to open domain (this will add pendingOpens and send or retry)
      if (autoOpen) {
        try {
          wsMgr.openDomain(domain, context);
          console.debug(
            `[useSyncedState:${domain}] openDomain requested`,
            domain,
            context
          );
        } catch (e) {
          console.warn(`[useSyncedState:${domain}] openDomain threw`, e);
        }
      }
    } catch (e) {
      console.warn(`[useSyncedState:${domain}] connect() error`, e);
    }
  }
  function disconnect() {
    try {
      if (sub) {
        try {
          sub.close();
        } catch {}
        // keep sub reference (manager may reattach), or optionally null it:
        sub = null;
      }
    } catch (e) {
      console.warn(`[useSyncedState:${domain}] disconnect error`, e);
    }
  }

  function isReady() {
    return !!sub && !!sub.ready;
  }

  return {
    state: stateManager.mergedState,
    dispatch,
    commit,
    connect,
    disconnect,
    isReady,
  };
}

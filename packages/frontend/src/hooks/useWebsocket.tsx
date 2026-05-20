// src/hooks/useWebsocket.tsx
import { createContext, useContext, JSX, onCleanup } from "solid-js";
import { ClientConnectionManager, SubConnectorClient } from "~/ws/manager";
import type { WSContextBase } from "~/ws/manager";

type WSManager<T extends WSContextBase> = ClientConnectionManager<T>;

/**
 * WebSocket context that exposes a single manager instance.
 * The provider will auto-connect on mount and auto-close on unmount.
 *
 * IMPORTANT: This provider assumes the server uses httpOnly cookie (sid) for session.
 * We do NOT read or place sid/token into the WebSocket URL. The browser will send
 * the httpOnly cookie automatically during the WebSocket handshake.
 */
const WSContext = createContext<{ manager: WSManager<any> | null } | undefined>(
  undefined,
);

export function WebSocketProvider<
  T extends WSContextBase = WSContextBase,
>(props: { url?: string; autoConnect?: boolean; children?: JSX.Element }) {
  const url =
    props.url ??
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

  const manager = new ClientConnectionManager<T>(url);

  if (props.autoConnect !== false) {
    manager.connect(true);
  }

  onCleanup(() => {
    manager.close();
  });

  return (
    <WSContext.Provider value={{ manager }}>
      {props.children}
    </WSContext.Provider>
  );
}

/**
 * Hook to get the manager
 */
export function useWS<T extends WSContextBase = WSContextBase>() {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used inside WebSocketProvider");
  return ctx.manager as WSManager<T>;
}

/**
 * Hook to use a sub-connector
 * - domain: string domain name
 * - opts.autoOpen: whether to automatically request open to server
 */
export function useSubConnector<
  CEvt = any,
  SEvt = any,
  Ctx extends WSContextBase = WSContextBase,
>(domain: string, opts?: { autoOpen?: boolean; context?: Partial<Ctx> }) {
  const manager = useWS<Ctx>();

  const sub = manager.getOrCreateSub<CEvt, SEvt>(domain, opts?.context ?? {});

  if (opts?.autoOpen ?? true) {
    manager.openDomain(domain, opts?.context ?? {});
  }

  return sub as SubConnectorClient<CEvt, SEvt, Ctx>;
}

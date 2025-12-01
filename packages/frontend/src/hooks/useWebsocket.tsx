// src/hooks/useWebsocket.tsx
import { createContext, useContext, JSX, onCleanup } from "solid-js";
import { ClientConnectionManager, SubConnectorClient } from "~/ws/manager";
import type { WSContextBase } from "~/ws/manager";

type WSManager = ClientConnectionManager<WSContextBase>;

/**
 * WebSocket context that exposes a single manager instance.
 * The provider will auto-connect on mount and auto-close on unmount.
 *
 * IMPORTANT: This provider assumes the server uses httpOnly cookie (sid) for session.
 * We do NOT read or place sid/token into the WebSocket URL. The browser will send
 * the httpOnly cookie automatically during the WebSocket handshake.
 */
const WSContext = createContext<{ manager: WSManager | null } | undefined>(undefined);

export function WebSocketProvider(props: {
  url?: string; // e.g. ws://localhost:3000/ws
  autoConnect?: boolean;
  children?: JSX.Element;
}) {
  // default url: same origin, path /ws
  const url = props.url ?? `${(location.protocol === "https:" ? "wss" : "ws")}://${location.host}/ws`;

  // Create manager — no sid/token getter required; rely on httpOnly cookie.
  const manager = new ClientConnectionManager<WSContextBase>(url);

  if (props.autoConnect !== false) {
    // reattach true will try to use persisted reconnectId if available
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
export function useWS() {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used inside WebSocketProvider");
  return ctx.manager!;
}

/**
 * Hook to use a sub-connector
 * - domain: string domain name
 * - opts.autoOpen: whether to automatically request open to server
 */
export function useSubConnector<CEvt = any, SEvt = any>(domain: string, opts?: { autoOpen?: boolean, context?: Partial<WSContextBase> }) {
  const manager = useWS();
  const sub = manager.getOrCreateSub<CEvt, SEvt>(domain, opts?.context ?? {});
  if (opts?.autoOpen ?? true) {
    manager.openDomain(domain, opts?.context ?? {});
  }
  return sub as SubConnectorClient<CEvt, SEvt, WSContextBase>;
}

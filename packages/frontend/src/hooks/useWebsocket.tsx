// src/hooks/useWebsocket.tsx
import { createContext, useContext, JSX, onCleanup } from "solid-js";
import { ClientConnectionManager, SubConnectorClient } from "~/ws/manager";
import type { WSContextBase } from "~/ws/manager";

type WSManager = ClientConnectionManager<WSContextBase>;

/**
 * WebSocket context that exposes a single manager instance.
 * The provider will auto-connect on mount and auto-close on unmount.
 */
const WSContext = createContext<{ manager: WSManager | null } | undefined>(undefined);

export function WebSocketProvider(props: {
  url?: string; // e.g. ws://localhost:3000/ws
  getToken?: () => string | null | undefined; // optional function to fetch token
  autoConnect?: boolean;
  children?: JSX.Element;
}) {
  // default url: same origin, path /ws
  const url = props.url ?? `${(location.protocol === "https:" ? "wss" : "ws")}://${location.host}/ws`;
  // allow token getter; fallback to null
  const getToken = props.getToken ?? (() => {
    // fallback: try reading cookie "sid" or nothing. User can pass custom getter.
    const match = document.cookie.match(/(?:^|;\s*)sid=([^;]+)/);
    return match ? match[1] : undefined;
  });

  // create manager
  const manager = new ClientConnectionManager<WSContextBase>(url, getToken);

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
  // create/get connector
  // ===== FIX: only 2 generic args (CEvt, SEvt). Ctx is already the manager's generic (WSContextBase)
  const sub = manager.getOrCreateSub<CEvt, SEvt>(domain, opts?.context ?? {});
  if (opts?.autoOpen ?? true) {
    // fire open request (ask server to open domain)
    manager.openDomain(domain, opts?.context ?? {});
  }
  return sub as SubConnectorClient<CEvt, SEvt, WSContextBase>;
}

// src/hooks/useWebsocket.tsx
import { createContext, type JSX, onCleanup, useContext } from "solid-js";
import type { WSOpenPayloadBase } from "~/ws/manager";
import { ClientConnectionManager, type SubConnectorClient } from "~/ws/manager";

type WSManager<T extends WSOpenPayloadBase> = ClientConnectionManager<T>;

/**
 * WebSocket context that exposes a single manager instance.
 * The provider will auto-connect on mount and auto-close on unmount.
 *
 * IMPORTANT: This provider assumes the server uses httpOnly cookie (sid) for session.
 * We do NOT read or place sid/token into the WebSocket URL. The browser will send
 * the httpOnly cookie automatically during the WebSocket handshake.
 */
// Context erases the OpenPayload generic due to contravariance; caller useWS<T>() casts on retrieval.
// biome-ignore lint/suspicious/noExplicitAny: cannot express "ClientConnectionManager for any OpenPayload" without any
const WSContext = createContext<{ manager: WSManager<any> | null } | undefined>(undefined);

export function WebSocketProvider<T extends WSOpenPayloadBase = WSOpenPayloadBase>(props: {
  url?: string;
  autoConnect?: boolean;
  children?: JSX.Element;
}) {
  const url = props.url ?? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

  const manager = new ClientConnectionManager<T>(url);

  if (props.autoConnect !== false) {
    manager.connect(true);
  }

  onCleanup(() => {
    manager.close();
  });

  return <WSContext.Provider value={{ manager }}>{props.children}</WSContext.Provider>;
}

/**
 * Hook to get the manager
 */
export function useWS<T extends WSOpenPayloadBase = WSOpenPayloadBase>() {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used inside WebSocketProvider");
  return ctx.manager as WSManager<T>;
}

/**
 * Hook to use a sub-connector
 * - domain: string domain name
 * - opts.autoOpen: whether to automatically request open to server
 */
export function useSubConnector<CEvt = unknown, SEvt = unknown, Ctx extends WSOpenPayloadBase = WSOpenPayloadBase>(
  domain: string,
  opts?: { autoOpen?: boolean; context?: Partial<Ctx> },
) {
  const manager = useWS<Ctx>();

  const sub = manager.getOrCreateSub<CEvt, SEvt>(domain);

  if (opts?.autoOpen ?? true) {
    manager.openDomain(domain);
  }

  return sub as SubConnectorClient<CEvt, SEvt, Ctx>;
}

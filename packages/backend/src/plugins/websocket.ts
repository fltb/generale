import { Elysia } from "elysia"; // FIX: Removed unused 't' import
import type { ServerSyncConnector } from '@generale/types/src/connection/conn-type';

// =================================================================================
// 1. INTERFACES AND TYPE DEFINITIONS
// =================================================================================

interface WSContextBase {
  userid: string;   // always filled by backend
  username: string;
};

export type WebSocketMessage<T = unknown, Context extends WSContextBase = WSContextBase> =
  | { domain: string; type: "open"; payload: Context }
  | { domain: string; type: "close"; payload?: { code?: number; reason?: string } }
  | { domain: string; type: "message"; payload: T }
  | { domain: string; type: "reconnect"; payload?: unknown };

export interface SubConnector<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase> extends ServerSyncConnector<CEvt, SEvt> {
  readonly domain: string;
  readonly context: Ctx;
  getConnectionId(): string;
  getContext(): Ctx;
}

export type DomainHandler<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase> = (connector: SubConnector<CEvt, SEvt, Ctx>) => void;

const domainHandlers = new Map<string, DomainHandler<any, any, any>>();
export { domainHandlers };

export function registerDomainHandler<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase>(domain: string, handler: DomainHandler<CEvt, SEvt, Ctx>): void {
  if (domainHandlers.has(domain)) {
    console.warn(`Domain handler for '${domain}' already exists, overwriting`);
  }
  domainHandlers.set(domain, handler);
}

export function unregisterDomainHandler(domain: string): void {
  domainHandlers.delete(domain);
}

// =================================================================================
// 2. CORE IMPLEMENTATION CLASSES
// =================================================================================

export class SubConnectorImpl<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase> implements SubConnector<CEvt, SEvt, Ctx> {
  private _ready: boolean = true;
  private openCallbacks: (() => void)[] = [];
  private closeCallbacks: ((code: number, reason: string) => void)[] = [];
  private disconnectCallbacks: ((err?: Error) => void)[] = [];
  private reconnectCallbacks: (() => void)[] = [];
  private messageCallbacks: ((payload: CEvt) => void)[] = [];

  private _explicitlyClosed = false;
  private _closeInfo: { code?: number; reason?: string } | null = null;

  constructor(
    public readonly domain: string,
    public readonly context: Ctx,
    // FIX: Removed unused `ws` property. Sending is delegated to the manager.
    private connectionManager: WebSocketConnectionManager<any, any>
  ) { }

  get ready(): boolean { return this._ready; }
  public isExplicitlyClosed(): boolean { return this._explicitlyClosed; }
  public getCloseInfo(): { code?: number; reason?: string } | null { return this._closeInfo; }
  public getConnectionId(): string { return this.connectionManager.getConnectionId(); }
  public getContext(): Ctx { return this.context as Ctx; }

  // FIX: Simplified method as the `ws` object is no longer stored here.
  public _updateTransport(newManager: WebSocketConnectionManager<any, any>) {
    this.connectionManager = newManager;
  }

  send(evt: SEvt): void {
    if (this._ready && this.connectionManager.isConnected) {
      this.connectionManager.sendRaw({ domain: this.domain, type: 'message', payload: evt });
    }
  }

  close(code?: number, reason?: string): void {
    this.connectionManager.closeSubConnector(this.domain, code, reason);
  }

  onOpen(cb: () => void): void { this.openCallbacks.push(cb); }
  onClose(cb: (code: number, reason: string) => void): void { this.closeCallbacks.push(cb); }
  onDisconnect(cb: (err?: Error) => void): void { this.disconnectCallbacks.push(cb); }
  onReconnect(cb: () => void): void { this.reconnectCallbacks.push(cb); }
  onClientMessage(cb: (evt: CEvt) => void): void { this.messageCallbacks.push(cb); }

  _triggerOpen(): void { this.openCallbacks.forEach(cb => cb()); }

  _triggerClose(code?: number, reason?: string): void {
    this._ready = false;
    this._explicitlyClosed = true;

    const info: { code?: number; reason?: string } = {};
    if (code !== undefined) info.code = code;
    if (reason !== undefined) info.reason = reason;
    this._closeInfo = info;

    this.closeCallbacks.forEach(cb => cb(code ?? 1000, reason ?? 'Normal Closure'));
  }
  _triggerDisconnect(err?: Error): void {
    this._ready = false;
    this.disconnectCallbacks.forEach(cb => cb(err));
  }
  _triggerReconnect(): void {
    this._ready = true;
    this._explicitlyClosed = false;
    this._closeInfo = null;
    this.reconnectCallbacks.forEach(cb => cb());
  }
  _triggerMessage(payload: CEvt): void { this.messageCallbacks.forEach(cb => cb(payload)); }
}

class WebSocketConnectionManager<T = unknown, Context extends WSContextBase = WSContextBase> {
  context: Context = {} as Context;
  private ws: any;
  private subConnectors = new Map<string, SubConnectorImpl<any, any, any>>();
  private connectionId: string;
  public isConnected = false;

  constructor(ws: any, connectionId: string) {
    this.ws = ws;
    this.connectionId = connectionId;
    this.isConnected = true;

  }

  setContext(ctx: Partial<Context>) {
    this.context = { ...this.context, ...ctx };
    if (this.ws && this.ws.data) {
      (this.ws.data as any).context = this.context;
    }
  }

  getContext(): Context { return this.context; }

  handleMessage(message: WebSocketMessage<T, Context>) {
    const { domain, type, payload } = message;
    console.debug(`recv event type ${type} to domain ${domain}`)
    switch (type) {
      case "open": this.openSubConnector(domain, payload as Partial<Context>); break;
      case "close": {
        let code: number | undefined; let reason: string | undefined;
        if (typeof payload === 'object' && payload !== null) { code = (payload as any).code; reason = (payload as any).reason; }
        this.closeSubConnector(domain, code, reason);
        break;
      }
      case "reconnect": this.reconnectSubConnector(domain); break;
      case "message": this.routeMessage(domain, payload as T); break;
      default:
        console.warn(`Unknown message type: ${(type as any)}`);
        this.ws.send({ type: 'error', payload: { error: 'Unknown message type' } });
    }
  }

  openSubConnector(domain: string, context: Partial<Context>): boolean {
    if (this.subConnectors.has(domain)) return false;
    const handler = domainHandlers.get(domain);
    if (!handler) return false;

    const safeContext = {
      ...context,
      ...this.context,   // fill by backend
    } as Context;

    const subConnector = new SubConnectorImpl(domain, safeContext, this);
    this.subConnectors.set(domain, subConnector);

    handler(subConnector);
    subConnector._triggerOpen();

    // <-- NEW: notify the client that the domain was opened
    // This sends a message the client-side ClientConnectionManager understands:
    // { domain, type: 'open', payload: Context }
    this.sendRaw({ domain, type: 'open', payload: safeContext });

    return true;
  }

  closeSubConnector(domain: string, code?: number, reason?: string): boolean {
    const subConnector = this.subConnectors.get(domain);
    if (!subConnector) { return false; }
    subConnector._triggerClose(code, reason);
    this.sendRaw({ type: 'close', domain, payload: { code, reason } });
    return true;
  }

  reconnectSubConnector(domain: string): boolean {
    const subConnector = this.subConnectors.get(domain);
    if (!subConnector) { return false; }
    if (subConnector.isExplicitlyClosed()) {
      this.sendRaw({ domain: domain, type: 'close', payload: subConnector.getCloseInfo() });
      return false;
    }
    subConnector._triggerReconnect();
    this.sendRaw({ type: 'reconnect_ack', domain, payload: { success: true } });
    return true;
  }

  routeMessage(domain: string, payload: T): boolean {
    const subConnector = this.subConnectors.get(domain);
    if (!subConnector || !subConnector.ready) { return false; }
    subConnector._triggerMessage(payload);
    return true;
  }

  handleClose() {
    this.isConnected = false; this.ws = null;
    for (const [, subConnector] of this.subConnectors) { subConnector._triggerDisconnect(); }
  }

  reattach(newWs: any) {
    this.ws = newWs; this.isConnected = true;
    for (const [, subConnector] of this.subConnectors) {
      // FIX: Call updated `_updateTransport` method
      subConnector._updateTransport(this);
    }
  }

  getConnectionId(): string { return this.connectionId; }

  sendRaw(message: object): void {
    if (this.isConnected && this.ws) { this.ws.send(JSON.stringify(message)); }
  }
}

// =================================================================================
// 3. GLOBAL STATE & MULTI-DEVICE BROADCAST/SENDING LOGIC
// =================================================================================

const connectionManagers = new Map<string, WebSocketConnectionManager<any, any>>();
const userConnections = new Map<string, Set<string>>();

interface CustomWsData {
  userId: string;
  connectionId: string;
  manager: WebSocketConnectionManager<any, any>;
}

async function authenticateUserByToken(token: string | undefined | null): Promise<string | null> {
  if (token && token.startsWith('token_for_')) {
    return token.replace('token_for_', '');
  }
  return null;
}

export function sendMessageToUser(userId: string, message: WebSocketMessage): void {
  const connectionIds = userConnections.get(userId);
  if (!connectionIds || connectionIds.size === 0) { return; }
  for (const connectionId of connectionIds) {
    const manager = connectionManagers.get(connectionId);
    if (manager && manager.isConnected) { manager.sendRaw(message); }
  }
}

export function sendMessageToConnection(connectionId: string, message: WebSocketMessage): boolean {
  const manager = connectionManagers.get(connectionId);
  if (manager && manager.isConnected) {
    manager.sendRaw(message);
    return true;
  }
  return false;
}

// =================================================================================
// 4. ELYSIA WEBSOCKET PLUGIN
// =================================================================================

export const websocketPlugin = new Elysia()
  .ws("/ws", {
    async open(ws) {
      const wsData = ws.data as any;
      const { token, reconnectId } = wsData.query;
      const userId = await authenticateUserByToken(token as string | undefined);

      if (!userId) {
        ws.close(4001, "Authentication failed");
        return;
      }

      wsData.userId = userId;
      let manager: WebSocketConnectionManager | undefined;
      let connectionId: string;

      if (reconnectId && (manager = connectionManagers.get(reconnectId as string)) && !manager.isConnected) {
        manager.reattach(ws);
        connectionId = reconnectId as string;
        wsData.connectionId = connectionId;
        wsData.manager = manager;
        manager.setContext({ userid: userId }); // fill userid
        ws.send({ type: "reconnection_ack", payload: { success: true, connectionId } });
      } else {
        connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        wsData.connectionId = connectionId;
        manager = new WebSocketConnectionManager(ws, connectionId);
        wsData.manager = manager;
        connectionManagers.set(connectionId, manager);

        manager.setContext({ userid: userId }); // fill userid
        ws.send({ type: "connection_ack", payload: { connectionId } });
      }

      if (!userConnections.has(userId)) {
        userConnections.set(userId, new Set());
      }
      userConnections.get(userId)!.add(connectionId);
      console.log(`[OPEN] User '${userId}' connected. Total connections: ${userConnections.get(userId)!.size}. (Conn ID: ${connectionId})`);
    },

    message(ws, message) {
      try {
        // FIX: Use a two-step assertion to satisfy strict type checking
        const { manager } = ws.data as unknown as CustomWsData;
        if (!manager) {
          console.warn("manager not found in ws data")
          return;
        }
        const parsedMessage = typeof message === 'object' ? message : JSON.parse(message as string);
        console.log("parseedMessage", parsedMessage)
        manager.handleMessage(parsedMessage);
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    },

    close(ws, _code, _message) {
      // FIX: Use a two-step assertion here as well
      const { connectionId, userId } = ws.data as unknown as CustomWsData;

      if (connectionId) {
        const manager = connectionManagers.get(connectionId);
        if (manager) { manager.handleClose(); }
      }

      if (userId && connectionId) {
        const userConnSet = userConnections.get(userId);
        if (userConnSet) {
          userConnSet.delete(connectionId);
          if (userConnSet.size === 0) {
            userConnections.delete(userId);
          }
          console.log(`[CLOSE] User '${userId}' disconnected. Remaining connections: ${userConnSet.size}. (Conn ID: ${connectionId})`);
        }
      }
    },

    error(context: any) {
      const connectionId = (context.ws || context)?.data?.connectionId;
      console.error(`WebSocket error for connection ${connectionId}:`, context.error);
    }
  });

// =================================================================================
// 5. DEBUGGING & UTILITY FUNCTIONS
// =================================================================================

export function getConnectionManager(connectionId: string): WebSocketConnectionManager | undefined {
  return connectionManagers.get(connectionId);
}

export function getAllConnections(): string[] {
  return Array.from(connectionManagers.keys());
}
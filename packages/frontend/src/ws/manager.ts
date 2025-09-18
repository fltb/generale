import { createSignal } from "solid-js";

/**
 * Types captured from your server-side definitions (simplified)
 */
export interface WSContextBase {
  userid: string;
  username?: string;
}

export type WebSocketMessage<T = unknown, Context extends WSContextBase = WSContextBase> =
  | { domain: string; type: "open"; payload: Context }
  | { domain: string; type: "close"; payload?: { code?: number; reason?: string } }
  | { domain: string; type: "message"; payload: T }
  | { domain: string; type: "reconnect"; payload?: unknown }
  // server-level control messages
  | { type: "connection_ack"; payload: { connectionId: string } }
  | { type: "reconnection_ack"; payload: { success: boolean; connectionId?: string } }
  | { type: "error"; payload: any };

/**
 * SubConnectorClient: client-side mirror of server SubConnectorImpl
 */
export class SubConnectorClient<CEvt = any, SEvt = any, Ctx extends WSContextBase = WSContextBase> {
  private openCallbacks: (() => void)[] = [];
  private closeCallbacks: ((code?: number, reason?: string) => void)[] = [];
  private disconnectCallbacks: ((err?: Error) => void)[] = [];
  private reconnectCallbacks: (() => void)[] = [];
  private messageCallbacks: ((payload: SEvt) => void)[] = [];

  private _ready = false;
  private _explicitlyClosed = false;
  private _closeInfo: { code?: number; reason?: string } | null = null;

  constructor(
    public readonly domain: string,
    public readonly context: Partial<Ctx>,
    private manager: ClientConnectionManager<Ctx>
  ) {}

  get ready() { return this._ready; }
  getConnectionId() { return this.manager.connectionId; }
  getContext() { return this.context as Ctx; }

  // lifecycle/callbacks registration
  onOpen(cb: () => void) { this.openCallbacks.push(cb); }
  onClose(cb: (code?: number, reason?: string) => void) { this.closeCallbacks.push(cb); }
  onDisconnect(cb: (err?: Error) => void) { this.disconnectCallbacks.push(cb); }
  onReconnect(cb: () => void) { this.reconnectCallbacks.push(cb); }
  onMessage(cb: (payload: SEvt) => void) { this.messageCallbacks.push(cb); }

  send(evt: CEvt) {
    if (!this._ready) return;
    this.manager.sendRaw({ domain: this.domain, type: "message", payload: evt });
  }

  close(code?: number, reason?: string) {
    this._explicitlyClosed = true;
    this._closeInfo = { code, reason };
    this.manager.sendRaw({ domain: this.domain, type: "close", payload: { code, reason } });
  }

  // internal triggers called by manager when receiving server-sent events
  _triggerOpen(ctx?: Partial<Ctx>) {
    this._ready = true;
    this._explicitlyClosed = false;
    if (ctx) Object.assign(this.context, ctx);
    this.openCallbacks.forEach(cb => cb());
  }
  _triggerClose(code?: number, reason?: string) {
    this._ready = false;
    this._explicitlyClosed = true;
    this._closeInfo = { code, reason };
    this.closeCallbacks.forEach(cb => cb(code, reason));
  }
  _triggerDisconnect(err?: Error) {
    this._ready = false;
    this.disconnectCallbacks.forEach(cb => cb(err));
  }
  _triggerReconnect() {
    this._ready = true;
    this._explicitlyClosed = false;
    this._closeInfo = null;
    this.reconnectCallbacks.forEach(cb => cb());
  }
  _triggerMessage(payload: SEvt) {
    this.messageCallbacks.forEach(cb => cb(payload));
  }
}

/**
 * ClientConnectionManager: manages one websocket connection and multiple sub-connectors.
 * It also handles reconnect & reattach using a connectionId.
 */
export class ClientConnectionManager<Ctx extends WSContextBase = WSContextBase> {
  private ws?: WebSocket | null;
  private url: string;
  private tokenGetter?: () => string | null | undefined;
  private reconnectAttempts = 0;
  private reconnectTimer?: number;
  private manualClose = false;

  public connectionId: string | null = null;
  public isConnected = false;

  private subConnectors = new Map<string, SubConnectorClient<any, any, Ctx>>();

  /** small reactive signal to allow UI to subscribe */
  public isConnectedSignal = createSignal(false);

  constructor(url: string, tokenGetter?: () => string | null | undefined) {
    this.url = url;
    this.tokenGetter = tokenGetter;
  }

  // Establish the websocket. If reconnectId provided, attempt reattach.
  connect(reattach = true) {
    this.manualClose = false;
    this._connectInternal(reattach);
  }

  private _connectInternal(reattach = true) {
    const token = this.tokenGetter ? this.tokenGetter() : undefined;
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (reattach && this.connectionId) params.set("reconnectId", this.connectionId);

    const wsUrl = `${this.url}?${params.toString()}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.onopen = () => {
      this.isConnected = true;
      this.isConnectedSignal[1](true);
      this.reconnectAttempts = 0;
      // nothing else — server will send connection_ack
    };
    this.ws.onmessage = (ev) => {
      try {
        const raw = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        this._handleIncoming(raw);
      } catch (e) {
        console.error("ws parse error", e);
      }
    };
    this.ws.onclose = (ev) => {
      this.isConnected = false;
      this.isConnectedSignal[1](false);
      // notify subconnectors of disconnect
      for (const sc of this.subConnectors.values()) sc._triggerDisconnect(new Error("socket closed"));
      if (!this.manualClose) this._scheduleReconnect();
    };
    this.ws.onerror = (err) => {
      console.error("ws error", err);
    };
  }

  private _scheduleReconnect() {
    const backoff = Math.min(30_000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this._connectInternal(true);
    }, backoff);
  }

  // close entire websocket and mark manual close
  close() {
    this.manualClose = true;
    if (this.ws) {
      this.ws.close();
    }
    this.ws = null;
    this.isConnected = false;
    this.isConnectedSignal[1](false);
  }

  // send out a raw object (encoded to JSON)
  sendRaw(obj: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify(obj)); } catch (e) { console.error("ws send error", e); }
    }
  }

  // create or get local subconnector (client-side)
  getOrCreateSub<CEvt = any, SEvt = any>(domain: string, ctx: Partial<Ctx> = {}) {
    let sub = this.subConnectors.get(domain) as SubConnectorClient<CEvt, SEvt, Ctx> | undefined;
    if (!sub) {
      sub = new SubConnectorClient<CEvt, SEvt, Ctx>(domain, ctx, this);
      this.subConnectors.set(domain, sub);
    }
    return sub;
  }

  // ask server to open a sub-domain
  openDomain(domain: string, ctx: Partial<Ctx> = {}) {
    const sub = this.getOrCreateSub(domain, ctx);
    // request server to open the суб-connector
    this.sendRaw({ domain, type: "open", payload: ctx });
    return sub;
  }

  closeDomain(domain: string, code?: number, reason?: string) {
    const sub = this.subConnectors.get(domain);
    if (sub) {
      sub._triggerClose(code, reason);
      // tell server
      this.sendRaw({ domain, type: "close", payload: { code, reason } });
      this.subConnectors.delete(domain);
    }
  }

  // route incoming server messages
  private _handleIncoming(msg: WebSocketMessage<any, Ctx>) {
    // connection ack
    if ((msg as any).type === "connection_ack") {
      const connectionId = (msg as any).payload?.connectionId;
      if (connectionId) this.connectionId = connectionId;
      return;
    }
    if ((msg as any).type === "reconnection_ack") {
      const payload = (msg as any).payload;
      if (payload?.success && payload.connectionId) this.connectionId = payload.connectionId;
      return;
    }

    // domain messages
    if ((msg as any).domain) {
      const domain = (msg as any).domain as string;
      const type = (msg as any).type as string;
      const payload = (msg as any).payload;
      // dispatch by type
      switch (type) {
        case "open": {
          // server opened subconnector; create if not exists
          const sub = this.getOrCreateSub(domain, payload as Partial<Ctx>);
          sub._triggerOpen(payload as Partial<Ctx>);
          break;
        }
        case "close": {
          const sub = this.subConnectors.get(domain);
          if (sub) {
            const code = payload?.code;
            const reason = payload?.reason;
            sub._triggerClose(code, reason);
            // we keep the sub object but mark closed
          }
          break;
        }
        case "reconnect": {
          const sub = this.subConnectors.get(domain);
          if (sub) {
            // server asks to reconnect domain: trigger reconnect and ack
            sub._triggerReconnect();
            this.sendRaw({ type: "reconnect_ack", domain, payload: { success: true } });
          }
          break;
        }
        case "message": {
          const sub = this.subConnectors.get(domain);
          if (sub) sub._triggerMessage(payload);
          break;
        }
        default:
          console.warn("Unknown domain message type", type);
      }
    } else {
      // unknown non-domain message
      console.warn("Unhandled non-domain message", msg);
    }
  }
}

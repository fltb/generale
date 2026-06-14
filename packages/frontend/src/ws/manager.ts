// src/ws/manager.ts
import { createSignal } from "solid-js";


export interface WSOpenPayloadBase {}

export type WebSocketMessage<T = unknown, Context extends WSOpenPayloadBase = WSOpenPayloadBase> =
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
export class SubConnectorClient<CEvt = any, SEvt = any, Ctx extends WSOpenPayloadBase = WSOpenPayloadBase> {
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
    private manager: ClientConnectionManager<Ctx>
  ) { }

  get ready() { return this._ready; }
  getConnectionId() { return this.manager.connectionId; }

  // lifecycle/callbacks registration
  onOpen(cb: () => void) { this.openCallbacks.push(cb); }
  onClose(cb: (code?: number, reason?: string) => void) { this.closeCallbacks.push(cb); }
  onDisconnect(cb: (err?: Error) => void) { this.disconnectCallbacks.push(cb); }
  onReconnect(cb: () => void) { this.reconnectCallbacks.push(cb); }
  onMessage(cb: (payload: SEvt) => void) {
    this.messageCallbacks.push(cb);
  }

  send(evt: CEvt) {
    if (!this._ready) return;
    this.manager.sendRaw({ domain: this.domain, type: "message", payload: evt });
  }

  close(code?: number, reason?: string) {
    this._explicitlyClosed = true;
    this._closeInfo = { code, reason };
    this.manager.sendRaw({ domain: this.domain, type: "close", payload: { code, reason } });
    // locally mark closed
    this._triggerClose(code, reason);
    // remove from manager map
    this.manager.deleteSub(this.domain);
  }

  // internal triggers called by manager when receiving server-sent events
  _triggerOpen() {
    this._ready = true;
    this._explicitlyClosed = false;
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
 *
 * NOTE: This implementation assumes session/auth is handled via httpOnly cookie.
 * It DOES NOT include session id/token in the WebSocket URL.
 */
export class ClientConnectionManager<OpenPayload extends WSOpenPayloadBase = WSOpenPayloadBase> {
  private ws?: WebSocket | null;
  private url: string;
  private reconnectAttempts = 0;
  private reconnectTimer?: number;
  private manualClose = false;
  private outbox: object[] = [];

  public connectionId: string | null = null;
  public isConnected = false;

  private subConnectors = new Map<string, SubConnectorClient<any, any, OpenPayload>>();

  /** domains we've asked the server to open but haven't yet received server 'open' ack */
  private pendingOpens = new Set<string>();
  private openPayloads = new Map<string, any>();

  /**
   * 每个 domain 的 open-ack 超时重试定时器。
   *
   * 修复进场竞态：openDomain 发出 open 后若服务端尚未就绪（如 GAME_STARTED 后 game
   * 实例还没建好），ack 不会回来，sub 永远 ready 不了 -> 卡在"同步中"，过去只能整页刷新
   * （刷新会触发 reconnection_ack -> _retryPendingOpens 重发 open）。这里给每个未 ack 的
   * open 加一个超时重发，等价于自动刷新那一次，不必整页刷新。
   */
  private openRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static readonly OPEN_RETRY_MS = 1500;
  private static readonly OPEN_RETRY_MAX = 6;

  /** small reactive signal to allow UI to subscribe */
  public isConnectedSignal = createSignal(false);

  constructor(url: string) {
    this.url = url;
  }

  // Establish the websocket. If reconnectId provided, attempt reattach using persisted connectionId.
  connect(reattach = true) {
    this.manualClose = false;
    this._connectInternal(reattach);
  }

  private _connectInternal(reattach = true) {
    this.manualClose = false;
    const params = new URLSearchParams();

    try {
      if (reattach && this.connectionId) params.set("reconnectId", this.connectionId);

      // robust URL construction (handles relative urls too)
      let u: URL;
      try {
        u = new URL(this.url);
      } catch (e) {
        u = new URL(this.url, `${location.protocol}//${location.host}`);
      }

      for (const [k, v] of params.entries()) u.searchParams.set(k, v);
      const wsUrl = u.toString();
      console.debug("[WS] connecting to", wsUrl);

      // create socket
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.debug("[WS] onopen readyState", this.ws?.readyState);
        this.isConnected = true;
        this.isConnectedSignal[1](true);
        this.reconnectAttempts = 0;

        // flush any queued messages
        this._flushOutbox();
      };

      this.ws.onmessage = (ev) => {
        try {
          const raw = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
          console.debug("[WS] onmessage raw:", raw);
          this._handleIncoming(raw);
        } catch (e) {
          console.error("ws parse error", e, "raw:", ev.data);
        }
      };

      this.ws.onclose = (ev) => {
        console.debug("[WS] onclose", ev);
        this.isConnected = false;
        this.isConnectedSignal[1](false);

        for (const sc of this.subConnectors.values()) sc._triggerDisconnect(new Error("socket closed"));

        // if the server sent an application-level auth-close, don't auto reconnect
        if (ev && ev.code === 4001) {
          console.warn("[WS] closed due to auth failure (4001). Will not attempt reconnect.");
          this.manualClose = true;
          try { window.dispatchEvent(new CustomEvent("ws:auth-failed")); } catch { }
          return;
        }

        if (!this.manualClose) this._scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error("[WS] websocket error event:", err);
      };
    } catch (err) {
      console.error("[WS] _connectInternal error:", err);
      this._scheduleReconnect();
    }
  }

  private _scheduleReconnect() {
    const backoff = Math.min(30_000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      console.debug("[WS] reconnect attempt", this.reconnectAttempts);
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
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify(obj);
        this.ws.send(payload);
        console.debug("[WS] sendRaw ->", obj);
      } else {
        console.warn("[WS] sendRaw: socket not open, enqueueing", obj);
        this.outbox.push(obj);
      }
    } catch (e) {
      console.error("ws send error", e, obj);
    }
  }

  private _flushOutbox() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.outbox.length > 0) {
      const obj = this.outbox.shift()!;
      try {
        this.ws.send(JSON.stringify(obj));
        console.debug("[WS] flushed outbox item ->", obj);
      } catch (e) {
        console.error("[WS] error flushing outbox item", e, obj);
        // 如果出错，把它放回队列并退出，稍后重试
        this.outbox.unshift(obj);
        break;
      }
    }
  }


  // create or get local subconnector (client-side)
  getOrCreateSub<CEvt = any, SEvt = any>(domain: string) {
    let sub = this.subConnectors.get(domain) as SubConnectorClient<CEvt, SEvt, OpenPayload> | undefined;
    if (!sub) {
      sub = new SubConnectorClient<CEvt, SEvt, OpenPayload>(domain, this);
      this.subConnectors.set(domain, sub);
      console.debug("[WS] getOrCreateSub: CREATED sub", domain, sub);
    } else {
      console.debug("[WS] getOrCreateSub: REUSE sub", domain, sub);
    }
    return sub;
  }

  // helper to delete a sub when closed by client
  deleteSub(domain: string) {
    this.subConnectors.delete(domain);
    this.pendingOpens.delete(domain);
    this._clearOpenRetry(domain);
  }

  // ask server to open a sub-domain
  openDomain(domain: string, payload: OpenPayload = {} as OpenPayload) {
    const sub = this.getOrCreateSub(domain);

    // If already pending, don't re-send
    if (this.pendingOpens.has(domain)) {
      console.debug('[WS] openDomain: already pending', domain);
      return sub;
    }

    // If sub exists and is already ready, nothing to do
    if (this.subConnectors.has(domain) && sub.ready) {
      console.debug('[WS] openDomain: sub already ready', domain);
      return sub;
    }

    // mark as pending and send open request
    this.pendingOpens.add(domain);
    this.openPayloads.set(domain, payload);
    this.sendRaw({ domain, type: "open", payload });
    console.debug("[WS] openDomain requested:", domain, payload);
    this._scheduleOpenRetry(domain, payload, 0);
    return sub;
  }

  /** 安排一次 open-ack 超时重试：到点仍未 ack（仍在 pendingOpens）就重发 open。 */
  private _scheduleOpenRetry(domain: string, ctx: Partial<OpenPayload>, attempt: number) {
    this._clearOpenRetry(domain);
    const timer = setTimeout(() => {
      this.openRetryTimers.delete(domain);
      // 已 ack（不在 pending）或已不再需要 -> 收手
      if (!this.pendingOpens.has(domain)) return;
      if (attempt >= ClientConnectionManager.OPEN_RETRY_MAX) {
        console.warn(`[WS] openDomain '${domain}' still not acked after ${attempt} retries; giving up`);
        return;
      }
      // socket 没连上就先不发（重连后 _retryPendingOpens 会兜底）
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const sub = this.subConnectors.get(domain);
        const c = sub ? this.openPayloads.get(domain) : ctx;
        console.warn(`[WS] openDomain '${domain}' not acked, resending (attempt ${attempt + 1})`);
        this.sendRaw({ domain, type: "open", payload: c });
      }
      this._scheduleOpenRetry(domain, ctx, attempt + 1);
    }, ClientConnectionManager.OPEN_RETRY_MS);
    this.openRetryTimers.set(domain, timer);
  }

  private _clearOpenRetry(domain: string) {
    const t = this.openRetryTimers.get(domain);
    if (t) {
      clearTimeout(t);
      this.openRetryTimers.delete(domain);
    }
  }

  closeDomain(domain: string, code?: number, reason?: string) {
    const sub = this.subConnectors.get(domain);
    if (sub) {
      sub._triggerClose(code, reason);
      // tell server
      this.sendRaw({ domain, type: "close", payload: { code, reason } });
      this.subConnectors.delete(domain);
      this.pendingOpens.delete(domain);
      this.openPayloads.delete(domain);
      this._clearOpenRetry(domain);
    }
  }

  // route incoming server messages
  private _handleIncoming(msg: WebSocketMessage<any, OpenPayload>) {
    // connection ack
    if (msg.type === "connection_ack") {
      const connectionId = msg.payload.connectionId;
      if (connectionId) {
        this.connectionId = connectionId;
        console.debug("[WS] received connection_ack:", connectionId);
      }
      // after connection ack, retry pending opens (if any)
      this._retryPendingOpens();
      return;
    }
    if (msg.type === "reconnection_ack") {
      const payload = msg.payload;
      if (payload?.success && payload.connectionId) {
        this.connectionId = payload.connectionId;
        console.debug("[WS] received reconnection_ack:", payload);
        // server has reattached our previous connection; retry opens just in case
        this._retryPendingOpens();
      } else {
        console.warn("[WS] reconnection_ack success=false, clearing saved connection id");
        this.connectionId = null;
      }
      return;
    }
    if (msg.type === "error") {
      console.error("[WS] received error:", msg.payload);
      return;
    }

    // domain messages
    if (msg.domain) {
      const domain = msg.domain;
      const type = msg.type;
      const payload = msg.payload;
      console.debug("[WS] domain got msg:", domain, type, payload);
      // dispatch by type
      switch (type) {
        case "open": {
          // server opened subconnector; create if not exists
          const sub = this.getOrCreateSub(domain);
          // remove from pending opens since server confirmed open
          this.pendingOpens.delete(domain);
          this._clearOpenRetry(domain);
          sub._triggerOpen();
          console.debug("[WS] domain open ack:", domain, payload);
          break;
        }
        case "close": {
          const sub = this.subConnectors.get(domain);
          if (sub) {
            const code = payload?.code;
            const reason = payload?.reason;
            sub._triggerClose(code, reason);
            this.deleteSub(domain);
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
        } default:
          console.warn("Unknown domain message type", type);
      }
    } else {
      // unknown non-domain message
      console.warn("Unhandled non-domain message", msg);
    }
  }

  // when connection ack/reconnect ack arrives, retry opens for domains we asked before
  private _retryPendingOpens() {
    if (!this.isConnected || !this.pendingOpens.size) return;
    for (const domain of Array.from(this.pendingOpens)) {
      const sub = this.subConnectors.get(domain);
      const ctx = sub ? this.openPayloads.get(domain) : {};
      console.debug("[WS] retrying open for pending domain:", domain);
      this.sendRaw({ domain, type: "open", payload: ctx });
      this._scheduleOpenRetry(domain, ctx as Partial<OpenPayload>, 0);
    }
  }
}

import type { ServerSyncConnector } from "@generale/types";
import { Elysia } from "elysia"; // FIX: Removed unused 't' import
import { profileService } from "../services/profileService";
import { sessionService } from "../services/sessionService";
import { userService } from "../services/userService";

function parseCookieHeader(cookieHeader?: string | null): Record<string, string> {
  const map: Record<string, string> = {};
  if (!cookieHeader) return map;
  cookieHeader.split(";").forEach((part) => {
    const [k, ...v] = part.split("=");
    if (!k) return;
    map[k.trim()] = decodeURIComponent((v || []).join("=").trim());
  });
  return map;
}

interface WsQueryLike {
  sid?: string;
  token?: string;
  reconnectId?: string;
}
interface WsDataLike {
  query?: WsQueryLike;
  request?: {
    headers?: {
      get?(name: string): string | null;
    };
  };
  headers?: { cookie?: string; "x-session-id"?: string; "x-sessionid"?: string; [k: string]: string | undefined };
}
interface WsDataShape extends WsDataLike {
  userId?: string;
  connectionId?: string;
  manager?: WebSocketConnectionManager<unknown, WSContextBase>;
}

/**
 * 从 ws（Elysia 提供的 ws.data）里尽可能多地提取 session id：
 * - 优先 query 参数 sid
 * - 兼容老的 token query 参数（保留，便于平滑迁移）
 * - 尝试从 request headers 的 cookie 中解析 sid
 * - 尝试读取 x-session-id header
 */
function extractSessionIdFromWsData(wsData: WsDataLike): string | undefined {
  try {
    const q: WsQueryLike = wsData?.query ?? {};
    if (q.sid) return q.sid;
    if (q.token) return q.token; // 兼容旧客户端短期保留

    // 优先从 request.headers.get (Elysia request-like object)
    const cookieHeader = wsData?.request?.headers?.get?.("cookie") ?? wsData?.headers?.cookie ?? null;
    if (cookieHeader) {
      const cookies = parseCookieHeader(cookieHeader);
      if (cookies["sid"]) return cookies["sid"];
    }

    // x-session-id header fallback
    const xSid =
      wsData?.request?.headers?.get?.("x-session-id") ??
      wsData?.headers?.["x-session-id"] ??
      wsData?.headers?.["x-sessionid"];
    if (xSid) return xSid as string;

    return undefined;
  } catch (_err) {
    // 若解析失败，返回 undefined
    return undefined;
  }
}

// =================================================================================
// 1. INTERFACES AND TYPE DEFINITIONS
// =================================================================================

export interface WSContextBase {
  userid: string; // always filled by backend
  username: string;
  /** 用户在 profile 表里设的昵称；UI 优先用它，缺省 fallback 到 username */
  displayName?: string;
  /** profile 缩略头像 URL；用于 PlayerList 等小尺寸场景 */
  avatarThumbUrl?: string;
  /** 房间密码（客户端 open payload 中传入，用于加入有密码的房间） */
  password?: string;
}

export type WebSocketMessage<T = unknown, Context extends WSContextBase = WSContextBase> =
  | { domain: string; type: "open"; payload: Context }
  | { domain: string; type: "close"; payload?: { code?: number; reason?: string } }
  | { domain: string; type: "message"; payload: T }
  | { domain: string; type: "reconnect"; payload?: unknown };

export interface SubConnector<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase>
  extends ServerSyncConnector<CEvt, SEvt> {
  readonly domain: string;
  readonly context: Ctx;
  getConnectionId(): string;
  getContext(): Ctx;
}

export type DomainHandler<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase> = (
  connector: SubConnector<CEvt, SEvt, Ctx>,
) => void;

const domainHandlers = new Map<string, DomainHandler<unknown, unknown, WSContextBase>>();

export { domainHandlers };

export function registerDomainHandler<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase>(
  domain: string,
  handler: DomainHandler<CEvt, SEvt, Ctx>,
): void {
  if (domainHandlers.has(domain)) {
    console.warn(`Domain handler for '${domain}' already exists, overwriting`);
  }
  domainHandlers.set(domain, handler as DomainHandler<unknown, unknown, WSContextBase>);
}

export function unregisterDomainHandler(domain: string): void {
  domainHandlers.delete(domain);
}

// =================================================================================
// 2. CORE IMPLEMENTATION CLASSES
// =================================================================================

export class SubConnectorImpl<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase>
  implements SubConnector<CEvt, SEvt, Ctx>
{
  private _ready = true;
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
    private connectionManager: WebSocketConnectionManager<unknown, WSContextBase>,
  ) {}

  get ready(): boolean {
    return this._ready;
  }
  public isExplicitlyClosed(): boolean {
    return this._explicitlyClosed;
  }
  public getCloseInfo(): { code?: number; reason?: string } | null {
    return this._closeInfo;
  }
  public getConnectionId(): string {
    return this.connectionManager.getConnectionId();
  }
  public getContext(): Ctx {
    return this.context as Ctx;
  }

  public _updateTransport(newManager: WebSocketConnectionManager<unknown, WSContextBase>) {
    this.connectionManager = newManager;
  }

  send(evt: SEvt): void {
    if (this._ready && this.connectionManager.isConnected) {
      this.connectionManager.sendRaw({ domain: this.domain, type: "message", payload: evt });
    }
  }

  close(code?: number, reason?: string): void {
    this.connectionManager.closeSubConnector(this.domain, code, reason);
  }

  onOpen(cb: () => void): void {
    this.openCallbacks.push(cb);
  }
  onClose(cb: (code: number, reason: string) => void): void {
    this.closeCallbacks.push(cb);
  }
  onDisconnect(cb: (err?: Error) => void): void {
    this.disconnectCallbacks.push(cb);
  }
  onReconnect(cb: () => void): void {
    this.reconnectCallbacks.push(cb);
  }
  onClientMessage(cb: (evt: CEvt) => void): void {
    this.messageCallbacks.push(cb);
  }

  _triggerOpen(): void {
    this.openCallbacks.forEach((cb) => {
      cb();
    });
  }

  _triggerClose(code?: number, reason?: string): void {
    this._ready = false;
    this._explicitlyClosed = true;

    const info: { code?: number; reason?: string } = {};
    if (code !== undefined) info.code = code;
    if (reason !== undefined) info.reason = reason;
    this._closeInfo = info;

    this.closeCallbacks.forEach((cb) => {
      cb(code ?? 1000, reason ?? "Normal Closure");
    });
  }
  _triggerDisconnect(err?: Error): void {
    this._ready = false;
    this.disconnectCallbacks.forEach((cb) => {
      cb(err);
    });
  }
  _triggerReconnect(): void {
    this._ready = true;
    this._explicitlyClosed = false;
    this._closeInfo = null;
    this.reconnectCallbacks.forEach((cb) => {
      cb();
    });
  }
  _triggerMessage(payload: CEvt): void {
    this.messageCallbacks.forEach((cb) => {
      cb(payload);
    });
  }
}

interface RawElysiaWs {
  send(data: unknown, compress?: boolean): number;
  close(code?: number, reason?: string): void;
  data?: Record<string, unknown>;
}

class WebSocketConnectionManager<T = unknown, Context extends WSContextBase = WSContextBase> {
  context: Context = {} as Context;
  private ws: RawElysiaWs | null = null;
  private subConnectors = new Map<string, SubConnectorImpl<unknown, unknown, WSContextBase>>();
  private connectionId: string;
  public isConnected = false;

  constructor(ws: RawElysiaWs, connectionId: string) {
    this.ws = ws;
    this.connectionId = connectionId;
    this.isConnected = true;
  }

  setContext(ctx: Partial<Context>) {
    this.context = { ...this.context, ...ctx };
    if (this.ws?.data) {
      (this.ws.data as Record<string, unknown>)["context"] = this.context;
    }
  }

  getContext(): Context {
    return this.context;
  }

  handleMessage(message: WebSocketMessage<T, Context>) {
    const { domain, type, payload } = message;
    console.debug(`recv event type ${type} to domain ${domain}`);
    switch (type) {
      case "open":
        this.openSubConnector(domain, payload as Partial<Context>);
        break;
      case "close": {
        let code: number | undefined;
        let reason: string | undefined;
        if (typeof payload === "object" && payload !== null) {
          code = (payload as Record<string, unknown>)["code"] as number | undefined;
          reason = (payload as Record<string, unknown>)["reason"] as string | undefined;
        }
        this.closeSubConnector(domain, code, reason);
        break;
      }
      case "reconnect":
        this.reconnectSubConnector(domain);
        break;
      case "message":
        this.routeMessage(domain, payload as T);
        break;
      default:
        console.warn(`Unknown message type: ${type}`);
        this.ws?.send(JSON.stringify({ type: "error", payload: { error: "Unknown message type" } }));
    }
  }

  openSubConnector(domain: string, context: Partial<Context>): boolean {
    const existing = this.subConnectors.get(domain);
    if (existing) {
      if (!existing.isExplicitlyClosed()) {
        // domain 已打开且活跃：幂等地重发一次 open ack。
        // 修复进场卡死：客户端可能因竞态/重连漏收了上一次 ack（sub 没标 ready），
        // 于是不断重发 open，而旧逻辑直接 return false 不回 ack -> 永远卡住、只能整页刷新。
        // 这里重发 ack 让客户端恢复 ready，随后它发 sync_request 即可取到当前快照。
        this.sendRaw({ domain, type: "open", payload: existing.getContext() });
        return true;
      }
      // 之前被显式 close 过的残留条目（closeSubConnector 没从 map 删除）。
      // 丢弃旧的，下面按全新 open 重建（GameWithSync unmount->remount / 路由切换会触发）。
      this.subConnectors.delete(domain);
    }
    const handler = domainHandlers.get(domain);
    if (!handler) return false;

    const safeContext = {
      ...context,
      ...this.context, // fill by backend
    } as Context;

    const subConnector = new SubConnectorImpl(domain, safeContext, this);
    this.subConnectors.set(domain, subConnector);

    handler(subConnector);
    subConnector._triggerOpen();

    // <-- NEW: notify the client that the domain was opened
    // This sends a message the client-side ClientConnectionManager understands:
    // { domain, type: 'open', payload: Context }
    this.sendRaw({ domain, type: "open", payload: safeContext });

    return true;
  }

  closeSubConnector(domain: string, code?: number, reason?: string): boolean {
    const subConnector = this.subConnectors.get(domain);
    if (!subConnector) {
      return false;
    }
    subConnector._triggerClose(code, reason);
    this.sendRaw({ type: "close", domain, payload: { code, reason } });
    return true;
  }

  reconnectSubConnector(domain: string): boolean {
    const subConnector = this.subConnectors.get(domain);
    if (!subConnector) {
      return false;
    }
    if (subConnector.isExplicitlyClosed()) {
      this.sendRaw({ domain: domain, type: "close", payload: subConnector.getCloseInfo() });
      return false;
    }
    subConnector._triggerReconnect();
    this.sendRaw({ type: "reconnect_ack", domain, payload: { success: true } });
    return true;
  }

  routeMessage(domain: string, payload: T): boolean {
    const subConnector = this.subConnectors.get(domain);
    if (!subConnector?.ready) {
      return false;
    }
    subConnector._triggerMessage(payload);
    return true;
  }

  handleClose() {
    this.isConnected = false;
    this.ws = null;
    for (const [, subConnector] of this.subConnectors) {
      subConnector._triggerDisconnect();
    }
  }

  reattach(newWs: RawElysiaWs) {
    this.ws = newWs;
    this.isConnected = true;
    for (const [, subConnector] of this.subConnectors) {
      // FIX: Call updated `_updateTransport` method
      subConnector._updateTransport(this);
    }
  }

  getConnectionId(): string {
    return this.connectionId;
  }

  sendRaw(message: object): void {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(message));
    }
  }
}

// =================================================================================
// 3. GLOBAL STATE & MULTI-DEVICE BROADCAST/SENDING LOGIC
// =================================================================================

const connectionManagers = new Map<string, WebSocketConnectionManager<unknown, WSContextBase>>();
const userConnections = new Map<string, Set<string>>();

interface CustomWsData {
  userId: string;
  connectionId: string;
  manager: WebSocketConnectionManager<unknown, WSContextBase>;
}

export function sendMessageToUser(userId: string, message: WebSocketMessage): void {
  const connectionIds = userConnections.get(userId);
  if (!connectionIds || connectionIds.size === 0) {
    return;
  }
  for (const connectionId of connectionIds) {
    const manager = connectionManagers.get(connectionId);
    if (manager?.isConnected) {
      manager.sendRaw(message);
    }
  }
}

export function sendMessageToConnection(connectionId: string, message: WebSocketMessage): boolean {
  const manager = connectionManagers.get(connectionId);
  if (manager?.isConnected) {
    manager.sendRaw(message);
    return true;
  }
  return false;
}

// =================================================================================
// 4. ELYSIA WEBSOCKET PLUGIN
// =================================================================================

export const websocketPlugin = new Elysia().ws("/ws", {
  async open(ws) {
    const wsData = ws.data as unknown as WsDataShape;

    // 尝试提取 session id（优先 sid query）
    const sessionId = extractSessionIdFromWsData(wsData);
    const reconnectId = wsData.query?.reconnectId;

    // 校验 session
    const session = sessionId ? sessionService.get(sessionId) : undefined;
    if (!session) {
      ws.close(4001, "Authentication failed: invalid or missing session");
      return;
    }

    // session 有效，取出 userId
    const userId = session.userId;

    // 拉 username + profile 信息（displayName / avatarThumbUrl），后续 domain handler
    // 通过 connector.context 直接读，避免每次 addPlayer 都跑 DB。
    // 任一失败都不阻塞连接，缺字段时 UI 会 fallback 到默认值。
    let username: string | undefined;
    let displayName: string | undefined;
    let avatarThumbUrl: string | undefined;
    try {
      const user = await userService.findById(userId);
      username = user?.username;
    } catch (err) {
      console.warn("Failed to fetch username for websocket session:", err);
    }
    try {
      const profile = await profileService.getProfile(userId);
      displayName = profile?.displayName ?? undefined;
      avatarThumbUrl = profile?.avatarThumbUrl ?? undefined;
    } catch (err) {
      console.warn("Failed to fetch profile for websocket session:", err);
    }

    // 填充 ws.data
    wsData.userId = userId;

    let manager: WebSocketConnectionManager | undefined;
    let connectionId: string;

    // reconnectId 场景：如果客户端传递 reconnectId 且对应 manager 存在且处于断线状态 -> 复连
    manager = reconnectId ? connectionManagers.get(reconnectId as string) : undefined;
    if (manager && !manager.isConnected) {
      manager.reattach(ws);
      connectionId = reconnectId as string;
      wsData.connectionId = connectionId;
      wsData.manager = manager;

      // 使用 session info 填充 manager context（保持最新）
      manager.setContext({
        userid: userId,
        username: username || "no-name",
        ...(displayName ? { displayName } : {}),
        ...(avatarThumbUrl ? { avatarThumbUrl } : {}),
      });
      ws.send({ type: "reconnection_ack", payload: { success: true, connectionId } });
    } else {
      // 新连接
      connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      wsData.connectionId = connectionId;
      manager = new WebSocketConnectionManager(ws, connectionId);
      wsData.manager = manager;
      connectionManagers.set(connectionId, manager);

      manager.setContext({
        userid: userId,
        username: username || "no-name",
        ...(displayName ? { displayName } : {}),
        ...(avatarThumbUrl ? { avatarThumbUrl } : {}),
      });
      ws.send({ type: "connection_ack", payload: { connectionId } });
    }

    // 将 connectionId 注册到 userConnections（multi-device 支持）
    if (!userConnections.has(userId)) {
      userConnections.set(userId, new Set());
    }
    userConnections.get(userId)?.add(connectionId);
    console.log(
      `[OPEN] User '${userId}' connected. Total connections: ${userConnections.get(userId)?.size}. (Conn ID: ${connectionId})`,
    );
  },

  message(ws, message) {
    try {
      // FIX: Use a two-step assertion to satisfy strict type checking
      const { manager } = ws.data as unknown as CustomWsData;
      if (!manager) {
        console.warn("manager not found in ws data");
        return;
      }
      const parsedMessage = typeof message === "object" ? message : JSON.parse(message as string);
      console.log("parseedMessage", parsedMessage);
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
      if (manager) {
        manager.handleClose();
      }
    }

    if (userId && connectionId) {
      const userConnSet = userConnections.get(userId);
      if (userConnSet) {
        userConnSet.delete(connectionId);
        if (userConnSet.size === 0) {
          userConnections.delete(userId);
        }
        console.log(
          `[CLOSE] User '${userId}' disconnected. Remaining connections: ${userConnSet.size}. (Conn ID: ${connectionId})`,
        );
      }
    }
  },

  error(context: { ws?: { data?: { connectionId?: string } }; data?: { connectionId?: string }; error?: unknown }) {
    const connectionId = (context.ws || context)?.data?.connectionId;
    console.error(`WebSocket error for connection ${connectionId}:`, context.error);
  },
});

// =================================================================================
// 5. DEBUGGING & UTILITY FUNCTIONS
// =================================================================================

/**
 * 关掉某 userId 当前所有活跃的 WS 连接（含其上挂的所有 sub-connector）。
 *
 * 用于：
 *  - /login 走"last-login-wins"反重复登录策略：踢旧端
 *  - /logout 主动断旧连接，避免 sub-connector 残留
 *  - /change-password 改密后撤销所有 WS（让其它端立刻掉线）
 *
 * 返回被关掉的连接数。
 *
 * 注意：这里只关 WS（连带各 sub-connector 的 onClose 链路触发 RoomInstance /
 * GameInstance 的清理）。session 表的删除由 sessionService 单独处理，两者解耦。
 */
export function closeAllConnectionsForUser(userId: string, code = 4001, reason = "session-revoked"): number {
  const connIds = userConnections.get(userId);
  if (!connIds || connIds.size === 0) return 0;
  let closed = 0;
  // 拷贝一份避免在迭代中改集合（onClose 会从 userConnections 里 delete）
  for (const cid of Array.from(connIds)) {
    const manager = connectionManagers.get(cid);
    if (manager?.isConnected) {
      try {
        (manager as unknown as { ws: RawElysiaWs }).ws?.close(code, reason);
        closed++;
      } catch (err) {
        console.warn(`[closeAllConnectionsForUser] close failed for ${cid}`, err);
      }
    }
  }
  console.log(`[closeAllConnectionsForUser] userId=${userId} closed=${closed}`);
  return closed;
}

export function getConnectionManager(connectionId: string): WebSocketConnectionManager | undefined {
  return connectionManagers.get(connectionId);
}

export function getAllConnections(): string[] {
  return Array.from(connectionManagers.keys());
}

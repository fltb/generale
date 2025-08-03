import { Elysia } from "elysia";
import type { ServerSyncConnector } from '@generale/types/src/connection/conn-type';

/**
 * WebSocket connection manager that handles sub-connectors
 * 纯粹的消息路由器，不包含业务逻辑
 */
interface WSContextBase {
  userid: string;
  username: string;
};

/**
 * WebSocket message structure for sub-connector communication
 */
export type WebSocketMessage<T = unknown, Context extends WSContextBase = WSContextBase> =
  | { domain: string; type: "open"; payload: Context }
  | { domain: string; type: "close"; payload?: { code?: number; reason?: string } }
  | { domain: string; type: "message"; payload: T };

/**
 * Sub-connector interface for domain-specific communication
 * 扩展支持生命周期事件注册和 context 访问
 */
export interface SubConnector<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase> extends ServerSyncConnector<CEvt, SEvt> {
  /** 当前子连接所属域名（如 pregame/game/chat） */
  readonly domain: string;
  /** 连接上下文，通常包含 playerId/gameId 等 */
  readonly context: Ctx;
}

/**
 * Domain handler interface - 单回调函数接收完整的 SubConnector 实例
 */
export type DomainHandler<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase> = (connector: SubConnector<CEvt, SEvt, Ctx>) => void;

/**
 * 全局域名处理器注册表
 */
const domainHandlers = new Map<string, DomainHandler<any, any, any>>();
export { domainHandlers };

/**
 * 注册域名处理器
 */
export function registerDomainHandler<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase>(domain: string, handler: DomainHandler<CEvt, SEvt, Ctx>): void {
  if (domainHandlers.has(domain)) {
    console.warn(`Domain handler for '${domain}' already exists, overwriting`);
  }
  domainHandlers.set(domain, handler);
  console.log(`Registered domain handler for: ${domain}`);
}

/**
 * 注销域名处理器
 */
export function unregisterDomainHandler(domain: string): void {
  domainHandlers.delete(domain);
  console.log(`Unregistered domain handler for: ${domain}`);
}

/**
 * SubConnector 实现类，支持生命周期事件注册
 */
export class SubConnectorImpl<CEvt = unknown, SEvt = unknown, Ctx extends WSContextBase = WSContextBase> implements SubConnector<CEvt, SEvt, Ctx> {
  private _ready: boolean = true;
  private openCallbacks: (() => void)[] = [];
  private closeCallbacks: ((code: number, reason: string) => void)[] = [];
  private disconnectCallbacks: ((err?: Error) => void)[] = [];
  private reconnectCallbacks: (() => void)[] = [];
  private messageCallbacks: ((payload: CEvt) => void)[] = [];

  constructor(
    public readonly domain: string,
    public readonly context: Ctx,
    private ws: any,
    private connectionManager: WebSocketConnectionManager<any, any>
  ) {}

  get ready(): boolean {
    return this._ready;
  }

  send(evt: SEvt): void {
    if (this._ready && this.connectionManager.isConnected) {
      this.ws.send(JSON.stringify({
        domain: this.domain,
        type: 'message',
        payload: evt
      }));
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

  // 内部方法，由 WebSocketConnectionManager 调用
  _triggerOpen(): void {
    this.openCallbacks.forEach(cb => cb());
  }

  _triggerClose(code?: number, reason?: string): void {
    this._ready = false;
    this.closeCallbacks.forEach(cb => cb(code ?? 1000, reason ?? 'Normal Closure'));
  }

  _triggerDisconnect(err?: Error): void {
    this.disconnectCallbacks.forEach(cb => cb(err));
  }

  _triggerReconnect(): void {
    this._ready = true;
    this.reconnectCallbacks.forEach(cb => cb());
  }

  _triggerMessage(payload: CEvt): void {
    this.messageCallbacks.forEach(cb => cb(payload));
  }
}

class WebSocketConnectionManager<T = unknown, Context extends WSContextBase = WSContextBase> {
  /**
   * 连接上下文信息（如 userId, gameId, domain 等）
   */
  context: Context = {} as Context;

  /**
   * 设置/合并 context 内容
   */
  setContext(ctx: Partial<Context>) {
    this.context = { ...this.context, ...ctx };
    // 可选：同步到 ws.data.context
    if (this.ws && this.ws.data) {
      this.ws.data.context = this.context;
    }
  }

  /**
   * 获取 context
   */
  getContext(): Context {
    return this.context;
  }

  private ws: any;
  private subConnectors = new Map<string, SubConnectorImpl<T, Context>>();
  private connectionId: string;
  public isConnected = false;

  constructor(ws: any, connectionId: string) {
    this.ws = ws;
    this.connectionId = connectionId;
    this.isConnected = true;
  }

  /**
   * Handle incoming WebSocket messages and route to appropriate sub-connector
   */
  handleMessage(message: WebSocketMessage<T, Context>) {
    const { domain, type, payload } = message;

    switch (type) {
      case "open":
        // open: payload 视为 config 类型（C）
        this.openSubConnector(domain, payload);
        break;
      case "close": {
        // close: payload 需为 { code?: number, reason?: string }
        let code: number | undefined;
        let reason: string | undefined;
        if (typeof payload === 'object' && payload !== null) {
          code = payload.code;
          reason = payload.reason;
        }
        this.closeSubConnector(domain, code, reason);
        break;
      }
      case "message":
        // message: payload 视为 T
        this.routeMessage(domain, payload);
        break;
      default:
        console.warn(`Unknown message type: ${type}`);
        this.ws.send(JSON.stringify({
          type: 'error',
          payload: { error: 'Unknown message type' }
        }));
    }
  }

  /**
   * Open a sub-connector for a specific domain
   */
  openSubConnector(domain: string, context: Context): boolean {
    // 域名判重
    if (this.subConnectors.has(domain)) {
      console.warn(`Sub-connector for domain '${domain}' already exists`);
      this.ws.send(JSON.stringify({
        type: 'open_ack',
        domain,
        payload: { success: false, error: 'Domain already exists' }
      }));
      return false;
    }

    // 检查域名处理器是否存在
    const handler = domainHandlers.get(domain);
    if (!handler) {
      console.warn(`No handler registered for domain: ${domain}`);
      this.ws.send(JSON.stringify({
        type: 'open_ack',
        domain,
        payload: { success: false, error: 'Domain handler not found' }
      }));
      return false;
    }

    // 创建 SubConnectorImpl 实例
    const subConnector = new SubConnectorImpl<T, Context>(
      domain,
      context,
      this.ws,
      this
    );

    this.subConnectors.set(domain, subConnector);

    // 调用域名处理器（新的单回调接口）
    handler(subConnector);

    // 触发 onOpen 事件
    subConnector._triggerOpen();

    // Send acknowledgment to client
    this.ws.send(JSON.stringify({
      type: 'open_ack',
      domain,
      payload: { success: true, config: context }
    }));

    console.log(`Sub-connector opened for domain: ${domain}`);
    return true;
  }

  /**
   * Close a sub-connector for a specific domain
   */
  closeSubConnector(domain: string, code?: number, reason?: string): boolean {
    const subConnector = this.subConnectors.get(domain);
    if (!subConnector) {
      console.warn(`Sub-connector for domain '${domain}' not found`);
      this.ws.send(JSON.stringify({
        type: 'close_ack',
        domain,
        payload: { success: false, error: 'Domain not found' }
      }));
      return false;
    }

    // 触发 onClose 事件
    subConnector._triggerClose(code, reason);

    this.subConnectors.delete(domain);

    // Send confirmation back to client
    this.ws.send(JSON.stringify({
      type: 'close_ack',
      domain,
      payload: { success: true, code, reason }
    }));

    console.log(`Sub-connector closed for domain: ${domain}`);
    return true;
  }

  /**
   * Route message to appropriate sub-connector
   */
  routeMessage(domain: string, payload: T): boolean {
    const subConnector = this.subConnectors.get(domain);
    if (!subConnector) {
      console.warn(`Sub-connector for domain '${domain}' not found`);
      this.ws.send(JSON.stringify({
        type: 'error',
        domain,
        payload: { error: 'Domain not found' }
      }));
      return false;
    }

    if (!subConnector.ready) {
      console.warn(`Sub-connector for domain '${domain}' is not ready`);
      this.ws.send(JSON.stringify({
        type: 'error',
        domain,
        payload: { error: 'Domain not ready' }
      }));
      return false;
    }

    // 触发 onMessage 事件
    subConnector._triggerMessage(payload);

    return true;
  }

  /**
   * Handle WebSocket connection close
   */
  handleClose() {
    this.isConnected = false;
    
    // 触发所有 sub-connector 的 onDisconnect 事件
    for (const [, subConnector] of this.subConnectors) {
      subConnector._triggerDisconnect();
    }

    // 清理所有sub-connectors
    this.subConnectors.clear();

    console.log(`WebSocket connection closed for connection: ${this.connectionId}`);
  }

  /**
   * Handle WebSocket reconnection
   */
  handleReconnect() {
    this.isConnected = true;
    
    // 触发所有 sub-connector 的 onReconnect 事件
    for (const [, subConnector] of this.subConnectors) {
      subConnector._triggerReconnect();
    }

    console.log(`WebSocket reconnected for connection: ${this.connectionId}`);
  }

  /**
   * Get sub-connector for a specific domain
   */
  getSubConnector(domain: string): SubConnectorImpl<T, Context> | undefined {
    return this.subConnectors.get(domain);
  }

  /**
   * Get all active sub-connectors
   */
  getAllSubConnectors(): Map<string, SubConnectorImpl<T, Context>> {
    return new Map(this.subConnectors);
  }

  /**
   * Get connection ID
   */
  getConnectionId(): string {
    return this.connectionId;
  }
}

// Store connection managers by connection ID
const connectionManagers = new Map<string, WebSocketConnectionManager>();

/**
 * 通过 connectionId 获取 context（如 userId, gameId, domain 等）
 */
export function getContextByConnectionId(connectionId: string): Record<string, any> | undefined {
  const manager = connectionManagers.get(connectionId);
  return manager?.getContext();
}

// 插件导出
export const websocketPlugin = new Elysia()
  .ws("/ws", {
    message(ws, message) {
      try {
        const connectionId = (ws as any).data?.connectionId || (ws as any).id;
        const manager = connectionManagers.get(connectionId);
        
        if (!manager) {
          console.error(`Connection manager not found for ID: ${connectionId}`);
          console.log('Available managers:', Array.from(connectionManagers.keys()));
          ws.send(JSON.stringify({
            type: "error",
            payload: { message: "Connection manager not found" }
          }));
          return;
        }

        const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
        manager.handleMessage(parsedMessage);
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({
          type: "error",
          payload: { message: "Invalid message format" }
        }));
      }
    },
    
    open(ws) {
      // 使用Elysia内部的连接ID，如果没有则生成一个
      const elysiaId = (ws as any).id;
      const connectionId = elysiaId || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 确保数据对象存在
      (ws as any).data = (ws as any).data || {};
      (ws as any).data.connectionId = connectionId;
      
      const manager = new WebSocketConnectionManager(ws, connectionId);
      
      // 使用Elysia的ID作为键，同时也存储我们生成的ID
      connectionManagers.set(connectionId, manager);
      if (elysiaId && elysiaId !== connectionId) {
        connectionManagers.set(elysiaId, manager);
      }
      
      console.log(`WebSocket connection opened: ${connectionId} (Elysia ID: ${elysiaId})`);
      
      // Send connection acknowledgment
      ws.send(JSON.stringify({
        type: "connection_ack",
        payload: { connectionId }
      }));
    },
    
    close(ws) {
      const connectionId = (ws as any).data?.connectionId;
      const elysiaId = (ws as any).id;
      
      if (connectionId) {
        const manager = connectionManagers.get(connectionId);
        if (manager) {
          manager.handleClose();
          connectionManagers.delete(connectionId);
          // 同时清理Elysia ID的映射
          if (elysiaId && elysiaId !== connectionId) {
            connectionManagers.delete(elysiaId);
          }
        }
        console.log(`WebSocket connection closed: ${connectionId} (Elysia ID: ${elysiaId})`);
      }
    },
    
    error(context: any) {
      const ws = context.ws || context;
      const error = context.error || context;
      const connectionId = ws?.data?.connectionId;
      console.error(`WebSocket error for connection ${connectionId}:`, error);
    }
  });

/**
 * 获取连接管理器（用于测试或调试）
 */
export function getConnectionManager(connectionId: string): WebSocketConnectionManager | undefined {
  return connectionManagers.get(connectionId);
}

/**
 * 获取所有活跃连接（用于测试或调试）
 */
export function getAllConnections(): string[] {
  return Array.from(connectionManagers.keys());
}

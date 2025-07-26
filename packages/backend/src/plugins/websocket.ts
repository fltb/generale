import { Elysia } from "elysia";

/**
 * WebSocket message structure for sub-connector communication
 */
interface WebSocketMessage {
  domain: string; // e.g., "game", "chat", "pregame"
  type: "open" | "close" | "message";
  payload?: any;
}

/**
 * Domain handler interface - 上层业务逻辑需要实现这个接口
 */
export interface DomainHandler {
  onOpen?: (connectionId: string, config?: any) => void;
  onClose?: (connectionId: string, code?: number, reason?: string) => void;
  onMessage?: (connectionId: string, payload: any) => any; // 可以返回响应数据
  onDisconnect?: (connectionId: string, err?: Error) => void;
  onReconnect?: (connectionId: string) => void;
}

/**
 * Sub-connector interface for domain-specific communication
 */
interface SubConnector {
  domain: string;
  ready: boolean;
  send: (payload: any) => void;
  close: (code?: number, reason?: string) => void;
}

/**
 * 全局域名处理器注册表
 */
const domainHandlers = new Map<string, DomainHandler>();

/**
 * 注册域名处理器
 */
export function registerDomainHandler(domain: string, handler: DomainHandler): void {
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
 * WebSocket connection manager that handles sub-connectors
 * 纯粹的消息路由器，不包含业务逻辑
 */
class WebSocketConnectionManager {
  private ws: any;
  private subConnectors = new Map<string, SubConnector>();
  private connectionId: string;
  private isConnected = false;

  constructor(ws: any, connectionId: string) {
    this.ws = ws;
    this.connectionId = connectionId;
    this.isConnected = true;
  }

  /**
   * Handle incoming WebSocket messages and route to appropriate sub-connector
   */
  handleMessage(message: WebSocketMessage) {
    const { domain, type, payload } = message;

    switch (type) {
      case "open":
        this.openSubConnector(domain, payload);
        break;
      case "close":
        this.closeSubConnector(domain, payload?.code, payload?.reason);
        break;
      case "message":
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
  openSubConnector(domain: string, config?: any): boolean {
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

    const subConnector: SubConnector = {
      domain,
      ready: true,
      send: (payload: any) => {
        if (this.isConnected) {
          this.ws.send(JSON.stringify({
            domain,
            type: 'message',
            payload
          }));
        }
      },
      close: (code?: number, reason?: string) => {
        this.closeSubConnector(domain, code, reason);
      }
    };

    this.subConnectors.set(domain, subConnector);

    // 通知域名处理器
    if (handler.onOpen) {
      handler.onOpen(this.connectionId, config);
    }

    // Send acknowledgment to client
    this.ws.send(JSON.stringify({
      type: 'open_ack',
      domain,
      payload: { success: true, config }
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

    subConnector.ready = false;
    
    // 通知域名处理器
    const handler = domainHandlers.get(domain);
    if (handler && handler.onClose) {
      handler.onClose(this.connectionId, code, reason);
    }

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
  routeMessage(domain: string, payload: any): boolean {
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

    // 通知域名处理器处理消息
    const handler = domainHandlers.get(domain);
    if (handler && handler.onMessage) {
      const response = handler.onMessage(this.connectionId, payload);
      
      // 如果处理器返回了响应，发送回客户端
      if (response) {
        this.ws.send(JSON.stringify({
          type: 'domain_message',
          domain,
          payload: response
        }));
      }
    }

    return true;
  }

  /**
   * Handle WebSocket connection close
   */
  handleClose() {
    this.isConnected = false;
    
    // 通知所有域名处理器连接断开
    for (const [domain] of this.subConnectors) {
      const handler = domainHandlers.get(domain);
      if (handler && handler.onDisconnect) {
        handler.onDisconnect(this.connectionId);
      }
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
    
    // 通知所有域名处理器重连
    for (const [domain] of this.subConnectors) {
      const handler = domainHandlers.get(domain);
      if (handler && handler.onReconnect) {
        handler.onReconnect(this.connectionId);
      }
    }

    console.log(`WebSocket reconnected for connection: ${this.connectionId}`);
  }

  /**
   * Get sub-connector for a specific domain
   */
  getSubConnector(domain: string): SubConnector | undefined {
    return this.subConnectors.get(domain);
  }

  /**
   * Get all active sub-connectors
   */
  getAllSubConnectors(): Map<string, SubConnector> {
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

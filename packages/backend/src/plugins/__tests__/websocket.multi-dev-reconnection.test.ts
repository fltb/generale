import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainHandlers, registerDomainHandler, type WebSocketMessage } from "../websocket"; // Adjust the import path as necessary

// Mock SubConnector for testing domain logic
class MockSubConnector {
  public _ready = true;
  public _explicitlyClosed = false;
  private openCallbacks: (() => unknown)[] = [];
  private closeCallbacks: ((code?: number, reason?: string) => void)[] = [];
  private disconnectCallbacks: ((err?: Error) => void)[] = [];
  private reconnectCallbacks: (() => void)[] = [];
  private messageCallbacks: ((payload: unknown) => unknown)[] = [];

  constructor(
    public readonly domain: string,
    public readonly context: Record<string, unknown>,
    private manager: MockConnectionManager,
  ) {}

  get ready(): boolean {
    return this._ready;
  }
  getContext = () => this.context;
  getConnectionId = () => this.manager.connectionId;
  send = (payload: unknown) => this.manager.sendRaw({ domain: this.domain, type: "message", payload });
  close = (code?: number, reason?: string) => this.manager.closeSubConnector(this.domain, code, reason);

  onOpen = (cb: () => unknown): void => { this.openCallbacks.push(cb); };
  onClose = (cb: (code?: number, reason?: string) => void): void => { this.closeCallbacks.push(cb); };
  onDisconnect = (cb: (err?: Error) => void): void => { this.disconnectCallbacks.push(cb); };
  onReconnect = (cb: () => void): void => { this.reconnectCallbacks.push(cb); };
  onClientMessage = (cb: (payload: unknown) => unknown): void => { this.messageCallbacks.push(cb); };

  triggerOpen = () =>
    this.openCallbacks.forEach((cb) => {
      cb();
    });
  triggerClose = (code?: number, reason?: string) => {
    this._ready = false;
    this._explicitlyClosed = true;
    this.closeCallbacks.forEach((cb) => {
      cb(code, reason);
    });
  };
  triggerMessage = (payload: unknown) =>
    this.messageCallbacks.forEach((cb) => {
      cb(payload);
    });
  triggerDisconnect = () => {
    this._ready = false;
    this.disconnectCallbacks.forEach((cb) => {
      cb();
    });
  };
  triggerReconnect = () => {
    this._ready = true;
    this._explicitlyClosed = false;
    this.reconnectCallbacks.forEach((cb) => {
      cb();
    });
  };
}

// Mock ConnectionManager to simulate behavior of the real class
class MockConnectionManager {
  public isConnected = true;
  private subConnectors = new Map<string, MockSubConnector>();
  public sendRaw = vi.fn();

  constructor(
    public readonly connectionId: string,
    public readonly userId: string,
  ) {}

  openSubConnector(domain: string, context: Record<string, unknown>) {
    const handler = domainHandlers.get(domain);
    if (!handler) return;
    const sub = new MockSubConnector(domain, { ...context, userId: this.userId }, this);
    this.subConnectors.set(domain, sub);
    (handler as unknown as (conn: MockSubConnector) => void)(sub);
    sub.triggerOpen();
  }

  reconnectSubConnector(domain: string) {
    const sub = this.subConnectors.get(domain);
    if (!sub) return;
    if (sub._explicitlyClosed) {
      this.sendRaw({ domain, type: "close", payload: { code: 1000, reason: "Closed" } });
    } else {
      sub.triggerReconnect();
    }
  }

  closeSubConnector(domain: string, code?: number, reason?: string) {
    this.subConnectors.get(domain)?.triggerClose(code, reason);
  }

  handleDisconnect() {
    this.isConnected = false;
    this.subConnectors.forEach((sub) => sub.triggerDisconnect());
  }

  // This method only restores the main connection's state
  // and does not affect the state of its children.
  handleReconnect() {
    this.isConnected = true;
    // DO NOT call triggerReconnect on sub-connectors here.
  }

  getSubConnector(domain: string) {
    return this.subConnectors.get(domain);
  }
}

// Mock Server to manage global state
class MockServer {
  public connectionManagers = new Map<string, MockConnectionManager>();
  public userConnections = new Map<string, Set<string>>();

  connect(userId: string, existingConnectionId?: string): MockConnectionManager {
    if (existingConnectionId) {
      const oldManager = this.connectionManagers.get(existingConnectionId);
      if (oldManager && !oldManager.isConnected) {
        oldManager.handleReconnect();
        return oldManager;
      }
    }

    const connectionId = `conn_${Math.random()}`;
    const manager = new MockConnectionManager(connectionId, userId);
    this.connectionManagers.set(connectionId, manager);
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set());
    }
    this.userConnections.get(userId)?.add(connectionId);
    return manager;
  }

  disconnect(connectionId: string) {
    const manager = this.connectionManagers.get(connectionId);
    if (!manager) return;
    manager.handleDisconnect();
    // In a real scenario, we might not remove the user's connection immediately
    // to allow for reconnection. For this test, we assume a simplified model
    // where the user connection mapping is cleaned up but the manager state is preserved.
    const userConnSet = this.userConnections.get(manager.userId);
    if (userConnSet) {
      userConnSet.delete(connectionId);
    }
  }

  sendMessageToUser(userId: string, message: WebSocketMessage) {
    const connIds = this.userConnections.get(userId);
    if (!connIds) return;
    for (const connId of connIds) {
      this.connectionManagers.get(connId)?.sendRaw(message);
    }
  }

  sendMessageToConnection(connectionId: string, message: WebSocketMessage) {
    this.connectionManagers.get(connectionId)?.sendRaw(message);
  }
}

// =================== 测试用例 ===================

describe("新增功能测试 (Reconnect, Multi-Device)", () => {
  let server: MockServer;

  beforeEach(() => {
    server = new MockServer();
    vi.clearAllMocks();
    // Ensure domain handlers are clean before each test
    domainHandlers.clear();
  });

  describe("会话保持与断线重连", () => {
    it("物理断线后，会话和子连接应被保留并标记为断开", () => {
      const conn = server.connect("user-1");
      const onDisconnect = vi.fn();
      registerDomainHandler("game", (c) => c.onDisconnect(onDisconnect));
      conn.openSubConnector("game", { gameId: "g1" });

      server.disconnect(conn.connectionId);

      expect(conn.isConnected).toBe(false);
      expect(onDisconnect).toHaveBeenCalledTimes(1);
      expect(server.connectionManagers.has(conn.connectionId)).toBe(true);
    });

    it("使用旧 connectionId 重连应能恢复会话", () => {
      const conn1 = server.connect("user-1");
      registerDomainHandler("game", () => {});
      conn1.openSubConnector("game", { gameId: "g1" });
      const oldConnectionId = conn1.connectionId;
      server.disconnect(oldConnectionId);

      const conn2 = server.connect("user-1", oldConnectionId);

      expect(conn2).toBe(conn1);
      expect(conn2.isConnected).toBe(true);
    });

    // =================== 新增测试用例 ===================
    it("断线重连后，客户端应能成功恢复未主动关闭的子连接", () => {
      // 1. 设置
      const onReconnect = vi.fn();
      const onDisconnect = vi.fn();
      registerDomainHandler("game", (c) => {
        c.onDisconnect(onDisconnect);
        c.onReconnect(onReconnect);
      });
      const conn = server.connect("user-1");
      conn.openSubConnector("game", { gameId: "g1" });
      const sub = conn.getSubConnector("game")!;

      // 2. 模拟断线
      server.disconnect(conn.connectionId);
      expect(onDisconnect).toHaveBeenCalledTimes(1);
      expect(conn.isConnected).toBe(false);
      expect(sub.ready).toBe(false);

      // 3. 模拟会话重连
      server.connect("user-1", conn.connectionId);
      expect(conn.isConnected).toBe(true);

      // 4. 客户端发起子连接的重连请求
      conn.reconnectSubConnector("game");

      // 5. 断言结果
      expect(onReconnect).toHaveBeenCalledTimes(1);
      expect(sub.ready).toBe(true);
      expect(sub._explicitlyClosed).toBe(false);
    });
    // =======================================================

    it("主动关闭的子连接在会话重连后，应拒绝重连请求", () => {
      const conn = server.connect("user-1");
      registerDomainHandler("game", () => {});
      conn.openSubConnector("game", { gameId: "g1" });

      conn.closeSubConnector("game", 1000, "Game Over");
      const sub = conn.getSubConnector("game")!;
      expect(sub._explicitlyClosed).toBe(true);

      server.disconnect(conn.connectionId);
      server.connect("user-1", conn.connectionId);
      expect(conn.isConnected).toBe(true);

      conn.reconnectSubConnector("game");

      expect(conn.sendRaw).toHaveBeenCalledWith({
        domain: "game",
        type: "close",
        payload: { code: 1000, reason: "Closed" },
      });
    });
  });

  describe("多用户与多设备支持", () => {
    it("一个用户可以建立多个连接", () => {
      const connA1 = server.connect("user-A");
      const connA2 = server.connect("user-A");

      expect(connA1.connectionId).not.toBe(connA2.connectionId);
      expect(server.userConnections.get("user-A")?.size).toBe(2);
      expect(server.userConnections.get("user-A")).toContain(connA1.connectionId);
      expect(server.userConnections.get("user-A")).toContain(connA2.connectionId);
    });

    it("sendMessageToUser 应向用户所有活动连接广播消息", () => {
      const connA1 = server.connect("user-A");
      const connA2 = server.connect("user-A");
      const connB1 = server.connect("user-B");

      const message: WebSocketMessage = { domain: "notifications", type: "message", payload: "Hi User A!" };
      server.sendMessageToUser("user-A", message);

      expect(connA1.sendRaw).toHaveBeenCalledWith(message);
      expect(connA2.sendRaw).toHaveBeenCalledWith(message);
      expect(connB1.sendRaw).not.toHaveBeenCalled();
    });

    it("sendMessageToUser 不应向已断开的连接发送消息", () => {
      const connA1 = server.connect("user-A");
      const connA2 = server.connect("user-A");

      server.disconnect(connA2.connectionId);

      const message: WebSocketMessage = { domain: "notifications", type: "message", payload: "Hi again!" };
      server.sendMessageToUser("user-A", message);

      expect(connA1.sendRaw).toHaveBeenCalledWith(message);
      expect(connA2.sendRaw).not.toHaveBeenCalled();
    });

    it("sendMessageToConnection 应只向指定连接发送消息", () => {
      const connA1 = server.connect("user-A");
      const connA2 = server.connect("user-A");

      const message: WebSocketMessage = { domain: "private", type: "message", payload: "This is just for you" };
      server.sendMessageToConnection(connA2.connectionId, message);

      expect(connA1.sendRaw).not.toHaveBeenCalled();
      expect(connA2.sendRaw).toHaveBeenCalledWith(message);
    });
  });
});

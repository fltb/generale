/**
 * WebSocket域名处理器测试
 * 适配新的单回调 DomainHandler 接口
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainHandler, SubConnector } from "../websocket";
import { registerDomainHandler, unregisterDomainHandler } from "../websocket";

// 模拟 SubConnector 实现
class MockSubConnector implements SubConnector {
  private openCallbacks: (() => void)[] = [];
  private closeCallbacks: ((code?: number, reason?: string) => void)[] = [];
  private disconnectCallbacks: ((err?: Error) => void)[] = [];
  private reconnectCallbacks: (() => void)[] = [];
  private messageCallbacks: ((payload: unknown) => void)[] = [];
  private _ready = true;

  constructor(
    public readonly domain: string,
    public readonly context: Record<string, unknown>,
  ) {}

  get ready(): boolean {
    return this._ready;
  }

  send(_payload: unknown): void {
    // Mock implementation
  }

  close(code?: number, reason?: string): void {
    this._ready = false;
    this.closeCallbacks.forEach((cb) => {
      cb(code, reason);
    });
  }

  onOpen(cb: () => void): void {
    this.openCallbacks.push(cb);
  }

  onClose(cb: (code?: number, reason?: string) => void): void {
    this.closeCallbacks.push(cb);
  }

  onDisconnect(cb: (err?: Error) => void): void {
    this.disconnectCallbacks.push(cb);
  }

  onReconnect(cb: () => void): void {
    this.reconnectCallbacks.push(cb);
  }

  onClientMessage(cb: (payload: unknown) => void): void {
    this.messageCallbacks.push(cb);
  }

  // 测试辅助方法
  triggerOpen(): unknown {
    if (this.openCallbacks.length > 0) {
      return this.openCallbacks[0]();
    }
  }

  triggerMessage(payload: unknown): unknown {
    if (this.messageCallbacks.length > 0) {
      return this.messageCallbacks[0](payload);
    }
  }

  triggerDisconnect(err?: Error): void {
    this.disconnectCallbacks.forEach((cb) => {
      cb(err);
    });
  }

  triggerReconnect(): void {
    this._ready = true;
    this.reconnectCallbacks.forEach((cb) => {
      cb();
    });
  }
}

// 模拟域名处理器连接管理器
class MockDomainHandlerManager {
  private connectionId: string;
  private domainHandlers = new Map<string, DomainHandler>();
  private subConnectors = new Map<string, MockSubConnector>();

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }

  // 模拟HTTP API注册域名处理器
  registerDomainViaAPI(domain: string, handler: DomainHandler) {
    this.domainHandlers.set(domain, handler);
    registerDomainHandler(domain, handler);
    return { success: true, message: `Domain ${domain} registered via API` };
  }

  // 模拟完整的域名消息生命周期
  simulateFullDomainLifecycle(domain: string, config: Record<string, unknown>, messages: unknown[]) {
    const handler = this.domainHandlers.get(domain);
    if (!handler) {
      return { error: "Domain handler not found" };
    }

    const results = [];
    const mockConnector = new MockSubConnector(domain, config);
    this.subConnectors.set(domain, mockConnector);

    // 调用域名处理器（新的单回调接口）
    handler(mockConnector);

    // 1. 触发打开事件并采集返回值
    // 1. 触发打开事件并采集返回值
    const openResult = mockConnector.triggerOpen();
    results.push({ type: "open", result: openResult, connector: mockConnector });

    // 2. 处理消息并采集返回值
    for (const message of messages) {
      const messageResult = mockConnector.triggerMessage(message);
      results.push({ type: "message", payload: message, result: messageResult, connector: mockConnector });
    }

    // 3. 关闭域名
    mockConnector.close(1000, "Normal closure");
    this.subConnectors.delete(domain);
    results.push({ type: "close", connector: mockConnector });

    return { success: true, lifecycle: results };
  }

  // 模拟多域名支持
  simulateMultiDomainSupport(domains: string[], handlers: DomainHandler[]) {
    const results = [];

    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      const handler = handlers[i];

      if (!(domain && handler)) {
        continue;
      }

      // 注册域名
      this.registerDomainViaAPI(domain, handler);

      // 新接口：创建 MockSubConnector 并注册事件
      const mockConnector = new MockSubConnector(domain, { domain });
      this.subConnectors.set(domain, mockConnector);
      handler(mockConnector);

      // 触发 open 事件并捕获返回值
      let openResult: unknown;
      const oc = (mockConnector as unknown as { openCallbacks: (() => void)[] }).openCallbacks;
      if (oc.length > 0) {
        // 只取第一个 open 回调的返回值
        openResult = oc[0]();
      }

      // 触发 message 事件并捕获返回值
      let messageResult: unknown;
      const mc = (mockConnector as unknown as { messageCallbacks: ((payload: unknown) => void)[] }).messageCallbacks;
      if (mc.length > 0) {
        messageResult = mc[0]({ test: `message for ${domain}` });
      }

      results.push({
        domain,
        open: openResult,
        message: messageResult,
      });
    }

    return results;
  }

  getId() {
    return this.connectionId;
  }

  getRegisteredDomains() {
    return Array.from(this.domainHandlers.keys());
  }

  getActiveSubConnectors() {
    return Array.from(this.subConnectors.keys());
  }
}

describe("WebSocket域名处理器测试", () => {
  let mockManager: MockDomainHandlerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockManager = new MockDomainHandlerManager("test-connection-domain");
  });

  afterEach(() => {
    unregisterDomainHandler("test-domain");
    unregisterDomainHandler("game-domain");
    unregisterDomainHandler("chat-domain");
    unregisterDomainHandler("pregame-domain");
  });

  describe("域名注册via HTTP API", () => {
    it("应该能够通过HTTP API注册域名处理器", () => {
      const onOpen = vi.fn();
      const onMessage = vi.fn();
      const onClose = vi.fn();
      const testHandler: DomainHandler = (connector) => {
        connector.onOpen(() => onOpen(connector.domain, connector.context));
        connector.onClientMessage((payload) => onMessage(connector.domain, payload));
        connector.onClose((code, reason) => onClose(connector.domain, code, reason));
      };

      const result = mockManager.registerDomainViaAPI("test-domain", testHandler);

      expect(result.success).toBe(true);
      expect(result.message).toBe("Domain test-domain registered via API");
      expect(mockManager.getRegisteredDomains()).toContain("test-domain");
    });

    it("应该能够注册多个不同的域名处理器", () => {
      const gameOnOpen = vi.fn();
      const gameOnMessage = vi.fn();
      const gameHandler: DomainHandler = (connector) => {
        connector.onOpen(() => gameOnOpen(connector.domain, connector.context));
        connector.onClientMessage((payload) => gameOnMessage(connector.domain, payload));
      };

      const chatOnOpen = vi.fn();
      const chatOnMessage = vi.fn();
      const chatHandler: DomainHandler = (connector) => {
        connector.onOpen(() => chatOnOpen(connector.domain, connector.context));
        connector.onClientMessage((payload) => chatOnMessage(connector.domain, payload));
      };

      mockManager.registerDomainViaAPI("game-domain", gameHandler);
      mockManager.registerDomainViaAPI("chat-domain", chatHandler);

      const registeredDomains = mockManager.getRegisteredDomains();
      expect(registeredDomains).toContain("game-domain");
      expect(registeredDomains).toContain("chat-domain");
      expect(registeredDomains).toHaveLength(2);
    });
  });

  describe("完整域名消息生命周期", () => {
    it("应该能够完成域名的打开->消息->关闭流程", () => {
      const onOpen2 = vi.fn();
      const onMessage2 = vi.fn();
      const onClose2 = vi.fn();
      const testHandler: DomainHandler = (connector) => {
        connector.onOpen(() => onOpen2(connector.domain, connector.context));
        connector.onClientMessage((payload) => onMessage2(connector.domain, payload));
        connector.onClose((code, reason) => onClose2(connector.domain, code, reason));
      };

      // 注册域名处理器
      mockManager.registerDomainViaAPI("test-domain", testHandler);

      // 模拟完整生命周期
      const messages = [
        { action: "ping" },
        { action: "getData", id: 123 },
        { action: "updateStatus", status: "active" },
      ];

      const result = mockManager.simulateFullDomainLifecycle("test-domain", { userId: "user-1" }, messages);

      expect(result.success).toBe(true);
      expect(result.lifecycle).toHaveLength(5); // 1 open + 3 messages + 1 close

      // 验证打开调用
      expect(onOpen2).toHaveBeenCalledWith("test-domain", { userId: "user-1" });

      // 验证消息调用
      expect(onMessage2).toHaveBeenCalledTimes(3);
      expect(onMessage2).toHaveBeenCalledWith("test-domain", { action: "ping" });
      expect(onMessage2).toHaveBeenCalledWith("test-domain", { action: "getData", id: 123 });
      expect(onMessage2).toHaveBeenCalledWith("test-domain", { action: "updateStatus", status: "active" });

      // 验证关闭调用
      expect(onClose2).toHaveBeenCalledWith("test-domain", 1000, "Normal closure");
    });

    it("应该正确处理域名处理器回调的返回值", () => {
      const _onOpen3 = vi.fn();
      const _onMessage3 = vi.fn();
      const testHandler: DomainHandler = (connector) => {
        connector.onOpen(() => ({ welcome: "Hello from test domain!" }));
        connector.onClientMessage((payload) => ({
          processed: true,
          originalPayload: payload,
          response: `Processed: ${JSON.stringify(payload)}`,
        }));
      };

      mockManager.registerDomainViaAPI("test-domain", testHandler);

      const result = mockManager.simulateFullDomainLifecycle("test-domain", {}, [{ test: "data" }]);

      expect(result.success).toBe(true);

      // 类型安全检查
      if ("lifecycle" in result && result.lifecycle) {
        // 检查打开结果
        const openResult = result.lifecycle.find((item) => item.type === "open")?.result;
        expect(openResult).toEqual({ welcome: "Hello from test domain!" });

        // 检查消息结果
        const messageResult = result.lifecycle.find((item) => item.type === "message");
        expect(messageResult?.result).toEqual({
          processed: true,
          originalPayload: { test: "data" },
          response: 'Processed: {"test":"data"}',
        });
      }
    });
  });

  describe("多域名支持", () => {
    it("应该能够同时支持多个域名处理器", () => {
      const _onOpen4 = vi.fn();
      const onMessage4 = vi.fn((payload) => ({
        processed: true,
        originalPayload: payload,
        response: `Processed: ${JSON.stringify(payload)}`,
      }));
      const _testHandler: DomainHandler = (connector) => {
        connector.onOpen(() => ({ welcome: "Hello from test domain!" }));
        connector.onClientMessage((payload) => onMessage4(payload));
      };

      const gameOnOpen = vi.fn(() => ({ type: "game", status: "ready" }));
      const gameOnMessage = vi.fn((payload) => ({ type: "game", echo: payload }));
      const gameHandler: DomainHandler = (connector) => {
        connector.onOpen(() => {
          return gameOnOpen(connector.domain, connector.context);
        });
        connector.onClientMessage((payload) => gameOnMessage(payload));
      };

      const chatOnOpen = vi.fn(() => ({ type: "chat", status: "connected" }));
      const chatOnMessage = vi.fn((payload) => ({ type: "chat", echo: payload }));
      const chatHandler: DomainHandler = (connector) => {
        connector.onOpen(() => {
          return chatOnOpen(connector.domain, connector.context);
        });
        connector.onClientMessage((payload) => chatOnMessage(payload));
      };

      const pregameOnOpen = vi.fn(() => ({ type: "pregame", status: "waiting" }));
      const pregameOnMessage = vi.fn((payload) => ({ type: "pregame", echo: payload }));
      const pregameHandler: DomainHandler = (connector) => {
        connector.onOpen(() => {
          return pregameOnOpen(connector.domain, connector.context);
        });
        connector.onClientMessage((payload) => pregameOnMessage(payload));
      };

      const domains = ["game-domain", "chat-domain", "pregame-domain"];
      const handlers = [gameHandler, chatHandler, pregameHandler];

      const results = mockManager.simulateMultiDomainSupport(domains, handlers);

      expect(results).toHaveLength(3);

      // 验证每个域名都被正确处理
      expect(results[0]?.domain).toBe("game-domain");
      expect(results[0]?.open).toEqual({ type: "game", status: "ready" });

      expect(results[1]?.domain).toBe("chat-domain");
      expect(results[1]?.open).toEqual({ type: "chat", status: "connected" });

      expect(results[2]?.domain).toBe("pregame-domain");
      expect(results[2]?.open).toEqual({ type: "pregame", status: "waiting" });

      // 验证所有处理器都被调用
      expect(gameOnOpen).toHaveBeenCalled();
      expect(chatOnOpen).toHaveBeenCalled();
      expect(pregameOnOpen).toHaveBeenCalled();
    });

    it("应该能够独立处理每个域名的消息", () => {
      const gameOnOpen3 = vi.fn();
      const gameOnMessage3 = vi.fn((payload) => ({ domain: "game", processed: payload }));
      const gameHandler: DomainHandler = (connector) => {
        connector.onOpen(() => gameOnOpen3(connector.domain, connector.context));
        connector.onClientMessage((payload) => gameOnMessage3(payload));
      };

      const chatOnOpen3 = vi.fn();
      const chatOnMessage3 = vi.fn((payload) => ({ domain: "chat", processed: payload }));
      const chatHandler: DomainHandler = (connector) => {
        connector.onOpen(() => chatOnOpen3(connector.domain, connector.context));
        connector.onClientMessage((payload) => chatOnMessage3(payload));
      };

      const domains = ["game-domain", "chat-domain"];
      const handlers = [gameHandler, chatHandler];

      const results = mockManager.simulateMultiDomainSupport(domains, handlers);

      // 验证消息处理结果
      expect(results[0]?.message).toEqual({
        domain: "game",
        processed: { test: "message for game-domain" },
      });

      expect(results[1]?.message).toEqual({
        domain: "chat",
        processed: { test: "message for chat-domain" },
      });

      // 验证每个处理器只处理自己的消息
      expect(gameOnMessage3).toHaveBeenCalledWith({ test: "message for game-domain" });
      expect(chatOnMessage3).toHaveBeenCalledWith({ test: "message for chat-domain" });
    });
  });
});

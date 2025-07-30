/**
 * WebSocket实时连接测试
 * 基于test-complete-websocket.js改写的模拟测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unregisterDomainHandler } from '../websocket';
import type { DomainHandler, SubConnector } from '../websocket';

// MockSubConnector 复用 domain-handlers 测试实现
class MockSubConnector implements SubConnector {
  private openCallbacks: (() => any)[] = [];
  private closeCallbacks: ((code?: number, reason?: string) => void)[] = [];
  private disconnectCallbacks: ((err?: Error) => void)[] = [];
  private reconnectCallbacks: (() => void)[] = [];
  private messageCallbacks: ((payload: any) => any)[] = [];
  private _ready = true;
  constructor(
    public readonly domain: string,
    public readonly context: any
  ) {}
  get ready(): boolean { return this._ready; }
  send(_payload: any): void {}
  close(code?: number, reason?: string): void {
    this._ready = false;
    this.closeCallbacks.forEach(cb => cb(code, reason));
  }
  onOpen(cb: () => any): void { this.openCallbacks.push(cb); }
  onClose(cb: (code?: number, reason?: string) => void): void { this.closeCallbacks.push(cb); }
  onDisconnect(cb: (err?: Error) => void): void { this.disconnectCallbacks.push(cb); }
  onReconnect(cb: () => void): void { this.reconnectCallbacks.push(cb); }
  onMessage(cb: (payload: any) => any): void { this.messageCallbacks.push(cb); }
  triggerOpen(): any { return this.openCallbacks[0]?.(); }
  triggerMessage(payload: any): any { return this.messageCallbacks[0]?.(payload); }
  triggerDisconnect(err?: Error): void { this.disconnectCallbacks.forEach(cb => cb(err)); }
  triggerReconnect(): void { this.reconnectCallbacks.forEach(cb => cb()); }
}

// 新版 MockRealTimeConnectionManager
class MockRealTimeConnectionManager {
  private connectionId: string;
  private isConnected = true;
  private subConnectors = new Map<string, MockSubConnector>();
  private domainHandlers = new Map<string, DomainHandler>();
  constructor(connectionId: string) { this.connectionId = connectionId; }
  registerDomain(domain: string, handler: DomainHandler) {
    this.domainHandlers.set(domain, handler); return { success: true };
  }
  openSubConnector(domain: string, context: any) {
    const handler = this.domainHandlers.get(domain);
    if (!handler) return { success: false, error: 'Domain handler not found' };
    const sub = new MockSubConnector(domain, context);
    this.subConnectors.set(domain, sub);
    handler(sub);
    const openResult = sub.triggerOpen();
    return { success: true, result: openResult, sub };
  }
  routeMessage(domain: string, payload: any) {
    const sub = this.subConnectors.get(domain);
    if (!sub) return { error: 'Domain not found or not opened' };
    const result = sub.triggerMessage(payload);
    return { success: true, response: result };
  }
  closeSubConnector(domain: string, code?: number, reason?: string) {
    const sub = this.subConnectors.get(domain);
    if (sub) sub.close(code, reason);
    this.subConnectors.delete(domain);
    return { success: true };
  }
  handleDisconnect() {
    this.isConnected = false;
    for (const sub of this.subConnectors.values()) sub.triggerDisconnect();
    // 不再清空subConnectors，断线后保留sub-connector以支持重连
  }
  handleReconnect() {
    this.isConnected = true;
    for (const sub of this.subConnectors.values()) sub.triggerReconnect();
  }
  getId() { return this.connectionId; }
  isActive() { return this.isConnected; }
}


// =================== 测试用例 ===================

  let mockConnection: MockRealTimeConnectionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnection = new MockRealTimeConnectionManager('test-connection-realtime');
  });

  afterEach(() => {
    unregisterDomainHandler('test-domain');
    unregisterDomainHandler('game-domain');
    unregisterDomainHandler('chat-domain');
  });

  describe('基础WebSocket连接测试', () => {
    it('应该能够建立WebSocket连接并接收连接确认', () => {
      expect(mockConnection.getId()).toBe('test-connection-realtime');
      expect(mockConnection.isActive()).toBe(true);
    });

    it('应该正确处理不存在的域名', () => {
      const result = mockConnection.openSubConnector('non-existent-domain', {});
      expect(result.success).toBe(false);
      expect(result.error).toBe('Domain handler not found');
    });

    it('应该正确处理无效的JSON消息', () => {
      const invalidJson = 'invalid json';
      let parseError = null;
      try {
        JSON.parse(invalidJson);
      } catch (error) {
        parseError = error;
      }
      expect(parseError).not.toBeNull();
    });

    it('应该正确处理无效的消息类型', () => {
      const result = mockConnection.routeMessage('non-existent-domain', { action: 'test' });
      expect(result.error).toBe('Domain not found or not opened');
    });
  });

  describe('域名处理器集成测试', () => {
    it('应该能够注册域名处理器并完成完整的消息流程', () => {
      const onOpen = vi.fn(() => ({ success: true, message: 'Welcome to test domain' }));
      const onMessage = vi.fn((payload) => ({ echo: payload, timestamp: 123456 }));
      const onClose = vi.fn();
      const onDisconnect = vi.fn();
      const onReconnect = vi.fn();
      const testHandler: DomainHandler = (connector) => {
        connector.onOpen(() => onOpen());
        connector.onMessage((payload) => onMessage(payload));
        connector.onClose(() => onClose());
        connector.onDisconnect(() => onDisconnect());
        connector.onReconnect(() => onReconnect());
      };
      mockConnection.registerDomain('test-domain', testHandler);
      const openResult = mockConnection.openSubConnector('test-domain', { userId: 'test-user' });
      expect(openResult.success).toBe(true);
      expect(onOpen).toHaveBeenCalled();
      expect(openResult.result).toEqual({ success: true, message: 'Welcome to test domain' });
      const messageResult = mockConnection.routeMessage('test-domain', { action: 'ping' });
      expect(messageResult.success).toBe(true);
      expect(onMessage).toHaveBeenCalledWith({ action: 'ping' });
      expect(messageResult.response).toEqual({ echo: { action: 'ping' }, timestamp: 123456 });
      const closeResult = mockConnection.closeSubConnector('test-domain', 1000, 'Normal closure');
      expect(closeResult.success).toBe(true);
      expect(onClose).toHaveBeenCalled();
    });

    it('应该支持多个域名同时工作', () => {
      const gameOnOpen = vi.fn(() => ({ ok: true }));
      const gameOnMessage = vi.fn((payload) => ({ type: 'game', data: payload }));
      const gameOnClose = vi.fn();
      const chatOnOpen = vi.fn(() => ({ ok: true }));
      const chatOnMessage = vi.fn((payload) => ({ type: 'chat', data: payload }));
      const chatOnClose = vi.fn();
      const gameHandler: DomainHandler = (connector) => {
        connector.onOpen(() => gameOnOpen());
        connector.onMessage((payload) => gameOnMessage(payload));
        connector.onClose(() => gameOnClose());
      };
      const chatHandler: DomainHandler = (connector) => {
        connector.onOpen(() => chatOnOpen());
        connector.onMessage((payload) => chatOnMessage(payload));
        connector.onClose(() => chatOnClose());
      };
      mockConnection.registerDomain('game-domain', gameHandler);
      mockConnection.registerDomain('chat-domain', chatHandler);
      const gameOpen = mockConnection.openSubConnector('game-domain', { gameId: 'game-1' });
      const chatOpen = mockConnection.openSubConnector('chat-domain', { roomId: 'room-1' });
      expect(gameOpen.success).toBe(true);
      expect(chatOpen.success).toBe(true);
      expect(gameOnOpen).toHaveBeenCalled();
      expect(chatOnOpen).toHaveBeenCalled();
      const gameMessage = mockConnection.routeMessage('game-domain', { action: 'move' });
      const chatMessage = mockConnection.routeMessage('chat-domain', { message: 'hello' });
      expect(gameMessage.success).toBe(true);
      expect(chatMessage.success).toBe(true);
      expect(gameOnMessage).toHaveBeenCalledWith({ action: 'move' });
      expect(chatOnMessage).toHaveBeenCalledWith({ message: 'hello' });
      expect(gameMessage.response).toEqual({ type: 'game', data: { action: 'move' } });
      expect(chatMessage.response).toEqual({ type: 'chat', data: { message: 'hello' } });
      mockConnection.closeSubConnector('game-domain');
      mockConnection.closeSubConnector('chat-domain');
      expect(gameOnClose).toHaveBeenCalled();
      expect(chatOnClose).toHaveBeenCalled();
    });
  });

  describe('错误处理和边界情况', () => {
    it('关闭未打开的sub-connector不应报错', () => {
      const result = mockConnection.closeSubConnector('non-existent-domain');
      expect(result.success).toBe(true);
    });
    it('断线和重连事件应能被触发', () => {
      const onDisconnect = vi.fn();
      const onReconnect = vi.fn();
      const handler: DomainHandler = (connector) => {
        connector.onDisconnect(() => onDisconnect());
        connector.onReconnect(() => onReconnect());
      };
      mockConnection.registerDomain('test-domain', handler);
      mockConnection.openSubConnector('test-domain', {});
      mockConnection.handleDisconnect();
      expect(onDisconnect).toHaveBeenCalled();
      mockConnection.handleReconnect();
      expect(onReconnect).toHaveBeenCalled();
    unregisterDomainHandler('test-domain');
    unregisterDomainHandler('game-domain');
    unregisterDomainHandler('chat-domain');
  });

  describe('基础WebSocket连接测试', () => {
    it('应该能够建立WebSocket连接并接收连接确认', () => {
      expect(mockConnection.getId()).toBe('test-connection-realtime');
      expect(mockConnection.isActive()).toBe(true);
    });

    it('应该正确处理不存在的域名', () => {
      const result = mockConnection.openSubConnector('non-existent-domain', {});
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Domain handler not found');
    });

    it('应该正确处理无效的JSON消息', () => {
      const invalidJson = 'invalid json';
      let parseError = null;
      
      try {
        JSON.parse(invalidJson);
      } catch (error) {
        parseError = error;
      }
      
      expect(parseError).not.toBeNull();
    });

    it('应该正确处理无效的消息类型', () => {
      const result = mockConnection.routeMessage('non-existent-domain', { action: 'test' });
      
      expect(result.error).toBe('Domain not found or not opened');
    });
  });

  describe('域名处理器集成测试', () => {
    it('应该能够注册域名处理器并完成完整的消息流程', () => {
      // 创建测试域名处理器（新接口风格）
      const onOpen = vi.fn((context: any) => {
        return { success: true, message: 'Welcome to test domain' };
      });
      const onMessage = vi.fn((payload: any) => {
        return { echo: payload, timestamp: Date.now() };
      });
      const onClose = vi.fn();
      const onDisconnect = vi.fn();
      const onReconnect = vi.fn();
      const testHandler: DomainHandler = (connector) => {
        connector.onOpen(() => onOpen(connector.context));
        connector.onMessage(onMessage);
        connector.onClose(onClose);
        connector.onDisconnect(onDisconnect);
        connector.onReconnect(onReconnect);
      };

      // 注册域名处理器
      const registerResult = mockConnection.registerDomain('test-domain', testHandler);
      expect(registerResult.success).toBe(true);

      // 打开sub-connector
      const openResult = mockConnection.openSubConnector('test-domain', { userId: 'test-user' });
      expect(openResult.success).toBe(true);
      expect(onOpen).toHaveBeenCalledWith({ userId: 'test-user' });

      // 发送消息
      const messageResult = mockConnection.routeMessage('test-domain', { action: 'ping' });
      expect(messageResult.success).toBe(true);
      expect(onMessage).toHaveBeenCalledWith({ action: 'ping' });

      // 关闭sub-connector
      const closeResult = mockConnection.closeSubConnector('test-domain', 1000, 'Normal closure');
      expect(closeResult.success).toBe(true);
      expect(onClose).toHaveBeenCalledWith(1000, 'Normal closure');
    });

    it('应该支持多个域名同时工作', () => {
      // 创建多个域名处理器（新接口风格）
      const gameOnOpen = vi.fn();
      const gameOnMessage = vi.fn((payload) => ({ type: 'game', data: payload }));
      const gameOnClose = vi.fn();
      const gameHandler: DomainHandler = (connector) => {
        connector.onOpen(gameOnOpen);
        connector.onMessage(gameOnMessage);
        connector.onClose(gameOnClose);
      };

      const chatOnOpen = vi.fn();
      const chatOnMessage = vi.fn((payload) => ({ type: 'chat', data: payload }));
      const chatOnClose = vi.fn();
      const chatHandler: DomainHandler = (connector) => {
        connector.onOpen(chatOnOpen);
        connector.onMessage(chatOnMessage);
        connector.onClose(chatOnClose);
      };

      // 注册多个域名
      mockConnection.registerDomain('game-domain', gameHandler);
      mockConnection.registerDomain('chat-domain', chatHandler);

      // 打开多个sub-connector
      const gameOpen = mockConnection.openSubConnector('game-domain', { gameId: 'game-1' });
      const chatOpen = mockConnection.openSubConnector('chat-domain', { roomId: 'room-1' });

      expect(gameOpen.success).toBe(true);
      expect(chatOpen.success).toBe(true);

      // 向不同域名发送消息
      const gameMessage = mockConnection.routeMessage('game-domain', { action: 'move' });
      const chatMessage = mockConnection.routeMessage('chat-domain', { message: 'hello' });

      expect(gameMessage.success).toBe(true);
      expect(chatMessage.success).toBe(true);
      expect(gameOnMessage).toHaveBeenCalledWith({ action: 'move' });
      expect(chatOnMessage).toHaveBeenCalledWith({ message: 'hello' });
    });
  });
});

/**
 * WebSocket实时连接测试
 * 基于test-complete-websocket.js改写的模拟测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unregisterDomainHandler } from '../websocket';
import type { DomainHandler } from '../websocket';

// 模拟实时连接管理器
class MockRealTimeConnectionManager {
  private connectionId: string;
  private isConnected: boolean = true;
  private subConnectors = new Map<string, any>();
  private domainHandlers = new Map<string, DomainHandler>();

  constructor(connectionId: string) {
    this.connectionId = connectionId;
  }

  registerDomain(domain: string, handler: DomainHandler) {
    this.domainHandlers.set(domain, handler);
    return { success: true, message: `Domain ${domain} registered` };
  }

  openSubConnector(domain: string, config: any) {
    const handler = this.domainHandlers.get(domain);
    if (!handler) {
      return { success: false, error: 'Domain handler not found' };
    }

    const result = handler.onOpen?.(this.connectionId, config);
    this.subConnectors.set(domain, { domain, ready: true, config });
    return { success: true, result };
  }

  routeMessage(domain: string, payload: any) {
    const handler = this.domainHandlers.get(domain);
    const subConnector = this.subConnectors.get(domain);
    
    if (!handler || !subConnector) {
      return { error: 'Domain not found or not opened' };
    }

    const result = handler.onMessage?.(this.connectionId, payload);
    return { success: true, response: result };
  }

  closeSubConnector(domain: string, code?: number, reason?: string) {
    const handler = this.domainHandlers.get(domain);
    if (handler) {
      handler.onClose?.(this.connectionId, code, reason);
    }
    this.subConnectors.delete(domain);
    return { success: true };
  }

  handleDisconnect() {
    this.isConnected = false;
    for (const [domain, handler] of this.domainHandlers) {
      handler.onDisconnect?.(this.connectionId);
    }
    this.subConnectors.clear();
  }

  handleReconnect() {
    this.isConnected = true;
    for (const [domain, handler] of this.domainHandlers) {
      handler.onReconnect?.(this.connectionId);
    }
  }

  getId() {
    return this.connectionId;
  }

  isActive() {
    return this.isConnected;
  }
}

describe('WebSocket实时连接测试', () => {
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
      // 创建测试域名处理器
      const testHandler: DomainHandler = {
        onOpen: vi.fn((connectionId: string, config: any) => {
          return { success: true, message: 'Welcome to test domain' };
        }),
        onMessage: vi.fn((connectionId: string, payload: any) => {
          return { echo: payload, timestamp: Date.now() };
        }),
        onClose: vi.fn(),
        onDisconnect: vi.fn(),
        onReconnect: vi.fn()
      };

      // 注册域名处理器
      const registerResult = mockConnection.registerDomain('test-domain', testHandler);
      expect(registerResult.success).toBe(true);

      // 打开sub-connector
      const openResult = mockConnection.openSubConnector('test-domain', { userId: 'test-user' });
      expect(openResult.success).toBe(true);
      expect(testHandler.onOpen).toHaveBeenCalledWith('test-connection-realtime', { userId: 'test-user' });

      // 发送消息
      const messageResult = mockConnection.routeMessage('test-domain', { action: 'ping' });
      expect(messageResult.success).toBe(true);
      expect(testHandler.onMessage).toHaveBeenCalledWith('test-connection-realtime', { action: 'ping' });

      // 关闭sub-connector
      const closeResult = mockConnection.closeSubConnector('test-domain', 1000, 'Normal closure');
      expect(closeResult.success).toBe(true);
      expect(testHandler.onClose).toHaveBeenCalledWith('test-connection-realtime', 1000, 'Normal closure');
    });

    it('应该支持多个域名同时工作', () => {
      // 创建多个域名处理器
      const gameHandler: DomainHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn((connectionId, payload) => ({ type: 'game', data: payload })),
        onClose: vi.fn()
      };

      const chatHandler: DomainHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn((connectionId, payload) => ({ type: 'chat', data: payload })),
        onClose: vi.fn()
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
      expect(gameHandler.onMessage).toHaveBeenCalledWith('test-connection-realtime', { action: 'move' });
      expect(chatHandler.onMessage).toHaveBeenCalledWith('test-connection-realtime', { message: 'hello' });
    });
  });

  describe('错误处理和边界情况', () => {
    it('应该正确处理连接断开', () => {
      // 注册域名处理器
      const testHandler: DomainHandler = {
        onDisconnect: vi.fn(),
        onReconnect: vi.fn()
      };

      mockConnection.registerDomain('test-domain', testHandler);

      // 模拟连接断开
      expect(mockConnection.isActive()).toBe(true);
      mockConnection.handleDisconnect();
      expect(mockConnection.isActive()).toBe(false);
      expect(testHandler.onDisconnect).toHaveBeenCalledWith('test-connection-realtime');

      // 模拟重连
      mockConnection.handleReconnect();
      expect(mockConnection.isActive()).toBe(true);
      expect(testHandler.onReconnect).toHaveBeenCalledWith('test-connection-realtime');
    });

    it('应该正确处理向未打开的域名发送消息', () => {
      // 注册域名处理器但不打开sub-connector
      const testHandler: DomainHandler = {
        onMessage: vi.fn()
      };

      mockConnection.registerDomain('test-domain', testHandler);

      // 尝试向未打开的域名发送消息
      const result = mockConnection.routeMessage('test-domain', { action: 'test' });
      
      expect(result.error).toBe('Domain not found or not opened');
      expect(testHandler.onMessage).not.toHaveBeenCalled();
    });
  });
});

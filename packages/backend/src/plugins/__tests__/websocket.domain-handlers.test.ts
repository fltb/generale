/**
 * WebSocket域名处理器测试
 * 基于test-websocket-with-handlers.js改写的模拟测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { registerDomainHandler, unregisterDomainHandler } from '../websocket';
import type { DomainHandler } from '../websocket';

// 模拟域名处理器连接管理器
class MockDomainHandlerManager {
  private connectionId: string;
  private domainHandlers = new Map<string, DomainHandler>();
  private subConnectors = new Map<string, any>();

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
  simulateFullDomainLifecycle(domain: string, config: any, messages: any[]) {
    const handler = this.domainHandlers.get(domain);
    if (!handler) {
      return { error: 'Domain handler not found' };
    }

    const results = [];

    // 1. 打开域名
    const openResult = handler.onOpen?.(this.connectionId, config);
    this.subConnectors.set(domain, { domain, ready: true });
    results.push({ type: 'open', result: openResult });

    // 2. 处理消息
    for (const message of messages) {
      const messageResult = handler.onMessage?.(this.connectionId, message);
      results.push({ type: 'message', payload: message, result: messageResult });
    }

    // 3. 关闭域名
    const closeResult = handler.onClose?.(this.connectionId, 1000, 'Normal closure');
    this.subConnectors.delete(domain);
    results.push({ type: 'close', result: closeResult });

    return { success: true, lifecycle: results };
  }

  // 模拟多域名支持
  simulateMultiDomainSupport(domains: string[], handlers: DomainHandler[]) {
    const results = [];

    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      const handler = handlers[i];
      
      if (!domain || !handler) {
        continue;
      }
      
      // 注册域名
      this.registerDomainViaAPI(domain, handler);
      
      // 打开域名
      const openResult = handler.onOpen?.(this.connectionId, { domain });
      this.subConnectors.set(domain, { domain, ready: true });
      
      // 发送测试消息
      const messageResult = handler.onMessage?.(this.connectionId, { test: `message for ${domain}` });
      
      results.push({
        domain,
        open: openResult,
        message: messageResult
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

describe('WebSocket域名处理器测试', () => {
  let mockManager: MockDomainHandlerManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockManager = new MockDomainHandlerManager('test-connection-domain');
  });

  afterEach(() => {
    unregisterDomainHandler('test-domain');
    unregisterDomainHandler('game-domain');
    unregisterDomainHandler('chat-domain');
    unregisterDomainHandler('pregame-domain');
  });

  describe('域名注册via HTTP API', () => {
    it('应该能够通过HTTP API注册域名处理器', () => {
      const testHandler: DomainHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn(),
        onClose: vi.fn()
      };

      const result = mockManager.registerDomainViaAPI('test-domain', testHandler);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Domain test-domain registered via API');
      expect(mockManager.getRegisteredDomains()).toContain('test-domain');
    });

    it('应该能够注册多个不同的域名处理器', () => {
      const gameHandler: DomainHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn((connectionId, payload) => ({ type: 'game-response', data: payload }))
      };

      const chatHandler: DomainHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn((connectionId, payload) => ({ type: 'chat-response', data: payload }))
      };

      mockManager.registerDomainViaAPI('game-domain', gameHandler);
      mockManager.registerDomainViaAPI('chat-domain', chatHandler);

      const registeredDomains = mockManager.getRegisteredDomains();
      expect(registeredDomains).toContain('game-domain');
      expect(registeredDomains).toContain('chat-domain');
      expect(registeredDomains).toHaveLength(2);
    });
  });

  describe('完整域名消息生命周期', () => {
    it('应该能够完成域名的打开->消息->关闭流程', () => {
      const testHandler: DomainHandler = {
        onOpen: vi.fn((connectionId, config) => ({
          success: true,
          message: 'Domain opened successfully',
          config
        })),
        onMessage: vi.fn((connectionId, payload) => ({
          echo: payload,
          timestamp: Date.now(),
          connectionId
        })),
        onClose: vi.fn((connectionId, code, reason) => {
          return { closed: true, code, reason };
        })
      };

      // 注册域名处理器
      mockManager.registerDomainViaAPI('test-domain', testHandler);

      // 模拟完整生命周期
      const messages = [
        { action: 'ping' },
        { action: 'getData', id: 123 },
        { action: 'updateStatus', status: 'active' }
      ];

      const result = mockManager.simulateFullDomainLifecycle('test-domain', { userId: 'user-1' }, messages);

      expect(result.success).toBe(true);
      expect(result.lifecycle).toHaveLength(5); // 1 open + 3 messages + 1 close

      // 验证打开调用
      expect(testHandler.onOpen).toHaveBeenCalledWith('test-connection-domain', { userId: 'user-1' });

      // 验证消息调用
      expect(testHandler.onMessage).toHaveBeenCalledTimes(3);
      expect(testHandler.onMessage).toHaveBeenCalledWith('test-connection-domain', { action: 'ping' });

      // 验证关闭调用
      expect(testHandler.onClose).toHaveBeenCalledWith('test-connection-domain', 1000, 'Normal closure');
    });

    it('应该正确处理域名处理器回调的返回值', () => {
      const testHandler: DomainHandler = {
        onOpen: vi.fn(() => ({ welcome: 'Hello from test domain!' })),
        onMessage: vi.fn((connectionId, payload) => ({
          processed: true,
          originalPayload: payload,
          response: `Processed: ${JSON.stringify(payload)}`
        }))
      };

      mockManager.registerDomainViaAPI('test-domain', testHandler);

      const result = mockManager.simulateFullDomainLifecycle('test-domain', {}, [{ test: 'data' }]);

      expect(result.success).toBe(true);
      
      // 类型安全检查
      if ('lifecycle' in result && result.lifecycle) {
        // 检查打开结果
        const openResult = result.lifecycle.find(item => item.type === 'open');
        expect(openResult?.result).toEqual({ welcome: 'Hello from test domain!' });

        // 检查消息结果
        const messageResult = result.lifecycle.find(item => item.type === 'message');
        expect(messageResult?.result).toEqual({
          processed: true,
          originalPayload: { test: 'data' },
          response: 'Processed: {"test":"data"}'
        });
      }
    });
  });

  describe('多域名支持', () => {
    it('应该能够同时支持多个域名处理器', () => {
      const gameHandler: DomainHandler = {
        onOpen: vi.fn(() => ({ type: 'game', status: 'ready' })),
        onMessage: vi.fn((connectionId, payload) => ({ type: 'game', echo: payload }))
      };

      const chatHandler: DomainHandler = {
        onOpen: vi.fn(() => ({ type: 'chat', status: 'connected' })),
        onMessage: vi.fn((connectionId, payload) => ({ type: 'chat', echo: payload }))
      };

      const pregameHandler: DomainHandler = {
        onOpen: vi.fn(() => ({ type: 'pregame', status: 'waiting' })),
        onMessage: vi.fn((connectionId, payload) => ({ type: 'pregame', echo: payload }))
      };

      const domains = ['game-domain', 'chat-domain', 'pregame-domain'];
      const handlers = [gameHandler, chatHandler, pregameHandler];

      const results = mockManager.simulateMultiDomainSupport(domains, handlers);

      expect(results).toHaveLength(3);
      
      // 验证每个域名都被正确处理
      expect(results[0]?.domain).toBe('game-domain');
      expect(results[0]?.open).toEqual({ type: 'game', status: 'ready' });
      
      expect(results[1]?.domain).toBe('chat-domain');
      expect(results[1]?.open).toEqual({ type: 'chat', status: 'connected' });
      
      expect(results[2]?.domain).toBe('pregame-domain');
      expect(results[2]?.open).toEqual({ type: 'pregame', status: 'waiting' });

      // 验证所有处理器都被调用
      expect(gameHandler.onOpen).toHaveBeenCalled();
      expect(chatHandler.onOpen).toHaveBeenCalled();
      expect(pregameHandler.onOpen).toHaveBeenCalled();
    });

    it('应该能够独立处理每个域名的消息', () => {
      const gameHandler: DomainHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn((connectionId, payload) => ({ domain: 'game', processed: payload }))
      };

      const chatHandler: DomainHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn((connectionId, payload) => ({ domain: 'chat', processed: payload }))
      };

      const domains = ['game-domain', 'chat-domain'];
      const handlers = [gameHandler, chatHandler];

      const results = mockManager.simulateMultiDomainSupport(domains, handlers);

      // 验证消息处理结果
      expect(results[0]?.message).toEqual({
        domain: 'game',
        processed: { test: 'message for game-domain' }
      });

      expect(results[1]?.message).toEqual({
        domain: 'chat',
        processed: { test: 'message for chat-domain' }
      });

      // 验证每个处理器只处理自己的消息
      expect(gameHandler.onMessage).toHaveBeenCalledWith('test-connection-domain', { test: 'message for game-domain' });
      expect(chatHandler.onMessage).toHaveBeenCalledWith('test-connection-domain', { test: 'message for chat-domain' });
    });
  });
});

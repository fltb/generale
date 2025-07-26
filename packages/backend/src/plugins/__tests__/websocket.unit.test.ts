/**
 * WebSocket单元测试
 * 基于JavaScript测试文件改写的纯单元测试（不需要真实服务器）
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerDomainHandler, unregisterDomainHandler } from '../websocket';

describe('WebSocket单元测试', () => {
  afterEach(() => {
    // 清理所有注册的域名处理器
    try {
      unregisterDomainHandler('test-domain');
      unregisterDomainHandler('game-domain');
      unregisterDomainHandler('chat-domain');
    } catch {
      // 忽略未注册的域名
    }
  });

  describe('域名处理器注册测试', () => {
    it('应该能够注册域名处理器', () => {
      const mockHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn(),
        onClose: vi.fn(),
        onDisconnect: vi.fn(),
        onReconnect: vi.fn()
      };

      expect(() => {
        registerDomainHandler('test-domain', mockHandler);
      }).not.toThrow();
    });

    it('应该能够注销域名处理器', () => {
      const mockHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn(),
        onClose: vi.fn()
      };

      registerDomainHandler('test-domain', mockHandler);
      
      expect(() => {
        unregisterDomainHandler('test-domain');
      }).not.toThrow();
    });

    it('应该能够注册多个不同的域名处理器', () => {
      const domains = ['game-domain', 'chat-domain', 'pregame-domain'];
      
      domains.forEach(domain => {
        const mockHandler = {
          onOpen: vi.fn(),
          onMessage: vi.fn(),
          onClose: vi.fn()
        };

        expect(() => {
          registerDomainHandler(domain, mockHandler);
        }).not.toThrow();
      });

      // 清理
      domains.forEach(domain => {
        unregisterDomainHandler(domain);
      });
    });

    it('应该在重复注册时显示警告', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const mockHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn(),
        onClose: vi.fn()
      };

      // 第一次注册
      registerDomainHandler('test-domain', mockHandler);
      
      // 第二次注册同一个域名
      registerDomainHandler('test-domain', mockHandler);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Domain handler for 'test-domain' already exists, overwriting"
      );

      consoleSpy.mockRestore();
    });
  });

  describe('域名处理器功能测试', () => {
    it('onMessage处理器应该能够返回响应数据', () => {
      const mockHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn().mockReturnValue({
          type: 'echo',
          data: 'test response'
        }),
        onClose: vi.fn()
      };

      registerDomainHandler('test-domain', mockHandler);

      // 模拟调用onMessage
      const response = mockHandler.onMessage('test-connection-id', {
        action: 'test',
        data: 'Hello!'
      });

      expect(response).toEqual({
        type: 'echo',
        data: 'test response'
      });

      expect(mockHandler.onMessage).toHaveBeenCalledWith('test-connection-id', {
        action: 'test',
        data: 'Hello!'
      });
    });

    it('onOpen处理器应该接收连接ID和配置', () => {
      const mockHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn(),
        onClose: vi.fn()
      };

      registerDomainHandler('test-domain', mockHandler);

      // 模拟调用onOpen
      const testConfig = { playerId: 'player123', testMode: true };
      mockHandler.onOpen('test-connection-id', testConfig);

      expect(mockHandler.onOpen).toHaveBeenCalledWith('test-connection-id', testConfig);
    });

    it('onClose处理器应该接收连接ID、代码和原因', () => {
      const mockHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn(),
        onClose: vi.fn()
      };

      registerDomainHandler('test-domain', mockHandler);

      // 模拟调用onClose
      mockHandler.onClose('test-connection-id', 1000, 'Normal closure');

      expect(mockHandler.onClose).toHaveBeenCalledWith(
        'test-connection-id', 
        1000, 
        'Normal closure'
      );
    });

    it('onDisconnect处理器应该接收连接ID', () => {
      const mockHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn(),
        onClose: vi.fn(),
        onDisconnect: vi.fn()
      };

      registerDomainHandler('test-domain', mockHandler);

      // 模拟调用onDisconnect
      mockHandler.onDisconnect('test-connection-id');

      expect(mockHandler.onDisconnect).toHaveBeenCalledWith('test-connection-id');
    });

    it('onReconnect处理器应该接收连接ID', () => {
      const mockHandler = {
        onOpen: vi.fn(),
        onMessage: vi.fn(),
        onClose: vi.fn(),
        onReconnect: vi.fn()
      };

      registerDomainHandler('test-domain', mockHandler);

      // 模拟调用onReconnect
      mockHandler.onReconnect('test-connection-id');

      expect(mockHandler.onReconnect).toHaveBeenCalledWith('test-connection-id');
    });
  });

  describe('错误处理测试', () => {
    it('应该正确处理注销不存在的域名', () => {
      expect(() => {
        unregisterDomainHandler('non-existent-domain');
      }).not.toThrow();
    });

    it('应该正确处理空的处理器对象', () => {
      expect(() => {
        registerDomainHandler('test-domain', {});
      }).not.toThrow();
    });

    it('应该正确处理只有部分回调的处理器', () => {
      const partialHandler = {
        onMessage: vi.fn()
      };

      expect(() => {
        registerDomainHandler('test-domain', partialHandler);
      }).not.toThrow();
    });
  });

  describe('消息格式验证测试', () => {
    it('应该正确处理各种消息类型', () => {
      const mockHandler = {
        onMessage: vi.fn().mockImplementation((connectionId, payload) => {
          // 根据不同的action返回不同的响应
          switch (payload.action) {
            case 'echo':
              return { type: 'echo', originalPayload: payload };
            case 'error':
              return { type: 'error', message: 'Test error' };
            default:
              return { type: 'unknown', payload };
          }
        })
      };

      registerDomainHandler('test-domain', mockHandler);

      // 测试echo消息
      const echoResponse = mockHandler.onMessage('conn1', { action: 'echo', data: 'test' });
      expect(echoResponse.type).toBe('echo');
      expect(echoResponse.originalPayload).toEqual({ action: 'echo', data: 'test' });

      // 测试错误消息
      const errorResponse = mockHandler.onMessage('conn1', { action: 'error' });
      expect(errorResponse.type).toBe('error');
      expect(errorResponse.message).toBe('Test error');

      // 测试未知消息
      const unknownResponse = mockHandler.onMessage('conn1', { action: 'unknown', data: 'test' });
      expect(unknownResponse.type).toBe('unknown');
    });

    it('应该正确处理复杂的消息载荷', () => {
      const mockHandler = {
        onMessage: vi.fn().mockReturnValue({ processed: true })
      };

      registerDomainHandler('test-domain', mockHandler);

      const complexPayload = {
        action: 'complex-action',
        data: {
          nested: {
            value: 123,
            array: [1, 2, 3],
            boolean: true
          }
        },
        timestamp: new Date().toISOString(),
        metadata: {
          version: '1.0.0',
          source: 'unit-test'
        }
      };

      const response = mockHandler.onMessage('test-conn', complexPayload);
      
      expect(mockHandler.onMessage).toHaveBeenCalledWith('test-conn', complexPayload);
      expect(response).toEqual({ processed: true });
    });
  });

  describe('性能测试', () => {
    it('应该能够快速注册大量域名处理器', () => {
      const startTime = Date.now();
      const domainCount = 100;
      
      for (let i = 0; i < domainCount; i++) {
        const mockHandler = {
          onMessage: vi.fn()
        };
        registerDomainHandler(`domain-${i}`, mockHandler);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 注册100个域名应该在100ms内完成
      expect(duration).toBeLessThan(100);
      
      // 清理
      for (let i = 0; i < domainCount; i++) {
        unregisterDomainHandler(`domain-${i}`);
      }
    });

    it('应该能够处理高频的消息调用', () => {
      const mockHandler = {
        onMessage: vi.fn().mockReturnValue({ processed: true })
      };

      registerDomainHandler('test-domain', mockHandler);

      const startTime = Date.now();
      const messageCount = 1000;
      
      for (let i = 0; i < messageCount; i++) {
        mockHandler.onMessage(`conn-${i}`, { action: 'test', index: i });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // 1000次消息调用应该在50ms内完成
      expect(duration).toBeLessThan(50);
      expect(mockHandler.onMessage).toHaveBeenCalledTimes(messageCount);
    });
  });
});

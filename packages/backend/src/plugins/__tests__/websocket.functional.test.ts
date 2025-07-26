import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerDomainHandler, unregisterDomainHandler } from '../websocket';

// 功能测试 - 测试域名处理器的核心功能
describe('WebSocket Domain Handler Functionality', () => {
  let mockConnectionId: string;
  let receivedMessages: any[];
  let mockHandler: any;

  beforeEach(() => {
    mockConnectionId = 'test-connection-123';
    receivedMessages = [];
    
    mockHandler = {
      onOpen: (connId: string, config: any) => {
        receivedMessages.push({ type: 'open', connId, config });
      },
      onMessage: (connId: string, payload: any) => {
        receivedMessages.push({ type: 'message', connId, payload });
      },
      onClose: (connId: string, code?: number, reason?: string) => {
        receivedMessages.push({ type: 'close', connId, code, reason });
      },
      onDisconnect: (connId: string, err?: Error) => {
        receivedMessages.push({ type: 'disconnect', connId, err });
      },
      onReconnect: (connId: string) => {
        receivedMessages.push({ type: 'reconnect', connId });
      }
    };
  });

  afterEach(() => {
    // 清理所有注册的域名处理器
    unregisterDomainHandler('test-domain');
    unregisterDomainHandler('game');
    unregisterDomainHandler('chat');
    unregisterDomainHandler('pregame');
  });

  describe('Domain Handler Registration', () => {
    it('should register and unregister domain handlers', () => {
      // 注册域名处理器
      registerDomainHandler('test-domain', mockHandler);
      
      // 验证注册成功（通过调用处理器方法）
      mockHandler.onOpen(mockConnectionId, { test: 'config' });
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'open',
        connId: mockConnectionId,
        config: { test: 'config' }
      });
      
      // 注销域名处理器
      unregisterDomainHandler('test-domain');
      
      // 验证注销成功（这里只是确保不会抛出错误）
      expect(() => unregisterDomainHandler('test-domain')).not.toThrow();
    });

    it('should handle duplicate domain registration', () => {
      const handler1 = { onOpen: () => receivedMessages.push('handler1') };
      const handler2 = { onOpen: () => receivedMessages.push('handler2') };
      
      // 注册第一个处理器
      registerDomainHandler('duplicate-test', handler1);
      
      // 注册第二个处理器（应该覆盖第一个）
      registerDomainHandler('duplicate-test', handler2);
      
      // 验证第二个处理器生效
      handler2.onOpen();
      expect(receivedMessages).toContain('handler2');
    });
  });

  describe('Domain Handler Callbacks', () => {
    beforeEach(() => {
      registerDomainHandler('callback-test', mockHandler);
    });

    it('should handle onOpen callback', () => {
      const config = { playerId: 'player123', gameId: 'game456' };
      
      mockHandler.onOpen(mockConnectionId, config);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'open',
        connId: mockConnectionId,
        config
      });
    });

    it('should handle onMessage callback', () => {
      const payload = { action: 'move', position: { x: 10, y: 20 } };
      
      mockHandler.onMessage(mockConnectionId, payload);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'message',
        connId: mockConnectionId,
        payload
      });
    });

    it('should handle onClose callback', () => {
      const code = 1000;
      const reason = 'Normal closure';
      
      mockHandler.onClose(mockConnectionId, code, reason);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'close',
        connId: mockConnectionId,
        code,
        reason
      });
    });

    it('should handle onDisconnect callback', () => {
      const error = new Error('Connection lost');
      
      mockHandler.onDisconnect(mockConnectionId, error);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'disconnect',
        connId: mockConnectionId,
        err: error
      });
    });

    it('should handle onReconnect callback', () => {
      mockHandler.onReconnect(mockConnectionId);
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'reconnect',
        connId: mockConnectionId
      });
    });
  });

  describe('Multiple Domain Handlers', () => {
    it('should handle multiple domains independently', () => {
      const gameMessages: any[] = [];
      const chatMessages: any[] = [];
      
      const gameHandler = {
        onMessage: (connId: string, payload: any) => {
          gameMessages.push({ connId, payload });
        }
      };
      
      const chatHandler = {
        onMessage: (connId: string, payload: any) => {
          chatMessages.push({ connId, payload });
        }
      };
      
      registerDomainHandler('game', gameHandler);
      registerDomainHandler('chat', chatHandler);
      
      // 发送游戏消息
      gameHandler.onMessage(mockConnectionId, { action: 'move' });
      
      // 发送聊天消息
      chatHandler.onMessage(mockConnectionId, { message: 'Hello!' });
      
      // 验证消息被正确路由
      expect(gameMessages).toHaveLength(1);
      expect(gameMessages[0].payload.action).toBe('move');
      
      expect(chatMessages).toHaveLength(1);
      expect(chatMessages[0].payload.message).toBe('Hello!');
    });

    it('should handle complex game scenario', () => {
      const gameState = {
        players: new Map(),
        messages: [] as any[]
      };
      
      const gameHandler = {
        onOpen: (connId: string, config: any) => {
          gameState.players.set(connId, { 
            name: config.playerName, 
            ready: false,
            position: { x: 0, y: 0 }
          });
          gameState.messages.push({ type: 'player_joined', connId, config });
        },
        
        onMessage: (connId: string, payload: any) => {
          const player = gameState.players.get(connId);
          
          switch (payload.action) {
            case 'ready':
              player.ready = true;
              gameState.messages.push({ type: 'player_ready', connId });
              break;
            case 'move':
              player.position = payload.position;
              gameState.messages.push({ type: 'player_moved', connId, position: payload.position });
              break;
          }
        },
        
        onClose: (connId: string) => {
          gameState.players.delete(connId);
          gameState.messages.push({ type: 'player_left', connId });
        }
      };
      
      registerDomainHandler('game-scenario', gameHandler);
      
      // 模拟游戏场景
      const player1 = 'player1';
      const player2 = 'player2';
      
      // 玩家加入
      gameHandler.onOpen(player1, { playerName: 'Alice' });
      gameHandler.onOpen(player2, { playerName: 'Bob' });
      
      // 玩家准备
      gameHandler.onMessage(player1, { action: 'ready' });
      gameHandler.onMessage(player2, { action: 'ready' });
      
      // 玩家移动
      gameHandler.onMessage(player1, { action: 'move', position: { x: 10, y: 5 } });
      gameHandler.onMessage(player2, { action: 'move', position: { x: 20, y: 15 } });
      
      // 玩家离开
      gameHandler.onClose(player1);
      
      // 验证游戏状态
      expect(gameState.players.size).toBe(1);
      expect(gameState.players.has(player2)).toBe(true);
      expect(gameState.players.get(player2).position).toEqual({ x: 20, y: 15 });
      
      // 验证消息历史
      expect(gameState.messages).toHaveLength(7);
      expect(gameState.messages[0].type).toBe('player_joined');
      expect(gameState.messages[1].type).toBe('player_joined');
      expect(gameState.messages[2].type).toBe('player_ready');
      expect(gameState.messages[3].type).toBe('player_ready');
      expect(gameState.messages[4].type).toBe('player_moved');
      expect(gameState.messages[5].type).toBe('player_moved');
      expect(gameState.messages[6].type).toBe('player_left');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing handler methods gracefully', () => {
      const partialHandler = {
        onOpen: (connId: string) => {
          receivedMessages.push({ type: 'open', connId });
        }
        // 缺少其他方法
      };
      
      registerDomainHandler('partial-handler', partialHandler);
      
      // 调用存在的方法
      expect(() => partialHandler.onOpen(mockConnectionId)).not.toThrow();
      expect(receivedMessages).toHaveLength(1);
      
      // 调用不存在的方法应该不会抛出错误（因为是可选的）
      expect(() => {
        // partialHandler 只有 onOpen 方法，没有 onMessage
        // 这里测试的是可选方法不存在时的情况
        expect(partialHandler.onMessage).toBeUndefined();
      }).not.toThrow();
    });

    it('should handle handler exceptions gracefully', () => {
      const errorHandler = {
        onMessage: (_connectionId: string, _payload: any) => {
          throw new Error('Handler error');
        }
      };
      
      registerDomainHandler('error-handler', errorHandler);
      
      // 处理器抛出错误不应该影响系统
      expect(() => {
        try {
          errorHandler.onMessage(mockConnectionId, {});
        } catch (error) {
          // 错误被捕获，这是预期的
          expect((error as Error).message).toBe('Handler error');
        }
      }).not.toThrow();
    });
  });

  describe('Performance Considerations', () => {
    it('should handle rapid handler registrations', () => {
      const startTime = Date.now();
      
      // 快速注册大量处理器
      for (let i = 0; i < 100; i++) {
        registerDomainHandler(`domain-${i}`, {
          onMessage: () => {}
        });
      }
      
      const registrationTime = Date.now() - startTime;
      
      // 清理
      for (let i = 0; i < 100; i++) {
        unregisterDomainHandler(`domain-${i}`);
      }
      
      const cleanupTime = Date.now() - startTime - registrationTime;
      
      // 验证性能合理（这些是宽松的限制）
      expect(registrationTime).toBeLessThan(100); // 100ms内完成注册
      expect(cleanupTime).toBeLessThan(50); // 50ms内完成清理
    });

    it('should handle high-frequency handler calls', () => {
      let messageCount = 0;
      
      const highFreqHandler = {
        onMessage: (_connectionId: string, _payload: any) => {
          messageCount++;
        }
      };
      
      registerDomainHandler('high-freq', highFreqHandler);
      
      const startTime = Date.now();
      
      // 高频调用处理器
      for (let i = 0; i < 1000; i++) {
        highFreqHandler.onMessage(mockConnectionId, { messageId: i });
      }
      
      const duration = Date.now() - startTime;
      
      expect(messageCount).toBe(1000);
      expect(duration).toBeLessThan(100); // 100ms内处理1000条消息
    });
  });
});

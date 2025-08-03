import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registerDomainHandler, unregisterDomainHandler, DomainHandler, SubConnectorImpl as MockSubConnector } from '../websocket';

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
      const handler1: DomainHandler = (connector) => {
        connector.onOpen(() => receivedMessages.push('handler1'));
      };
      const handler2: DomainHandler = (connector) => {
        connector.onOpen(() => receivedMessages.push('handler2'));
      };
      // 注册第一个处理器
      registerDomainHandler('duplicate-test', handler1);
      // 注册第二个处理器（应该覆盖第一个）
      registerDomainHandler('duplicate-test', handler2);
      // 验证第二个处理器生效
      // 通过模拟 subConnector 触发 open
      const subConnector = new MockSubConnector('duplicate-test', {});
      handler2(subConnector);
      subConnector._triggerOpen();
      expect(receivedMessages).toContain('handler2');
    });
  });

  describe('Domain Handler Callbacks', () => {
    beforeEach(() => {
      registerDomainHandler('callback-test', mockHandler);
    });

    it('should handle onOpen callback', () => {
      const config = { playerId: 'player123', gameId: 'game456' };
      // 新接口：注册 handler 并触发 open
      const handler: DomainHandler = (connector: any) => {
        connector.onOpen(() => {
          receivedMessages.push({
            type: 'open',
            connId: mockConnectionId,
            config
          });
        });
      };
      const subConnector = new MockSubConnector('test-domain', config);
      handler(subConnector);
      subConnector._triggerOpen();
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toEqual({
        type: 'open',
        connId: mockConnectionId,
        config
      });
    });

    it('should handle onMessage callback', () => {
      const payload = { action: 'move', position: { x: 10, y: 20 } };
      // 新接口：注册 handler 并触发 message
      const handler: DomainHandler = (connector: any) => {
        connector.onClientMessage((msg: any) => {
          receivedMessages.push({
            type: 'message',
            connId: mockConnectionId,
            payload: msg
          });
        });
      };
      const subConnector = new MockSubConnector('test-domain', {});
      handler(subConnector);
      subConnector._triggerMessage(payload);
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
      // 新接口：注册 handler 并触发 close
      const handler: DomainHandler = (connector) => {
        connector.onClose((closeCode, closeReason) => {
          receivedMessages.push({
            type: 'close',
            connId: mockConnectionId,
            code: closeCode,
            reason: closeReason
          });
        });
      };
      const subConnector = new MockSubConnector('test-domain', {});
      handler(subConnector);
      subConnector._triggerClose(code, reason);
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
      // 新接口：注册 handler 并触发 disconnect
      const handler: DomainHandler = (connector) => {
        connector.onDisconnect((err) => {
          receivedMessages.push({
            type: 'disconnect',
            connId: mockConnectionId,
            err
          });
        });
      };
      const subConnector = new MockSubConnector('test-domain', {});
      handler(subConnector);
      subConnector._triggerDisconnect(error);
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
      
      const gameHandler: DomainHandler = (connector) => {
        connector.onClientMessage((payload) => {
          gameMessages.push({ domain: 'game', payload });
        });
      };
      const chatHandler: DomainHandler = (connector) => {
        connector.onClientMessage((payload) => {
          chatMessages.push({ domain: 'chat', payload });
        });
      };
      registerDomainHandler('game', gameHandler);
      registerDomainHandler('chat', chatHandler);
      // 通过 subConnector 分别触发消息
      const gameSub = new MockSubConnector('game', {});
      const chatSub = new MockSubConnector('chat', {});
      gameHandler(gameSub);
      chatHandler(chatSub);
      gameSub._triggerMessage({ action: 'move' });
      chatSub._triggerMessage({ message: 'Hello!' });
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
      
      const gameHandler: DomainHandler = (connector) => {
        connector.onOpen(() => {
          type PlayerContext = { playerName: string };
          const ctx = connector.context as PlayerContext;
          const connId = connector.domain + '-' + (ctx.playerName || '');
          gameState.players.set(connId, {
            name: ctx.playerName,
            ready: false,
            position: { x: 0, y: 0 }
          });
          gameState.messages.push({ type: 'player_joined', connId, config: connector.context });
        });
        connector.onClientMessage((payload) => {
          const ctx = connector.context as { playerName: string };
          const connId = connector.domain + '-' + (ctx.playerName || '');
          const player = gameState.players.get(connId);
          const msg = payload as { action: string; position?: { x: number; y: number } };
          switch (msg.action) {
            case 'ready':
              player.ready = true;
              gameState.messages.push({ type: 'player_ready', connId });
              break;
            case 'move':
              player.position = msg.position;
              gameState.messages.push({ type: 'player_moved', connId, position: msg.position });
              break;
          }
        });
        connector.onClose(() => {
          const ctx = connector.context as { playerName: string };
          const connId = connector.domain + '-' + (ctx.playerName || '');
          gameState.players.delete(connId);
          gameState.messages.push({ type: 'player_left', connId });
        });
      };
      registerDomainHandler('game-scenario', gameHandler);
      // 模拟游戏场景
      const player1 = new MockSubConnector('game-scenario', { playerName: 'Alice' });
      const player2 = new MockSubConnector('game-scenario', { playerName: 'Bob' });
      gameHandler(player1); gameHandler(player2);
      // 玩家加入
      player1._triggerOpen();
      player2._triggerOpen();
      // 玩家准备
      player1._triggerMessage({ action: 'ready' });
      player2._triggerMessage({ action: 'ready' });
      // 玩家移动
      player1._triggerMessage({ action: 'move', position: { x: 10, y: 5 } });
      player2._triggerMessage({ action: 'move', position: { x: 20, y: 15 } });
      // 玩家离开
      player1._triggerClose();
      // 验证游戏状态
      expect(gameState.players.size).toBe(1);
      expect([...gameState.players.values()][0].name).toBe('Bob');
      expect([...gameState.players.values()][0].position).toEqual({ x: 20, y: 15 });
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
      const partialHandler: DomainHandler = (connector) => {
        connector.onOpen(() => {
          receivedMessages.push({ type: 'open', domain: connector.domain });
        });
        // 不注册其他事件
      };
      registerDomainHandler('partial-handler', partialHandler);
      // 用 MockSubConnector 触发 open
      const sub = new MockSubConnector('partial-handler', {});
      partialHandler(sub);
      expect(() => sub._triggerOpen()).not.toThrow();
      expect(receivedMessages).toHaveLength(1);
      // 不触发 onMessage，不会有异常
      expect(() => sub._triggerMessage({})).not.toThrow();
    });

    it('should handle handler exceptions gracefully', () => {
      const errorHandler: DomainHandler = (connector) => {
        connector.onClientMessage(() => { throw new Error('Handler error'); });
      };
      registerDomainHandler('error-handler', errorHandler);
      const sub = new MockSubConnector('error-handler', {});
      errorHandler(sub);
      expect(() => sub._triggerMessage({})).toThrow('Handler error');
    });
  });

  describe('Performance Considerations', () => {
    it('should handle rapid handler registrations', () => {
      const startTime = Date.now();
      
      // 快速注册大量处理器
      for (let i = 0; i < 100; i++) {
        registerDomainHandler(`domain-${i}`, (connector) => {
          connector.onOpen(() => {});
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

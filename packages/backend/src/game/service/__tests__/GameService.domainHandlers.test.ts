import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameService, GamePhase, GameServiceConfig } from '../GameService';
import { GameInstance } from '../../instance/GameInstance';
import { GameId } from '@generale/types';

// Mock SubConnector
const createMockSubConnector = (context: any = {}) => ({
  context: { userid: 'test-user', username: 'Test User', ...context },
  close: vi.fn(),
  send: vi.fn(),
  onMessage: vi.fn(),
  onClose: vi.fn(),
  onOpen: vi.fn(),
  onClientMessage: vi.fn(),
  domain: 'mock-domain',
  ready: true,
  onDisconnect: vi.fn(),
  onReconnect: vi.fn()
});

// Mock dependencies
vi.mock('../../plugins/websocket', () => ({
  registerDomainHandler: vi.fn(),
  unregisterDomainHandler: vi.fn(),
}));

vi.mock('../../instance/PreGameInstance', () => ({
  PreGameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: [],
      playerLimit: 8
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    onStartGame: vi.fn()
  }))
}));

vi.mock('../../instance/GameInstance', () => ({
  GameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: {},
      status: 'Playing'
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    advance: vi.fn(),
    onStartGame: vi.fn()
  }))
}));

vi.mock('../instance/GameChatInstance', () => ({
  GameChatInstance: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    onStartGame: vi.fn()

  }))
}));

describe('GameService Domain Handlers', () => {
  let gameService: GameService;
  let config: GameServiceConfig;

  beforeEach(() => {
    config = {
      gameId: 'test-game-123' as GameId,
      maxPlayers: 4
    };
    gameService = new GameService(config);
  });

  afterEach(() => {
    gameService.disbandGame();
    vi.clearAllMocks();
  });

  describe('Pregame Domain Handler', () => {
    it('应该接受有效的 pregame 连接', () => {
      const connector = createMockSubConnector();
      const handler = gameService['createPregameDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).not.toHaveBeenCalled();
      expect(gameService['preGameInstance']).toBeTruthy();
    });

    it('应该拒绝缺少 userid 的连接', () => {
      const connector = createMockSubConnector({ userid: null });
      const handler = gameService['createPregameDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4001, 'Missing userid or username');
    });

    it('应该拒绝缺少 username 的连接', () => {
      const connector = createMockSubConnector({ username: null });
      const handler = gameService['createPregameDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4001, 'Missing userid or username');
    });

    it('应该拒绝非 PREGAME 阶段的连接', () => {
      gameService['phase'] = GamePhase.INGAME;
      const connector = createMockSubConnector();
      const handler = gameService['createPregameDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4002, 'Invalid phase for pregame');
    });

    it('应该处理 PreGameInstance 添加玩家失败', () => {
      const connector = createMockSubConnector();
      const handler = gameService['createPregameDomainHandler']();
      
      // Mock PreGameInstance.addPlayer 返回失败
      const mockPreGameInstance = {
        addPlayer: vi.fn().mockReturnValue({ success: false }),
        destroy: vi.fn()
      };
      gameService['preGameInstance'] = mockPreGameInstance as any;
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4003, 'Failed to add to pregame');
    });
  });

  describe('Game Domain Handler', () => {
    beforeEach(() => {
      gameService['phase'] = GamePhase.INGAME;
      gameService['gameInstance'] = new GameInstance();
    });

    it('应该接受有效的 game 连接', () => {
      const connector = createMockSubConnector();
      const handler = gameService['createGameDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).not.toHaveBeenCalled();
    });

    it('应该拒绝缺少 userid 的连接', () => {
      const connector = createMockSubConnector({ userid: null });
      const handler = gameService['createGameDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4001, 'Missing userid or username');
    });

    it('应该拒绝非 INGAME 阶段的连接', () => {
      gameService['phase'] = GamePhase.PREGAME;
      const connector = createMockSubConnector();
      const handler = gameService['createGameDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4002, 'Invalid phase for game');
    });

    it('应该处理 GameInstance 添加玩家失败', () => {
      const connector = createMockSubConnector();
      const handler = gameService['createGameDomainHandler']();
      
      // Mock GameInstance.addPlayer 返回失败
      gameService['gameInstance']!.addPlayer = vi.fn().mockReturnValue({ 
        success: false, 
        message: 'Player already exists' 
      });
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4003, 'Player already exists');
    });
  });

  describe('Chat Domain Handler', () => {
    it('应该在 PREGAME 阶段接受 chat 连接', () => {
      const connector = createMockSubConnector();
      const handler = gameService['createChatDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).not.toHaveBeenCalled();
    });

    it('应该在 INGAME 阶段接受 chat 连接', () => {
      gameService['phase'] = GamePhase.INGAME;
      const connector = createMockSubConnector();
      const handler = gameService['createChatDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).not.toHaveBeenCalled();
    });

    it('应该在 ENDED 阶段接受 chat 连接', () => {
      gameService['phase'] = GamePhase.ENDED;
      const connector = createMockSubConnector();
      const handler = gameService['createChatDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).not.toHaveBeenCalled();
    });

    it('应该拒绝 DISBANDED 阶段的连接', () => {
      gameService['phase'] = GamePhase.DISBANDED;
      const connector = createMockSubConnector();
      const handler = gameService['createChatDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4004, 'Game disbanded');
    });

    it('应该拒绝缺少 userid 的连接', () => {
      const connector = createMockSubConnector({ userid: null });
      const handler = gameService['createChatDomainHandler']();
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4001, 'Missing userid or username');
    });

    it('应该处理 ChatInstance 添加玩家失败', () => {
      const connector = createMockSubConnector();
      const handler = gameService['createChatDomainHandler']();
      
      // Mock ChatInstance.addPlayer 返回失败
      gameService['chatInstance'].addPlayer = vi.fn().mockReturnValue({ 
        success: false, 
        message: 'Chat full' 
      });
      
      handler(connector);
      
      expect(connector.close).toHaveBeenCalledWith(4003, 'Chat full');
    });
  });

  describe('Connector 适配', () => {
    it('应该正确适配 PreGame connector', () => {
      const mockSubConnector = createMockSubConnector();
      const adapted = gameService['adaptToPregameConnector'](mockSubConnector);
      
      expect(adapted).toHaveProperty('send');
      expect(adapted).toHaveProperty('onClientMessage');
      expect(adapted).toHaveProperty('onOpen');
      expect(adapted).toHaveProperty('onClose');
    });

    it('应该正确适配 Game connector', () => {
      const mockSubConnector = createMockSubConnector();
      const adapted = gameService['adaptToGameConnector'](mockSubConnector);
      
      expect(adapted).toHaveProperty('send');
      expect(adapted).toHaveProperty('onClientMessage');
      expect(adapted).toHaveProperty('onOpen');
      expect(adapted).toHaveProperty('onClose');
    });

    it('应该正确适配 Chat connector', () => {
      const mockSubConnector = createMockSubConnector();
      const adapted = gameService['adaptToChatConnector'](mockSubConnector);
      
      expect(adapted).toHaveProperty('send');
      expect(adapted).toHaveProperty('onClientMessage');
      expect(adapted).toHaveProperty('onOpen');
      expect(adapted).toHaveProperty('onClose');
    });
  });
});

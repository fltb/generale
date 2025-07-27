import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameService, GameServiceConfig, GamePhase } from '../GameService';
import { GameId, PlayerId } from '@generale/types';

// Mock the websocket plugin
vi.mock('../../../plugins/websocket', () => ({
  registerDomainHandler: vi.fn(),
  unregisterDomainHandler: vi.fn(),
  DomainHandler: {}
}));

// Mock PreGameInstance
vi.mock('../../instance/PreGameInstance', () => ({
  PreGameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      gameId: 'test-game',
      hostId: 'player1',
      players: [
        { id: 'player1', name: 'Player 1', ready: true },
        { id: 'player2', name: 'Player 2', ready: true }
      ],
      gameSetting: { speed: 1.0, tileGrowth: 1, tileConsume: 1 },
      mapSetting: { type: 'random', width: 20, height: 20, tileFrequency: {} },
      teamCount: 2,
      playerLimit: 8,
      started: false
    }),
    addPlayer: vi.fn().mockReturnValue(true),
    destroy: vi.fn()
  }))
}));

// Mock GameInstance
vi.mock('../../instance/GameInstance', () => ({
  GameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      status: 'Playing',
      players: []
    })
  }))
}));

// Mock GameChatInstance
vi.mock('../../instance/GameChatInstance', () => ({
  GameChatInstance: vi.fn().mockImplementation(() => ({
    addPlayer: vi.fn(),
    removePlayer: vi.fn(),
    sendMessage: vi.fn()
  }))
}));

describe('GameService', () => {
  let gameService: GameService;
  let config: GameServiceConfig;
  const gameId: GameId = 'test-game-123';
  const player1Id: PlayerId = 'player1';
  const player2Id: PlayerId = 'player2';

  beforeEach(() => {
    config = {
      gameId,
      maxPlayers: 4,
      chatMaxMessages: 100
    };
    gameService = new GameService(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初始化', () => {
    it('应该正确初始化 GameService', () => {
      expect(gameService.getGameId()).toBe(gameId);
      expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
      expect(gameService.getPlayerCount()).toBe(0);
      expect(gameService.getPlayers()).toEqual([]);
    });

    it('应该使用默认配置', () => {
      const minimalConfig = { gameId: 'test' };
      const service = new GameService(minimalConfig);
      expect(service.getGameId()).toBe('test');
    });
  });

  describe('玩家连接管理', () => {
    it('错误阶段尝试建立错误 sub-connector 应返回错误', () => {
      const sendToConnectionMock = vi.spyOn(gameService as any, 'sendToConnection');
      const playerId = player1Id;
      const connectionId = 'conn-test';
      const domainPregame = `pregame-${gameId}`;
      const domainGame = `game-${gameId}`;
      const domainChat = `chat-${gameId}`;

      // 1. INGAME 阶段尝试 pregame
      gameService.onOpen(connectionId, { playerId, playerName: 'Player 1' });
      gameService.startGame();
      sendToConnectionMock.mockClear();
      const res1 = gameService.handleSubConnectorOpen(domainPregame, connectionId);
      expect(res1).toBe(false);
      expect(sendToConnectionMock).toHaveBeenCalledWith(connectionId, domainPregame, expect.objectContaining({ error: 'SUBCONNECTOR_PHASE_MISMATCH' }));

      // 2. PREGAME 阶段尝试 game
      gameService = new GameService(config);
      const sendToConnectionMock2 = vi.spyOn(gameService as any, 'sendToConnection');
      const conn2 = 'conn-2';
      gameService.onOpen(conn2, { playerId, playerName: 'Player 1' });
      const res2 = gameService.handleSubConnectorOpen(domainGame, conn2);
      expect(res2).toBe(false);
      expect(sendToConnectionMock2).toHaveBeenCalledWith(conn2, domainGame, expect.objectContaining({ error: 'SUBCONNECTOR_PHASE_MISMATCH' }));

      // 3. ENDED 阶段尝试 pregame/game
      gameService = new GameService(config);
      const sendToConnectionMock3 = vi.spyOn(gameService as any, 'sendToConnection');
      const conn3 = 'conn-3';
      gameService.onOpen(conn3, { playerId, playerName: 'Player 1' });
      (gameService as any).phase = GamePhase.ENDED;
      const res3a = gameService.handleSubConnectorOpen(domainPregame, conn3);
      expect(res3a).toBe(false);
      expect(sendToConnectionMock3).toHaveBeenCalledWith(conn3, domainPregame, expect.objectContaining({ error: 'SUBCONNECTOR_PHASE_MISMATCH' }));
      const res3b = gameService.handleSubConnectorOpen(domainGame, conn3);
      expect(res3b).toBe(false);
      expect(sendToConnectionMock3).toHaveBeenCalledWith(conn3, domainGame, expect.objectContaining({ error: 'SUBCONNECTOR_PHASE_MISMATCH' }));

      // 4. DISBANDED 阶段尝试任何域名
      gameService = new GameService(config);
      const sendToConnectionMock4 = vi.spyOn(gameService as any, 'sendToConnection');
      const conn4 = 'conn-4';
      gameService.onOpen(conn4, { playerId, playerName: 'Player 1' });
      (gameService as any).phase = GamePhase.DISBANDED;
      const res4a = gameService.handleSubConnectorOpen(domainPregame, conn4);
      const res4b = gameService.handleSubConnectorOpen(domainGame, conn4);
      const res4c = gameService.handleSubConnectorOpen(domainChat, conn4);
      expect(res4a).toBe(false);
      expect(res4b).toBe(false);
      expect(res4c).toBe(false);
      expect(sendToConnectionMock4).toHaveBeenCalledWith(conn4, domainPregame, expect.objectContaining({ error: 'SUBCONNECTOR_PHASE_MISMATCH' }));
      expect(sendToConnectionMock4).toHaveBeenCalledWith(conn4, domainGame, expect.objectContaining({ error: 'SUBCONNECTOR_PHASE_MISMATCH' }));
      expect(sendToConnectionMock4).toHaveBeenCalledWith(conn4, domainChat, expect.objectContaining({ error: 'SUBCONNECTOR_PHASE_MISMATCH' }));
    });

    it('玩家在 pregame 阶段建立连接，应建立 pregame 和 chat connector', () => {
      const connectionId = 'conn-pregame';
      const playerId = player1Id;
      const playerName = 'Player 1';
      gameService.onOpen(connectionId, { playerId, playerName });
      const playerConnection = (gameService as any).players.get(playerId);
      expect(playerConnection.pregameConnector).toBeDefined();
      expect(playerConnection.chatConnector).toBeDefined();
      expect(playerConnection.gameConnector).toBeUndefined();
    });

    it('玩家在 game 阶段建立连接，应建立 game 和 chat connector', () => {
      // 先进入 pregame 阶段并添加玩家
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      gameService.onOpen('conn-2', { playerId: player2Id, playerName: 'Player 2' });
      gameService.startGame();
      // 新玩家尝试在 game 阶段建立连接
      const connectionId = 'conn-game';
      const playerId = 'player3';
      const playerName = 'Player 3';
      gameService.onOpen(connectionId, { playerId, playerName });
      const playerConnection = (gameService as any).players.get(playerId);
      expect(playerConnection.gameConnector).toBeDefined();
      expect(playerConnection.chatConnector).toBeDefined();
      expect(playerConnection.pregameConnector).toBeUndefined();
    });
    it('应该处理玩家连接', () => {
      const connectionId = 'conn-123';
      
      // 模拟玩家连接
      gameService.onOpen(connectionId, { playerId: player1Id, playerName: 'Player 1' });
      
      expect(gameService.hasPlayer(player1Id)).toBe(true);
      expect(gameService.getPlayerCount()).toBe(1);
      expect(gameService.getPlayers()).toContain(player1Id);
    });

    it('应该处理多个玩家连接', () => {
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      gameService.onOpen('conn-2', { playerId: player2Id, playerName: 'Player 2' });
      
      expect(gameService.getPlayerCount()).toBe(2);
      expect(gameService.hasPlayer(player1Id)).toBe(true);
      expect(gameService.hasPlayer(player2Id)).toBe(true);
    });

    it('应该处理连接关闭', () => {
      const connectionId = 'conn-123';
      gameService.onOpen(connectionId, { playerId: player1Id, playerName: 'Player 1' });
      
      expect(gameService.hasPlayer(player1Id)).toBe(true);
      
      gameService.onClose(connectionId);
      
      expect(gameService.hasPlayer(player1Id)).toBe(false);
      expect(gameService.getPlayerCount()).toBe(0);
    });
  });

  describe('游戏阶段管理', () => {
    beforeEach(() => {
      // 添加玩家到游戏
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      gameService.onOpen('conn-2', { playerId: player2Id, playerName: 'Player 2' });
    });

    it('应该能够开始游戏', () => {
      expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
      
      gameService.startGame();
      
      expect(gameService.getPhase()).toBe(GamePhase.INGAME);
    });

    it('应该只能从 PREGAME 阶段开始游戏', () => {
      gameService.startGame();
      expect(gameService.getPhase()).toBe(GamePhase.INGAME);
      
      // 尝试再次开始游戏应该失败
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      gameService.startGame();
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('应该能够结束游戏', () => {
      gameService.startGame();
      expect(gameService.getPhase()).toBe(GamePhase.INGAME);
      
      const result = { winner: 'player1' };
      gameService.endGame(result);
      
      expect(gameService.getPhase()).toBe(GamePhase.ENDED);
    });

    it('应该只能从 INGAME 阶段结束游戏', () => {
      expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      gameService.endGame();
      expect(consoleSpy).toHaveBeenCalled();
      expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
      
      consoleSpy.mockRestore();
    });

    it('应该能够解散游戏', () => {
      gameService.disbandGame();
      
      expect(gameService.getPhase()).toBe(GamePhase.DISBANDED);
      expect(gameService.getPlayerCount()).toBe(0);
    });
  });

  describe('事件回调', () => {
    it('应该触发游戏开始回调', () => {
      const onGameStartCallback = vi.fn();
      gameService.onGameStart(onGameStartCallback);
      
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      gameService.startGame();
      
      expect(onGameStartCallback).toHaveBeenCalled();
    });

    it('应该触发游戏结束回调', () => {
      const onGameEndCallback = vi.fn();
      const result = { winner: 'player1' };
      
      gameService.onGameEnd(onGameEndCallback);
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      gameService.startGame();
      gameService.endGame(result);
      
      expect(onGameEndCallback).toHaveBeenCalledWith(result);
    });

    it('应该触发游戏解散回调', () => {
      const onDisbandCallback = vi.fn();
      gameService.onDisband(onDisbandCallback);
      
      gameService.disbandGame();
      
      expect(onDisbandCallback).toHaveBeenCalled();
    });
  });

  describe('消息处理', () => {
    beforeEach(() => {
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
    });

    it('应该处理来自已知连接的消息', () => {
      const payload = {
        domain: 'pregame',
        data: { type: 'ready', playerId: player1Id }
      };
      
      const result = gameService.onMessage('conn-1', payload);
      
      // 消息应该被处理（不返回错误）
      expect(result).toBeUndefined();
    });

    it('应该拒绝来自未知连接的消息', () => {
      const payload = { domain: 'pregame', data: { type: 'ready' } };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      gameService.onMessage('unknown-conn', payload);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown connection')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('游戏状态查询', () => {
    it('应该返回正确的游戏状态', () => {
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      
      const gameState = gameService.getGameState();
      
      expect(gameState).toEqual({
        gameId,
        phase: GamePhase.PREGAME,
        playerCount: 1,
        players: [player1Id],
        preGameState: expect.any(Object),
        gameState: undefined
      });
    });

    it('应该在游戏开始后返回游戏实例状态', () => {
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      gameService.startGame();
      
      const gameState = gameService.getGameState();
      
      expect(gameState.phase).toBe(GamePhase.INGAME);
      expect(gameState.gameState).toBeDefined();
      expect(gameState.preGameState).toBeUndefined();
    });
  });

  describe('连接生命周期', () => {
    it('应该处理连接断开', () => {
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      expect(gameService.hasPlayer(player1Id)).toBe(true);
      
      gameService.onDisconnect('conn-1');
      
      // 连接断开不应该立即移除玩家（可能重连）
      expect(gameService.hasPlayer(player1Id)).toBe(true);
    });

    it('应该处理连接重连', () => {
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      gameService.onDisconnect('conn-1');
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      gameService.onReconnect('conn-1');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connection reconnected')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('边界情况', () => {
    it('应该处理空的玩家连接配置', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      gameService.onOpen('conn-1', {});
      
      expect(gameService.getPlayerCount()).toBe(0);
      
      consoleSpy.mockRestore();
    });

    it('应该处理重复的玩家连接', () => {
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      gameService.onOpen('conn-2', { playerId: player1Id, playerName: 'Player 1' });
      
      // 应该只有一个玩家实例
      expect(gameService.getPlayerCount()).toBe(1);
    });

    it('应该处理游戏已解散后的连接尝试', () => {
      gameService.disbandGame();
      
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      gameService.onOpen('conn-1', { playerId: player1Id, playerName: 'Player 1' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Game ended, rejecting connection')
      );
      
      consoleSpy.mockRestore();
    });
  });
});

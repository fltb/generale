import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameService, GamePhase, GameServiceConfig } from '../GameService';
import { GameInstance } from '../../instance/GameInstance';
import { PreGameInstance } from '../../instance/PreGameInstance';
import { GameId } from '@generale/types';

// Mock dependencies
vi.mock('../../plugins/websocket', () => ({
  registerDomainHandler: vi.fn(),
  unregisterDomainHandler: vi.fn(),
}));

vi.mock('../../instance/PreGameInstance', () => ({
  PreGameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: [
        { 
          id: 'player1', 
          name: 'Player 1', 
          teamId: 'team1', 
          isHost: true, 
          ready: false, 
          tileColor: 0xff0000 
        },
        { 
          id: 'player2', 
          name: 'Player 2', 
          teamId: 'team2', 
          isHost: false, 
          ready: true, 
          tileColor: 0x00ff00 
        }
      ],
      playerLimit: 4,
      gameSetting: { speed: 1, tileGrowth: 1, tileConsume: 1 },
      mapSetting: { type: 'Random', width: 10, height: 10, tileFrequency: {} }
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true })
  }))
}));

vi.mock('../../instance/GameInstance', () => ({
  GameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: {
        player1: { id: 'player1', status: 'Playing', army: 10, land: 5, teamId: 'team1' },
        player2: { id: 'player2', status: 'Playing', army: 8, land: 3, teamId: 'team2' }
      },
      status: 'Playing',
      tick: 5
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    advance: vi.fn()
  }))
}));

vi.mock('../../instance/GameChatInstance', () => ({
  GameChatInstance: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true })
  }))
}));

describe('GameService HTTP API', () => {
  let gameService: GameService;
  let config: GameServiceConfig;

  beforeEach(() => {
    config = {
      gameId: 'test-game-123' as GameId,
      maxPlayers: 4,
      chatMaxMessages: 100
    };
    gameService = new GameService(config);
  });

  afterEach(() => {
    gameService.disbandGame();
    vi.clearAllMocks();
  });

  describe('createGameForAPI', () => {
    it('应该创建新的 GameService 实例', () => {
      const newConfig: GameServiceConfig = {
        gameId: 'api-game-456' as GameId,
        maxPlayers: 8
      };
      
      const newGameService = GameService.createGameForAPI(newConfig);
      
      expect(newGameService).toBeInstanceOf(GameService);
      expect(newGameService.getGameId()).toBe('api-game-456');
      expect(newGameService.getPhase()).toBe(GamePhase.PREGAME);
      
      newGameService.disbandGame();
    });
  });

  describe('joinGameForAPI', () => {
    it('应该允许在 PREGAME 阶段加入游戏', () => {
      // 初始化 PreGameInstance
      gameService['preGameInstance'] = new PreGameInstance();
      
      const result = gameService.joinGameForAPI('new-player');
      
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('domains');
      if (result.success) {
        expect(result.domains).toEqual({ pregame: true });
      }
    });

    it('应该拒绝在非 PREGAME 阶段加入游戏', () => {
      gameService['phase'] = GamePhase.INGAME;
      
      const result = gameService.joinGameForAPI('new-player');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toContain('Cannot join game in phase');
      }
    });

    it('应该拒绝已存在的玩家重复加入', () => {
      // 初始化 PreGameInstance
      gameService['preGameInstance'] = new PreGameInstance();
      
      const result = gameService.joinGameForAPI('player1'); // 已存在的玩家
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Player already in game');
      }
    });

    it('应该拒绝超过最大玩家数的加入', () => {
      // Mock 满员状态
      const mockPreGameInstance = new PreGameInstance();
      mockPreGameInstance.getState = vi.fn().mockReturnValue({
        players: [
          { id: 'player1', name: 'Player 1' },
          { id: 'player2', name: 'Player 2' },
          { id: 'player3', name: 'Player 3' },
          { id: 'player4', name: 'Player 4' }
        ],
        playerLimit: 4
      });
      gameService['preGameInstance'] = mockPreGameInstance;
      
      const result = gameService.joinGameForAPI('new-player');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Game is full');
      }
    });

    it('应该使用配置的最大玩家数作为后备', () => {
      // Mock PreGameInstance 没有 playerLimit
      const mockPreGameInstance = new PreGameInstance();
      mockPreGameInstance.getState = vi.fn().mockReturnValue({
        players: [
          { id: 'player1', name: 'Player 1' },
          { id: 'player2', name: 'Player 2' },
          { id: 'player3', name: 'Player 3' },
          { id: 'player4', name: 'Player 4' }
        ],
        playerLimit: undefined
      });
      gameService['preGameInstance'] = mockPreGameInstance;
      
      const result = gameService.joinGameForAPI('new-player');
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toBe('Game is full');
      }
    });
  });

  describe('getGameInfo', () => {
    it('应该返回 PREGAME 阶段的游戏信息', () => {
      // 初始化 PreGameInstance
      gameService['preGameInstance'] = new PreGameInstance();
      
      const info = gameService.getGameInfo();
      
      expect(info).toEqual({
        gameId: 'test-game-123',
        phase: GamePhase.PREGAME,
        playerCount: 2,
        maxPlayers: 4,
        players: [
          {
            playerId: 'player1',
            playerName: 'Player 1',
            connected: { pregame: true, game: false, chat: false },
            teamId: 'team1',
            tileColor: 0xff0000,
            isHost: true
          },
          {
            playerId: 'player2',
            playerName: 'Player 2',
            connected: { pregame: true, game: false, chat: false },
            teamId: 'team2',
            tileColor: 0x00ff00,
            isHost: false
          }
        ],
        preGameState: expect.any(Object),
        gameState: undefined
      });
    });

    it('应该返回 INGAME 阶段的游戏信息', () => {
      // 设置为 INGAME 阶段
      gameService['phase'] = GamePhase.INGAME;
      gameService['gameInstance'] = new GameInstance();
      
      const info = gameService.getGameInfo();
      
      expect(info).toEqual({
        gameId: 'test-game-123',
        phase: GamePhase.INGAME,
        playerCount: 2,
        maxPlayers: 2,
        players: [
          {
            playerId: 'player1',
            playerName: '',
            connected: { pregame: false, game: true, chat: false },
            teamId: 'team1'
          },
          {
            playerId: 'player2',
            playerName: '',
            connected: { pregame: false, game: true, chat: false },
            teamId: 'team2'
          }
        ],
        preGameState: undefined,
        gameState: expect.any(Object)
      });
    });

    it('应该返回其他阶段的基本游戏信息', () => {
      gameService['phase'] = GamePhase.ENDED;
      
      const info = gameService.getGameInfo();
      
      expect(info).toEqual({
        gameId: 'test-game-123',
        phase: GamePhase.ENDED,
        playerCount: 0,
        maxPlayers: 4,
        players: [],
        preGameState: undefined,
        gameState: undefined
      });
    });

    it('应该使用默认最大玩家数', () => {
      const configWithoutMaxPlayers: GameServiceConfig = {
        gameId: 'test-game-456' as GameId
      };
      const serviceWithoutMaxPlayers = new GameService(configWithoutMaxPlayers);
      
      const info = serviceWithoutMaxPlayers.getGameInfo();
      
      expect(info.maxPlayers).toBe(8); // 默认值
      
      serviceWithoutMaxPlayers.disbandGame();
    });
  });

  describe('玩家查询方法', () => {
    describe('getPlayerCount', () => {
      it('应该返回 PREGAME 阶段的玩家数量', () => {
        gameService['preGameInstance'] = new PreGameInstance();
        
        expect(gameService.getPlayerCount()).toBe(2);
      });

      it('应该返回 INGAME 阶段的玩家数量', () => {
        gameService['phase'] = GamePhase.INGAME;
        gameService['gameInstance'] = new GameInstance();
        
        expect(gameService.getPlayerCount()).toBe(2);
      });

      it('应该在其他阶段返回 0', () => {
        gameService['phase'] = GamePhase.ENDED;
        
        expect(gameService.getPlayerCount()).toBe(0);
      });
    });

    describe('getPlayers', () => {
      it('应该返回 PREGAME 阶段的玩家列表', () => {
        gameService['preGameInstance'] = new PreGameInstance();
        
        expect(gameService.getPlayers()).toEqual(['player1', 'player2']);
      });

      it('应该返回 INGAME 阶段的玩家列表', () => {
        gameService['phase'] = GamePhase.INGAME;
        gameService['gameInstance'] = new GameInstance();
        
        expect(gameService.getPlayers()).toEqual(['player1', 'player2']);
      });

      it('应该在其他阶段返回空数组', () => {
        gameService['phase'] = GamePhase.ENDED;
        
        expect(gameService.getPlayers()).toEqual([]);
      });
    });

    describe('hasPlayer', () => {
      it('应该在 PREGAME 阶段正确检查玩家存在', () => {
        gameService['preGameInstance'] = new PreGameInstance();
        
        expect(gameService.hasPlayer('player1')).toBe(true);
        expect(gameService.hasPlayer('nonexistent')).toBe(false);
      });

      it('应该在 INGAME 阶段正确检查玩家存在', () => {
        gameService['phase'] = GamePhase.INGAME;
        gameService['gameInstance'] = new GameInstance();
        
        expect(gameService.hasPlayer('player1')).toBe(true);
        expect(gameService.hasPlayer('nonexistent')).toBe(false);
      });

      it('应该在其他阶段返回 false', () => {
        gameService['phase'] = GamePhase.ENDED;
        
        expect(gameService.hasPlayer('player1')).toBe(false);
      });
    });
  });

  describe('getGameState', () => {
    it('应该返回完整的游戏状态信息', () => {
      gameService['preGameInstance'] = new PreGameInstance();
      
      const state = gameService.getGameState();
      
      expect(state).toEqual({
        gameId: 'test-game-123',
        phase: GamePhase.PREGAME,
        playerCount: 2,
        players: ['player1', 'player2'],
        preGameState: expect.any(Object),
        gameState: undefined
      });
    });
  });
});

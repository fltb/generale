import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameService, GamePhase, GameServiceConfig } from '../GameService';
import { GameInstance } from '../../instance/GameInstance';
import { PreGameInstance } from '../../instance/PreGameInstance';
import { PreGameMapType, GameStatus } from '@generale/types';
import { unregisterDomainHandler, registerDomainHandler } from '../../../plugins/websocket';
import { GameId } from '@generale/types';

// Mock dependencies
vi.mock('../../../plugins/websocket', () => ({
  registerDomainHandler: vi.fn(),
  unregisterDomainHandler: vi.fn(),
}));

vi.mock('../../instance/PreGameInstance', () => ({
  PreGameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: [
        { id: 'player1', name: 'Player 1', teamId: 'team1', isHost: true, ready: false, tileColor: 0xff0000 },
        { id: 'player2', name: 'Player 2', teamId: 'team2', isHost: false, ready: true, tileColor: 0x00ff00 }
      ],
      playerLimit: 8,
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
      tick: 0
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    advance: vi.fn(),
    onEndGame: vi.fn()
  }))
}));

vi.mock('../../instance/GameChatInstance', () => ({
  GameChatInstance: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true })
  }))
}));

vi.mock('../core/map-gen', () => ({
  generateMap: vi.fn().mockReturnValue({
    width: 10,
    height: 10,
    tiles: []
  })
}));

describe('GameService Lifecycle', () => {
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

  describe('初始化', () => {
    it('应该以 PREGAME 阶段初始化', () => {
      expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
      expect(gameService.getGameId()).toBe('test-game-123');
    });

    it('应该注册 WebSocket 域名处理器', () => {
      expect(registerDomainHandler).toHaveBeenCalledTimes(3);
      expect(registerDomainHandler).toHaveBeenCalledWith('pregame-test-game-123', expect.any(Function));
      expect(registerDomainHandler).toHaveBeenCalledWith('game-test-game-123', expect.any(Function));
      expect(registerDomainHandler).toHaveBeenCalledWith('chat-test-game-123', expect.any(Function));
    });
  });

  describe('阶段转换', () => {
    it('应该能从 PREGAME 转换到 INGAME', () => {
      // 模拟 PreGameInstance 存在
      gameService['preGameInstance'] = new PreGameInstance({
  gameId: 'mock-game',
  hostId: 'host',
  players: [],
  mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
  gameSetting: { speed: 1, tileGrow: {
    PLAIN: { duration: 1, growth: 1 },
    THRONE: { duration: 1, growth: 1 },
    BARRACKS: { duration: 1, growth: 1 },
    MOUNTAIN: { duration: 1, growth: 1 },
    SWAMP: { duration: 1, growth: 1 },
    FOG: { duration: 1, growth: 1 }
  }, afkThreshold: 30 },
  playerLimit: 8,
  started: false,
  teamCount: 2
}, new Map());
      
      gameService.startGame({
  gameId: 'test-game-123',
  gameSetting: { speed: 1.0, tileGrow: {
    PLAIN:   { duration: 40,      growth: 1 },
    THRONE:  { duration: 1,       growth: 1 },
    BARRACKS:{ duration: 1,       growth: 1 },
    MOUNTAIN:{ duration: 1e10,    growth: 0 },
    SWAMP:   { duration: 1,       growth: -1 },
    FOG:     { duration: 1e10,    growth: 0 },
  }, afkThreshold: 30 },
  mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
  teamCount: 2,
  players: [],
  playerLimit: 8,
  hostId: 'host',
  started: false,
});
      
      expect(gameService.getPhase()).toBe(GamePhase.INGAME);
      expect(gameService['gameInstance']).toBeTruthy();
      expect(gameService['preGameInstance']).toBeNull();
    });

    it('应该能从 INGAME 转换到 ENDED', () => {
      // 先转到 INGAME
      gameService['phase'] = GamePhase.INGAME;
      gameService['gameInstance'] = new GameInstance({
  status: GameStatus.Playing,
  tick: 0,
  settings: {
    tileGrow: {
      PLAIN: { duration: 1, growth: 1 },
      THRONE: { duration: 1, growth: 1 },
      BARRACKS: { duration: 1, growth: 1 },
      MOUNTAIN: { duration: 1, growth: 1 },
      SWAMP: { duration: 1, growth: 1 },
      FOG: { duration: 1, growth: 1 }
    },
    afkThreshold: 30
  },
  players: {},
  teams: {},
  map: { width: 10, height: 10, tiles: [] }
}, { playerDisplay: {} }, []);
      
      gameService.endGame({ winnerId: 'player1', reason: 'Victory' });
      
      expect(gameService.getPhase()).toBe(GamePhase.ENDED);
      expect(gameService['gameInstance']).toBeNull();
    });

    it('应该能从任何阶段转换到 DISBANDED', () => {
      gameService.disbandGame();
      
      expect(gameService.getPhase()).toBe(GamePhase.DISBANDED);
      expect(gameService['preGameInstance']).toBeNull();
      expect(gameService['gameInstance']).toBeNull();
    });

    it('不应该在错误阶段开始游戏', () => {
      gameService['phase'] = GamePhase.INGAME;
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      gameService.startGame();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('不应该在错误阶段结束游戏', () => {
      // 在 PREGAME 阶段尝试结束游戏应该不会抛错，但会记录错误
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      gameService.endGame();
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(gameService.getPhase()).toBe(GamePhase.PREGAME); // 阶段不变
      
      consoleSpy.mockRestore();
    });
  });

  describe('事件回调', () => {
    it('应该触发游戏开始回调', () => {
      const onStartCallback = vi.fn();
      gameService.onGameStart(onStartCallback);
      
      // 模拟 PreGameInstance 存在
      gameService['preGameInstance'] = new PreGameInstance({
  gameId: 'mock-game',
  hostId: 'host',
  players: [],
  mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
  gameSetting: { speed: 1, tileGrow: {
    PLAIN: { duration: 1, growth: 1 },
    THRONE: { duration: 1, growth: 1 },
    BARRACKS: { duration: 1, growth: 1 },
    MOUNTAIN: { duration: 1, growth: 1 },
    SWAMP: { duration: 1, growth: 1 },
    FOG: { duration: 1, growth: 1 }
  }, afkThreshold: 30 },
  playerLimit: 8,
  started: false,
  teamCount: 2
}, new Map());
      
      gameService.startGame({
  gameId: 'test-game-123',
  gameSetting: { speed: 1.0, tileGrow: {
    PLAIN:   { duration: 40,      growth: 1 },
    THRONE:  { duration: 1,       growth: 1 },
    BARRACKS:{ duration: 1,       growth: 1 },
    MOUNTAIN:{ duration: 1e10,    growth: 0 },
    SWAMP:   { duration: 1,       growth: -1 },
    FOG:     { duration: 1e10,    growth: 0 },
  }, afkThreshold: 30 },
  mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
  teamCount: 2,
  players: [],
  playerLimit: 8,
  hostId: 'host',
  started: false,
});
      
      expect(onStartCallback).toHaveBeenCalled();
    });

    it('应该触发游戏结束回调', () => {
      const onEndCallback = vi.fn();
      const result = { winnerId: 'player1', reason: 'Victory' };
      
      gameService.onGameEnd(onEndCallback);
      gameService['phase'] = GamePhase.INGAME;
      gameService['gameInstance'] = new GameInstance({
  status: GameStatus.Playing,
  tick: 0,
  settings: {
    tileGrow: {
      PLAIN: { duration: 1, growth: 1 },
      THRONE: { duration: 1, growth: 1 },
      BARRACKS: { duration: 1, growth: 1 },
      MOUNTAIN: { duration: 1, growth: 1 },
      SWAMP: { duration: 1, growth: 1 },
      FOG: { duration: 1, growth: 1 }
    },
    afkThreshold: 30
  },
  players: {},
  teams: {},
  map: { width: 10, height: 10, tiles: [] }
}, { playerDisplay: {} }, []);
      
      gameService.endGame(result);
      
      expect(onEndCallback).toHaveBeenCalledWith(result);
    });

    it('应该触发游戏解散回调', () => {
      const onDisbandCallback = vi.fn();
      gameService.onDisband(onDisbandCallback);
      
      gameService.disbandGame();
      
      expect(onDisbandCallback).toHaveBeenCalled();
    });
  });

  describe('清理资源', () => {
    it('解散时应该注销所有域名处理器', () => {
      // 直接使用上方 import 的 unregisterDomainHandler（已被 vi.mock）
      
      gameService.disbandGame();
      
      expect(unregisterDomainHandler).toHaveBeenCalledWith('pregame-test-game-123');
      expect(unregisterDomainHandler).toHaveBeenCalledWith('game-test-game-123');
      expect(unregisterDomainHandler).toHaveBeenCalledWith('chat-test-game-123');
    });

    it('解散时应该销毁所有实例', () => {
      const preGameInstance = new PreGameInstance({
  gameId: 'mock-game',
  hostId: 'host',
  players: [],
  mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
  gameSetting: { speed: 1, tileGrow: {
    PLAIN: { duration: 1, growth: 1 },
    THRONE: { duration: 1, growth: 1 },
    BARRACKS: { duration: 1, growth: 1 },
    MOUNTAIN: { duration: 1, growth: 1 },
    SWAMP: { duration: 1, growth: 1 },
    FOG: { duration: 1, growth: 1 }
  }, afkThreshold: 30 },
  playerLimit: 8,
  started: false,
  teamCount: 2
}, new Map());
      const gameInstance = new GameInstance({
  status: GameStatus.Playing,
  tick: 0,
  settings: {
    tileGrow: {
      PLAIN: { duration: 1, growth: 1 },
      THRONE: { duration: 1, growth: 1 },
      BARRACKS: { duration: 1, growth: 1 },
      MOUNTAIN: { duration: 1, growth: 1 },
      SWAMP: { duration: 1, growth: 1 },
      FOG: { duration: 1, growth: 1 }
    },
    afkThreshold: 30
  },
  players: {},
  teams: {},
  map: { width: 10, height: 10, tiles: [] }
}, { playerDisplay: {} }, []);
      const chatInstance = gameService['chatInstance'];
      
      gameService['preGameInstance'] = preGameInstance;
      gameService['gameInstance'] = gameInstance;
      
      gameService.disbandGame();
      
      expect(preGameInstance.destroy).toHaveBeenCalled();
      expect(gameInstance.destroy).toHaveBeenCalled();
      expect(chatInstance.destroy).toHaveBeenCalled();
    });
  });
});

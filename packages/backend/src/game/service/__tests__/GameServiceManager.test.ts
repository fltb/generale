import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameServiceManager } from '../GameServiceManager';
import { GameService, GameServiceConfig } from '../GameService';
import { GameId } from '@generale/types';

// Mock GameService
vi.mock('../GameService', () => ({
  GameService: vi.fn().mockImplementation((config) => ({
    getGameId: () => config.gameId,
    onGameEnd: vi.fn(),
    onDisband: vi.fn(),
    disbandGame: vi.fn(),
    getPhase: vi.fn().mockReturnValue('pregame'),
    getPlayerCount: vi.fn().mockReturnValue(0),
    getPlayers: vi.fn().mockReturnValue([])
  })),
  GamePhase: {
    PREGAME: 'pregame',
    INGAME: 'ingame',
    ENDED: 'ended',
    DISBANDED: 'disbanded'
  }
}));

describe('GameServiceManager', () => {
  let manager: GameServiceManager;
  const gameId1: GameId = 'game-123';
  const gameId2: GameId = 'game-456';

  beforeEach(() => {
    // 重置单例实例
    (GameServiceManager as any).instance = undefined;
    manager = GameServiceManager.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // 清理所有游戏
    manager.cleanup();
  });

  describe('单例模式', () => {
    it('应该返回同一个实例', () => {
      const manager1 = GameServiceManager.getInstance();
      const manager2 = GameServiceManager.getInstance();
      
      expect(manager1).toBe(manager2);
    });
  });

  describe('游戏创建', () => {
    it('应该能够创建新游戏', () => {
      const config: GameServiceConfig = {
        gameId: gameId1,
        maxPlayers: 4
      };

      const gameService = manager.createGame(config);

      expect(gameService).toBeDefined();
      expect(gameService.getGameId()).toBe(gameId1);
      expect(manager.getGameCount()).toBe(1);
      expect(manager.getActiveGames()).toContain(gameId1);
    });

    it('应该为创建的游戏设置回调', () => {
      const config: GameServiceConfig = {
        gameId: gameId1,
        maxPlayers: 4
      };

      const gameService = manager.createGame(config);

      // 验证回调被设置
      expect(gameService.onGameEnd).toHaveBeenCalled();
      expect(gameService.onDisband).toHaveBeenCalled();
    });

    it('应该拒绝创建重复的游戏ID', () => {
      const config: GameServiceConfig = {
        gameId: gameId1,
        maxPlayers: 4
      };

      manager.createGame(config);

      expect(() => {
        manager.createGame(config);
      }).toThrow(`Game ${gameId1} already exists`);
    });

    it('应该能够创建多个不同的游戏', () => {
      const config1: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      const config2: GameServiceConfig = { gameId: gameId2, maxPlayers: 6 };

      manager.createGame(config1);
      manager.createGame(config2);

      expect(manager.getGameCount()).toBe(2);
      expect(manager.getActiveGames()).toEqual(expect.arrayContaining([gameId1, gameId2]));
    });
  });

  describe('游戏查询', () => {
    beforeEach(() => {
      const config: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      manager.createGame(config);
    });

    it('应该能够获取存在的游戏', () => {
      const gameService = manager.getGame(gameId1);

      expect(gameService).toBeDefined();
      expect(gameService!.getGameId()).toBe(gameId1);
    });

    it('应该对不存在的游戏返回 undefined', () => {
      const gameService = manager.getGame('non-existent-game' as GameId);

      expect(gameService).toBeUndefined();
    });

    it('应该返回正确的游戏数量', () => {
      expect(manager.getGameCount()).toBe(1);

      const config2: GameServiceConfig = { gameId: gameId2, maxPlayers: 4 };
      manager.createGame(config2);

      expect(manager.getGameCount()).toBe(2);
    });

    it('应该返回所有活跃游戏的ID列表', () => {
      const config2: GameServiceConfig = { gameId: gameId2, maxPlayers: 4 };
      manager.createGame(config2);

      const activeGames = manager.getActiveGames();

      expect(activeGames).toHaveLength(2);
      expect(activeGames).toContain(gameId1);
      expect(activeGames).toContain(gameId2);
    });
  });

  describe('游戏移除', () => {
    let gameService: GameService;

    beforeEach(() => {
      const config: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      gameService = manager.createGame(config);
    });

    it('应该能够移除存在的游戏', () => {
      expect(manager.getGameCount()).toBe(1);

      const result = manager.removeGame(gameId1);

      expect(result).toBe(true);
      expect(manager.getGameCount()).toBe(0);
      expect(manager.getGame(gameId1)).toBeUndefined();
      expect(gameService.disbandGame).toHaveBeenCalled();
    });

    it('应该对不存在的游戏返回 false', () => {
      const result = manager.removeGame('non-existent-game' as GameId);

      expect(result).toBe(false);
      expect(manager.getGameCount()).toBe(1); // 原游戏仍存在
    });

    it('应该在移除游戏时调用 disbandGame', () => {
      manager.removeGame(gameId1);

      expect(gameService.disbandGame).toHaveBeenCalled();
    });
  });

  describe('自动清理', () => {
    it('应该在游戏结束时自动移除游戏', () => {
      const config: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      const gameService = manager.createGame(config);

      expect(manager.getGameCount()).toBe(1);

      // 模拟游戏结束回调
      const onGameEndCallback = (gameService.onGameEnd as any).mock.calls[0][0];
      onGameEndCallback();

      expect(manager.getGameCount()).toBe(0);
    });

    it('应该在游戏解散时自动移除游戏', () => {
      const config: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      const gameService = manager.createGame(config);

      expect(manager.getGameCount()).toBe(1);

      // 模拟游戏解散回调
      const onDisbandCallback = (gameService.onDisband as any).mock.calls[0][0];
      onDisbandCallback();

      expect(manager.getGameCount()).toBe(0);
    });
  });

  describe('全局清理', () => {
    beforeEach(() => {
      const config1: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      const config2: GameServiceConfig = { gameId: gameId2, maxPlayers: 6 };
      
      manager.createGame(config1);
      manager.createGame(config2);
    });

    it('应该能够清理所有游戏', () => {
      expect(manager.getGameCount()).toBe(2);

      manager.cleanup();

      expect(manager.getGameCount()).toBe(0);
      expect(manager.getActiveGames()).toHaveLength(0);
    });

    it('应该在清理时调用所有游戏的 disbandGame', () => {
      const game1 = manager.getGame(gameId1)!;
      const game2 = manager.getGame(gameId2)!;

      manager.cleanup();

      expect(game1.disbandGame).toHaveBeenCalled();
      expect(game2.disbandGame).toHaveBeenCalled();
    });

    it('应该在清理后能够重新创建游戏', () => {
      manager.cleanup();
      expect(manager.getGameCount()).toBe(0);

      const config: GameServiceConfig = { gameId: 'new-game' as GameId, maxPlayers: 4 };
      manager.createGame(config);

      expect(manager.getGameCount()).toBe(1);
    });
  });

  describe('边界情况', () => {
    it('应该处理空的游戏列表', () => {
      expect(manager.getGameCount()).toBe(0);
      expect(manager.getActiveGames()).toEqual([]);
      
      manager.cleanup(); // 应该不会出错
      expect(manager.getGameCount()).toBe(0);
    });

    it('应该处理多次清理调用', () => {
      const config: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      manager.createGame(config);

      manager.cleanup();
      expect(manager.getGameCount()).toBe(0);

      manager.cleanup(); // 第二次清理应该不会出错
      expect(manager.getGameCount()).toBe(0);
    });

    it('应该处理移除已移除的游戏', () => {
      const config: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      manager.createGame(config);

      const result1 = manager.removeGame(gameId1);
      const result2 = manager.removeGame(gameId1);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });
  });

  describe('日志记录', () => {
    it('应该记录游戏创建日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const config: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      manager.createGame(config);

      expect(consoleSpy).toHaveBeenCalledWith(
        `[GameServiceManager] Created game: ${gameId1}`
      );

      consoleSpy.mockRestore();
    });

    it('应该记录游戏移除日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const config: GameServiceConfig = { gameId: gameId1, maxPlayers: 4 };
      manager.createGame(config);
      manager.removeGame(gameId1);

      expect(consoleSpy).toHaveBeenCalledWith(
        `[GameServiceManager] Removed game: ${gameId1}`
      );

      consoleSpy.mockRestore();
    });

    it('应该记录清理日志', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      manager.cleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[GameServiceManager] All games cleaned up'
      );

      consoleSpy.mockRestore();
    });
  });
});

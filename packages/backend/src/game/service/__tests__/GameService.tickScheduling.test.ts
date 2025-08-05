import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameService, GamePhase, GameServiceConfig } from '../GameService';
import { PreGameMapType } from '@generale/types';
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
        { id: 'player1', name: 'Player 1', teamId: 'team1', isHost: true, ready: false, tileColor: 0xff0000 }
      ],
      playerLimit: 8,
      gameSetting: { speed: 2, tileGrowth: 1, tileConsume: 1 },
      mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} }
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true })
  }))
}));

vi.mock('../../instance/GameInstance', () => ({
  GameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: {
        player1: { id: 'player1', status: 'Playing', army: 10, land: 5, teamId: 'team1' }
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

describe('GameService Tick Scheduling', () => {
  let gameService: GameService;
  let config: GameServiceConfig;

  beforeEach(() => {
    vi.useFakeTimers();
    config = {
      gameId: 'test-game-123' as GameId,
      maxPlayers: 4
    };
    gameService = new GameService(config);
  });

  afterEach(() => {
    vi.useRealTimers();
    gameService.disbandGame();
    vi.clearAllMocks();
  });

  describe('游戏开始时的 Tick 调度', () => {
    it('应该在游戏开始时调度第一个 tick', () => {
      // 传递完整的 PreGameRoomState 参数对象
      const preGameRoomState = {
        gameId: 'test-game-123',
        gameSetting: { speed: 1.0, tileGrow: {}, afkThreshold: 30 },
        mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
        teamCount: 2,
        players: [],
        playerLimit: 8,
        hostId: 'host',
        roomId: 'room',
        phase: 'PREGAME',
        started: false,
        teams: [],
        config: {},
      };

      // 模拟 PreGameInstance 并 mock getState 返回 state
      const mockPreGameInstance = new PreGameInstance();
      mockPreGameInstance.getState = vi.fn().mockReturnValue(preGameRoomState);
      gameService['preGameInstance'] = mockPreGameInstance;
      gameService['gameInstance'] = { advance: vi.fn() } as any;
      gameService.startGame(preGameRoomState);
      // Vitest fake timers: setTimeout returns number, not Timeout object
      expect(typeof gameService['tickTimerId'] === 'number' || !!gameService['tickTimerId']).toBeTruthy();
    });

    it('应该根据游戏速度设置 tick 间隔', () => {
      // 传递完整的 PreGameRoomState 参数对象
      const preGameRoomState2 = {
        gameId: 'test-game-123',
        gameSetting: { speed: 2.0, tileGrow: {}, afkThreshold: 30 },
        mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
        teamCount: 2,
        players: [],
        playerLimit: 8,
        hostId: 'host',
        roomId: 'room',
        phase: 'PREGAME',
        started: false,
        teams: [],
        config: {},
      };

      // 模拟 PreGameInstance 并 mock getState 返回 state
      const mockPreGameInstance2 = new PreGameInstance();
      mockPreGameInstance2.getState = vi.fn().mockReturnValue(preGameRoomState2);
      gameService['preGameInstance'] = mockPreGameInstance2;
      gameService['gameInstance'] = { advance: vi.fn() } as any;
      gameService.startGame(preGameRoomState2);
      // 验证初始延迟（5秒）
      // Vitest fake timers: setTimeout returns number, not Timeout object
      expect(typeof gameService['tickTimerId'] === 'number' || !!gameService['tickTimerId']).toBeTruthy();
      
      // 快进到初始延迟后
      vi.advanceTimersByTime(5000);
      
      // 验证 GameInstance.advance 被调用
      expect(gameService['gameInstance']!.advance).toHaveBeenCalled();
    });

    it('应该在最小间隔 250ms 以上调度 tick', () => {
      // 设置极高速度，应该被限制在 250ms
      const mockPreGameInstance = new PreGameInstance();
      mockPreGameInstance.getState = vi.fn().mockReturnValue({
        gameId: 'test-game-123',
        gameSetting: { speed: 10, tileGrow: {}, afkThreshold: 30 }, // 极高速度
        mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
        teamCount: 2,
        players: [{ id: 'player1', name: 'Player 1', teamId: 'team1', isHost: true, ready: false, tileColor: 0xff0000 }],
        playerLimit: 8,
        hostId: 'host',
        roomId: 'room',
        phase: 'PREGAME',
        started: false,
        teams: [],
        config: {},
      });
      gameService['preGameInstance'] = mockPreGameInstance;
      
      gameService.startGame(mockPreGameInstance.getState());

      
      // 快进到初始延迟后
      vi.advanceTimersByTime(5050);
      
      // 验证第一次 advance 被调用
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
      
      // 快进 250ms（最小间隔）
      vi.advanceTimersByTime(250);
      
      // 验证第二次 advance 被调用
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(2);
    });
  });

  describe('Tick 循环管理', () => {
    beforeEach(() => {
      // 设置游戏为 INGAME 状态
      gameService['phase'] = GamePhase.INGAME;
      gameService['gameInstance'] = new GameInstance();
    });

    it('应该持续调度 tick 直到游戏结束', () => {
      gameService['runTickLoop'](500);
      
      // 验证第一次 advance
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
      
      // 快进一个间隔
      vi.advanceTimersByTime(500);
      
      // 验证第二次 advance
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(2);
      
      // 再快进一个间隔
      vi.advanceTimersByTime(500);
      
      // 验证第三次 advance
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(3);
    });

    it('应该在游戏阶段改变时停止 tick', () => {
      gameService['runTickLoop'](500);
      
      // 验证第一次 advance
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
      
      // 改变游戏阶段
      gameService['phase'] = GamePhase.ENDED;
      
      // 快进一个间隔
      vi.advanceTimersByTime(500);
      
      // 验证没有更多 advance 调用
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
      expect(gameService['tickTimerId']).toBeNull();
    });

    it('应该在 GameInstance 不存在时停止 tick', () => {
      gameService['runTickLoop'](500);
      
      // 验证第一次 advance
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
      
      // 移除 GameInstance
      gameService['gameInstance'] = null;
      
      // 快进一个间隔
      vi.advanceTimersByTime(500);
      
      // 验证没有更多 advance 调用
      expect(gameService['tickTimerId']).toBeNull();
    });

    it('应该处理 advance 过程中的错误', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock advance 抛出错误
      gameService['gameInstance']!.advance = vi.fn().mockImplementation(() => {
        throw new Error('Game advance error');
      });
      
      gameService['runTickLoop'](500);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error during game tick:'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Timer 清理', () => {
    it('应该在游戏结束时清理 timer', () => {
      // 设置游戏为 INGAME 状态并启动 tick
      gameService['phase'] = GamePhase.INGAME;
      gameService['gameInstance'] = new GameInstance();
      gameService['tickTimerId'] = setTimeout(() => {}, 1000) as any;
      
      gameService.endGame();
      
      expect(gameService['tickTimerId']).toBeNull();
    });

    it('应该在游戏解散时清理 timer', () => {
      // 设置 timer
      gameService['tickTimerId'] = setTimeout(() => {}, 1000) as any;
      
      gameService.disbandGame();
      
      expect(gameService['tickTimerId']).toBeNull();
    });

    it('应该防止重复调度 timer', () => {
      gameService['phase'] = GamePhase.INGAME;
      gameService['gameInstance'] = new GameInstance();
      
      // 第一次调度
      gameService['scheduleGameTicks'](1);
      const firstTimerId = gameService['tickTimerId'];
      
      // 第二次调度应该清理第一个 timer
      gameService['scheduleGameTicks'](1);
      const secondTimerId = gameService['tickTimerId'];
      
      expect(firstTimerId).not.toBe(secondTimerId);
      expect(gameService['tickTimerId']).toBe(secondTimerId);
    });
  });

  describe('边界情况', () => {
    it('应该处理速度为 0 或负数的情况', () => {
      const mockPreGameInstance = new PreGameInstance();
      mockPreGameInstance.getState = vi.fn().mockReturnValue({
        players: [{ id: 'player1', name: 'Player 1', teamId: 'team1', isHost: true, ready: false, tileColor: 0xff0000 }],
        playerLimit: 8,
        gameSetting: { speed: 0, tileGrow: {}, afkThreshold: 30 },
        mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} }
      });
      gameService['preGameInstance'] = mockPreGameInstance;
      
      gameService.startGame(mockPreGameInstance.getState());

      
      // 应该使用默认速度 1.0，间隔为 1000ms
      vi.advanceTimersByTime(5000); // 初始延迟
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
      
      vi.advanceTimersByTime(1000); // 默认间隔
      expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(2);
    });

    it('应该在非 INGAME 阶段时不调度 tick', () => {
      gameService['phase'] = GamePhase.PREGAME;
      
      gameService['scheduleGameTicks'](1);
      
      expect(gameService['tickTimerId']).toBeNull();
    });

    it('应该在没有 GameInstance 时不调度 tick', () => {
      gameService['phase'] = GamePhase.INGAME;
      gameService['gameInstance'] = null;
      
      gameService['scheduleGameTicks'](1);
      
      expect(gameService['tickTimerId']).toBeNull();
    });
  });
});

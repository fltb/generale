import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 模拟玩家列表状态
let mockPlayers: Array<{ id: string; name: string; teamId?: string; isHost?: boolean; ready?: boolean; tileColor?: number }> = [];
function getState() {
  return {
    players: mockPlayers,
    playerLimit: 4,
    gameSetting: { speed: 2, tileGrowth: 1, tileConsume: 1 },
    mapSetting: { type: 'Random', width: 10, height: 10, tileFrequency: {} }
  };
}

// Mock WebSocket 插件
vi.mock('../../plugins/websocket', () => ({
  registerDomainHandler: vi.fn(),
  unregisterDomainHandler: vi.fn(),
}));

// Mock PreGameInstance
vi.mock('../../instance/PreGameInstance', () => {
  class PreGameInstance {
    constructor(initialState: any, connectors: any) {}
    getState() { return getState(); }
    onStartGame = vi.fn();
    destroy     = vi.fn();
    addPlayer   = vi.fn().mockReturnValue({ success: true });
    advance     = vi.fn();
    onEndGame   = vi.fn();
  }
  // Use a global to be accessible inside the test file if needed
  (globalThis as any).PreGameInstance = PreGameInstance;
  return { PreGameInstance };
});

// Mock GameInstance
vi.mock('../../instance/GameInstance', () => ({
  GameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: {
        player1: { id: 'player1', status: 1, army: 10, land: 5, teamId: 'team1' },
        player2: { id: 'player2', status: 1, army: 8, land: 3, teamId: 'team2' }
      },
      teams: {
        team1: { id: 'team1', memberIds: ['player1'], status: 1 },
        team2: { id: 'team2', memberIds: ['player2'], status: 1 }
      },
      status: 1,
      tick: 0
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    advance: vi.fn(),
    onEndGame: vi.fn()
  }))
}));

// Mock GameChatInstance
vi.mock('../../instance/GameChatInstance', () => ({
  GameChatInstance: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    activeStageInstance: null
  }))
}));

// Mock map-gen
vi.mock('../core/map-gen', () => ({
  generateMap: vi.fn().mockReturnValue({
    width: 10,
    height: 10,
    tiles: Array(10).fill(null).map(() => Array(10).fill({ type: 'Plain', ownerId: null, army: 0 }))
  })
}));

import { GameService } from '../GameService';
import { GameId, GamePhase, PlayerId } from '@generale/types';

describe('GameService 全流程集成测试', () => {
  let gameService: GameService;
  let config: { gameId: GameId; maxPlayers: number; chatMaxMessages: number; gameTimeout: number; heartbeatInterval: number };

  beforeEach(() => {
    vi.useFakeTimers();
    config = {
      gameId: 'integration-test-game' as GameId,
      maxPlayers: 4,
      chatMaxMessages: 50,
      gameTimeout: 300000,
      heartbeatInterval: 30000
    };
    gameService = new GameService(config);
    mockPlayers = []; // Reset mock state for each test
  });

  afterEach(() => {
    vi.useRealTimers();
    gameService.disbandGame();
    vi.clearAllMocks();
  });

  it('完整流程：创建 → 准备 → 开始 → 推进 → 结束', () => {
    // 1. Initial State
    expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
    expect(gameService.getGameId()).toBe('integration-test-game');
    expect(gameService.getPlayerCount()).toBe(0);

    // 2. Pregame Phase: Simulate players joining by populating the mock state
    // FIX: Removed calls to the deleted `joinGameForAPI`.
    // We now directly manipulate the mock state to simulate players being present.
    mockPlayers.push({ id: 'player1', name: 'P1' });
    mockPlayers.push({ id: 'player2', name: 'P2' });

    // Initialize the pre-game instance which will now use the mock state with 2 players
    gameService['initializePreGame'](); 
    
    // Check game info after players have "joined"
    const info = gameService.getGameInfo();
    expect(info.playerCount).toBe(2);

    // 3. Setup Callbacks
    const onStart = vi.fn();
    const onEnd   = vi.fn();
    const onDb    = vi.fn();
    gameService.onGameStart(onStart);
    gameService.onGameEnd(onEnd);
    gameService.onDisband(onDb);

    // 4. Start Game
    gameService.startGame(gameService['preGameInstance']!.getState());
    expect(gameService.getPhase()).toBe(GamePhase.INGAME);
    expect(onStart).toHaveBeenCalled();

    // 5. Advance Ticks
    vi.advanceTimersByTime(5000); // Initial delay
    expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500); // Tick interval
    expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(2);

    // 6. End Game
    const result = { winnerId: 'player1', reason: 'Victory', duration: 120000, finalStats: {} };
    gameService.endGame(result);
    expect(gameService.getPhase()).toBe(GamePhase.ENDED);
    expect(onEnd).toHaveBeenCalledWith(result);

    // 7. Disband Game
    gameService.disbandGame();
    expect(gameService.getPhase()).toBe(GamePhase.DISBANDED);
    expect(onDb).toHaveBeenCalled();
  });

  it('异常流程：中途解散', () => {
    mockPlayers.push({ id: 'player1', name: 'P1' });
    gameService['initializePreGame']();
    gameService.startGame(gameService['preGameInstance']!.getState());

    expect(gameService.getPhase()).toBe(GamePhase.INGAME);
    const onDb = vi.fn();
    gameService.onDisband(onDb);
    gameService.disbandGame();
    expect(gameService.getPhase()).toBe(GamePhase.DISBANDED);
    expect(onDb).toHaveBeenCalled();
  });

  it('Tick 异常不崩溃', () => {
    mockPlayers.push({ id: 'player1', name: 'P1' });
    gameService['initializePreGame']();
    gameService.startGame(gameService['preGameInstance']!.getState());

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    gameService['gameInstance']!.advance = vi.fn(() => { throw new Error('oops'); });
    vi.advanceTimersByTime(5000); // Trigger the first tick
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error during game tick:'), expect.any(Error));
    expect(gameService.getPhase()).toBe(GamePhase.INGAME);
    spy.mockRestore();
  });

  it('边界：满员', () => {
    // Arrange: Set up a game state with 4 players and a limit of 4
    mockPlayers.push(
        { id: 'p1', name: 'p1' },
        { id: 'p2', name: 'p2' },
        { id: 'p3', name: 'p3' },
        { id: 'p4', name: 'p4' }
    );
    gameService['initializePreGame']();

    // Act: Test the correct API for checking connection readiness
    // FIX: Changed call from `joinGameForAPI` to `prepareConnectionForPlayer`.
    const res = gameService.prepareConnectionForPlayer('p5' as PlayerId);

    // Assert: Check against the new method's return format
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.reason).toBe('GAME_UNAVAILABLE');
      expect(res.message).toBe('Game is full. Cannot connect.');
    }
  });

  it('性能：高速 Tick 调度', () => {
    mockPlayers.push({ id: 'p1', name: 'p1', teamId: 't1', isHost: true, ready: true, tileColor: 0xFF0000 });
    
    // We need to create a custom preGameInstance for this specific setting
    const pre = new (globalThis as any).PreGameInstance();
    pre.getState = vi.fn().mockReturnValue({
      players: mockPlayers,
      playerLimit: 4,
      gameSetting: { speed: 10 }, // High speed setting
      mapSetting: { type: 'Random', width: 10, height: 10, tileFrequency: {} }
    });
    gameService['preGameInstance'] = pre;

    gameService.startGame(pre.getState());
    vi.advanceTimersByTime(5000);
    expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);

    // 1000ms / 10 speed = 100ms interval. But our code has a minimum of 250ms.
    // So we advance by the minimum interval.
    for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(250);
    }
    expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(11);
  });
});
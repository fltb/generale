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
  globalThis.PreGameInstance = PreGameInstance;
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

import { GameService, GamePhase } from '../GameService';
import { GameId } from '@generale/types';

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
    mockPlayers = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    gameService.disbandGame();
    vi.clearAllMocks();
    mockPlayers = [];
  });

  it('完整流程：创建 → 准备 → 开始 → 推进 → 结束', () => {
    expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
    expect(gameService.getGameId()).toBe('integration-test-game');
    expect(gameService.getPlayerCount()).toBe(0);

    gameService.initializePreGame();
    let r = gameService.joinGameForAPI('player1'); expect(r.success).toBe(true); mockPlayers.push({ id: 'player1', name: 'P1' });
    r = gameService.joinGameForAPI('player2');             expect(r.success).toBe(true); mockPlayers.push({ id: 'player2', name: 'P2' });
    r = gameService.joinGameForAPI('player1');             expect(r.success).toBe(false);

    gameService.initializePreGame();
    gameService.preGameInstance = new globalThis.PreGameInstance();
    const info = gameService.getGameInfo();
    expect(info.playerCount).toBe(2);

    const onStart = vi.fn();
    const onEnd   = vi.fn();
    const onDb    = vi.fn();
    gameService.onGameStart(onStart);
    gameService.onGameEnd(onEnd);
    gameService.onDisband(onDb);

    gameService.startGame(gameService.preGameInstance!.getState());
    expect(gameService.getPhase()).toBe(GamePhase.INGAME);
    expect(onStart).toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(2);

    const result = { winnerId: 'player1', reason: 'Victory', duration: 120000, finalStats: {} };
    gameService.endGame(result);
    expect(gameService.getPhase()).toBe(GamePhase.ENDED);
    expect(onEnd).toHaveBeenCalledWith(result);

    gameService.disbandGame();
    expect(gameService.getPhase()).toBe(GamePhase.DISBANDED);
    expect(onDb).toHaveBeenCalled();
  });

  it('异常流程：中途解散', () => {
    gameService.preGameInstance = new globalThis.PreGameInstance();
    gameService.startGame(gameService.preGameInstance!.getState());
    expect(gameService.getPhase()).toBe(GamePhase.INGAME);
    const onDb = vi.fn();
    gameService.onDisband(onDb);
    gameService.disbandGame();
    expect(gameService.getPhase()).toBe(GamePhase.DISBANDED);
    expect(onDb).toHaveBeenCalled();
  });

  it('Tick 异常不崩溃', () => {
    gameService.preGameInstance = new globalThis.PreGameInstance();
    gameService.startGame(gameService.preGameInstance!.getState());
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    gameService['gameInstance']!.advance = vi.fn(() => { throw new Error('oops'); });
    vi.advanceTimersByTime(5000);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Error during game tick:'), expect.any(Error));
    expect(gameService.getPhase()).toBe(GamePhase.INGAME);
    spy.mockRestore();
  });

  it('边界：满员', () => {
    const pre = new globalThis.PreGameInstance();
    pre.getState = vi.fn().mockReturnValue({ players: [1,2,3,4].map(i=>({id:`p${i}`,name:`p${i}`})), playerLimit:4 });
    gameService.preGameInstance = pre;
    const res = gameService.joinGameForAPI('p5');
    expect(res.success).toBe(false);
    expect(res.message).toBe('Game is full');
  });

  it('性能：高速 Tick 调度', () => {
    const pre = new globalThis.PreGameInstance();
    pre.getState = vi.fn().mockReturnValue({
      players:[{id:'p1',name:'p1',teamId:'t1',isHost:true,ready:true,tileColor:0xFF0000}],
      playerLimit:4,
      gameSetting:{speed:10,tileGrowth:1,tileConsume:1},
      mapSetting:{type:'Random',width:10,height:10,tileFrequency:{}}
    });
    gameService.preGameInstance = pre;
    gameService.startGame(pre.getState());
    vi.advanceTimersByTime(5000);
    expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(1);
    for(let i=0;i<10;i++) vi.advanceTimersByTime(250);
    expect(gameService['gameInstance']!.advance).toHaveBeenCalledTimes(11);
  });
});

import { type GameId, GamePhase, GameStatus, PreGameMapType } from "@generale/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerDomainHandler, unregisterDomainHandler } from "../../../plugins/websocket";
import { GameInstance } from "../../instance/GameInstance";
import { RoomInstance } from "../../instance/RoomInstance";
import { GameService, type GameServiceConfig } from "../GameService";

// Mock dependencies
vi.mock("../../../plugins/websocket", () => ({
  registerDomainHandler: vi.fn(),
  unregisterDomainHandler: vi.fn(),
}));

vi.mock("../../instance/RoomInstance", () => ({
  RoomInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: [
        { id: "player1", name: "Player 1", teamId: "team1", isHost: true, ready: false, tileColor: 0xff0000 },
        { id: "player2", name: "Player 2", teamId: "team2", isHost: false, ready: true, tileColor: 0x00ff00 },
      ],
      playerLimit: 8,
      gameSetting: { speed: 1, tileGrowth: 1, tileConsume: 1 },
      mapSetting: { type: "Random", width: 10, height: 10, tileFrequency: {} },
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    broadcastGameEnded: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
  })),
}));

vi.mock("../../instance/GameInstance", () => ({
  GameInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: {
        player1: { id: "player1", status: "Playing", army: 10, land: 5, teamId: "team1" },
        player2: { id: "player2", status: "Playing", army: 8, land: 3, teamId: "team2" },
      },
      status: "Playing",
      tick: 0,
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    broadcastGameEnded: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    advance: vi.fn(),
    startTicking: vi.fn(),
    stopTicking: vi.fn(),
    onEndGame: vi.fn(),
  })),
}));

vi.mock("../../instance/GameChatInstance", () => ({
  GameChatInstance: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    broadcastGameEnded: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
  })),
}));

function gs(s: GameService) {
  return s as unknown as {
    disbandGame: () => void;
    roomInstance: RoomInstance | null;
    gameInstance: GameInstance | null;
    phase: GamePhase;
    chatInstance: { destroy: Function };
  };
}

vi.mock("../core/map-gen", () => ({
  generateMap: vi.fn().mockReturnValue({
    width: 10,
    height: 10,
    tiles: [],
  }),
}));

describe("GameService Lifecycle", () => {
  let gameService: GameService;
  let config: GameServiceConfig;

  beforeEach(() => {
    config = {
      gameId: "test-game-123" as GameId,
      maxPlayers: 4,
      chatMaxMessages: 100,
    };
    gameService = new GameService(config);
  });

  afterEach(() => {
    gs(gameService).disbandGame();
    vi.clearAllMocks();
  });

  describe("初始化", () => {
    it("应该以 PREGAME 阶段初始化", () => {
      expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
      expect(gameService.getGameId()).toBe("test-game-123");
    });

    it("应该注册 WebSocket 域名处理器", () => {
      expect(registerDomainHandler).toHaveBeenCalledTimes(3);
      expect(registerDomainHandler).toHaveBeenCalledWith("room-test-game-123", expect.any(Function));
      expect(registerDomainHandler).toHaveBeenCalledWith("game-test-game-123", expect.any(Function));
      expect(registerDomainHandler).toHaveBeenCalledWith("chat-test-game-123", expect.any(Function));
    });
  });

  describe("阶段转换", () => {
    it("应该能从 PREGAME 转换到 INGAME", () => {
      // 模拟 RoomInstance 存在
      gs(gameService).roomInstance = new RoomInstance(
        {
          gameId: "mock-game",
          hostId: "host",
          players: [],
          mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
          roomType: "standard",
          teamMode: "ffa",
          teams: [],
          gameSetting: {
            speed: 1,
            tileGrow: {
              PLAIN: { duration: 1, growth: 1 },
              THRONE: { duration: 1, growth: 1 },
              BARRACKS: { duration: 1, growth: 1 },
              MOUNTAIN: { duration: 1, growth: 1 },
              SWAMP: { duration: 1, growth: 1 },
              FOG: { duration: 1, growth: 1 },
            },
            afkThreshold: 30,
          },
          playerLimit: 8,
          started: false,
          teamCount: 2,
        },
        new Map(),
      );

      gameService.startGame({
        gameId: "test-game-123",
        gameSetting: {
          speed: 1.0,
          tileGrow: {
            PLAIN: { duration: 40, growth: 1 },
            THRONE: { duration: 1, growth: 1 },
            BARRACKS: { duration: 1, growth: 1 },
            MOUNTAIN: { duration: 1e10, growth: 0 },
            SWAMP: { duration: 1, growth: -1 },
            FOG: { duration: 1e10, growth: 0 },
          },
          afkThreshold: 30,
        },
        mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
        teamCount: 2,
        players: [],
        playerLimit: 8,
        roomType: "standard",
        teamMode: "ffa",
        teams: [],
        hostId: "host",
        started: false,
      });

      expect(gameService.getPhase()).toBe(GamePhase.INGAME);
      expect(gs(gameService).gameInstance).toBeTruthy();
      expect(gs(gameService).roomInstance).toBeTruthy();
    });

    it("应该能从 INGAME 转换到 ENDED", () => {
      // 先转到 INGAME
      gs(gameService).phase = GamePhase.INGAME;
      gs(gameService).gameInstance = new GameInstance(
        {
          status: GameStatus.Playing,
          tick: 0,
          settings: {
            tileGrow: {
              PLAIN: { duration: 1, growth: 1 },
              THRONE: { duration: 1, growth: 1 },
              BARRACKS: { duration: 1, growth: 1 },
              MOUNTAIN: { duration: 1, growth: 1 },
              SWAMP: { duration: 1, growth: 1 },
              FOG: { duration: 1, growth: 1 },
            },
            afkThreshold: 30,
          },
          players: {},
          teams: {},
          map: { width: 10, height: 10, tiles: [] },
        },
        { playerDisplay: {} },
        [],
      );

      gs(gameService).roomInstance = gs(gameService).roomInstance = new RoomInstance(
        {
          gameId: "mock-game",
          roomType: "standard",
          teamMode: "ffa",
          teams: [],
          hostId: "host",
          players: [],
          mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
          gameSetting: {
            speed: 1,
            tileGrow: {
              PLAIN: { duration: 1, growth: 1 },
              THRONE: { duration: 1, growth: 1 },
              BARRACKS: { duration: 1, growth: 1 },
              MOUNTAIN: { duration: 1, growth: 1 },
              SWAMP: { duration: 1, growth: 1 },
              FOG: { duration: 1, growth: 1 },
            },
            afkThreshold: 30,
          },
          playerLimit: 8,
          started: false,
          teamCount: 2,
        },
        new Map(),
      );

      gameService.endGame({ winnerId: "player1", reason: "Victory" });

      expect(gameService.getPhase()).toBe(GamePhase.PREGAME);
      expect(gs(gameService).gameInstance).toBeNull();
    });

    it("应该能从任何阶段转换到 DISBANDED", () => {
      gs(gameService).disbandGame();

      expect(gameService.getPhase()).toBe(GamePhase.DISBANDED);
      expect(gs(gameService).roomInstance).toBeNull();
      expect(gs(gameService).gameInstance).toBeNull();
    });

    it("不应该在错误阶段开始游戏", () => {
      gs(gameService).phase = GamePhase.INGAME;
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      gameService.startGame();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("不应该在错误阶段结束游戏", () => {
      // 在 PREGAME 阶段尝试结束游戏应该不会抛错，但会记录错误
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      gameService.endGame();

      expect(consoleSpy).toHaveBeenCalled();
      expect(gameService.getPhase()).toBe(GamePhase.PREGAME); // 阶段不变

      consoleSpy.mockRestore();
    });
  });

  describe("事件回调", () => {
    it("应该触发游戏开始回调", () => {
      const onStartCallback = vi.fn();
      gameService.onGameStart(onStartCallback);

      // 模拟 RoomInstance 存在
      gs(gameService).roomInstance = new RoomInstance(
        {
          gameId: "mock-game",
          hostId: "host",
          players: [],
          mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
          roomType: "standard",
          teamMode: "ffa",
          teams: [],
          gameSetting: {
            speed: 1,
            tileGrow: {
              PLAIN: { duration: 1, growth: 1 },
              THRONE: { duration: 1, growth: 1 },
              BARRACKS: { duration: 1, growth: 1 },
              MOUNTAIN: { duration: 1, growth: 1 },
              SWAMP: { duration: 1, growth: 1 },
              FOG: { duration: 1, growth: 1 },
            },
            afkThreshold: 30,
          },
          playerLimit: 8,
          started: false,
          teamCount: 2,
        },
        new Map(),
      );

      gameService.startGame({
        gameId: "test-game-123",
        gameSetting: {
          speed: 1.0,
          tileGrow: {
            PLAIN: { duration: 40, growth: 1 },
            THRONE: { duration: 1, growth: 1 },
            BARRACKS: { duration: 1, growth: 1 },
            MOUNTAIN: { duration: 1e10, growth: 0 },
            SWAMP: { duration: 1, growth: -1 },
            FOG: { duration: 1e10, growth: 0 },
          },
          afkThreshold: 30,
        },
        mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
        teamCount: 2,
        players: [],
        playerLimit: 8,
        roomType: "standard",
        teamMode: "ffa",
        teams: [],
        hostId: "host",
        started: false,
      });

      expect(onStartCallback).toHaveBeenCalled();
    });

    it("应该触发游戏结束回调", () => {
      const onEndCallback = vi.fn();
      const result = { winnerId: "player1", reason: "Victory" };

      gameService.onGameEnd(onEndCallback);
      gs(gameService).phase = GamePhase.INGAME;
      gs(gameService).gameInstance = new GameInstance(
        {
          status: GameStatus.Playing,
          tick: 0,
          settings: {
            tileGrow: {
              PLAIN: { duration: 1, growth: 1 },
              THRONE: { duration: 1, growth: 1 },
              BARRACKS: { duration: 1, growth: 1 },
              MOUNTAIN: { duration: 1, growth: 1 },
              SWAMP: { duration: 1, growth: 1 },
              FOG: { duration: 1, growth: 1 },
            },
            afkThreshold: 30,
          },
          players: {},
          teams: {},
          map: { width: 10, height: 10, tiles: [] },
        },
        { playerDisplay: {} },
        [],
      );

      gameService.endGame(result);

      expect(onEndCallback).toHaveBeenCalledWith(result);
    });

    it("应该触发游戏解散回调", () => {
      const onDisbandCallback = vi.fn();
      gameService.onDisband(onDisbandCallback);

      gs(gameService).disbandGame();

      expect(onDisbandCallback).toHaveBeenCalled();
    });
  });

  describe("清理资源", () => {
    it("解散时应该注销所有域名处理器", () => {
      // 直接使用上方 import 的 unregisterDomainHandler（已被 vi.mock）

      gs(gameService).disbandGame();

      expect(unregisterDomainHandler).toHaveBeenCalledWith("room-test-game-123");
      expect(unregisterDomainHandler).toHaveBeenCalledWith("game-test-game-123");
      expect(unregisterDomainHandler).toHaveBeenCalledWith("chat-test-game-123");
    });

    it("解散时应该销毁所有实例", () => {
      const roomInstance = new RoomInstance(
        {
          gameId: "mock-game",
          hostId: "host",
          players: [],
          mapSetting: { type: PreGameMapType.Random, width: 10, height: 10, tileFrequency: {} },
          roomType: "standard",
          teamMode: "ffa",
          teams: [],
          gameSetting: {
            speed: 1,
            tileGrow: {
              PLAIN: { duration: 1, growth: 1 },
              THRONE: { duration: 1, growth: 1 },
              BARRACKS: { duration: 1, growth: 1 },
              MOUNTAIN: { duration: 1, growth: 1 },
              SWAMP: { duration: 1, growth: 1 },
              FOG: { duration: 1, growth: 1 },
            },
            afkThreshold: 30,
          },
          playerLimit: 8,
          started: false,
          teamCount: 2,
        },
        new Map(),
      );
      const gameInstance = new GameInstance(
        {
          status: GameStatus.Playing,
          tick: 0,
          settings: {
            tileGrow: {
              PLAIN: { duration: 1, growth: 1 },
              THRONE: { duration: 1, growth: 1 },
              BARRACKS: { duration: 1, growth: 1 },
              MOUNTAIN: { duration: 1, growth: 1 },
              SWAMP: { duration: 1, growth: 1 },
              FOG: { duration: 1, growth: 1 },
            },
            afkThreshold: 30,
          },
          players: {},
          teams: {},
          map: { width: 10, height: 10, tiles: [] },
        },
        { playerDisplay: {} },
        [],
      );
      const chatInstance = gs(gameService).chatInstance;

      gs(gameService).roomInstance = roomInstance;
      gs(gameService).gameInstance = gameInstance;

      gs(gameService).disbandGame();

      expect(roomInstance.destroy).toHaveBeenCalled();
      expect(gameInstance.destroy).toHaveBeenCalled();
      expect(chatInstance.destroy).toHaveBeenCalled();
    });
  });
});

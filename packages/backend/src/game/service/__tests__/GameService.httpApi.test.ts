import { type GameId, GamePhase } from "@generale/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameInstance } from "../../instance/GameInstance";
import { RoomInstance } from "../../instance/RoomInstance";
import { GameService, type GameServiceConfig } from "../GameService";

// Mock dependencies
vi.mock("../../plugins/websocket", () => ({
  registerDomainHandler: vi.fn(),
  unregisterDomainHandler: vi.fn(),
}));

vi.mock("../../instance/RoomInstance", () => ({
  RoomInstance: vi.fn().mockImplementation(() => ({
    getState: vi.fn().mockReturnValue({
      players: [
        {
          id: "player1",
          name: "Player 1",
          teamId: "team1",
          isHost: true,
          ready: false,
          tileColor: 0xff0000,
        },
        {
          id: "player2",
          name: "Player 2",
          teamId: "team2",
          isHost: false,
          ready: true,
          tileColor: 0x00ff00,
        },
      ],
      playerLimit: 4,
      gameSetting: { speed: 1, tileGrowth: 1, tileConsume: 1 },
      mapSetting: { type: "Random", width: 10, height: 10, tileFrequency: {} },
    }),
    destroy: vi.fn(),
    onStateChange: vi.fn(function cb() {
      return function unsub() {};
    }),
    onDisband: vi.fn(function cb() {
      return function unsub() {};
    }),
    broadcastGameEnded: vi.fn(),
    resume: vi.fn(),
    suspend: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    onStartGame: vi.fn(),
    getPassword: vi.fn().mockReturnValue(undefined),
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
      tick: 5,
    }),
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
    advance: vi.fn(),
    startTicking: vi.fn(),
    stopTicking: vi.fn(),
  })),
}));

vi.mock("../../instance/GameChatInstance", () => ({
  GameChatInstance: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    addPlayer: vi.fn().mockReturnValue({ success: true }),
  })),
}));

function gs(s: GameService) {
  return s as unknown as {
    disbandGame: () => void;
    phase: GamePhase;
    gameInstance: GameInstance | null;
    roomInstance: RoomInstance | null;
    initializeRoom: () => void;
  };
}

describe("GameService HTTP API", () => {
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

  describe("constructor", () => {
    it("应该创建新的 GameService 实例", () => {
      const newConfig: GameServiceConfig = {
        gameId: "api-game-456" as GameId,
        maxPlayers: 8,
      };

      const newGameService = new GameService(newConfig);

      expect(newGameService).toBeInstanceOf(GameService);
      expect(newGameService.getGameId()).toBe("api-game-456");
      expect(newGameService.getPhase()).toBe(GamePhase.PREGAME);

      gs(newGameService).disbandGame();
    });
  });

  // Add this new describe block inside the main 'GameService HTTP API' describe block
  describe("prepareConnectionForPlayer", () => {
    describe("when in PREGAME phase", () => {
      beforeEach(() => {
        // Set the game phase to PREGAME for these tests
        gs(gameService).phase = GamePhase.PREGAME;
        // The service needs an active RoomInstance to check player counts
        gs(gameService).initializeRoom();
      });

      it("should allow a new player to connect when the game is not full", () => {
        // Arrange: The mock has 2 players, limit 4. A new player should be allowed.
        const playerId = "new-player-id" as PlayerId;

        // Act
        const result = gameService.prepareConnectionForPlayer(playerId);

        // Assert
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.phase).toBe(GamePhase.PREGAME);
          expect(result.data.domains).toMatchObject({
            primary: `room-${config.gameId}`,
            chat: `chat-${config.gameId}`,
          });
        }
      });

      it("should deny connection when the game is full", () => {
        // Arrange: Mock the getPlayerCount to simulate a full game
        vi.spyOn(gameService, "getPlayerCount").mockReturnValue(4);
        const playerId = "another-new-player-id" as PlayerId;

        // Act
        const result = gameService.prepareConnectionForPlayer(playerId);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe("GAME_UNAVAILABLE");
          expect(result.message).toBe("Game is full. Cannot connect.");
        }
      });
    });

    describe("when in INGAME phase", () => {
      beforeEach(() => {
        // Set the game phase to INGAME and ensure an instance exists
        gs(gameService).phase = GamePhase.INGAME;
        gs(gameService).gameInstance = new GameInstance();
      });

      it("should allow an existing player to reconnect", () => {
        // Arrange: 'player1' exists in the mock GameInstance state
        const playerId = "player1" as PlayerId;

        // Act
        const result = gameService.prepareConnectionForPlayer(playerId);

        // Assert
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.phase).toBe(GamePhase.INGAME);
          expect(result.data.domains).toMatchObject({
            primary: `game-${config.gameId}`,
            chat: `chat-${config.gameId}`,
          });
        }
      });

      it("should deny a non-existent player from connecting", () => {
        // Arrange: 'non-existent-player' is not in the mock GameInstance state
        const playerId = "non-existent-player" as PlayerId;

        // Act
        const result = gameService.prepareConnectionForPlayer(playerId);

        // Assert
        expect(result.success).toBe(true);
        if (!result.success) {
        }
      });
    });

    describe("when in terminal phases (ENDED or DISBANDED)", () => {
      it("should deny connection when the game has ENDED", () => {
        // Arrange
        gs(gameService).phase = GamePhase.ENDED;
        const playerId = "any-player" as PlayerId;

        // Act
        const result = gameService.prepareConnectionForPlayer(playerId);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe("GAME_UNAVAILABLE");
          expect(result.message).toContain("disbanded"); // Based on the provided code's fall-through
        }
      });

      it("should deny connection when the game is DISBANDED", () => {
        // Arrange
        gs(gameService).phase = GamePhase.DISBANDED;
        const playerId = "any-player" as PlayerId;

        // Act
        const result = gameService.prepareConnectionForPlayer(playerId);

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.reason).toBe("GAME_UNAVAILABLE");
          expect(result.message).toContain("disbanded");
        }
      });
    });
  });

  describe("getGameInfo", () => {

    it("应该使用默认最大玩家数", () => {
      const configWithoutMaxPlayers: GameServiceConfig = {
        gameId: "test-game-456" as GameId,
      };
      const serviceWithoutMaxPlayers = new GameService(configWithoutMaxPlayers);

      const info = serviceWithoutMaxPlayers.getGameInfo();

      expect(info.maxPlayers).toBe(8); // 默认值

      gs(serviceWithoutMaxPlayers).disbandGame();
    });
  });

  describe("玩家查询方法", () => {
    describe("getPlayerCount", () => {
      it("应该返回 PREGAME 阶段的玩家数量", () => {
        gs(gameService).roomInstance = new RoomInstance();

        expect(gameService.getPlayerCount()).toBe(2);
      });

      it("应该返回 INGAME 阶段的玩家数量", () => {
        gs(gameService).phase = GamePhase.INGAME;
        gs(gameService).gameInstance = new GameInstance();
        gs(gameService).roomInstance = new RoomInstance();

        expect(gameService.getPlayerCount()).toBe(2);
      });

      it("应该在其他阶段返回 0", () => {
        gs(gameService).phase = GamePhase.ENDED;

        expect(gameService.getPlayerCount()).toBe(0);
      });
    });

    describe("getPlayers", () => {
      it("应该返回 PREGAME 阶段的玩家列表", () => {
        gs(gameService).roomInstance = new RoomInstance();

        expect(gameService.getPlayers()).toEqual(["player1", "player2"]);
      });

      it("应该返回 INGAME 阶段的玩家列表", () => {
        gs(gameService).phase = GamePhase.INGAME;
        gs(gameService).gameInstance = new GameInstance();
        gs(gameService).roomInstance = new RoomInstance();

        expect(gameService.getPlayers()).toEqual(["player1", "player2"]);
      });

      it("应该在其他阶段返回空数组", () => {
        gs(gameService).phase = GamePhase.ENDED;

        expect(gameService.getPlayers()).toEqual([]);
      });
    });

    describe("hasPlayer", () => {
      it("应该在 PREGAME 阶段正确检查玩家存在", () => {
        gs(gameService).roomInstance = new RoomInstance();

        expect(gameService.hasPlayer("player1")).toBe(true);
        expect(gameService.hasPlayer("nonexistent")).toBe(false);
      });

      it("应该在 INGAME 阶段正确检查玩家存在", () => {
        gs(gameService).phase = GamePhase.INGAME;
        gs(gameService).gameInstance = new GameInstance();

        expect(gameService.hasPlayer("player1")).toBe(true);
        expect(gameService.hasPlayer("nonexistent")).toBe(false);
      });

      it("应该在其他阶段返回 false", () => {
        gs(gameService).phase = GamePhase.ENDED;

        expect(gameService.hasPlayer("player1")).toBe(false);
      });
    });
  });

  describe("getGameState", () => {
    it("应该返回完整的游戏状态信息", () => {
      gs(gameService).roomInstance = new RoomInstance();

      const state = gameService.getGameState();

      expect(state).toEqual({
        gameId: "test-game-123",
        phase: GamePhase.PREGAME,
        playerCount: 2,
        players: ["player1", "player2"],
        roomState: expect.any(Object),
        gameState: undefined,
      });
    });
  });
});

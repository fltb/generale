import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GameServiceConfig } from "../GameService";

// Mock GameService module so the manager can create mock instances
const mockForceDispose = vi.fn();

vi.mock("../GameService", () => {
  return {
    GameService: vi.fn().mockImplementation(function (this: any, config: GameServiceConfig) {
      this.config = config;
      this.gameId = config.gameId;
      this.forceDispose = mockForceDispose;
      this.getGameInfo = vi.fn().mockReturnValue({
        id: config.gameId,
        roomName: config.roomName,
        hostId: config.creatorId ?? "",
        hostName: "Host",
        type: "standard",
        map: "small",
        status: "PREGAME",
        playerCount: 1,
        maxPlayers: config.maxPlayers ?? 4,
        hasPassword: !!config.password,
      });
      this.setRoomUpdateEmitter = vi.fn();
      this.onDisband = vi.fn();
    }),
    GamePhase: { PREGAME: "PREGAME", INGAME: "INGAME", ENDED: "ENDED" },
  };
});

const { GameServiceManager, gameServiceManager } = await import("../GameServiceManager");

function resetSingleton() {
  // Reset the singleton by re-setting the private static instance
  (GameServiceManager as any).instance = undefined;
}

beforeEach(() => {
  resetSingleton();
  vi.clearAllMocks();
});

afterEach(() => {
  resetSingleton();
});

function makeConfig(id = "game-1"): GameServiceConfig & { type: "standard" } {
  return {
    gameId: id,
    roomName: `Room ${id}`,
    type: "standard" as const,
    mapSize: "small" as const,
    maxPlayers: 4,
    creatorId: "user-1",
  };
}

describe("GameServiceManager", () => {
  it("getInstance returns the same instance", () => {
    const instance1 = GameServiceManager.getInstance();
    const instance2 = GameServiceManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it("createGame stores and returns a GameService", () => {
    const mgr = GameServiceManager.getInstance();
    const config = makeConfig();
    const gs = mgr.createGame(config);
    expect(gs).toBeDefined();
    expect((gs as any).gameId).toBe("game-1");
  });

  it("getGame retrieves created game", () => {
    const mgr = GameServiceManager.getInstance();
    mgr.createGame(makeConfig("g1"));
    const gs = mgr.getGame("g1");
    expect(gs).toBeDefined();
    expect((gs as any).gameId).toBe("g1");
  });

  it("getGame returns undefined for unknown game", () => {
    const mgr = GameServiceManager.getInstance();
    expect(mgr.getGame("nonexistent")).toBeUndefined();
  });

  it("createGame throws on duplicate id", () => {
    const mgr = GameServiceManager.getInstance();
    mgr.createGame(makeConfig("g1"));
    expect(() => mgr.createGame(makeConfig("g1"))).toThrow("already exists");
  });

  it("getActiveGames returns all game ids", () => {
    const mgr = GameServiceManager.getInstance();
    mgr.createGame(makeConfig("g1"));
    mgr.createGame(makeConfig("g2"));
    const ids = mgr.getActiveGames();
    expect(ids).toContain("g1");
    expect(ids).toContain("g2");
    expect(ids).toHaveLength(2);
  });

  it("getGameCount returns correct count", () => {
    const mgr = GameServiceManager.getInstance();
    expect(mgr.getGameCount()).toBe(0);
    mgr.createGame(makeConfig("g1"));
    expect(mgr.getGameCount()).toBe(1);
    mgr.createGame(makeConfig("g2"));
    expect(mgr.getGameCount()).toBe(2);
  });

  it("removeGame removes and calls forceDispose", () => {
    const mgr = GameServiceManager.getInstance();
    mgr.createGame(makeConfig("g1"));
    const removed = mgr.removeGame("g1");
    expect(removed).toBe(true);
    expect(mgr.getGame("g1")).toBeUndefined();
    expect(mockForceDispose).toHaveBeenCalled();
  });

  it("removeGame returns false for unknown game", () => {
    const mgr = GameServiceManager.getInstance();
    expect(mgr.removeGame("nonexistent")).toBe(false);
  });

  it("cleanup removes all games", () => {
    const mgr = GameServiceManager.getInstance();
    mgr.createGame(makeConfig("g1"));
    mgr.createGame(makeConfig("g2"));
    expect(mgr.getGameCount()).toBe(2);
    mgr.cleanup();
    expect(mgr.getGameCount()).toBe(0);
  });

  it("onRoomCreated callback fires on createGame", () => {
    const mgr = GameServiceManager.getInstance();
    const cb = vi.fn();
    mgr.onRoomCreated(cb);
    mgr.createGame(makeConfig("g1"));
    expect(cb).toHaveBeenCalledWith("g1");
  });

  it("onRoomDeleted callback fires on removeGame", () => {
    const mgr = GameServiceManager.getInstance();
    mgr.createGame(makeConfig("g1"));
    const cb = vi.fn();
    mgr.onRoomDeleted(cb);
    mgr.removeGame("g1");
    expect(cb).toHaveBeenCalledWith("g1");
  });

  it("onRoomUpdated callback fires on notifyRoomUpdated", () => {
    const mgr = GameServiceManager.getInstance();
    mgr.createGame(makeConfig("g1"));
    const cb = vi.fn();
    mgr.onRoomUpdated(cb);
    mgr.notifyRoomUpdated("g1");
    expect(cb).toHaveBeenCalledWith("g1");
  });

  it("notifyRoomUpdated does nothing for unknown game", () => {
    const mgr = GameServiceManager.getInstance();
    const cb = vi.fn();
    mgr.onRoomUpdated(cb);
    mgr.notifyRoomUpdated("nonexistent");
    expect(cb).not.toHaveBeenCalled();
  });

  it("unsubscribe from onRoomCreated does not fire after unsub", () => {
    const mgr = GameServiceManager.getInstance();
    const cb = vi.fn();
    const unsub = mgr.onRoomCreated(cb);
    unsub();
    mgr.createGame(makeConfig("g1"));
    expect(cb).not.toHaveBeenCalled();
  });

  it("exported singleton is defined", () => {
    expect(gameServiceManager).toBeDefined();
  });
});

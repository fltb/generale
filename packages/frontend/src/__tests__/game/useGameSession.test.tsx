import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { useGameSession } from "~/game/useGameSession";
import { SyncedGameClientActionTypes } from "@generale/types";

const mockDispatch = vi.hoisted(() => vi.fn(() => 1));
const mockConnect = vi.hoisted(() => vi.fn());
const mockDisconnect = vi.hoisted(() => vi.fn());

vi.mock("~/hooks/useSyncedState", () => ({
  useSyncedState: () => ({
    state: () => ({
      map: { width: 10, height: 10, tiles: [] },
      players: {},
      playerOperationQueue: [],
      teams: {},
      playerDisplay: {},
      settings: {},
      status: "PLAYING",
      tick: 0,
    }),
    dispatch: mockDispatch,
    connect: mockConnect,
    disconnect: mockDisconnect,
    isReady: () => true,
    commit: vi.fn(),
  }),
}));

vi.mock("~/ui/dialogs", () => ({
  confirmDialog: vi.fn(() => true),
}));

vi.mock("~/game/selectors", () => ({
  computeEndgameResult: () => null,
}));

vi.mock("~/testBridge", () => ({ default: { gameState: null, onOperationQueued: null, onClearQueue: null } }));

describe("useGameSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns expected API shape", () => {
    let result: ReturnType<typeof useGameSession>;
    createRoot(() => {
      result = useGameSession({
        domain: "game-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    expect(result!).toHaveProperty("state");
    expect(result!).toHaveProperty("mergedState");
    expect(result!).toHaveProperty("notice");
    expect(result!).toHaveProperty("gameEndedInfo");
    expect(result!).toHaveProperty("displaced");
    expect(result!).toHaveProperty("endgameResult");
    expect(typeof result!.handleOperationQueued).toBe("function");
    expect(typeof result!.handleClearQueue).toBe("function");
    expect(typeof result!.handleSurrender).toBe("function");
    expect(typeof result!.handleLeave).toBe("function");
    expect(typeof result!.handleBackToRoom).toBe("function");
  });

  it("handleOperationQueued dispatches PUSH action", () => {
    let result: ReturnType<typeof useGameSession>;
    createRoot(() => {
      result = useGameSession({
        domain: "game-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    const op = { type: "MOVE", payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, percentage: 100 } };
    result!.handleOperationQueued(op as any);

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: SyncedGameClientActionTypes.PUSH, payload: [op] }),
    );
  });

  it("handleClearQueue dispatches CLEAN_ALL", () => {
    let result: ReturnType<typeof useGameSession>;
    createRoot(() => {
      result = useGameSession({
        domain: "game-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.handleClearQueue();

    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedGameClientActionTypes.CLEAN_ALL });
  });

  it("handleSurrender dispatches SURRENDER", () => {
    let result: ReturnType<typeof useGameSession>;
    createRoot(() => {
      result = useGameSession({
        domain: "game-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.handleSurrender();

    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedGameClientActionTypes.SURRENDER });
  });

  it("handleLeave calls disconnect", () => {
    let result: ReturnType<typeof useGameSession>;
    createRoot(() => {
      result = useGameSession({
        domain: "game-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.handleLeave();

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("handleOperationQueued does nothing in spectate mode", () => {
    let result: ReturnType<typeof useGameSession>;
    createRoot(() => {
      result = useGameSession({
        domain: "game-test",
        gameId: "g1",
        playerId: "p1",
        spectate: true,
      });
    });

    const op = { type: "MOVE", payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, percentage: 100 } };
    result!.handleOperationQueued(op as any);

    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("handleBackToRoom does nothing when gameEndedInfo is null", () => {
    let result: ReturnType<typeof useGameSession>;
    let dismissCalled = false;
    createRoot(() => {
      result = useGameSession({
        domain: "game-test",
        gameId: "g1",
        playerId: "p1",
        onDismissGameEnd: () => { dismissCalled = true; },
      });
    });

    result!.handleBackToRoom();

    expect(dismissCalled).toBe(false);
  });
});

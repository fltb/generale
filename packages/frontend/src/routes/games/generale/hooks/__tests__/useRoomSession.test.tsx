import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { useRoomSession } from "~/routes/games/generale/hooks/useRoomSession";
import { GamePhase, PreGamePlayerStatus, SyncedPreGameServerEventPayloadType } from "@generale/types";

const mockPrepareConnectApi = vi.hoisted(() => vi.fn());

vi.mock("~/routes/games/generale/api/gameApi", () => ({
  prepareConnectApi: mockPrepareConnectApi,
}));

describe("useRoomSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns expected API shape", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!).toHaveProperty("playerId");
    expect(result!).toHaveProperty("roomDomain");
    expect(result!).toHaveProperty("gameDomain");
    expect(result!).toHaveProperty("chatDomain");
    expect(result!).toHaveProperty("phase");
    expect(result!).toHaveProperty("selfStatus");
    expect(result!).toHaveProperty("setSelfStatus");
    expect(result!).toHaveProperty("roomState");
    expect(result!).toHaveProperty("setRoomState");
    expect(result!).toHaveProperty("roomApi");
    expect(result!).toHaveProperty("setRoomApi");
    expect(result!).toHaveProperty("loading");
    expect(result!).toHaveProperty("error");
    expect(result!).toHaveProperty("hasPassword");
    expect(result!).toHaveProperty("needsPassword");
    expect(result!).toHaveProperty("wrongPassword");
    expect(result!).toHaveProperty("setPassword");
    expect(result!).toHaveProperty("roomPassword");
    expect(result!).toHaveProperty("showingGameUI");
    expect(result!).toHaveProperty("startedThisSession");
    expect(typeof result!.handleStateUpdate).toBe("function");
    expect(typeof result!.handleGameEndedReceived).toBe("function");
    expect(typeof result!.handleDismissGameEnd).toBe("function");
  });

  it("initial phase is PREGAME", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!.phase()).toBe(GamePhase.PREGAME);
  });

  it("initial selfStatus is Lobby", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!.selfStatus()).toBe(PreGamePlayerStatus.Lobby);
  });

  it("initial loading is false", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!.loading()).toBe(false);
  });

  it("initial error is null", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!.error()).toBeNull();
  });

  it("initial showingGameUI is false", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!.showingGameUI()).toBe(false);
  });

  it("initial startedThisSession is false", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!.startedThisSession()).toBe(false);
  });

  it("handleStateUpdate with KICKED sets error and phase to ENDED", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    result!.handleStateUpdate({
      event: { type: SyncedPreGameServerEventPayloadType.KICKED, reason: "bye" },
    } as any);

    expect(result!.error()).toBe("bye");
    expect(result!.phase()).toBe(GamePhase.ENDED);
  });

  it("handleStateUpdate with DISBANDED sets error and phase to ENDED", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    result!.handleStateUpdate({
      event: { type: SyncedPreGameServerEventPayloadType.DISBANDED, reason: "解散" },
    } as any);

    expect(result!.error()).toBe("房间已解散");
    expect(result!.phase()).toBe(GamePhase.ENDED);
  });

  it("handleGameEndedReceived is safe to call when phase is not INGAME", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    result!.handleGameEndedReceived();

    expect(result!.phase()).toBe(GamePhase.PREGAME);
  });

  it("handleDismissGameEnd resets phase to PREGAME", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    result!.handleDismissGameEnd();

    expect(result!.phase()).toBe(GamePhase.PREGAME);
    expect(result!.startedThisSession()).toBe(false);
  });

  it("needsPassword is false when hasPassword and roomPassword are both unset", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!.needsPassword()).toBe(false);
  });

  it("setPassword stores password and clears wrongPassword", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    result!.setPassword("mypass");
    expect(result!.roomPassword()).toBe("mypass");
    expect(result!.wrongPassword()).toBe(false);

    result!.setPassword(null);
    expect(result!.roomPassword()).toBeNull();
  });

  it("showingGameUI defaults to false", () => {
    let result: ReturnType<typeof useRoomSession>;
    createRoot(() => {
      result = useRoomSession(() => undefined);
    });

    expect(result!.showingGameUI()).toBe(false);
  });
});

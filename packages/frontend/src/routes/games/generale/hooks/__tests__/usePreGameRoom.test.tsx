import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { usePreGameRoom } from "~/routes/games/generale/hooks/usePreGameRoom";
import {
  SyncedPreGameClientActionTypes,
  PreGameMapType,
} from "@generale/types";

const mockDispatch = vi.hoisted(() => vi.fn(() => 1));
const mockConnect = vi.hoisted(() => vi.fn());
const mockDisconnect = vi.hoisted(() => vi.fn());

vi.mock("~/hooks/useSyncedState", () => ({
  useSyncedState: vi.fn(() => ({
    state: () => ({
      room: {
        gameId: "g1",
        roomType: "standard",
        teamMode: "ffa",
        hostId: "host1",
        players: [],
        mapSetting: { type: PreGameMapType.Random, width: 20, height: 20, tileFrequency: {}, sizeLabel: "medium" },
        gameSetting: { speed: 1, tileGrow: {}, afkThreshold: 30 },
        teams: [],
        teamCount: 0,
        playerLimit: 8,
        started: false,
      },
      selfId: "p1",
    }),
    dispatch: mockDispatch,
    connect: mockConnect,
    disconnect: mockDisconnect,
    isReady: () => true,
  })),
}));

describe("usePreGameRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns expected API shape", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    expect(result!).toHaveProperty("notice");
    expect(result!).toHaveProperty("isKicked");
    expect(result!).toHaveProperty("displaced");
    expect(result!).toHaveProperty("room");
    expect(result!).toHaveProperty("selfId");
    expect(result!).toHaveProperty("isHost");
    expect(result!).toHaveProperty("selfReady");
    expect(result!).toHaveProperty("selfStatus");
    expect(result!).toHaveProperty("gameInProgress");
    expect(result!).toHaveProperty("isLobby");
    expect(result!).toHaveProperty("isSpectating");
    expect(typeof result!.onSettingChange).toBe("function");
    expect(typeof result!.onToggleReadyForSelf).toBe("function");
    expect(typeof result!.onKick).toBe("function");
    expect(typeof result!.onTransferHost).toBe("function");
    expect(typeof result!.onStartGame).toBe("function");
    expect(typeof result!.onLeave).toBe("function");
    expect(typeof result!.onDisband).toBe("function");
    expect(typeof result!.onMapChange).toBe("function");
    expect(typeof result!.onRoomTypeChange).toBe("function");
    expect(typeof result!.onTeamModeChange).toBe("function");
    expect(typeof result!.onEnterSpectate).toBe("function");
    expect(typeof result!.onLeaveSpectate).toBe("function");
    expect(typeof result!.onChangeTeam).toBe("function");
    expect(typeof result!.onCreateTeam).toBe("function");
    expect(typeof result!.onRenameTeam).toBe("function");
    expect(typeof result!.onDeleteTeam).toBe("function");
    expect(typeof result!.onChangeColor).toBe("function");
  });

  it("onToggleReadyForSelf dispatches READY", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onToggleReadyForSelf(true);
    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedPreGameClientActionTypes.READY });
  });

  it("onToggleReadyForSelf dispatches UNREADY", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onToggleReadyForSelf(false);
    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedPreGameClientActionTypes.UNREADY });
  });

  it("onStartGame dispatches START_GAME", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onStartGame();
    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedPreGameClientActionTypes.START_GAME });
  });

  it("onLeave dispatches LEAVE_ROOM and disconnect", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onLeave();
    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedPreGameClientActionTypes.LEAVE_ROOM });
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("onDisband dispatches DISBAND_ROOM", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onDisband();
    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedPreGameClientActionTypes.DISBAND_ROOM });
  });

  it("onSettingChange dispatches CHANGE_SETTING", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onSettingChange({ speed: 3 });
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: SyncedPreGameClientActionTypes.CHANGE_SETTING, payload: { speed: 3 } }),
    );
  });

  it("onMapChange dispatches CHANGE_MAP", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    const mapSetting = { type: PreGameMapType.Random, width: 30, height: 30, tileFrequency: {}, sizeLabel: "large" } as any;
    result!.onMapChange(mapSetting);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: SyncedPreGameClientActionTypes.CHANGE_MAP, payload: mapSetting }),
    );
  });

  it("onRoomTypeChange dispatches CHANGE_ROOM_TYPE", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onRoomTypeChange("custom");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE,
        payload: { roomType: "custom" },
      }),
    );
  });

  it("onTeamModeChange dispatches CHANGE_TEAM_MODE", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onTeamModeChange("team");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.CHANGE_TEAM_MODE,
        payload: { teamMode: "team" },
      }),
    );
  });

  it("onKick dispatches KICK_PLAYER", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onKick("player2");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.KICK_PLAYER,
        payload: { playerId: "player2" },
      }),
    );
  });

  it("onTransferHost dispatches TRANSFER_HOST", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onTransferHost("player2");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.TRANSFER_HOST,
        payload: { newHostId: "player2" },
      }),
    );
  });

  it("onEnterSpectate dispatches ENTER_SPECTATE", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onEnterSpectate();
    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedPreGameClientActionTypes.ENTER_SPECTATE });
  });

  it("onLeaveSpectate dispatches LEAVE_SPECTATE", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onLeaveSpectate();
    expect(mockDispatch).toHaveBeenCalledWith({ type: SyncedPreGameClientActionTypes.LEAVE_SPECTATE });
  });

  it("onChangeColor dispatches CHANGE_COLOR", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onChangeColor(0xff0000 as any);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.CHANGE_COLOR,
        payload: { tileColor: 0xff0000 },
      }),
    );
  });

  it("onCreateTeam dispatches CREATE_TEAM", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onCreateTeam("Alpha");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.CREATE_TEAM,
        payload: { name: "Alpha" },
      }),
    );
  });

  it("onRenameTeam dispatches RENAME_TEAM", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onRenameTeam("team1", "Bravo");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.RENAME_TEAM,
        payload: { teamId: "team1", name: "Bravo" },
      }),
    );
  });

  it("onDeleteTeam dispatches DELETE_TEAM", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onDeleteTeam("team1");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.DELETE_TEAM,
        payload: { teamId: "team1" },
      }),
    );
  });

  it("onChangeTeam dispatches CHANGE_TEAM", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onChangeTeam("p1", "team2");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.CHANGE_TEAM,
        payload: { playerId: "p1", teamId: "team2" },
      }),
    );
  });

  it("onChangeTeam with undefined playerId dispatches for self", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    result!.onChangeTeam(undefined, "team2");
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SyncedPreGameClientActionTypes.CHANGE_TEAM,
        payload: { teamId: "team2" },
      }),
    );
  });

  it("initial selfStatus is Lobby", () => {
    let result: ReturnType<typeof usePreGameRoom>;
    createRoot(() => {
      result = usePreGameRoom({
        domain: "room-test",
        gameId: "g1",
        playerId: "p1",
      });
    });

    expect(result!.selfStatus()).toBe("lobby");
  });
});

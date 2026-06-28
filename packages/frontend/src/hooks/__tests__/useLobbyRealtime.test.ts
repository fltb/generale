import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import {
  LobbyClientEventType,
  LobbyServerMessageType,
} from "@generale/types";

vi.mock("~/hooks/useWebsocket", () => ({
  useWS: vi.fn(),
  useSubConnector: vi.fn(),
}));

vi.mock("@tanstack/solid-query", () => ({
  useQueryClient: vi.fn(),
}));

import { useWS, useSubConnector } from "~/hooks/useWebsocket";
import { useQueryClient } from "@tanstack/solid-query";
import { useLobbyRealtime } from "../useLobbyRealtime";

function createMockChain() {
  const subCbs: Record<string, Function> = {};
  let _ready = false;
  const sub = {
    get ready() {
      return _ready;
    },
    set ready(v: boolean) {
      _ready = v;
    },
    onOpen: vi.fn((cb: Function) => {
      subCbs.open = cb;
    }),
    onMessage: vi.fn((cb: Function) => {
      subCbs.message = cb;
    }),
    send: vi.fn(),
    close: vi.fn(),
  };
  const manager = {
    isConnected: false,
    connect: vi.fn(),
  };
  const mockQueryCache = {
    getAll: vi.fn<() => { queryKey: unknown }[]>(() => [] as any),
  };
  const qc = {
    getQueryCache: vi.fn(() => mockQueryCache),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
  };
  return { sub, subCbs, manager, qc, mockQueryCache };
}

async function setupLobby(options?: { isConnected?: boolean }) {
  const { sub, subCbs, manager, qc, mockQueryCache } = createMockChain();
  manager.isConnected = options?.isConnected ?? false;

  vi.mocked(useWS).mockReturnValue(manager as any);
  vi.mocked(useSubConnector).mockReturnValue(sub as any);
  vi.mocked(useQueryClient).mockReturnValue(qc as any);

  let dispose!: () => void;

  await new Promise<void>((resolve) => {
    createRoot((d) => {
      dispose = d;
      const filters = () => ({ status: "lobby" as const });
      useLobbyRealtime(filters as any, { offset: 0, limit: 50 });
      setTimeout(resolve, 10);
    });
  });

  return { sub, subCbs, manager, qc, mockQueryCache, dispose };
}

describe("useLobbyRealtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connects WS if not already connected", async () => {
    const { manager, dispose } = await setupLobby({ isConnected: false });
    expect(manager.connect).toHaveBeenCalledWith(true);
    dispose();
  });

  it("does not connect WS if already connected", async () => {
    const { manager, dispose } = await setupLobby({ isConnected: true });
    expect(manager.connect).not.toHaveBeenCalled();
    dispose();
  });

  it("creates sub with lobby-games domain", async () => {
    const { dispose } = await setupLobby();
    expect(useSubConnector).toHaveBeenCalledWith(
      "lobby-games",
      expect.objectContaining({ autoOpen: true }),
    );
    dispose();
  });

  it("sends REQUEST_LIST on open", async () => {
    const { subCbs, sub, dispose } = await setupLobby();
    expect(subCbs.open).toBeDefined();

    subCbs.open!();

    expect(sub.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: LobbyClientEventType.REQUEST_LIST }),
    );
    dispose();
  });

  it("handles room-list message by applying snapshot to matching cache queries", async () => {
    const { subCbs, qc, mockQueryCache, dispose } = await setupLobby();

    const mockQuery: any = { queryKey: ["games", { status: "lobby" }, 0, 50, undefined, undefined] };
    mockQueryCache.getAll.mockReturnValue([mockQuery] as any);

    subCbs.message!({
      type: LobbyServerMessageType.LIST,
      payload: [{ id: "g1", name: "Game 1" }],
      meta: { ts: 1, seq: 1 },
    });

    expect(qc.setQueryData).toHaveBeenCalledWith(
      mockQuery.queryKey,
      expect.any(Function),
    );
    dispose();
  });

  it("handles room-created message by patching cache", async () => {
    const { subCbs, qc, mockQueryCache, dispose } = await setupLobby();

    const mockQuery: any = { queryKey: ["games", { status: "lobby" }, 0, 50, undefined, undefined] };
    mockQueryCache.getAll.mockReturnValue([mockQuery] as any);
    qc.getQueryData = vi.fn(() => [{ id: "g1" }]);

    subCbs.message!({
      type: LobbyServerMessageType.CREATED,
      payload: { id: "g2" },
      meta: { ts: 2, seq: 2, id: "g2" },
    });

    expect(qc.setQueryData).toHaveBeenCalled();
    dispose();
  });

  it("handles room-updated message by patching cache", async () => {
    const { subCbs, qc, mockQueryCache, dispose } = await setupLobby();

    const mockQuery2: any = { queryKey: ["games", { status: "lobby" }, 0, 50, undefined, undefined] };
    mockQueryCache.getAll.mockReturnValue([mockQuery2] as any);
    qc.getQueryData = vi.fn(() => [{ id: "g1" }]);

    subCbs.message!({
      type: LobbyServerMessageType.UPDATED,
      payload: { id: "g1" },
      meta: { ts: 3, seq: 3, id: "g1" },
    });

    expect(qc.setQueryData).toHaveBeenCalled();
    dispose();
  });

  it("handles room-deleted message by removing from cache", async () => {
    const { subCbs, qc, mockQueryCache, dispose } = await setupLobby();

    const mockQuery3: any = { queryKey: ["games", { status: "lobby" }, 0, 50, undefined, undefined] };
    mockQueryCache.getAll.mockReturnValue([mockQuery3] as any);
    qc.getQueryData = vi.fn(() => [{ id: "g1" }, { id: "g2" }]);

    subCbs.message!({
      type: LobbyServerMessageType.DELETED,
      payload: { gameId: "g1" },
      meta: { ts: 4, seq: 4, id: "g1" },
    });

    expect(qc.setQueryData).toHaveBeenCalled();
    dispose();
  });

  it("handles unknown message types without error", async () => {
    const { subCbs, dispose } = await setupLobby();

    expect(() => {
      subCbs.message!({ type: "unknown-type", payload: {} });
    }).not.toThrow();

    dispose();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { TileType } from "@generale/types";
import type { SyncedGameState } from "@generale/types";

vi.mock("solid-pixi", () => ({
  Application: (p: any) => p.children ?? null,
  Container: (p: any) => p.children ?? null,
  Graphics: () => null,
  Text: () => null,
  Index: (p: any) => p.each?.(p.fallback) ?? null,
  For: (p: any) => p.each ?? null,
}));

vi.mock("pixi.js", () => ({
  Graphics: vi.fn(() => ({
    clear: vi.fn(),
    removeChildren: vi.fn(),
    addChild: vi.fn(() => ({ x: 0, y: 0 })),
    rect: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    x: 0,
    y: 0,
  })),
  Rectangle: vi.fn(() => ({})),
  TextStyle: vi.fn(() => ({})),
}));

vi.mock("~/utils/faIconGraphic", () => ({
  createIconFactory: () => ({
    createScaledIcon: vi.fn(() => ({ x: 0, y: 0 })),
    destroy: vi.fn(),
  }),
}));

vi.mock("../MapTile", () => ({
  MapTile: () => null,
}));

vi.mock("~/routes/games/generale/hooks/render/useMapInput", () => ({
  useMapInput: () => ({
    active: () => null,
    handleTileClick: vi.fn(),
  }),
}));

import { MapRender } from "../MapRender";

function makeState(overrides?: Partial<SyncedGameState>): SyncedGameState {
  return {
    status: 0 as any,
    tick: 1,
    map: {
      width: 3,
      height: 3,
      tiles: [
        [
          { type: TileType.Plain, ownerId: null, army: 0 },
          { type: TileType.Throne, ownerId: "p1", army: 5 },
          { type: TileType.Mountain, ownerId: null, army: 0 },
        ],
        [
          { type: TileType.Swamp, ownerId: null, army: 0 },
          { type: TileType.Barracks, ownerId: "p2", army: 3 },
          { type: TileType.Fog, ownerId: null, army: 0 },
        ],
        [
          { type: TileType.Plain, ownerId: "p1", army: 2 },
          { type: TileType.Plain, ownerId: "p2", army: 1 },
          { type: TileType.Plain, ownerId: null, army: 0 },
        ],
      ],
    },
    players: {},
    teams: {},
    settings: {} as any,
    playerDisplay: {
      p1: { name: "Player1", displayName: "Player 1", tileColor: 0xff0000, avatarThumbUrl: "" },
      p2: { name: "Player2", displayName: "Player 2", tileColor: 0x0000ff, avatarThumbUrl: "" },
    },
    playerOperationQueue: [],
    ...overrides,
  };
}

describe("MapRender", () => {
  it("renders without crash with map state", () => {
    render(() => <MapRender state={makeState()} />);
  });

  it("calls onViewportReady on mount", () => {
    const onViewportReady = vi.fn();
    render(() => <MapRender state={makeState()} onViewportReady={onViewportReady} />);
    expect(onViewportReady).toHaveBeenCalled();
  });

  it("renders with empty map state", () => {
    const emptyState = makeState({ map: { width: 0, height: 0, tiles: [] } as any });
    render(() => <MapRender state={emptyState} />);
  });

  it("renders with operation queue", () => {
    const state = makeState({
      playerOperationQueue: [
        {
          type: 0 as any,
          payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 100 },
        },
      ],
    });
    render(() => <MapRender state={state} selfId="p1" />);
  });
});

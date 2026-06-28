import { describe, it, expect, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { TileType } from "@generale/types";
import type { Tile } from "@generale/types";

vi.mock("solid-pixi", () => ({
  Application: (p: any) => p.children ?? null,
  Container: (p: any) => p.children ?? null,
  Graphics: () => null,
  Text: (p: any) => p.children ?? null,
  Show: (p: any) => (p.when ? p.children : null),
}));

vi.mock("pixi.js", () => ({
  Graphics: vi.fn(() => ({
    clear: vi.fn(),
    removeChildren: vi.fn(),
    addChild: vi.fn(() => ({ x: 0, y: 0 })),
    rect: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
  })),
  TextStyle: vi.fn(() => ({})),
}));

vi.mock("~/utils/faIconGraphic", () => ({
  createIconFactory: () => ({
    createScaledIcon: vi.fn(() => ({ x: 0, y: 0 })),
    destroy: vi.fn(),
  }),
}));

vi.mock("~/utils/playerColor", () => ({
  tileColorNumber: () => 0xffffff,
}));

import { MapTile } from "../MapTile";

describe("MapTile", () => {
  const baseProps = {
    coord: { x: 0, y: 0 },
    size: 36,
    playerDisplay: {},
    iconTextures: {} as any,
  };

  it("renders with plain tile", () => {
    const tile: Tile = { type: TileType.Plain, ownerId: null, army: 0 };
    const { container } = render(() => <MapTile {...baseProps} tile={tile} />);
    expect(container).toBeTruthy();
  });

  it("renders with throne tile and army", () => {
    const tile: Tile = { type: TileType.Throne, ownerId: "p1", army: 5 };
    render(() => <MapTile {...baseProps} tile={tile} />);
  });

  it("renders with owned tile", () => {
    const tile: Tile = { type: TileType.Plain, ownerId: "p1", army: 3 };
    render(() => <MapTile {...baseProps} tile={tile} />);
  });

  it("renders with fog tile", () => {
    const tile: Tile = { type: TileType.Fog, ownerId: null, army: 0 };
    render(() => <MapTile {...baseProps} tile={tile} />);
  });
});

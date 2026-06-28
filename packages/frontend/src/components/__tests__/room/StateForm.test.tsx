import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { TileType } from "@generale/types";
import type { PreGameGameSetting } from "@generale/types";
import { PreGameRoomStateFrom } from "~/components/room/StateForm";

const defaultState: PreGameGameSetting = {
  speed: 1,
  afkThreshold: 100,
  tileGrow: {
    [TileType.Plain]: { duration: 10, growth: 5 },
    [TileType.Throne]: { duration: 0, growth: 0 },
    [TileType.Barracks]: { duration: 0, growth: 0 },
    [TileType.Mountain]: { duration: 20, growth: 3 },
    [TileType.Swamp]: { duration: 0, growth: 0 },
    [TileType.Fog]: { duration: 0, growth: 0 },
  },
};

const defaultMap = {
  type: "custom" as const,
  width: 10,
  height: 10,
  tileFrequency: {},
} as any;

describe("PreGameRoomStateFrom", () => {
  it("renders speed label with current value", () => {
    render(() => (
      <PreGameRoomStateFrom state={defaultState} map={defaultMap} onChange={vi.fn()} />
    ));
    expect(screen.getByText(/Game Speed/)).toBeInTheDocument();
  });

  it("renders afkThreshold input", () => {
    render(() => (
      <PreGameRoomStateFrom state={defaultState} map={defaultMap} onChange={vi.fn()} />
    ));
    const input = screen.getByLabelText(/AFK Threshold/) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("100");
  });

  it("renders apply button", () => {
    render(() => (
      <PreGameRoomStateFrom state={defaultState} map={defaultMap} onChange={vi.fn()} />
    ));
    expect(screen.getByText("Apply Settings")).toBeInTheDocument();
  });

  it("renders tileGrow section toggle", () => {
    render(() => (
      <PreGameRoomStateFrom state={defaultState} map={defaultMap} onChange={vi.fn()} />
    ));
    expect(screen.getByText("Tile Growth Rules (tileGrow)")).toBeInTheDocument();
  });

  it("renders tile grow entries when expanded", () => {
    render(() => (
      <PreGameRoomStateFrom state={defaultState} map={defaultMap} onChange={vi.fn()} />
    ));
    fireEvent.click(screen.getByText("Tile Growth Rules (tileGrow)"));
    expect(screen.getByText(TileType.Plain)).toBeInTheDocument();
    expect(screen.getByText(TileType.Mountain)).toBeInTheDocument();
  });
});

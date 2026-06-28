import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { PlayerStatus, TileType } from "@generale/types";
import type { SyncedGameState } from "@generale/types";

vi.mock("@solidjs/router", () => ({
  A: (p: any) => p.children,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [() => ({}), vi.fn()],
}));

vi.mock("~/components/Avatar", () => ({
  default: () => null,
}));

import { PlayerList } from "~/components/game/PlayerList";

function makeState(overrides?: Partial<SyncedGameState>): () => SyncedGameState {
  return () => ({
    status: 0 as any,
    tick: 1,
    map: {
      width: 3,
      height: 3,
      tiles: [
        [
          { type: TileType.Plain, ownerId: "p1", army: 0 },
          { type: TileType.Plain, ownerId: "p2", army: 0 },
          { type: TileType.Plain, ownerId: null, army: 0 },
        ],
        [
          { type: TileType.Plain, ownerId: "p1", army: 0 },
          { type: TileType.Plain, ownerId: null, army: 0 },
          { type: TileType.Plain, ownerId: null, army: 0 },
        ],
        [
          { type: TileType.Plain, ownerId: null, army: 0 },
          { type: TileType.Plain, ownerId: null, army: 0 },
          { type: TileType.Plain, ownerId: null, army: 0 },
        ],
      ],
    },
    players: {
      p1: { id: "p1", army: 10, status: PlayerStatus.Playing, land: 0, lastActiveTick: 0, teamId: "" } as any,
      p2: { id: "p2", army: 5, status: PlayerStatus.Playing, land: 0, lastActiveTick: 0, teamId: "" } as any,
    },
    teams: {},
    settings: {} as any,
    playerDisplay: {
      p1: { name: "Player1", displayName: "Player 1", tileColor: 0xff0000, avatarThumbUrl: "" },
      p2: { name: "Player2", displayName: "Player 2", tileColor: 0x0000ff, avatarThumbUrl: "" },
    },
    playerOperationQueue: [],
    ...overrides,
  });
}

describe("PlayerList (game)", () => {
  it("renders player display names", () => {
    render(() => <PlayerList state={makeState()} />);
    expect(screen.getByText("Player 1")).toBeInTheDocument();
    expect(screen.getByText("Player 2")).toBeInTheDocument();
  });

  it("renders land and army info for each player", () => {
    render(() => <PlayerList state={makeState()} />);
    expect(screen.getByText("land: 2 · army: 10")).toBeInTheDocument();
    expect(screen.getByText("land: 1 · army: 5")).toBeInTheDocument();
  });

  it("renders in compact mode", () => {
    render(() => <PlayerList state={makeState()} compact />);
    expect(screen.getByText("Player 1")).toBeInTheDocument();
  });

  it("renders compact format land and army", () => {
    render(() => <PlayerList state={makeState()} compact />);
    expect(screen.getByText("2L·10A")).toBeInTheDocument();
    expect(screen.getByText("1L·5A")).toBeInTheDocument();
  });
});

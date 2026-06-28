import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

const mockState = vi.hoisted(() => ({
  status: 0 as any,
  tick: 1,
  map: { width: 3, height: 3, tiles: [[{ type: "PLAIN", ownerId: null, army: 0 }]] },
  players: {},
  teams: {},
  settings: {} as any,
  playerDisplay: {},
  playerOperationQueue: [],
}));

vi.mock("solid-pixi", () => ({
  Application: (p: any) => p.children ?? null,
  Container: (p: any) => p.children ?? null,
  Graphics: () => null,
  Text: () => null,
  Show: (p: any) => (p.when ? p.children : null),
  Index: (p: any) => p.each ?? null,
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

vi.mock("~/game/render/useMapInput", () => ({
  useMapInput: () => ({
    active: () => null,
    handleTileClick: vi.fn(),
  }),
}));

vi.mock("~/game/useGameSession", () => ({
  useGameSession: () => ({
    state: () => mockState,
    mergedState: () => mockState,
    notice: () => null,
    gameEndedInfo: () => null,
    displaced: () => false,
    endgameResult: () => null,
    handleOperationQueued: vi.fn(),
    handleClearQueue: vi.fn(),
    handleSurrender: vi.fn(),
    handleLeave: vi.fn(),
    handleBackToRoom: vi.fn(),
    isReady: () => true,
  }),
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  A: (p: any) => p.children,
}));

vi.mock("~/testBridge", () => ({
  default: { viewportApi: null },
}));

vi.mock("~/ui", () => ({
  Badge: (p: any) => <span {...p} />,
  Button: (p: any) => <button {...p} />,
  Confetti: () => null,
  Countdown: () => null,
  Overlay: (p: any) => <div data-testid="overlay" {...p} />,
  sfx: { victory: vi.fn(), defeat: vi.fn() },
  TakeoverOverlay: () => null,
  uiTheme: { outcome: { won: "text-green", lost: "text-red" } },
}));

vi.mock("~/components/MapRender", () => ({
  MapRender: () => null,
}));

vi.mock("~/game/PlayerList", () => ({
  default: () => null,
}));

vi.mock("solid-js", async () => {
  const actual = await vi.importActual("solid-js");
  return {
    ...actual as any,
    onMount: (fn: () => void) => fn(),
  };
});

vi.mock("../MapTile", () => ({
  MapTile: () => null,
}));

import { GameWithSync } from "~/components/game/Game";

describe("GameWithSync", () => {
  it("renders loading state when map not ready", () => {
    render(() => (
      <GameWithSync domain="test" gameId="g1" playerId="p1" />
    ));
    expect(screen.getByTestId("game-hud")).toBeInTheDocument();
  });

  it("renders game HUD with game id", () => {
    render(() => (
      <GameWithSync domain="test" gameId="g1" playerId="p1" />
    ));
    expect(screen.getByText("g1")).toBeInTheDocument();
  });

  it("renders tick info", () => {
    render(() => (
      <GameWithSync domain="test" gameId="g1" playerId="p1" />
    ));
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders surrender button for non-spectator", () => {
    render(() => (
      <GameWithSync domain="test" gameId="g1" playerId="p1" />
    ));
    expect(screen.getByTestId("surrender")).toBeInTheDocument();
  });

  it("renders spectator badge when spectating", () => {
    render(() => (
      <GameWithSync domain="test" gameId="g1" playerId="p1" spectate />
    ));
    expect(screen.getByTestId("spectator-badge")).toBeInTheDocument();
  });
});

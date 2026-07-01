import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { PlayerColor, PreGamePlayerReadyState, PreGamePlayerStatus } from "@generale/types";
import { PlayerList } from "~/routes/games/generale/components/room/PlayerList";

vi.mock("@solidjs/router", () => ({
  A: (p: any) => p.children,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [() => ({}), vi.fn()],
}));

function makePlayer(id: string, overrides?: Record<string, unknown>) {
  return {
    id,
    name: `user${id}`,
    displayName: `User ${id}`,
    teamId: "",
    isHost: id === "p1",
    ready: PreGamePlayerReadyState.Ready,
    tileColor: PlayerColor.Blue,
    status: PreGamePlayerStatus.Lobby,
    ...overrides,
  } as any;
}

function defaultProps() {
  return {
    players: [makePlayer("p1"), makePlayer("p2", { isHost: false, ready: PreGamePlayerReadyState.Ready })],
    teams: [],
    selfId: "p1",
    hostId: "p1",
    teamCount: 0,
    teamMode: "ffa" as const,
    onToggleReady: vi.fn(),
  };
}

describe("PlayerList", () => {
  it("renders player-list test id", () => {
    render(() => <PlayerList {...defaultProps()} />);
    expect(screen.getByTestId("player-list")).toBeInTheDocument();
  });

  it("renders player display name", () => {
    render(() => <PlayerList {...defaultProps()} />);
    expect(screen.getByText("User p1")).toBeInTheDocument();
  });

  it("shows Host badge for host player", () => {
    render(() => <PlayerList {...defaultProps()} />);
    expect(screen.getByText("Host")).toBeInTheDocument();
  });

  it("shows Ready status when non-host player is ready", () => {
    render(() => <PlayerList {...defaultProps()} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows Not Ready when non-host player is not ready", () => {
    const props = defaultProps();
    props.players = [makePlayer("p1"), makePlayer("p2", { isHost: false, ready: PreGamePlayerReadyState.NotReady })];
    render(() => <PlayerList {...props} />);
    expect(screen.getByText("Not Ready")).toBeInTheDocument();
  });
});

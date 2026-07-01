import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import type { PregameController } from "~/routes/games/generale/hooks/usePreGameRoom";

vi.mock("@solidjs/router", () => ({
  A: (p: any) => p.children,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [() => ({}), vi.fn()],
}));

vi.mock("~/ui", () => ({
  Alert: (p: any) => <div {...p} />,
  Button: (p: any) => <button {...p}>{p.children}</button>,
  Card: (p: any) => <div {...p} />,
  Panel: (p: any) => <div {...p} />,
  Range: (p: any) => <div {...p} />,
  TakeoverOverlay: () => null,
}));

vi.mock("~/routes/games/generale/components/room/PlayerList", () => ({
  PlayerList: () => null,
}));

vi.mock("~/routes/games/generale/components/room/PreGameControls", () => ({
  PreGameControls: () => null,
}));

vi.mock("~/routes/games/generale/components/room/PreGameMapSettingForm", () => ({
  PreGameMapSettingForm: () => null,
}));

vi.mock("~/routes/games/generale/components/room/StateForm", () => ({
  PreGameRoomStateFrom: () => null,
}));

import { RoomWithSync } from "~/routes/games/generale/components/room/Room";

function makeCtrl(overrides?: Partial<PregameController>): PregameController {
  return {
    notice: () => null,
    isKicked: () => false,
    displaced: () => false,
    room: () => ({
      gameId: "g1",
      hostId: "p1",
      roomType: "standard",
      teamMode: "ffa",
      players: [],
      teams: [],
      gameSetting: { speed: 1, tileGrow: {} as any, afkThreshold: 30 },
      mapSetting: { type: "random" as const, width: 20, height: 20, tileFrequency: {} as any, sizeLabel: "medium" },
      teamCount: 0,
      playerLimit: 8,
      started: false,
    }),
    selfId: () => "p1",
    isHost: () => true,
    selfReady: () => false,
    selfStatus: () => "LOBBY" as any,
    gameInProgress: () => false,
    isLobby: () => true,
    isSpectating: () => false,
    onSettingChange: vi.fn(),
    onToggleReadyForSelf: vi.fn(),
    onToggleReadyForPlayer: vi.fn(),
    onKick: vi.fn(),
    onTransferHost: vi.fn(),
    onStartGame: vi.fn(),
    onLeave: vi.fn(),
    onDisband: vi.fn(),
    onMapChange: vi.fn(),
    onRoomTypeChange: vi.fn(),
    onTeamModeChange: vi.fn(),
    onEnterSpectate: vi.fn(),
    onLeaveSpectate: vi.fn(),
    onChangeTeam: vi.fn(),
    onCreateTeam: vi.fn(),
    onRenameTeam: vi.fn(),
    onDeleteTeam: vi.fn(),
    onChangeColor: vi.fn(),
    ...overrides,
  } as PregameController;
}

describe("RoomWithSync", () => {
  it("renders room info card", () => {
    render(() => <RoomWithSync ctrl={makeCtrl()} playerId="p1" gameId="g1" />);
    expect(screen.getByText("Room Info")).toBeInTheDocument();
  });

  it("renders game id", () => {
    render(() => <RoomWithSync ctrl={makeCtrl()} playerId="p1" gameId="g1" />);
    expect(screen.getByTestId("room-game-id")).toBeInTheDocument();
  });

  it("renders copy invite link button for host", () => {
    render(() => <RoomWithSync ctrl={makeCtrl()} playerId="p1" gameId="g1" />);
    expect(screen.getByText("Copy Invite Link")).toBeInTheDocument();
  });

  it("renders Player Limit info", () => {
    render(() => <RoomWithSync ctrl={makeCtrl()} playerId="p1" gameId="g1" />);
    expect(screen.getByText(/Player Limit/)).toBeInTheDocument();
  });

  it("hides when visible is false", () => {
    const { container } = render(() => (
      <RoomWithSync ctrl={makeCtrl()} playerId="p1" gameId="g1" visible={false} />
    ));
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.display).toBe("none");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("~/game/usePreGameRoom", () => ({
  usePreGameRoom: () => ({
    room: () => ({
      gameId: "test-game",
      hostId: "p1",
      players: [],
      teams: [],
      gameSetting: { speed: 1, tileGrow: {}, afkThreshold: 30 },
      mapSetting: { type: "random", width: 20, height: 20, tileFrequency: {} as any, sizeLabel: "medium" },
      roomType: "standard",
      teamMode: "ffa",
      teamCount: 0,
      playerLimit: 8,
      started: false,
    }),
    selfId: () => "p1",
    isHost: () => true,
    selfReady: () => false,
    selfStatus: () => "LOBBY" as any,
    notice: () => null,
    isKicked: () => false,
    displaced: () => false,
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
  }),
}));

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

vi.mock("~/components/room/PlayerList", () => ({
  PlayerList: () => null,
}));

vi.mock("~/components/room/PreGameControls", () => ({
  PreGameControls: () => null,
}));

vi.mock("~/components/room/PreGameMapSettingForm", () => ({
  PreGameMapSettingForm: () => null,
}));

vi.mock("~/components/room/StateForm", () => ({
  PreGameRoomStateFrom: () => null,
}));

import { ConnectedRoom } from "~/components/room/ConnectedRoom";

describe("ConnectedRoom", () => {
  it("renders room UI", () => {
    render(() => (
      <ConnectedRoom domain="test" playerId="p1" gameId="test-game" />
    ));
    expect(screen.getByText("房间信息")).toBeInTheDocument();
  });

  it("renders game id", () => {
    render(() => (
      <ConnectedRoom domain="test" playerId="p1" gameId="test-game" />
    ));
    expect(screen.getByTestId("room-game-id")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  useParams: () => ({ id: "room-123" }),
  useNavigate: () => vi.fn(),
}));

vi.mock("~/game/useRoomSession", () => ({
  useRoomSession: () => ({
    error: () => null,
    loading: () => false,
    needsPassword: () => false,
    wrongPassword: () => false,
    showingGameUI: () => false,
    gameDomain: () => null,
    playerId: () => null,
    roomDomain: () => null,
    chatDomain: () => null,
    selfStatus: () => null,
    startedThisSession: () => false,
    phase: () => "lobby",
    roomState: () => null,
    roomPassword: () => null,
    handleStateUpdate: vi.fn(),
    handleDismissGameEnd: vi.fn(),
    handleGameEndedReceived: vi.fn(),
    setPassword: vi.fn(),
    setSelfStatus: vi.fn(),
    setRoomState: vi.fn(),
    setRoomApi: vi.fn(),
    roomApi: () => null,
  }),
}));

vi.mock("~/components/ChatPanel", () => ({
  default: () => <div data-testid="chat-panel">ChatPanel</div>,
}));

vi.mock("~/components/game/Game", () => ({
  default: () => <div data-testid="game-component">GameWithSync</div>,
}));

vi.mock("~/components/room/ConnectedRoom", () => ({
  default: () => <div data-testid="connected-room">ConnectedRoom</div>,
}));

vi.mock("~/testBridge", () => ({
  default: {},
}));

import RoomRoute from "../room";

describe("Room route", () => {
  it("renders without crashing", () => {
    render(() => <RoomRoute />);
    expect(document.querySelector(".container")).toBeInTheDocument();
  });
});

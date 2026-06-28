import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";

const mockNavigate = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock("@tanstack/solid-query", () => ({
  useQuery: () => ({
    isLoading: false,
    isError: false,
    isSuccess: false,
    data: null,
    error: null,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryCache: () => ({ getAll: () => [] }),
  }),
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => mockNavigate,
  A: (p: any) => p.children,
  useSearchParams: () => [() => ({}), vi.fn()],
}));

const mockGameListQuery = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  isSuccess: true,
  error: null,
  data: [],
  refetch: vi.fn(),
}));

vi.mock("~/hooks/useGameListQuery", () => ({
  useGameListQuery: () => mockGameListQuery,
}));

vi.mock("~/hooks/useLobbyRealtime", () => ({
  useLobbyRealtime: () => ({}),
}));

vi.mock("~/api/gameApi", () => ({
  getGameInfoApi: vi.fn(),
  listGamesApi: vi.fn(),
}));

vi.mock("~/components/roomlist/CreateRoomModal", () => ({
  default: (p: any) => <div data-testid="create-room-modal" />,
}));

vi.mock("~/components/roomlist/RoomFilter", () => ({
  default: () => <div data-testid="room-filter" />,
}));

import { RoomList } from "~/components/roomlist/index";

describe("RoomList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGameListQuery.isLoading = false;
    mockGameListQuery.isError = false;
    mockGameListQuery.isSuccess = true;
    mockGameListQuery.error = null;
    mockGameListQuery.data = [];
  });

  it("renders title", () => {
    render(() => <RoomList />);
    expect(screen.getByText("Active Rooms")).toBeInTheDocument();
  });

  it("renders create room button", () => {
    render(() => <RoomList />);
    expect(screen.getByText("New Room")).toBeInTheDocument();
  });

  it("renders refresh button", () => {
    render(() => <RoomList />);
    expect(screen.getByText("Refresh")).toBeInTheDocument();
  });

  it("renders RoomFilter", () => {
    render(() => <RoomList />);
    expect(screen.getByTestId("room-filter")).toBeInTheDocument();
  });

  it("shows loading spinner when loading", () => {
    mockGameListQuery.isLoading = true;
    mockGameListQuery.isSuccess = false;
    render(() => <RoomList />);
    expect(screen.getByText("Active Rooms")).toBeInTheDocument();
  });

  it("shows error alert when error", () => {
    mockGameListQuery.isLoading = false;
    mockGameListQuery.isError = true;
    mockGameListQuery.isSuccess = false;
    mockGameListQuery.error = { message: "Network error" };
    render(() => <RoomList />);
    expect(screen.getByText(/Failed to load room list/)).toBeInTheDocument();
  });

  it("renders game cards on success with data", () => {
    mockGameListQuery.data = [
      {
        id: "g1",
        roomName: "Test Game",
        hostName: "Host1",
        type: "standard",
        playerCount: 2,
        maxPlayers: 4,
        status: "lobby",
      },
    ];
    render(() => <RoomList />);
    expect(screen.getByText("Test Game")).toBeInTheDocument();
    expect(screen.getByText("Host1")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
  });

  it("renders Join button for game cards", () => {
    mockGameListQuery.data = [
      {
        id: "g1",
        roomName: "Test Game",
        playerCount: 1,
        maxPlayers: 4,
        status: "lobby",
      },
    ];
    render(() => <RoomList />);
    expect(screen.getByText("Join")).toBeInTheDocument();
  });

  it("opens create modal when new room button clicked", () => {
    render(() => <RoomList />);
    fireEvent.click(screen.getByText("New Room"));
    expect(screen.getByTestId("create-room-modal")).toBeInTheDocument();
  });

  it("navigates to game when Join clicked", () => {
    mockGameListQuery.data = [
      {
        id: "g1",
        roomName: "Test Game",
        playerCount: 1,
        maxPlayers: 4,
        status: "lobby",
      },
    ];
    render(() => <RoomList />);
    fireEvent.click(screen.getByText("Join"));
    expect(mockNavigate).toHaveBeenCalledWith("/game/g1");
  });

  it("shows Locked badge for password-protected rooms", () => {
    mockGameListQuery.data = [
      {
        id: "g1",
        roomName: "Locked Game",
        hasPassword: true,
        playerCount: 1,
        maxPlayers: 4,
        status: "lobby",
      },
    ];
    render(() => <RoomList />);
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("shows Details button for game cards", () => {
    mockGameListQuery.data = [
      {
        id: "g1",
        roomName: "Test Game",
        playerCount: 1,
        maxPlayers: 4,
        status: "lobby",
      },
    ];
    render(() => <RoomList />);
    expect(screen.getByText("Details")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("~/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "1", username: "test", displayName: "Test" },
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  A: (p: any) => <a href={p.href}>{p.children}</a>,
  useSearchParams: () => [() => ({}), vi.fn()],
  useParams: () => ({}),
}));

vi.mock("~/components/roomlist", () => ({
  default: () => <div data-testid="roomlist">RoomList</div>,
  RoomList: () => <div data-testid="roomlist">RoomList</div>,
}));

vi.mock("~/hooks/useWebsocket", () => ({
  WebSocketProvider: (p: any) => p.children,
  useWS: () => ({}),
  useSubConnector: () => ({}),
}));

import Home from "../index";

describe("Home route", () => {
  it("renders room list when authenticated", () => {
    render(() => <Home />);
    expect(screen.getByTestId("roomlist")).toBeInTheDocument();
  });

  it("renders sidebar menu", () => {
    render(() => <Home />);
    expect(screen.getByText("ROOM")).toBeInTheDocument();
    expect(screen.getByText("MAP")).toBeInTheDocument();
  });
});

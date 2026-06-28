import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

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

vi.mock("~/hooks/useWebsocket", () => ({
  WebSocketProvider: (p: any) => p.children,
  useWS: () => ({}),
  useSubConnector: () => ({}),
}));

import Home from "../index";

describe("Home route", () => {
  it("renders Hero section with PLAY ONLINE heading", () => {
    render(() => <Home />);
    expect(screen.getByText("PLAY ONLINE")).toBeInTheDocument();
  });

  it("renders GAMES section heading", () => {
    render(() => <Home />);
    expect(screen.getByText("GAMES")).toBeInTheDocument();
  });

  it("renders General E GameCard", () => {
    render(() => <Home />);
    expect(screen.getByText("General E")).toBeInTheDocument();
  });

  it("renders More Coming Soon GameCard", () => {
    render(() => <Home />);
    expect(screen.getByText("More Coming Soon")).toBeInTheDocument();
  });

  it("renders footer text", () => {
    render(() => <Home />);
    expect(screen.getByText("Float's Games — Online Multiplayer Games")).toBeInTheDocument();
  });
});

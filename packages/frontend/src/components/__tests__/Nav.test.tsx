import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@solidjs/testing-library";

const mockUseLocation = vi.hoisted(() => vi.fn(() => ({ pathname: "/" })));

vi.mock("~/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@solidjs/router", () => ({
  A: (p: any) => <a href={p.href}>{p.children}</a>,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [() => ({}), vi.fn()],
  useLocation: mockUseLocation,
}));

import Nav from "../Nav";

describe("Nav", () => {
  beforeEach(() => {
    mockUseLocation.mockReturnValue({ pathname: "/" });
  });

  it("renders logo and site name", () => {
    render(() => <Nav />);
    const items = screen.getAllByText("General E");
    expect(items.length).toBeGreaterThan(0);
  });

  it("renders LogoIcon", () => {
    render(() => <Nav />);
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows Play link on platform pages", () => {
    render(() => <Nav />);
    expect(screen.getByText("Play")).toBeInTheDocument();
  });

  it("shows Platform and General E links on game pages", () => {
    mockUseLocation.mockReturnValue({ pathname: "/game/123" });
    render(() => <Nav />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
    const items = screen.getAllByText("General E");
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("does not show Play link on game pages", () => {
    mockUseLocation.mockReturnValue({ pathname: "/game/123" });
    render(() => <Nav />);
    expect(screen.queryByText("Play")).not.toBeInTheDocument();
  });

  it("renders About link", () => {
    render(() => <Nav />);
    expect(screen.getByText("About")).toBeInTheDocument();
  });

  it("renders 地图工坊 link", () => {
    render(() => <Nav />);
    expect(screen.getByText("地图工坊")).toBeInTheDocument();
  });

  it("shows Login when user is not authenticated", () => {
    render(() => <Nav />);
    expect(screen.getByText("Login")).toBeInTheDocument();
  });

  it("renders MuteToggle", () => {
    render(() => <Nav />);
    const muteBtn = screen.getByTitle("静音");
    expect(muteBtn).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

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
}));

import Nav from "../Nav";

describe("Nav", () => {
  it("renders logo and site name", () => {
    render(() => <Nav />);
    expect(screen.getByText("General E")).toBeInTheDocument();
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

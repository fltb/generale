import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("~/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  A: (p: any) => <a href={p.href}>{p.children}</a>,
}));

import LoginPage from "../login";

describe("Login route", () => {
  it("renders heading", () => {
    render(() => <LoginPage />);
    expect(screen.getByText("账户")).toBeInTheDocument();
  });

  it("renders login form by default", () => {
    render(() => <LoginPage />);
    expect(screen.getByTestId("login-username")).toBeInTheDocument();
    expect(screen.getByTestId("login-password")).toBeInTheDocument();
    expect(screen.getByTestId("login-submit")).toBeInTheDocument();
  });

  it("renders tab switcher", () => {
    render(() => <LoginPage />);
    expect(screen.getAllByText("登录")).toHaveLength(2);
    expect(screen.getByText("注册")).toBeInTheDocument();
  });
});

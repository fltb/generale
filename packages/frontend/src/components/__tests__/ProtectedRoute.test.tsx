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
  A: (p: any) => p.children,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [() => ({}), vi.fn()],
}));

import { ProtectedRoute } from "../ProtectedRoute";

describe("ProtectedRoute", () => {
  it("shows checking login status when no user", () => {
    render(() => (
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    ));
    expect(screen.getByText("Checking login status...")).toBeInTheDocument();
  });

  it("does not render children when no user", () => {
    render(() => (
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    ));
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });
});

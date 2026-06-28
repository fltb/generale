import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@solidjs/testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { AuthProvider, useAuth } from "../useAuth";

vi.mock("~/api/auth", () => ({
  meApi: vi.fn(),
  loginApi: vi.fn(),
  registerApi: vi.fn(),
  logoutApi: vi.fn(),
  verifyApi: vi.fn(),
  patchProfileApi: vi.fn(),
}));

import * as authApi from "~/api/auth";

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="user">{auth.user?.username ?? "null"}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <button data-testid="login-btn" onClick={() => auth.login({ username: "test", password: "pass" })}>
        Login
      </button>
      <button data-testid="logout-btn" onClick={() => auth.logout()}>
        Logout
      </button>
    </div>
  );
}

function renderWithProviders() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(() => (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    </QueryClientProvider>
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useAuth", () => {
  it("shows null user initially when meApi returns no data", async () => {
    vi.mocked(authApi.meApi).mockResolvedValue({ user: undefined as any });
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });
  });

  it("calls loginApi on login button click", async () => {
    vi.mocked(authApi.meApi).mockResolvedValue({ user: undefined as any });
    vi.mocked(authApi.loginApi).mockResolvedValue({ user: { id: "u1", username: "alice" } as any });

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
    });

    fireEvent.click(screen.getByTestId("login-btn"));

    await waitFor(() => {
      expect(authApi.loginApi).toHaveBeenCalledWith({ username: "test", password: "pass" });
    });
  });

  it("calls logoutApi on logout button click", async () => {
    vi.mocked(authApi.meApi).mockResolvedValue({ user: { id: "u1", username: "alice" } as any });
    vi.mocked(authApi.logoutApi).mockResolvedValue({ ok: true } as any);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("alice");
    });

    fireEvent.click(screen.getByTestId("logout-btn"));

    await waitFor(() => {
      expect(authApi.logoutApi).toHaveBeenCalled();
    });
  });

  it("throws error if used outside AuthProvider", () => {
    const orig = console.error;
    console.error = vi.fn();
    expect(() =>
      render(() => {
        const Test = () => {
          useAuth();
          return <div />;
        };
        return <Test />;
      }),
    ).toThrow("useAuth must be used inside AuthProvider");
    console.error = orig;
  });
});

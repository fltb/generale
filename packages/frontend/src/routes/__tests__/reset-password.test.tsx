import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

const mockParams = { token: "reset-token-123" };
vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [mockParams, vi.fn()],
  A: (p: any) => <a href={p.href}>{p.children}</a>,
}));

vi.mock("@tanstack/solid-query", () => ({
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
  }),
}));

vi.mock("~/api/accountApi", () => ({
  resetPasswordApi: vi.fn(),
}));

import ResetPasswordPage from "../reset-password";

describe("ResetPassword route", () => {
  it("renders heading", () => {
    render(() => <ResetPasswordPage />);
    expect(screen.getByText("设置新密码")).toBeInTheDocument();
  });

  it("renders password fields", () => {
    render(() => <ResetPasswordPage />);
    const pwInputs = document.querySelectorAll('input[type="password"]');
    expect(pwInputs.length).toBe(2);
  });

  it("renders submit button", () => {
    render(() => <ResetPasswordPage />);
    expect(screen.getByText("重置密码")).toBeInTheDocument();
  });
});

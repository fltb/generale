import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
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
  forgotPasswordApi: vi.fn(),
}));

import ForgotPasswordPage from "../forgot-password";

describe("ForgotPassword route", () => {
  it("renders heading and form", () => {
    render(() => <ForgotPasswordPage />);
    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByText("Send reset link")).toBeInTheDocument();
  });

  it("renders link back to login", () => {
    render(() => <ForgotPasswordPage />);
    expect(screen.getByText("Back to login")).toBeInTheDocument();
  });
});

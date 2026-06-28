import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

const mockMutate = vi.fn();

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [() => ({ token: "test-token" }), vi.fn()],
  A: (p: any) => <a href={p.href}>{p.children}</a>,
}));

vi.mock("@tanstack/solid-query", () => ({
  useMutation: () => ({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
  }),
}));

vi.mock("~/hooks/useAuth", () => ({
  useAuth: () => ({ refresh: vi.fn() }),
}));

vi.mock("~/api/accountApi", () => ({
  confirmEmailChangeApi: vi.fn(),
}));

import ConfirmEmailChangePage from "../confirm-email-change";

describe("ConfirmEmailChange route", () => {
  it("renders heading", () => {
    render(() => <ConfirmEmailChangePage />);
    expect(screen.getByText("确认邮箱变更")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/meta", () => ({ Title: () => null, Meta: () => null }));

vi.mock("@solidjs/router", () => ({
  useParams: () => ({ userId: "user-abc" }),
  useNavigate: () => vi.fn(),
  A: (p: any) => <a href={p.href}>{p.children}</a>,
}));

vi.mock("@tanstack/solid-query", () => ({
  useQuery: () => ({
    isLoading: false,
    isError: false,
    isSuccess: true,
    data: {
      userId: "user-abc",
      username: "someuser",
      displayName: "Some User",
      bio: "A bio",
      avatarUrl: null,
    },
    error: null,
  }),
}));

vi.mock("~/api/profileApi", () => ({
  getProfileApi: vi.fn(),
}));

vi.mock("~/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "other-user", username: "me" },
    isLoading: false,
  }),
}));

vi.mock("~/components/Avatar", () => ({
  default: (p: any) => <div data-testid="avatar">Avatar</div>,
}));

import PublicProfilePage from "../profile-view";

describe("ProfileView route", () => {
  it("renders back button", () => {
    render(() => <PublicProfilePage />);
    expect(screen.getByText("← Back")).toBeInTheDocument();
  });

  it("renders user display name", () => {
    render(() => <PublicProfilePage />);
    expect(screen.getByText("Some User")).toBeInTheDocument();
  });

  it("renders user bio", () => {
    render(() => <PublicProfilePage />);
    expect(screen.getByText("A bio")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";

vi.mock("@solidjs/router", () => ({
  A: (p: any) => <a href={p.href}>{p.children}</a>,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [() => ({}), vi.fn()],
}));

import GameCard from "../GameCard";

describe("GameCard", () => {
  it("renders title and description", () => {
    render(() => (
      <GameCard
        title="Test Game"
        description="A test game description"
        href="/test"
      />
    ));
    expect(screen.getByText("Test Game")).toBeInTheDocument();
    expect(screen.getByText("A test game description")).toBeInTheDocument();
  });

  it("renders Play link with correct href", () => {
    render(() => (
      <GameCard
        title="Test Game"
        description="A test game description"
        href="/test"
      />
    ));
    const link = screen.getByText("Play").closest("a");
    expect(link).toHaveAttribute("href", "/test");
  });

  it("shows screenshot placeholder for non-coming-soon", () => {
    render(() => (
      <GameCard
        title="Test Game"
        description="A test game description"
        href="/test"
      />
    ));
    expect(screen.getByText("🎮 Screenshot")).toBeInTheDocument();
  });

  it("renders meta text when provided", () => {
    render(() => (
      <GameCard
        title="Test Game"
        description="A test game description"
        href="/test"
        meta="▲ 24 online"
      />
    ));
    expect(screen.getByText("▲ 24 online")).toBeInTheDocument();
  });

  it("comingSoon variant shows ❓ and no Play link", () => {
    render(() => (
      <GameCard
        title="Coming Soon"
        description="New game coming"
        href=""
        comingSoon
      />
    ));
    expect(screen.getByText("❓")).toBeInTheDocument();
    expect(screen.queryByText("Play")).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import Hero from "../Hero";

describe("Hero", () => {
  it("renders PLAY ONLINE heading", () => {
    render(() => <Hero />);
    expect(screen.getByText("PLAY ONLINE")).toBeInTheDocument();
  });

  it("renders description text", () => {
    render(() => <Hero />);
    expect(screen.getByText(/Multiplayer games/)).toBeInTheDocument();
  });

  it("has scroll hint", () => {
    render(() => <Hero />);
    expect(screen.getByText("▼")).toBeInTheDocument();
  });
});

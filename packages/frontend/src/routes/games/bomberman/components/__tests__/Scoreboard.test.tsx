import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Scoreboard } from "../Scoreboard";

describe("Scoreboard", () => {
  const players = [
    { name: "Alice", rank: 1, score: 300 },
    { name: "Bob", rank: 2, score: 150 },
    { name: "Carol", rank: 3, score: 80 },
  ];

  it("renders GAME OVER heading", () => {
    render(() => <Scoreboard players={players} onBackToRoom={() => {}} />);
    expect(screen.getByText("GAME OVER")).toBeInTheDocument();
  });

  it("renders all players", () => {
    render(() => <Scoreboard players={players} onBackToRoom={() => {}} />);
    expect(screen.getByText((t) => t.includes("Alice"))).toBeInTheDocument();
    expect(screen.getByText((t) => t.includes("Bob"))).toBeInTheDocument();
    expect(screen.getByText((t) => t.includes("Carol"))).toBeInTheDocument();
  });

  it("renders player scores", () => {
    render(() => <Scoreboard players={players} onBackToRoom={() => {}} />);
    expect(screen.getByText("300 pts")).toBeInTheDocument();
  });

  it("renders back to room button", () => {
    render(() => <Scoreboard players={players} onBackToRoom={() => {}} />);
    expect(screen.getByText("Back to Room")).toBeInTheDocument();
  });
});

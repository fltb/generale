import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { HUD } from "../HUD";

describe("HUD", () => {
  it("renders time in mm:ss format", () => {
    render(() => <HUD timeLeft={125} aliveCount={2} totalPlayers={4} />);
    expect(screen.getByText("2:05")).toBeInTheDocument();
  });

  it("renders alive count", () => {
    render(() => <HUD timeLeft={0} aliveCount={1} totalPlayers={4} />);
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });

  it("renders zero time as 0:00", () => {
    render(() => <HUD timeLeft={0} aliveCount={4} totalPlayers={4} />);
    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});

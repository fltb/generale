import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import Confetti from "../Confetti";

describe("Confetti", () => {
  it("renders with default count", () => {
    const { container } = render(() => <Confetti />);
    expect(container.querySelector(".fixed")).toBeInTheDocument();
  });
  it("accepts custom count prop", () => {
    const { container } = render(() => <Confetti count={20} />);
    expect(container.querySelector(".fixed")).toBeInTheDocument();
  });
  it("renders confetti pieces as divs", () => {
    const { container } = render(() => <Confetti count={5} />);
    const pieces = container.querySelectorAll("div > div");
    expect(pieces.length).toBeGreaterThanOrEqual(5);
  });
});

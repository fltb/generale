import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import Counter from "../Counter";

describe("Counter", () => {
  it("renders with initial count 0", () => {
    render(() => <Counter />);
    expect(screen.getByText("Clicks: 0")).toBeInTheDocument();
  });

  it("increments count on click", () => {
    render(() => <Counter />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(screen.getByText("Clicks: 1")).toBeInTheDocument();
  });

  it("increments multiple times", () => {
    render(() => <Counter />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.getByText("Clicks: 3")).toBeInTheDocument();
  });

  it("has increment class", () => {
    render(() => <Counter />);
    expect(screen.getByRole("button")).toHaveClass("increment");
  });

  it("is a button element", () => {
    render(() => <Counter />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import Range from "../Range";

describe("Range", () => {
  it("renders range input", () => {
    render(() => <Range />);
    const input = screen.getByRole("slider");
    expect(input).toBeInTheDocument();
  });
  it("applies variant class", () => {
    render(() => <Range variant="primary" />);
    expect(screen.getByRole("slider").className).toContain("range-primary");
  });
  it("forwards value and onInput", () => {
    const handle = vi.fn();
    render(() => <Range value={5} onInput={handle} />);
    const input = screen.getByRole("slider") as HTMLInputElement;
    expect(input.value).toBe("5");
    fireEvent.input(input, { target: { value: "7" } });
    expect(handle).toHaveBeenCalled();
  });
  it("renders disabled", () => {
    render(() => <Range disabled />);
    expect(screen.getByRole("slider")).toBeDisabled();
  });
  it("has range class", () => {
    render(() => <Range />);
    expect(screen.getByRole("slider").className).toContain("range");
  });
});

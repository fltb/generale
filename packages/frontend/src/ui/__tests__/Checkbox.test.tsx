import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Checkbox } from "../Checkbox";

describe("Checkbox", () => {
  it("renders checkbox input", () => {
    render(() => <Checkbox />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("applies size class", () => {
    render(() => <Checkbox size="sm" />);
    expect(screen.getByRole("checkbox").className).toContain("checkbox-sm");
  });

  it("renders checked state", () => {
    render(() => <Checkbox checked />);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it("renders disabled state", () => {
    render(() => <Checkbox disabled />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("triggers onChange", () => {
    let val = false;
    render(() => <Checkbox onChange={() => { val = true; }} />);
    screen.getByRole("checkbox").click();
    expect(val).toBe(true);
  });

  it("merges custom class", () => {
    render(() => <Checkbox class="my-cb" />);
    expect(screen.getByRole("checkbox").className).toContain("my-cb");
  });
});

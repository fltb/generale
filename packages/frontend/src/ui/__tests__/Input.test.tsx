import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { Input } from "../Input";

describe("Input", () => {
  it("renders with placeholder", () => {
    render(() => <Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("applies size class", () => {
    render(() => <Input size="sm" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("input-sm");
  });

  it("applies bordered class", () => {
    render(() => <Input bordered />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("input-bordered");
  });

  it("merges custom class", () => {
    render(() => <Input class="my-input" />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("my-input");
  });

  it("forwards value and onInput", () => {
    const handleInput = vi.fn();
    render(() => <Input value="hello" onInput={handleInput} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("hello");
    fireEvent.input(input, { target: { value: "world" } });
    expect(handleInput).toHaveBeenCalled();
  });

  it("renders disabled input", () => {
    render(() => <Input disabled />);
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
  });

  it("has pixel-border class by default", () => {
    render(() => <Input />);
    const input = screen.getByRole("textbox");
    expect(input.className).toContain("pixel-border");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import Textarea from "../Textarea";

describe("Textarea", () => {
  it("renders with placeholder", () => {
    render(() => <Textarea placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });
  it("applies bordered class", () => {
    render(() => <Textarea bordered />);
    expect(screen.getByRole("textbox").className).toContain("textarea-bordered");
  });
  it("forwards value and onInput", () => {
    const handle = vi.fn();
    render(() => <Textarea value="hello" onInput={handle} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.value).toBe("hello");
    fireEvent.input(ta, { target: { value: "world" } });
    expect(handle).toHaveBeenCalled();
  });
  it("renders disabled", () => {
    render(() => <Textarea disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
  it("has textarea class", () => {
    render(() => <Textarea />);
    expect(screen.getByRole("textbox").className).toContain("textarea");
  });
});

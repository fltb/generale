import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { Button } from "../Button";

vi.mock("../sound", () => ({
  sfx: { click: vi.fn() },
}));

describe("Button", () => {
  it("renders children text", () => {
    render(() => <Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("applies variant class", () => {
    render(() => <Button variant="primary">Primary</Button>);
    const btn = screen.getByText("Primary");
    expect(btn.className).toContain("btn-primary");
  });

  it("applies size class", () => {
    render(() => <Button size="sm">Small</Button>);
    const btn = screen.getByText("Small");
    expect(btn.className).toContain("btn-sm");
  });

  it("applies active class", () => {
    render(() => <Button active>Active</Button>);
    const btn = screen.getByText("Active");
    expect(btn.className).toContain("btn-active");
  });

  it("applies outline class", () => {
    render(() => <Button outline>Outline</Button>);
    const btn = screen.getByText("Outline");
    expect(btn.className).toContain("btn-outline");
  });

  it("applies circle class", () => {
    render(() => <Button circle>Circle</Button>);
    const btn = screen.getByText("Circle");
    expect(btn.className).toContain("btn-circle");
  });

  it("applies block class", () => {
    render(() => <Button block>Block</Button>);
    const btn = screen.getByText("Block");
    expect(btn.className).toContain("btn-block");
  });

  it("merges custom class", () => {
    render(() => <Button class="my-custom">Custom</Button>);
    const btn = screen.getByText("Custom");
    expect(btn.className).toContain("my-custom");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(() => <Button onClick={onClick}>Clickable</Button>);
    fireEvent.click(screen.getByText("Clickable"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders disabled button", () => {
    render(() => <Button disabled>Disabled</Button>);
    const btn = screen.getByText("Disabled");
    expect(btn).toBeDisabled();
  });

  it("renders default variant (neutral) when variant not specified", () => {
    render(() => <Button>No Variant</Button>);
    const btn = screen.getByText("No Variant");
    expect(btn.className).toContain("btn");
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Overlay, TakeoverOverlay } from "../Overlay";

describe("Overlay", () => {
  it("renders children", () => {
    render(() => <Overlay><div>content</div></Overlay>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });
  it("has fixed positioning classes", () => {
    render(() => <Overlay>X</Overlay>);
    const el = screen.getByText("X");
    expect(el.className).toContain("fixed");
    expect(el.className).toContain("inset-0");
  });
  it("applies dim=60 class", () => {
    render(() => <Overlay dim={60}>X</Overlay>);
    const el = screen.getByText("X");
    expect(el.className).toContain("bg-black/60");
  });
  it("defaults to dim=70", () => {
    render(() => <Overlay>X</Overlay>);
    const el = screen.getByText("X");
    expect(el.className).toContain("bg-black/70");
  });
  it("merges custom class", () => {
    render(() => <Overlay class="z-50">X</Overlay>);
    const el = screen.getByText("X");
    expect(el.className).toContain("z-50");
  });
});

describe("TakeoverOverlay", () => {
  it("renders takeover message with default scope", () => {
    render(() => <TakeoverOverlay />);
    expect(screen.getByText(/已被/)).toBeInTheDocument();
  });
  it("renders with custom scope", () => {
    render(() => <TakeoverOverlay scope="游戏" />);
    expect(screen.getByText(/游戏/)).toBeInTheDocument();
  });
});

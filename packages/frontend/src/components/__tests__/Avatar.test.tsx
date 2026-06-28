import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Avatar } from "../Avatar";

describe("Avatar", () => {
  it("renders img with src", () => {
    render(() => <Avatar src="/avatar.png" alt="Alice" />);
    const img = screen.getByAltText("Alice") as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain("/avatar.png");
  });

  it("uses default size 40 when size not provided", () => {
    render(() => <Avatar src="/a.png" />);
    const container = screen.getByAltText("avatar").parentElement!;
    expect(container.style.width).toBe("40px");
    expect(container.style.height).toBe("40px");
  });

  it("uses custom size", () => {
    render(() => <Avatar src="/a.png" size={64} />);
    const container = screen.getByAltText("avatar").parentElement!;
    expect(container.style.width).toBe("64px");
    expect(container.style.height).toBe("64px");
  });

  it("applies custom class", () => {
    render(() => <Avatar src="/a.png" class="ring-2" />);
    const container = screen.getByAltText("avatar").parentElement!;
    expect(container.className).toContain("ring-2");
  });

  it("renders with rounded-full class", () => {
    render(() => <Avatar src="/a.png" alt="Bob" />);
    const container = screen.getByAltText("Bob").parentElement!;
    expect(container.className).toContain("rounded-full");
  });

  it("has object-cover on img", () => {
    render(() => <Avatar src="/a.png" />);
    const img = screen.getByAltText("avatar");
    expect(img.className).toContain("object-cover");
  });
});

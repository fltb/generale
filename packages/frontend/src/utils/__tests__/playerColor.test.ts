import { describe, it, expect } from "vitest";
import { tileColorNumber, playerColorCss, DEFAULT_TILE_COLOR_NUMBER, DEFAULT_PLAYER_COLOR_CSS } from "../playerColor";

describe("tileColorNumber", () => {
  it("returns number as-is", () => {
    expect(tileColorNumber(0xff0000)).toBe(0xff0000);
  });

  it("resolves string enum name to number", () => {
    const result = tileColorNumber("Red");
    expect(typeof result).toBe("number");
    expect(result).not.toBe(DEFAULT_TILE_COLOR_NUMBER);
  });

  it("returns fallback for unknown string", () => {
    expect(tileColorNumber("HotPink" as any, 0xcccccc)).toBe(0xcccccc);
  });

  it("returns fallback for undefined", () => {
    expect(tileColorNumber(undefined)).toBe(DEFAULT_TILE_COLOR_NUMBER);
  });

  it("returns custom fallback when provided", () => {
    expect(tileColorNumber(undefined, 0x123456)).toBe(0x123456);
  });
});

describe("playerColorCss", () => {
  it("formats number to #rrggbb", () => {
    expect(playerColorCss(0xff0000)).toBe("#ff0000");
  });

  it("resolves string enum to css", () => {
    const css = playerColorCss("Red");
    expect(css).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns fallback for null/undefined", () => {
    expect(playerColorCss(null as any)).toBe(DEFAULT_PLAYER_COLOR_CSS);
    expect(playerColorCss(undefined)).toBe(DEFAULT_PLAYER_COLOR_CSS);
  });

  it("returns custom fallback", () => {
    expect(playerColorCss(undefined, "#123456")).toBe("#123456");
  });
});

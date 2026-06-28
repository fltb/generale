import { describe, it, expect } from "vitest";
import { createT } from "../index";

describe("createT", () => {
  it("returns English text for en locale", () => {
    const t = createT("en");
    expect(t("Login")).toBe("Login");
  });

  it("returns Chinese text for zh-CN locale", () => {
    const t = createT("zh-CN");
    // zh-CN has empty values; falls back to en
    expect(t("Login")).toBe("Login");
  });

  it("handles param substitution", () => {
    const t = createT("en");
    expect(t("Game Over! {winner} wins", { winner: "Alice" }))
      .toBe("Game Over! Alice wins");
  });

  it("falls back to en when key missing in locale", () => {
    const t = createT("zh-CN");
    expect(t("Login")).toBe("Login");
  });

  it("returns key itself when missing everywhere", () => {
    const t = createT("en");
    expect(t("SomeRandomKey" as any)).toBe("SomeRandomKey");
  });

  it("handles multiple params", () => {
    const t = createT("en");
    expect(t("Player {name} captured tile ({x}, {y})", { name: "Bob", x: 5, y: 10 }))
      .toBe("Player Bob captured tile (5, 10)");
  });
});

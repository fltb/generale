import { describe, it, expect } from "vitest";
import { uiTheme } from "../theme";

describe("uiTheme", () => {
  it("has won color", () => {
    expect(uiTheme.outcome.won).toBe("text-amber-300");
  });
  it("has lost color", () => {
    expect(uiTheme.outcome.lost).toBe("text-rose-300");
  });
});

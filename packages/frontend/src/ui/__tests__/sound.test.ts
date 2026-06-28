import { describe, it, expect, beforeEach } from "vitest";
import { isMuted, setMuted, toggleMuted } from "../sound";

describe("sound", () => {
  beforeEach(() => {
    localStorage.clear();
    setMuted(false);
  });

  it("isMuted returns false initially", () => {
    expect(isMuted()).toBe(false);
  });
  it("setMuted(true) updates isMuted", () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
  });
  it("toggleMuted flips state", () => {
    toggleMuted();
    expect(isMuted()).toBe(true);
    toggleMuted();
    expect(isMuted()).toBe(false);
  });
  it("persists to localStorage", () => {
    setMuted(true);
    expect(localStorage.getItem("generale.muted")).toBe("1");
  });
});

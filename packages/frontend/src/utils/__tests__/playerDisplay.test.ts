import { describe, it, expect } from "vitest";
import { resolveDisplayNames } from "../playerDisplay";

describe("resolveDisplayNames", () => {
  it("uses displayName when unique", () => {
    const players = [
      { id: "p1", name: "alice", displayName: "Alice" },
      { id: "p2", name: "bob", displayName: "Bob" },
    ];
    const map = resolveDisplayNames(players);
    expect(map.get("p1")).toBe("Alice");
    expect(map.get("p2")).toBe("Bob");
  });

  it("disambiguates duplicate displayNames with #username", () => {
    const players = [
      { id: "p1", name: "alice", displayName: "Player" },
      { id: "p2", name: "bob", displayName: "Player" },
    ];
    const map = resolveDisplayNames(players);
    expect(map.get("p1")).toBe("Player#alice");
    expect(map.get("p2")).toBe("Player#bob");
  });

  it("falls back to name when displayName is null", () => {
    const players = [
      { id: "p1", name: "alice", displayName: null },
      { id: "p2", name: "bob", displayName: "Bob" },
    ];
    const map = resolveDisplayNames(players);
    expect(map.get("p1")).toBe("alice");
    expect(map.get("p2")).toBe("Bob");
  });

  it("handles empty array", () => {
    const map = resolveDisplayNames([]);
    expect(map.size).toBe(0);
  });

  it("single player does not self-disambiguate", () => {
    const players = [{ id: "p1", name: "alice", displayName: "Alice" }];
    const map = resolveDisplayNames(players);
    expect(map.get("p1")).toBe("Alice");
  });
});

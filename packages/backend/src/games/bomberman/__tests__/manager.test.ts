import { describe, it, expect, beforeEach } from "vitest";
import { BombermanManager } from "../service/BombermanManager";

describe("BombermanManager", () => {
  let manager: BombermanManager;

  beforeEach(() => {
    manager = new BombermanManager();
  });

  it("creates a new game with unique ID", () => {
    const s1 = manager.createGame("Room A");
    const s2 = manager.createGame("Room B");
    expect(s1).toBeDefined();
    expect(s2).toBeDefined();
    expect(s1).not.toBe(s2);
  });

  it("retrieves a game by ID", () => {
    const service = manager.createGame("Test");
    const found = manager.getGame(service.gameId);
    expect(found).toBe(service);
  });

  it("returns undefined for non-existent game", () => {
    expect(manager.getGame("nonexistent")).toBeUndefined();
  });

  it("removes a game and destroys it", () => {
    const service = manager.createGame("Test");
    manager.removeGame(service.gameId);
    expect(manager.getGame(service.gameId)).toBeUndefined();
  });

  it("removeGame is idempotent for non-existent ID", () => {
    expect(() => manager.removeGame("ghost")).not.toThrow();
  });
});

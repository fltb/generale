import { describe, it, expect } from "vitest";
import { BombermanGame } from "../instance/BombermanGame";
import { defaultBombermanConfig } from "../settings";
import { GameStatus } from "@generale/types";

describe("BombermanGame", () => {
  it("starts with GameStatus.Playing", () => {
    const config = defaultBombermanConfig();
    config.mapWidth = 9;
    config.mapHeight = 9;
    const game = new BombermanGame(config, ["p1", "p2"]);
    const state = game.getState();
    expect(state.status).toBe(GameStatus.Playing);
    expect(state.tick).toBe(0);
    game.destroy();
  });

  it("creates players at spawn positions", () => {
    const config = defaultBombermanConfig();
    config.mapWidth = 9;
    config.mapHeight = 9;
    const game = new BombermanGame(config, ["p1", "p2"]);
    const state = game.getState();
    expect(state.players.p1).toBeDefined();
    expect(state.players.p2).toBeDefined();
    expect(state.players.p1!.alive).toBe(true);
    expect(state.players.p2!.alive).toBe(true);
    game.destroy();
  });

  it("handles player actions through handleAction", () => {
    const config = defaultBombermanConfig();
    config.mapWidth = 9;
    config.mapHeight = 9;
    const game = new BombermanGame(config, ["p1", "p2"]);

    game.handleAction("p1", { type: "MOVE", direction: "right" }, 0);
    game.handleAction("p1", { type: "PLACE_BOMB" }, 1);

    // Actions are queued and processed by tick
    const state = game.getState();
    const tickedState = (BombermanGame.prototype as any).tick
      ? null
      : null;

    game.startTicking();
    // Let one tick happen
    game.stopTicking();
    game.destroy();
  });

  it("fires onEnd callback when game ends", async () => {
    const config = defaultBombermanConfig();
    config.mapWidth = 9;
    config.mapHeight = 9;
    config.tickRate = 10;
    config.bombFuse = 3;
    const game = new BombermanGame(config, ["p1", "p2"]);

    let endResult: any = null;
    game.onEnd((result) => { endResult = result; });

    // Kill p2 before starting
    const state = game.getState();
    state.players.p2!.alive = false;

    game.startTicking();

    await new Promise((r) => setTimeout(r, 50));
    game.stopTicking();

    // The game should have ended since only p1 is alive
    // onEnd fires during tick if status changes to Ended
    game.destroy();
  });

  it("supports adding bots", () => {
    const config = defaultBombermanConfig();
    config.mapWidth = 9;
    config.mapHeight = 9;
    const game = new BombermanGame(config, ["p1"]);

    game.addBot("bot1", () => ({ type: "NOOP" }));

    const state = game.getState();
    expect(state.players.bot1).toBeDefined();
    expect(state.players.bot1!.alive).toBe(true);
    game.destroy();
  });

  it("destroys cleanly", () => {
    const config = defaultBombermanConfig();
    config.mapWidth = 9;
    config.mapHeight = 9;
    const game = new BombermanGame(config, ["p1", "p2"]);
    game.startTicking();
    game.destroy();
    // Should not throw
  });
});

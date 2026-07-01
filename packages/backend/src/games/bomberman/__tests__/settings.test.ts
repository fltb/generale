import { describe, it, expect } from "vitest";
import { defaultBombermanConfig, validateBombermanConfig } from "../settings";

describe("defaultBombermanConfig", () => {
  it("returns valid config with expected defaults", () => {
    const config = defaultBombermanConfig();
    expect(config.mapWidth).toBe(15);
    expect(config.mapHeight).toBe(13);
    expect(config.playerLimit).toBe(4);
    expect(config.tickRate).toBe(4);
    expect(config.bombFuse).toBe(12);
    expect(config.bombLimit).toBe(1);
    expect(config.blastRadius).toBe(1);
    expect(config.roundTimeSec).toBe(180);
    expect(config.itemDropRate).toBe(0.6);
    expect(config.mode).toBe("multi");
  });
});

describe("validateBombermanConfig", () => {
  it("returns null for valid config", () => {
    expect(validateBombermanConfig(defaultBombermanConfig())).toBeNull();
  });

  it("rejects mapWidth below 11", () => {
    expect(validateBombermanConfig({ mapWidth: 9 })).toContain("mapWidth");
  });

  it("rejects mapWidth above 31", () => {
    expect(validateBombermanConfig({ mapWidth: 40 })).toContain("mapWidth");
  });

  it("rejects playerLimit below 2", () => {
    expect(validateBombermanConfig({ playerLimit: 1 })).toContain("playerLimit");
  });

  it("rejects playerLimit above 4", () => {
    expect(validateBombermanConfig({ playerLimit: 8 })).toContain("playerLimit");
  });

  it("rejects tickRate below 2", () => {
    expect(validateBombermanConfig({ tickRate: 1 })).toContain("tickRate");
  });

  it("rejects tickRate above 8", () => {
    expect(validateBombermanConfig({ tickRate: 10 })).toContain("tickRate");
  });

  it("returns null for partial valid config", () => {
    expect(validateBombermanConfig({ mapWidth: 21, playerLimit: 2 })).toBeNull();
  });
});

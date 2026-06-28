import { describe, it, expect } from "vitest";
import { makeEmptyRoom, makeEmptyGameState } from "../defaults";
import { PreGameMapType } from "@generale/types";

describe("makeEmptyRoom", () => {
  it("returns room with empty players", () => {
    const room = makeEmptyRoom();
    expect(room.players).toEqual([]);
  });

  it("uses provided gameId", () => {
    const room = makeEmptyRoom("test-id");
    expect(room.gameId).toBe("test-id");
  });

  it("defaults to empty gameId when not provided", () => {
    const room = makeEmptyRoom();
    expect(room.gameId).toBe("");
  });

  it("has default roomType of standard", () => {
    const room = makeEmptyRoom();
    expect(room.roomType).toBe("standard");
  });

  it("has default teamMode of ffa", () => {
    const room = makeEmptyRoom();
    expect(room.teamMode).toBe("ffa");
  });

  it("has default playerLimit of 8", () => {
    const room = makeEmptyRoom();
    expect(room.playerLimit).toBe(8);
  });

  it("has started set to false", () => {
    const room = makeEmptyRoom();
    expect(room.started).toBe(false);
  });

  it("has hostId as empty string", () => {
    const room = makeEmptyRoom();
    expect(room.hostId).toBe("");
  });

  it("has mapSetting with Random type and default dimensions", () => {
    const room = makeEmptyRoom();
    const map = room.mapSetting as { width: number; height: number; sizeLabel: string };
    expect(room.mapSetting.type).toBe(PreGameMapType.Random);
    expect(map.width).toBe(20);
    expect(map.height).toBe(20);
    expect(map.sizeLabel).toBe("medium");
  });

  it("has default tileGrow values", () => {
    const room = makeEmptyRoom();
    const tileGrow = room.gameSetting.tileGrow;
    expect(tileGrow.PLAIN.duration).toBe(40);
    expect(tileGrow.PLAIN.growth).toBe(1);
    expect(tileGrow.THRONE.duration).toBe(1);
    expect(tileGrow.MOUNTAIN.duration).toBe(1e10);
    expect(tileGrow.FOG.duration).toBe(1e10);
    expect(tileGrow.SWAMP.growth).toBe(-1);
  });

  it("has empty teams array and teamCount 0", () => {
    const room = makeEmptyRoom();
    expect(room.teams).toEqual([]);
    expect(room.teamCount).toBe(0);
  });

  it("default speed is 1 and afkThreshold is 30", () => {
    const room = makeEmptyRoom();
    expect(room.gameSetting.speed).toBe(1);
    expect(room.gameSetting.afkThreshold).toBe(30);
  });
});

describe("makeEmptyGameState", () => {
  it("returns state with tick 0", () => {
    const state = makeEmptyGameState();
    expect(state.tick).toBe(0);
  });

  it("has empty players object", () => {
    const state = makeEmptyGameState();
    expect(state.players).toEqual({});
  });

  it("has empty teams object", () => {
    const state = makeEmptyGameState();
    expect(state.teams).toEqual({});
  });

  it("has empty playerOperationQueue", () => {
    const state = makeEmptyGameState();
    expect(state.playerOperationQueue).toEqual([]);
  });

  it("has empty playerDisplay object", () => {
    const state = makeEmptyGameState();
    expect(state.playerDisplay).toEqual({});
  });

  it("has map with width 0 and height 0", () => {
    const state = makeEmptyGameState();
    expect(state.map.width).toBe(0);
    expect(state.map.height).toBe(0);
  });

  it("has empty tiles array", () => {
    const state = makeEmptyGameState();
    expect(state.map.tiles).toEqual([]);
  });

  it("status is undefined", () => {
    const state = makeEmptyGameState();
    expect(state.status).toBeUndefined();
  });
});

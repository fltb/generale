import { describe, it, expect } from "vitest";
import { generateBombermanMap, validateConnectivity, getSpawnPositions } from "../map-gen";

describe("generateBombermanMap", () => {
  it("returns map with correct dimensions (odd-corrected)", () => {
    const map = generateBombermanMap(15, 13);
    expect(map.width).toBe(15);
    expect(map.height).toBe(13);
    expect(map.tiles.length).toBe(13);
    expect(map.tiles[0]!.length).toBe(15);
  });

  it("forces odd dimensions (even input)", () => {
    const map = generateBombermanMap(14, 12);
    expect(map.width).toBe(15);
    expect(map.height).toBe(13);
  });

  it("has hard walls on all borders", () => {
    const map = generateBombermanMap(15, 13);
    for (let x = 0; x < map.width; x++) {
      expect(map.tiles[0]![x]!.type).toBe("hard_wall");
      expect(map.tiles[map.height - 1]![x]!.type).toBe("hard_wall");
    }
    for (let y = 0; y < map.height; y++) {
      expect(map.tiles[y]![0]!.type).toBe("hard_wall");
      expect(map.tiles[y]![map.width - 1]!.type).toBe("hard_wall");
    }
  });

  it("has pillar hard walls at even-even positions", () => {
    const map = generateBombermanMap(15, 13);
    for (let y = 2; y < map.height - 2; y += 2) {
      for (let x = 2; x < map.width - 2; x += 2) {
        expect(map.tiles[y]![x]!.type).toBe("hard_wall");
      }
    }
  });

  it("has cleared 3x3 zones at all spawn positions", () => {
    const map = generateBombermanMap(15, 13);
    const spawns = getSpawnPositions(4, 15, 13);
    expect(spawns).toHaveLength(4);
    for (const s of spawns) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const y = s.y + dy;
          const x = s.x + dx;
          if (y < 0 || y >= map.height || x < 0 || x >= map.width) continue;
          const tile = map.tiles[y]![x]!;
          if (tile.type !== "hard_wall") {
            expect(tile.type).toBe("empty");
          }
        }
      }
    }
  });

  it("has all spawn positions connected (guaranteed by BFS path carving)", () => {
    for (let i = 0; i < 10; i++) {
      const map = generateBombermanMap(15, 13);
      const spawns = getSpawnPositions(4, 15, 13);
      // Check all spawns reachable via BFS on empty tiles only
      const visited = new Set<string>();
      const queue = [{ x: spawns[0]!.x, y: spawns[0]!.y }];
      visited.add(`${spawns[0]!.x},${spawns[0]!.y}`);
      while (queue.length > 0) {
        const cell = queue.shift()!;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
          const nx = cell.x + dx, ny = cell.y + dy;
          const key = `${nx},${ny}`;
          if (visited.has(key)) continue;
          const tile = map.tiles[ny]?.[nx];
          if (!tile || tile.type === "hard_wall" || tile.type === "soft_wall") continue;
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
      for (const s of spawns) {
        expect(visited.has(`${s.x},${s.y}`)).toBe(true);
      }
    }
  });

  it("generates maps with at least some soft walls", () => {
    let softWallCount = 0;
    const map = generateBombermanMap(15, 13);
    for (const row of map.tiles) {
      for (const tile of row) {
        if (tile.type === "soft_wall") softWallCount++;
      }
    }
    expect(softWallCount).toBeGreaterThan(0);
  });
});

describe("validateConnectivity", () => {
  it("returns true for a fully open map", () => {
    const map = {
      width: 5,
      height: 5,
      tiles: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ type: "empty" as const })),
      ),
    };
    const spawns = [{ x: 1, y: 1 }, { x: 3, y: 3 }];
    expect(validateConnectivity(map, spawns)).toBe(true);
  });

  it("returns false when spawns are separated by hard walls", () => {
    const map = {
      width: 5,
      height: 5,
      tiles: Array.from({ length: 5 }, () =>
        Array.from({ length: 5 }, () => ({ type: "empty" as const })),
      ),
    };
    for (let y = 0; y < 5; y++) (map.tiles[y] as any)[2] = { type: "hard_wall" };
    const spawns = [{ x: 1, y: 2 }, { x: 3, y: 2 }];
    expect(validateConnectivity(map, spawns)).toBe(false);
  });
});

describe("getSpawnPositions", () => {
  it("returns 4 corners for 4 players", () => {
    const spawns = getSpawnPositions(4, 15, 13);
    expect(spawns).toHaveLength(4);
    expect(spawns[0]!).toEqual({ x: 1, y: 1 });
    expect(spawns[3]!).toEqual({ x: 13, y: 11 });
  });

  it("returns opposite corners for 2 players", () => {
    const spawns = getSpawnPositions(2, 15, 13);
    expect(spawns).toHaveLength(2);
    expect(spawns[0]!).toEqual({ x: 1, y: 1 });
    expect(spawns[1]!).toEqual({ x: 13, y: 11 });
  });
});

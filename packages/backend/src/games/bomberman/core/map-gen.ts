import type { BombermanMap, BombermanTile } from "@generale/types";

function createEmptyMap(width: number, height: number): BombermanMap {
  const tiles: BombermanTile[][] = [];
  for (let y = 0; y < height; y++) {
    const row: BombermanTile[] = [];
    for (let x = 0; x < width; x++) {
      row.push({ type: "empty" });
    }
    tiles.push(row);
  }
  return { width, height, tiles };
}

export function generateBombermanMap(w: number, h: number): BombermanMap {
  const width = w % 2 === 1 ? w : w + 1;
  const height = h % 2 === 1 ? h : h + 1;

  const map = createEmptyMap(width, height);

  // Hard walls: borders + pillars at even-even
  for (let y = 0; y < height; y++) {
    const row = map.tiles[y]!;
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        row[x] = { type: "hard_wall" };
      } else if (x % 2 === 0 && y % 2 === 0) {
        row[x] = { type: "hard_wall" };
      }
    }
  }

  // Safe zones around 4 corners
  const spawns = getSpawnPositions(4, width, height);
  const safeSet = new Set<string>();
  for (const c of spawns) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        safeSet.add(`${c.x + dx},${c.y + dy}`);
      }
    }
  }

  // Fill ALL non-safe, non-pillar tiles as soft_wall candidates
  const candidates: { x: number; y: number }[] = [];
  for (let y = 1; y < height - 1; y++) {
    const row = map.tiles[y]!;
    for (let x = 1; x < width - 1; x++) {
      if (safeSet.has(`${x},${y}`)) continue;
      if (y % 2 === 0 && x % 2 === 0) continue;
      row[x] = { type: "soft_wall" };
      candidates.push({ x, y });
    }
  }

  // Walk from spawn[0] to all other spawns using pathfinding
  // and remove soft walls along the path to create guaranteed corridors
  const rest = spawns.slice(1).filter(Boolean);
  let cur: { x: number; y: number } = spawns[0]!;
  for (const target of rest) {
    const path = bfsPath(map, cur, target);
    if (path) {
      for (const p of path) {
        if (map.tiles[p.y]![p.x]!.type === "soft_wall") {
          map.tiles[p.y]![p.x] = { type: "empty" };
        }
      }
    }
    cur = target;
  }

  // Randomly remove additional soft walls (40%) for variety
  for (const c of candidates) {
    if (map.tiles[c.y]![c.x]!.type === "soft_wall" && Math.random() < 0.4) {
      map.tiles[c.y]![c.x] = { type: "empty" };
    }
  }

  // Remove soft walls blocking spawn exits if any remain
  for (const s of spawns) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = s.x + dx, ny = s.y + dy;
      const tile = map.tiles[ny]?.[nx];
      if (tile && tile.type === "hard_wall") continue;
      if (tile && tile.type === "soft_wall") {
        map.tiles[ny]![nx] = { type: "empty" };
      }
    }
  }

  return map;
}

function bfsPath(
  map: BombermanMap,
  start: { x: number; y: number },
  end: { x: number; y: number },
): { x: number; y: number }[] | null {
  const visited = new Set<string>();
  const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [
    { x: start.x, y: start.y, path: [start] },
  ];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const cell = queue.shift()!;
    if (cell.x === end.x && cell.y === end.y) return cell.path;

    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      const tile = map.tiles[ny]?.[nx];
      if (!tile || tile.type === "hard_wall") continue;
      visited.add(key);
      queue.push({ x: nx, y: ny, path: [...cell.path, { x: nx, y: ny }] });
    }
  }

  return null;
}

export function validateConnectivity(map: BombermanMap, spawns: { x: number; y: number }[]): boolean {
  if (spawns.length === 0) return true;
  const start = spawns[0]!;
  const visited = new Set<string>();
  const queue: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const cell = queue.shift()!;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      const row = map.tiles[ny];
      if (!row) continue;
      const tile = row[nx];
      if (!tile || tile.type === "hard_wall" || tile.type === "soft_wall") continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });
    }
  }

  for (const s of spawns) {
    if (!visited.has(`${s.x},${s.y}`)) return false;
  }

  let totalPassable = 0, reachable = 0;
  for (let y = 0; y < map.height; y++) {
    const row = map.tiles[y]!;
    for (let x = 0; x < map.width; x++) {
      const tile = row[x]!;
      if (tile.type !== "hard_wall" && tile.type !== "soft_wall") {
        totalPassable++;
        if (visited.has(`${x},${y}`)) reachable++;
      }
    }
  }
  return reachable / totalPassable >= 0.8;
}

export function getSpawnPositions(playerCount: number, width: number, height: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [
    { x: 1, y: 1 },
    { x: width - 2, y: 1 },
    { x: 1, y: height - 2 },
    { x: width - 2, y: height - 2 },
  ];
  if (playerCount === 2) return [corners[0]!, corners[3]!];
  if (playerCount === 3) return [corners[0]!, corners[1]!, corners[3]!];
  return corners.slice(0, playerCount);
}

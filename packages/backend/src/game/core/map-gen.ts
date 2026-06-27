import { GameMap, TileType, PreGameMapType, PreGameRoomState } from '@generale/types';
import { mapService } from '../../services/mapService';

/**
 * 生成游戏地图（异步，支持从地图工坊加载自定义地图）
 * @param mapSetting 地图设置（可选字段：width, height, tileFrequency, customMapId）
 * @param players 玩家列表
 * @returns 生成的游戏地图
 */
export async function generateMap(
  mapSetting: PreGameRoomState['mapSetting'],
  players: PreGameRoomState['players']
): Promise<GameMap> {
  const width = (mapSetting as any).width || 20;
  const height = (mapSetting as any).height || 20;
  const type = mapSetting.type;
  const tileFrequency = (mapSetting as any).tileFrequency || {};
  const customMapId = (mapSetting as any).customMapId as string | undefined;

  const tiles: GameMap['tiles'] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      type: TileType.Plain,
      ownerId: null,
      army: 0
    }))
  );

  let actualWidth = width;
  let actualHeight = height;

  if (customMapId) {
    const customData = await mapService.loadTiles(customMapId);
    if (customData) {
      actualWidth = Math.max(1, customData[0]?.length ?? width);
      actualHeight = Math.max(1, customData.length);
      tiles.length = 0;
      for (let y = 0; y < actualHeight; y++) {
        tiles[y] = [];
        for (let x = 0; x < actualWidth; x++) {
          tiles[y]![x] = { type: TileType.Plain, ownerId: null, army: 0 };
        }
      }
      for (let y = 0; y < Math.min(actualHeight, customData.length); y++) {
        for (let x = 0; x < Math.min(actualWidth, customData[y]!.length); x++) {
          const ct = customData[y]![x]!;
          tiles[y]![x]! = {
            type: (ct.type as TileType) || TileType.Plain,
            ownerId: null,
            army: ct.army ?? 0,
          };
        }
      }
      console.log(`[map-gen] Loaded custom map ${customMapId} (${actualWidth}x${actualHeight})`);
    } else {
      console.warn(`[map-gen] Custom map ${customMapId} not found, falling back to random`);
      generateRandomMap(tiles, width, height, tileFrequency);
      adjustBarracksArmies(tiles, width, height);
    }
  } else if (type === PreGameMapType.Random || type === PreGameMapType.Custom) {
    do {
      generateRandomMap(tiles, width, height, tileFrequency);
      adjustBarracksArmies(tiles, width, height);
    } while (!isAllLandConnected(tiles, width, height));
  }

  // 自定义地图：按编辑器中放置的王座位置分配给玩家
  if (customMapId) {
    const throneCoords: { x: number; y: number }[] = [];
    for (let y = 0; y < actualHeight; y++) {
      for (let x = 0; x < actualWidth; x++) {
        if (tiles[y]![x]!.type === TileType.Throne) {
          throneCoords.push({ x, y });
        }
      }
    }

    // 按位置排序：从上到下，从左到右，保证分配顺序稳定
    throneCoords.sort((a, b) => a.y - b.y || a.x - b.x);

    const remaining: typeof players = [];
    players.forEach((player, i) => {
      const coord = throneCoords[i];
      if (coord) {
        tiles[coord.y]![coord.x]! = {
          type: TileType.Throne,
          ownerId: player.id,
          army: 1,
        };
      } else {
        remaining.push(player);
      }
    });

    if (remaining.length > 0) {
      assignPlayerStartingPositions(tiles, actualWidth, actualHeight, remaining);
    }

    console.log(`[map-gen] Custom map ${customMapId}: ${throneCoords.length} pre-placed thrones, ${remaining.length} random fallback`);
  } else {
    assignPlayerStartingPositions(tiles, width, height, players);
  }

  return {
    width: actualWidth,
    height: actualHeight,
    tiles
  };
}

/**
 * 根据频率随机生成地块并随机设置兵营的初始兵力
 * @param tiles
 * @param width
 * @param height
 * @param tileFrequency
 */
function generateRandomMap(
  tiles: GameMap['tiles'],
  width: number,
  height: number,
  tileFrequency: Record<string, number> | undefined
): void {
  const defaultFrequency = {
    [TileType.Plain]: 0.6,
    [TileType.Mountain]: 0.15,
    [TileType.Swamp]: 0.1,
    [TileType.Barracks]: 0.15,
  };

  const frequency = { ...defaultFrequency, ...(tileFrequency || {}) };

  // 归一化（防止用户传入的频率总和不是 1）
  const totalFreq = Object.values(frequency).reduce((s, v) => s + (v as number), 0) || 1;
  const normalized: Record<string, number> = {};
  for (const k of Object.keys(frequency)) {
    normalized[k] = (frequency as any)[k] / totalFreq;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rand = Math.random();
      let cumulative = 0;
      for (const [tileType, freq] of Object.entries(normalized)) {
        cumulative += (freq as number);
        if (rand <= cumulative) {
          tiles[y]![x]!.type = tileType as TileType;
          if (tileType === TileType.Barracks) {
            // 初始每个兵营的随机值（后续会统一调整到 target）
            tiles[y]![x]!.army = Math.floor(Math.random() * 5) + 1; // 1 ~ 5
          } else {
            tiles[y]![x]!.army = 0;
          }
          break;
        }
      }
    }
  }
}

function adjustBarracksArmies(
  tiles: GameMap['tiles'],
  width: number,
  height: number
): void {
  const MIN = 20;
  const MAX = 40;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y]![x]!;

      if (tile.type === TileType.Barracks) {
        tile.army = MIN + Math.floor(Math.random() * (MAX - MIN + 1));
      }
    }
  }
}


/**
 * 检查所有非山地块是否连通（BFS）
 * @param tiles
 * @param width
 * @param height
 */
function isAllLandConnected(tiles: GameMap['tiles'], width: number, height: number): boolean {
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const queue: { x: number; y: number }[] = [];

  let found = false;
  for (let y = 0; y < height && !found; y++) {
    for (let x = 0; x < width && !found; x++) {
      if (tiles[y]![x]!.type !== TileType.Mountain) {
        queue.push({ x, y });
        visited[y]![x] = true;
        found = true;
      }
    }
  }
  if (!found) return true;

  const dirs = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
  ];

  while (queue.length) {
    const { x, y } = queue.shift()!;
    for (const { dx, dy } of dirs) {
      const nx = x + dx, ny = y + dy;
      if (
        nx >= 0 && nx < width &&
        ny >= 0 && ny < height &&
        !visited[ny]![nx] &&
        tiles[ny]![nx]!.type !== TileType.Mountain
      ) {
        visited[ny]![nx] = true;
        queue.push({ x: nx, y: ny });
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y]![x]!.type !== TileType.Mountain && !visited[y]![x]) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 为玩家分配出生点（王座 Throne）
 *  - <=2：保留角点，但在 margin 范围内随机偏移
 *  - <=4：四角每个角加随机偏移
 *  - >4：在平原/兵营集合中使用贪心最远点采样以最大化分散性
 * @param tiles
 * @param width
 * @param height
 * @param players
 */
function assignPlayerStartingPositions(
  tiles: GameMap['tiles'],
  width: number,
  height: number,
  players: PreGameRoomState['players']
): void {
  const positions = generateStartingPositions(width, height, players.length, tiles);
  players.forEach((player, index) => {
    const pos = positions[index];
    if (pos) {
      const { x, y } = pos;
      tiles[y]![x]! = {
        type: TileType.Throne,
        ownerId: player.id,
        army: 1
      };
      // 起始视野只给一个 throne + 1 兵，四邻不预占有，让玩家自己扩张
    }
  });
}

/**
 * 生成出生点位置集（更随机且分散）
 * @param width
 * @param height
 * @param playerCount
 * @param tiles
 */
function generateStartingPositions(
  width: number,
  height: number,
  playerCount: number,
  tiles: GameMap['tiles']
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const margin = 2;

  // 小人数保留"角点"分布但加入随机偏移，减少固定性
  if (playerCount <= 2) {
    const corners = [
      { x: margin, y: margin },
      { x: width - margin - 1, y: height - margin - 1 }
    ];
    for (const c of corners.slice(0, playerCount)) {
      positions.push(randomizeNear(c.x, c.y, width, height, margin, tiles));
    }
    return positions;
  } else if (playerCount <= 4) {
    const corners = [
      { x: margin, y: margin },
      { x: width - margin - 1, y: margin },
      { x: margin, y: height - margin - 1 },
      { x: width - margin - 1, y: height - margin - 1 }
    ];
    for (const c of corners.slice(0, playerCount)) {
      positions.push(randomizeNear(c.x, c.y, width, height, margin, tiles));
    }
    return positions;
  } else {
    // 多人：采样平原/兵营点，然后采用贪心 "farthest point sampling" 最大化最小距离
    const candidates: Array<{ x: number; y: number }> = getPlainAndBarracksTiles(width, height, tiles, margin);
    if (candidates.length === 0) return positions;

    // 如果候选点过多，随机挑选一部分作为候选池提升性能
    const MAX_POOL = 400;
    let pool = candidates;
    if (candidates.length > MAX_POOL) {
      pool = [];
      const idxs = new Set<number>();
      while (idxs.size < MAX_POOL) {
        idxs.add(Math.floor(Math.random() * candidates.length));
      }
      for (const i of idxs) pool.push(candidates[i]!);
    }

    // 贪心初始化：随机 pick 一个
    const first = pool[Math.floor(Math.random() * pool.length)];
    const picked: Array<{ x: number; y: number }> = [first!];

    while (picked.length < playerCount && picked.length < pool.length) {
      // 从 pool 中选择使得到已选集合的最小距离最大化的点
      let best: { x: number; y: number } | null = null;
      let bestDist = -1;
      for (const c of pool) {
        // 跳过已选
        if (picked.some(p => p.x === c.x && p.y === c.y)) continue;
        // 计算到已选点的最小距离
        let minDist = Infinity;
        for (const p of picked) {
          const d = Math.hypot(p.x - c.x, p.y - c.y);
          if (d < minDist) minDist = d;
        }
        if (minDist > bestDist) {
          bestDist = minDist;
          best = c;
        }
      }
      if (!best) break;
      picked.push(best);
    }

    // 如果还不够（极端），补齐 pool 前几个
    for (let i = 0; picked.length < playerCount && i < pool.length; i++) {
      const c = pool[i]!;
      if (!picked.some(p => p.x === c.x && p.y === c.y)) picked.push(c);
    }

    positions.push(...picked.slice(0, playerCount));
    return positions.slice(0, playerCount);
  }
}

/** 在给定中心附近随机偏移，确保不是山地并且在边界内 */
function randomizeNear(
  cx: number,
  cy: number,
  width: number,
  height: number,
  margin: number,
  tiles: GameMap['tiles']
): { x: number; y: number } {
  const tries = 50;
  for (let t = 0; t < tries; t++) {
    const rx = cx + Math.floor((Math.random() * (margin * 2 + 1)) - margin);
    const ry = cy + Math.floor((Math.random() * (margin * 2 + 1)) - margin);
    if (rx >= margin && rx < width - margin && ry >= margin && ry < height - margin) {
      const tile = tiles[ry]![rx]!;
      if (tile.type !== TileType.Mountain) return { x: rx, y: ry };
    }
  }
  // 退化：扫描附近第一个非山格
  for (let dy = -margin; dy <= margin; dy++) {
    for (let dx = -margin; dx <= margin; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (tiles[ny]![nx]!.type !== TileType.Mountain) return { x: nx, y: ny };
      }
    }
  }
  // 最后兜底返回中心
  return { x: Math.max(margin, Math.min(cx, width - margin - 1)), y: Math.max(margin, Math.min(cy, height - margin - 1)) };
}

/** 收集平原和兵营作为出生点候选 */
function getPlainAndBarracksTiles(width: number, height: number, tiles: GameMap['tiles'], margin = 2): Array<{ x: number; y: number }> {
  const list: Array<{ x: number; y: number }> = [];
  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      const t = tiles[y]![x]!;
      if (t && (t.type === TileType.Plain || t.type === TileType.Barracks)) {
        list.push({ x, y });
      }
    }
  }
  return list;
}

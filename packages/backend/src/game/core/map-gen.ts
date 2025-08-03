import { GameMap, TileType, PreGameMapType, PreGameRoomState } from '@generale/types';

/**
 * 生成游戏地图
 * @param mapSetting 地图设置
 * @param players 玩家列表
 * @returns 生成的游戏地图
 */
export function generateMap(mapSetting: PreGameRoomState['mapSetting'], players: PreGameRoomState['players']): GameMap {
  const width = (mapSetting as any).width || 20;
  const height = (mapSetting as any).height || 20;
  const type = mapSetting.type;
  const tileFrequency = (mapSetting as any).tileFrequency || {};

  const tiles: GameMap['tiles'] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      type: TileType.Plain,
      ownerId: null,
      army: 0
    }))
  );

  if (type === PreGameMapType.Random || type === PreGameMapType.Custom) {
    do {
      generateRandomMap(tiles, width, height, tileFrequency);
    } while (!isAllLandConnected(tiles, width, height));
  }

  assignPlayerStartingPositions(tiles, width, height, players);

  return {
    width,
    height,
    tiles
  };
}

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

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rand = Math.random();
      let cumulative = 0;
      for (const [tileType, freq] of Object.entries(frequency)) {
        cumulative += (freq as number);
        if (rand <= cumulative) {
          tiles[y]![x]!.type = tileType as TileType;
          if (tileType === TileType.Barracks) {
            tiles[y]![x]!.army = Math.floor(Math.random() * 5) + 3;
          }
          break;
        }
      }
    }
  }
}

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
      const surrounding = [
        { x: x - 1, y }, { x: x + 1, y },
        { x, y: y - 1 }, { x, y: y + 1 }
      ];
      surrounding.forEach(({ x: sx, y: sy }) => {
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const tile = tiles[sy]![sx]!;
          if (tile.type === TileType.Plain || tile.type === TileType.Barracks) {
            tile.ownerId = player.id;
            tile.army = Math.floor(Math.random() * 3) + 1;
          }
        }
      });
    }
  });
}

function generateStartingPositions(width: number, height: number, playerCount: number, tiles: GameMap['tiles']): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  const margin = 2;
  if (playerCount <= 2) {
    positions.push(
      { x: margin, y: margin },
      { x: width - margin - 1, y: height - margin - 1 }
    );
  } else if (playerCount <= 4) {
    positions.push(
      { x: margin, y: margin },
      { x: width - margin - 1, y: margin },
      { x: margin, y: height - margin - 1 },
      { x: width - margin - 1, y: height - margin - 1 }
    );
  } else {
    const plainTiles: Array<{ x: number; y: number }> = [];
    for (let y = margin; y < height - margin; y++) {
      for (let x = margin; x < width - margin; x++) {
        if (tiles[y]?.[x] && tiles[y]![x]!.type === TileType.Plain) {
          plainTiles.push({ x, y });
        }
      }
    }
    for (let i = plainTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [plainTiles[i]!, plainTiles[j]!] = [plainTiles[j]!, plainTiles[i]!];
    }
    positions.push(...plainTiles.slice(0, playerCount));
  }
  return positions.slice(0, playerCount);
}

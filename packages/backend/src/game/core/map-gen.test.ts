import { describe, expect, it } from 'bun:test';
import { generateMap } from './map-gen';
import { PreGameMapType, TileType } from '@generale/types';

describe('Map Generator', () => {
  it('should generate a valid map for 2 players', () => {
    const players = [
      { id: 'player1', name: 'Player 1', teamId: 'team1', isHost: true, isReady: true },
      { id: 'player2', name: 'Player 2', teamId: 'team2', isHost: false, isReady: true }
    ];
    const mapSetting = {
      type: PreGameMapType.Random,
      width: 10,
      height: 10,
      tileFrequency: {
        [TileType.Plain]: 0.5,
        [TileType.Mountain]: 0.2,
        [TileType.Swamp]: 0.1,
        [TileType.Barracks]: 0.2,
      }
    };
    const map = generateMap(mapSetting, players);
    expect(map.width).toBe(10);
    expect(map.height).toBe(10);
    // 检查王座数量
    let throneCount = 0;
    let playerTiles = 0;
    const tileStats: Record<string, number> = {};
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        tileStats[tile.type] = (tileStats[tile.type] || 0) + 1;
        if (tile.type === TileType.Throne) throneCount++;
        if (tile.ownerId) playerTiles++;
      }
    }
    expect(throneCount).toBe(players.length);
    expect(playerTiles).toBeGreaterThanOrEqual(players.length);
    // 地图尺寸
    expect(map.width).toBe(mapSetting.width);
    expect(map.height).toBe(mapSetting.height);
  });

  it('should generate a valid map for 4 players with correct distribution', () => {
    const players = [
      { id: 'player1', name: 'Player 1', teamId: 'team1', isHost: true, isReady: true },
      { id: 'player2', name: 'Player 2', teamId: 'team2', isHost: false, isReady: true },
      { id: 'player3', name: 'Player 3', teamId: 'team3', isHost: false, isReady: true },
      { id: 'player4', name: 'Player 4', teamId: 'team4', isHost: false, isReady: true }
    ];
    const mapSetting = {
      type: PreGameMapType.Random,
      width: 12,
      height: 12,
      tileFrequency: {
        [TileType.Plain]: 0.5,
        [TileType.Mountain]: 0.2,
        [TileType.Swamp]: 0.1,
        [TileType.Barracks]: 0.2,
      }
    };
    const map = generateMap(mapSetting, players);
    expect(map.width).toBe(12);
    expect(map.height).toBe(12);
    // 检查王座数量
    let throneCount = 0;
    let playerTiles = 0;
    const playerStats: Record<string, number> = {};
    const tileStats: Record<string, number> = {};
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        tileStats[tile.type] = (tileStats[tile.type] || 0) + 1;
        if (tile.type === TileType.Throne) throneCount++;
        if (tile.ownerId) {
          playerTiles++;
          playerStats[tile.ownerId] = (playerStats[tile.ownerId] || 0) + 1;
        }
      }
    }
    expect(throneCount).toBe(players.length);
    expect(playerTiles).toBeGreaterThanOrEqual(players.length);
    // 每个玩家至少有一块地
    expect(Object.keys(playerStats).length).toBe(players.length);
    // 地图尺寸
    expect(map.width).toBe(mapSetting.width);
    expect(map.height).toBe(mapSetting.height);

    // 可选：输出地图统计信息
    // console.log('Tile distribution:', tileStats);
    // console.log('Player territories:', playerStats);
  });

  it('visualize a 4-player map (console debug)', () => {
    // 可选：仅用于调试
    const players = [
      { id: 'player1', name: 'Player 1', teamId: 'team1', isHost: true, isReady: true },
      { id: 'player2', name: 'Player 2', teamId: 'team2', isHost: false, isReady: true },
      { id: 'player3', name: 'Player 3', teamId: 'team3', isHost: false, isReady: true },
      { id: 'player4', name: 'Player 4', teamId: 'team4', isHost: false, isReady: true }
    ];
    const mapSetting = {
      type: PreGameMapType.Random,
      width: 12,
      height: 12,
      tileFrequency: {
        [TileType.Plain]: 0.5,
        [TileType.Mountain]: 0.2,
        [TileType.Swamp]: 0.1,
        [TileType.Barracks]: 0.2,
      }
    };
    const map = generateMap(mapSetting, players);
    const tileSymbols: Record<string, string> = {
      [TileType.Plain]: '.',
      [TileType.Mountain]: '^',
      [TileType.Swamp]: '~',
      [TileType.Barracks]: '#',
      [TileType.Throne]: 'T',
      [TileType.Fog]: '?'
    };
    const playerColors: Record<string, string> = {
      'player1': '1',
      'player2': '2',
      'player3': '3',
      'player4': '4',
    };
    // 打印列号
    let header = '   ';
    for (let x = 0; x < map.width; x++) {
      header += (x % 10).toString();
    }
    // eslint-disable-next-line no-console
    console.log(header);
    for (let y = 0; y < map.height; y++) {
      let row = y.toString().padStart(2) + ' ';
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        let symbol = tileSymbols[tile.type] || '?';
        if (tile.ownerId) {
          symbol = playerColors[tile.ownerId] || 'X';
        }
        row += symbol;
      }
      // eslint-disable-next-line no-console
      console.log(row);
    }
    // 统计信息
    const tileStats: Record<string, number> = {};
    const playerStats: Record<string, number> = {};
    let totalPlayerTiles = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y][x];
        tileStats[tile.type] = (tileStats[tile.type] || 0) + 1;
        if (tile.ownerId) {
          playerStats[tile.ownerId] = (playerStats[tile.ownerId] || 0) + 1;
          totalPlayerTiles++;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('Tile distribution:', tileStats);
    // eslint-disable-next-line no-console
    console.log('Player territories:', playerStats);
    // eslint-disable-next-line no-console
    console.log(`Total owned tiles: ${totalPlayerTiles}/${map.width * map.height}`);
  });
});


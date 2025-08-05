// 游戏房间阶段（PreGameInstance）核心类型定义，最大程度复用 core-type
import type { PlayerId, TeamId, GameId, TileType } from '../core-type';
import { PlayerColor } from './player-colors';

// 地图类型
export enum PreGameMapType {
  Random = 'random',
  Custom = 'custom',
  Imported = 'imported',
}

// 随机地图参数（地形频率用 TileType）
export interface PreGameRandomMapSetting {
  type: PreGameMapType.Random;
  width: number;
  height: number;
  tileFrequency: Partial<Record<TileType, number>>; // 只允许 core-type 里的地形
}

// 自定义地图参数
export interface PreGameCustomMapSetting {
  type: PreGameMapType.Custom;
  width: number;
  height: number;
  tileFrequency: Partial<Record<TileType, number>>;
  customData?: any; // 可进一步细化
}

// 导入地图参数
export interface PreGameImportedMapSetting {
  type: PreGameMapType.Imported;
  mapName: string; // 数据库中已存在的地图名
}

export type PreGameMapSetting =
  | PreGameRandomMapSetting
  | PreGameCustomMapSetting
  | PreGameImportedMapSetting;

// 游戏通用设置（如后续与 GameSettings 兼容可再调整）
export interface PreGameGameSetting {
  /** 游戏倍速 0.5-3，仅用于 tick 调度，不参与 GameSettings */
  speed: number;
  /** 地块增长规则，格式与 GameSettings.tileGrow 一致 */
  tileGrow: Record<TileType, {
    duration: number;
    growth: number;
  }>;
  /** 挂机多少 tick 视为失败，格式与 GameSettings.afkThreshold 一致 */
  afkThreshold: number;
}

// 玩家准备状态
export enum PreGamePlayerReadyState {
  NotReady = 0,
  Ready = 1,
}

// 玩家房间信息（只保留房间阶段必需字段）
export interface PreGamePlayerInfo {
  id: PlayerId;
  name: string;
  teamId: TeamId;
  isHost: boolean;
  ready: PreGamePlayerReadyState;
  /** 玩家自选颜色，16进制数，前端可选填 */
  tileColor: PlayerColor;
}

// 房间整体状态
export interface PreGameRoomState {
  gameId: GameId;
  hostId: PlayerId;
  players: PreGamePlayerInfo[];
  mapSetting: PreGameMapSetting;
  gameSetting: PreGameGameSetting;
  teamCount: number;
  playerLimit: number;
  started: boolean;
}

export { PlayerColor } from './player-colors';
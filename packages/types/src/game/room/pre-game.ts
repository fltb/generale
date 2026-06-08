// 游戏房间阶段（PreGameInstance）核心类型定义，最大程度复用 core-type
import type { PlayerId, TeamId, GameId, TileType } from '../core-type';
import { PlayerColor } from './player-colors';

export interface TeamInfo {
  id: TeamId;
  name?: string;
}

// 地图类型
export enum PreGameMapType {
  Random = 'random',
  Custom = 'custom',
  Imported = 'imported',
}

// standard 房间的预设尺寸 label，标记当前选中的预设；custom 房间为 null/undefined
export type PreGameStandardSizeLabel = "small" | "medium" | "large";

// standard 房间预设尺寸表：sizeLabel 与 width/height 一一对应，前后端共享
export const PRESET_SIZES: Record<PreGameStandardSizeLabel, { width: number; height: number }> = {
  small: { width: 10, height: 10 },
  medium: { width: 20, height: 20 },
  large: { width: 40, height: 40 },
};

// 随机地图参数（地形频率用 TileType）
export interface PreGameRandomMapSetting {
  type: PreGameMapType.Random;
  width: number;
  height: number;
  tileFrequency: Partial<Record<TileType, number>>; // 只允许 core-type 里的地形
  /**
   * standard 房间的预设尺寸标签（small/medium/large）。standard 模式下作为权威字段，
   * width/height 由后端按预设表回填；custom 房间不应出现此字段。
   */
  sizeLabel?: PreGameStandardSizeLabel;
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

/**
 * 房间阶段视角下的玩家状态
 * - Lobby:        默认；在房间里，可以换队伍/准备/被踢
 * - Playing:      游戏开始时被锁入游戏；不能换队伍/准备/被踢；离开只算断线
 * - Disconnected: 曾是 Playing 但 connector 断开；座位保留到游戏结束
 * - Spectating:   Lobby 的受限变体；在 INGAME 期间打开 game 域观战；游戏结束/退出回 Lobby
 */
export enum PreGamePlayerStatus {
  Lobby = 'lobby',
  Playing = 'playing',
  Disconnected = 'disconnected',
  Spectating = 'spectating',
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
  /** 房间阶段视角下的玩家状态，缺省视为 Lobby */
  status: PreGamePlayerStatus;
}

// 房间类型（与 GameServiceConfig.type 一致，固定在创建时，房间内不可变）
export type PreGameRoomType = "standard" | "custom";

// 房间整体状态
export interface PreGameRoomState {
  gameId: GameId;
  /** 房间类型：standard 仅允许预设地图尺寸，custom 允许任意尺寸 */
  roomType: PreGameRoomType;
  hostId: PlayerId;
  players: PreGamePlayerInfo[];
  mapSetting: PreGameMapSetting;
  gameSetting: PreGameGameSetting;
  teams: TeamInfo[];
  teamCount: number; // synced as teams.length
  playerLimit: number;
  started: boolean;
}

export { PlayerColor } from './player-colors';

/**
 * 游戏阶段枚举
 */
export enum GamePhase {
  PREGAME = 'pregame',    // 房间准备阶段
  INGAME = 'ingame',      // 游戏进行阶段
  ENDED = 'ended',        // 游戏结束阶段
  DISBANDED = 'disbanded' // 房间解散
}
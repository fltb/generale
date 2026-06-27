/**
 * 坐标
 */
export type Coordinates = {
  x: number;
  y: number;
};

/**
 * 地块的类型
 */
export enum TileType {
  Plain = "PLAIN", // 普通地块
  Throne = "THRONE", // 王座
  Barracks = "BARRACKS", // 兵营
  Mountain = "MOUNTAIN", // 山地 (无法通行)
  Swamp = "SWAMP", // 沼泽 (吞噬兵力)
  Fog = "FOG", // 战争迷雾
}

/**
 * 玩家的状态
 */
export enum PlayerStatus {
  Playing = "PLAYING", // 游戏中
  Defeated = "DEFEATED", // 已战败
  Won = "WON", // 已胜利
}

export type PlayerId = string;
export type GameId = string;

export enum PlayerOperationType {
  Move = "MOVE",
}

/**
 * 单个地块的完整状态
 */
export interface Tile {
  type: TileType;
  ownerId: PlayerId | null; // null 表示中立
  army: number;
  /**
   * 用于内部逻辑的计时器，例如普通地块的产兵计时
   * @internal
   */
  _internalCounter?: number;
}

export type TeamId = `team${number}`;

/** 队伍核心信息 */
export interface TeamCore {
  readonly id: TeamId;
  memberIds: PlayerId[]; // 队员列表
  status: PlayerStatus; // 队伍状态（比如全部队员都败北时可判负）
  // 可以再加：胜利条件、分数、等等
}

/**
 * 玩家的全局状态
 */
export interface PlayerCore {
  readonly id: PlayerId; // 玩家ID永不改变
  status: PlayerStatus;
  army: number; // 总兵力
  land: number; // 总地块
  /** 上一次有操作的 tick，用于挂机判定 */
  lastActiveTick: number;
  readonly teamId: TeamId; // 玩家所属队伍
}

export interface GameMap {
  readonly width: number;
  readonly height: number;
  readonly tiles: Tile[][];
}

export interface GameSettings {
  readonly tileGrow: Record<
    TileType,
    {
      readonly duration: number;
      readonly growth: number;
    }
  >;
  /** 挂机多少 tick 视为失败 */
  readonly afkThreshold: number;
}

/**
 * 代表整个游戏世界在某一时刻的快照。
 * 这是游戏的“单一真实来源 (Single Source of Truth)”。
 */
export enum GameStatus {
  Playing = "PLAYING",
  Ended = "ENDED",
}

export interface GameState {
  status: GameStatus;
  tick: number;
  readonly settings: GameSettings;
  readonly players: Record<PlayerId, PlayerCore>;
  readonly teams: Record<TeamId, TeamCore>;
  readonly map: GameMap;
}

/**
 * 给某一个玩家的，带有战争迷雾，隐藏了其他玩家信息的快照
 */
export type MaskedGameState = GameState;

// --- 玩家操作相关类型 ---
export interface BaseOperation<T> {
  type: PlayerOperationType;
  payload: T;
}

export interface MoveOperationPayload {
  from: Coordinates;
  to: Coordinates;
  /**
   * 移动兵力的百分比 (0-100)。
   */
  percentage: number;
}
/**
 * 移动操作的具体载荷
 */
export type MoveOperation = BaseOperation<MoveOperationPayload>;

export type PlayerOperation = MoveOperation;

// 未来可以扩展:
// | { type: 'BUILD'; payload: BuildActionPayload }
// | { type: 'UPGRADE'; payload: UpgradeActionPayload };

/**
 * 每个玩家的操作队列。
 * key 是玩家ID (Player['id'])。
 * value 是该玩家在本 tick 提交的操作序列。
 */
export type PlayerActionQueues = Record<PlayerId, PlayerOperation[]>;

import { GameId } from '@generale/types';
import { GameService, GameServiceConfig } from './GameService';

/**
 * GameService 管理器
 * 负责管理所有活跃的游戏实例
 */
export class GameServiceManager {
  private static instance: GameServiceManager;
  private gameServices = new Map<GameId, GameService>();

  private constructor() {}

  public static getInstance(): GameServiceManager {
    if (!GameServiceManager.instance) {
      GameServiceManager.instance = new GameServiceManager();
    }
    return GameServiceManager.instance;
  }

  /**
   * 创建新的游戏服务
   */
  public createGame(config: GameServiceConfig): GameService {
    if (this.gameServices.has(config.gameId)) {
      throw new Error(`Game ${config.gameId} already exists`);
    }

    const gameService = new GameService(config);
    this.gameServices.set(config.gameId, gameService);

    // 设置游戏结束和解散回调，自动清理
    gameService.onGameEnd(() => this.removeGame(config.gameId));
    gameService.onDisband(() => this.removeGame(config.gameId));

    console.log(`[GameServiceManager] Created game: ${config.gameId}`);
    return gameService;
  }

  /**
   * 获取游戏服务
   */
  public getGame(gameId: GameId): GameService | undefined {
    return this.gameServices.get(gameId);
  }

  /**
   * 移除游戏服务
   */
  public removeGame(gameId: GameId): boolean {
    const gameService = this.gameServices.get(gameId);
    if (!gameService) return false;

    // 确保游戏被正确解散
    gameService.disbandGame();
    this.gameServices.delete(gameId);

    console.log(`[GameServiceManager] Removed game: ${gameId}`);
    return true;
  }

  /**
   * 获取所有活跃游戏
   */
  public getActiveGames(): GameId[] {
    return Array.from(this.gameServices.keys());
  }

  /**
   * 获取游戏数量
   */
  public getGameCount(): number {
    return this.gameServices.size;
  }

  /**
   * 清理所有游戏
   */
  public cleanup(): void {
    for (const [_gameId, gameService] of this.gameServices) {
      gameService.disbandGame();
    }
    this.gameServices.clear();
    console.log(`[GameServiceManager] All games cleaned up`);
  }
}

// 导出单例实例
export const gameServiceManager = GameServiceManager.getInstance();

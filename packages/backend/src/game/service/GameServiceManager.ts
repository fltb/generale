import { GameId } from '@generale/types';
import { GameService, GameServiceConfig } from './GameService';
import { registerDomainHandler } from '../../plugins/websocket';

/**
 * GameService 管理器
 * 负责管理所有活跃的游戏实例
 */
export class GameServiceManager {
  private static instance: GameServiceManager;
  private gameServices = new Map<GameId, GameService>();
  private roomCreatedCallbacks: Array<(gameId: GameId) => void> = [];
  private roomDeletedCallbacks: Array<(gameId: GameId) => void> = [];
  private roomUpdatedCallbacks: Array<(gameId: GameId) => void> = [];

  private constructor() {
    // register lobby domain handler so clients can subscribe to room events
    registerDomainHandler('lobby-games', (connector) => {
      // on open: send current list
      connector.onOpen(() => {
        const games = Array.from(this.gameServices.keys()).map(id => this.getGame(id)?.getGameInfo()).filter(Boolean);
        connector.send({ type: 'room-list', payload: games });
      });

      // subscribe to manager events and forward to this connector
      const unsubCreated = this.onRoomCreated((id) => {
        const info = this.getGame(id)?.getGameInfo() ?? { gameId: id };
        connector.send({ type: 'room-created', payload: info });
      });
      const unsubDeleted = this.onRoomDeleted((id) => {
        connector.send({ type: 'room-deleted', payload: { gameId: id } });
      });
      const unsubUpdated = this.onRoomUpdated((id) => {
        const info = this.getGame(id)?.getGameInfo();
        connector.send({ type: 'room-updated', payload: info ?? { gameId: id } });
      });

      // clean up on close
      connector.onClose(() => {
        unsubCreated(); unsubDeleted(); unsubUpdated();
      });
      connector.onDisconnect(() => {
        // keep subscriptions? usually best to unsubscribe to prevent memory leak
        unsubCreated(); unsubDeleted(); unsubUpdated();
      });
    });
  }
  // subscribe helpers return unsubscribe function
  public onRoomCreated(cb: (gameId: GameId) => void): () => void {
    this.roomCreatedCallbacks.push(cb);
    return () => { const i = this.roomCreatedCallbacks.indexOf(cb); if (i >= 0) this.roomCreatedCallbacks.splice(i, 1); };
  }
  public onRoomDeleted(cb: (gameId: GameId) => void): () => void {
    this.roomDeletedCallbacks.push(cb);
    return () => { const i = this.roomDeletedCallbacks.indexOf(cb); if (i >= 0) this.roomDeletedCallbacks.splice(i, 1); };
  }
  public onRoomUpdated(cb: (gameId: GameId) => void): () => void {
    this.roomUpdatedCallbacks.push(cb);
    return () => { const i = this.roomUpdatedCallbacks.indexOf(cb); if (i >= 0) this.roomUpdatedCallbacks.splice(i, 1); };
  }

  private emitRoomCreated(gameId: GameId) {
    for (const cb of this.roomCreatedCallbacks) { try { cb(gameId); } catch (err) { console.error('[GSM] emitRoomCreated error', err); } }
  }
  private emitRoomDeleted(gameId: GameId) {
    for (const cb of this.roomDeletedCallbacks) { try { cb(gameId); } catch (err) { console.error('[GSM] emitRoomDeleted error', err); } }
  }
  private emitRoomUpdated(gameId: GameId) {
    for (const cb of this.roomUpdatedCallbacks) { try { cb(gameId); } catch (err) { console.error('[GSM] emitRoomUpdated error', err); } }
  }

  /** External / internal caller can call this to mark a room updated (e.g. GameService) */
  public notifyRoomUpdated(gameId: GameId) {
    // quick guard: only emit if present
    if (!this.gameServices.has(gameId)) return;
    this.emitRoomUpdated(gameId);
  }
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
    // let the game service forward updates to the manager:
    gameService.setRoomUpdateEmitter((id) => this.notifyRoomUpdated(id));

    this.gameServices.set(config.gameId, gameService);

    // existing cleanup callbacks...
    gameService.onGameEnd(() => this.removeGame(config.gameId));
    gameService.onDisband(() => this.removeGame(config.gameId));

    // --- new: emit created event ---
    this.emitRoomCreated(config.gameId);

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

    // ensure game disbanded
    gameService.disbandGame();
    this.gameServices.delete(gameId);

    // --- new: emit deleted event ---
    this.emitRoomDeleted(gameId);

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

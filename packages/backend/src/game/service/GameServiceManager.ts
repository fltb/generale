import { type GameId, LobbyClientEvent, LobbyMessage, LobbyServerMessageType } from '@generale/types';
import { GameService, GameServiceConfig } from './GameService';
import { registerDomainHandler, WSContextBase } from '../../plugins/websocket';
import { GameInfoRoute, GameInfoSuccessResp, ListGamesQuery } from '@generale/types';
import { applyGameFilters, applyGameSort, paginateGames } from '../../routes/utils/gameListFilter';

let GLOBAL_LOBBY_SEQ = 0;
function nextSeq(): number {
  GLOBAL_LOBBY_SEQ += 1;
  return GLOBAL_LOBBY_SEQ;
}

/**
 * helper: whether a single game matches a ListGamesQuery.
 * We can reuse applyGameFilters by feeding single-item array.
 */
function matchesFilters(game: GameInfoSuccessResp["data"], query?: Partial<ListGamesQuery> | null) {
  if (!query || Object.keys(query).length === 0) return true;
  // applyGameFilters expects ListGamesQuery (strings), but calling with partial is OK for matching behavior:
  try {
    const res = applyGameFilters([game], query as ListGamesQuery);
    return res.length > 0;
  } catch (e) {
    // if filters invalid, default to false
    return false;
  }
}


/**
 * helper: build paged snapshot for a given client filters/pagination context
 * ctxFilters: may be Partial<ListGamesQuery> or full ListGamesQuery (strings). If no offset/limit provided, return full filtered array.
 */
function buildSnapshotForClient(allGames: GameInfoSuccessResp["data"][], ctxFilters?: Partial<ListGamesQuery> | null) {
  const q: Partial<ListGamesQuery> = ctxFilters ?? {};
  // apply filters
  const filtered = applyGameFilters(allGames, q as ListGamesQuery);
  // apply sort if present
  const sorted = applyGameSort(filtered, q as ListGamesQuery);
  // if offset/limit provided, paginate
  if (q.offset !== undefined || q.limit !== undefined) {
    const page = paginateGames(sorted, q as ListGamesQuery);
    return { items: page.items, meta: { total: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore } };
  }
  return { items: sorted, meta: { total: sorted.length, offset: 0, limit: sorted.length, hasMore: false } };
}


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
    // --- register domain handler inside GameServiceManager constructor ---
    registerDomainHandler<LobbyClientEvent, LobbyMessage, {filters?: ListGamesQuery} & WSContextBase>('lobby-games', (connector) => {
      // read initial context from connector
      // connector.getContext() returns server-filled context merged with client open payload
      const ctx = (() => {
        try { return connector.getContext(); } catch { return connector.context ?? {}; }
      })();

      // store per-connector filters state so we can update it on set-filters events
      let clientFilters: ListGamesQuery | null = ctx.filters ?? null;

      // convenience to get all current GameInfoRoute[] (summary/detailed as stored by GameService)
      const getAllGames = (): GameInfoSuccessResp["data"][] => {
        // this refers to GameServiceManager instance scope; if inside class ensure closure captures 'this'
        const games: GameInfoSuccessResp["data"][] = (Array.from(this.gameServices.values()))
          .map((g) => g.getGameInfo())
          .filter(Boolean);
        return games;
      };

      // on open: send initial snapshot according to client's filters/pagination
      connector.onOpen(() => {
        try {
          const all = getAllGames();
          const snapshot = buildSnapshotForClient(all, clientFilters);
          const msg: LobbyMessage = {
            type: LobbyServerMessageType.LIST,
            payload: snapshot.items as GameInfoRoute[],
            meta: { ts: Date.now(), seq: nextSeq() }
          };
          connector.send(msg);
        } catch (err) {
          console.error("[lobby-games] onOpen error", err);
        }
      });

      // handle messages from client (set-filters, request-list, sync-from-seq, ping, close)
      connector.onClientMessage((evt: LobbyClientEvent) => {
        try {
          switch (evt.type) {
            case "request-list": {
              // allow client to request arbitrary filtered/paged snapshot (ad-hoc)
              const reqFilters = evt.payload.filters ?? null;
              const offset = evt.payload?.offset;
              const limit = evt.payload?.limit;
              const ctxForReq = { ...(reqFilters ?? {}) };
              if (offset !== undefined) ctxForReq.offset = String(offset);
              if (limit !== undefined) ctxForReq.limit = String(limit);

              const all = getAllGames();
              const snapshot = buildSnapshotForClient(all, ctxForReq);
              const msg: LobbyMessage = {
                type: LobbyServerMessageType.LIST,
                payload: snapshot.items,
                meta: { ts: Date.now(), seq: nextSeq() }
              };
              connector.send(msg);
              break;
            }

            case "set-filters": {
              clientFilters = evt.payload.filters ?? null;
              // immediately send new snapshot for new filters:
              const all = getAllGames();
              const snapshot = buildSnapshotForClient(all, clientFilters);
              connector.send({
                type: LobbyServerMessageType.LIST,
                payload: snapshot.items,
                meta: { ts: Date.now(), seq: nextSeq() }
              });
              break;
            }

            case "sync-from-seq": {
              // For now, we just send a fresh snapshot.
              const all = getAllGames();
              const snapshot = buildSnapshotForClient(all, clientFilters);
              connector.send({
                type: LobbyServerMessageType.LIST,
                payload: snapshot.items,
                meta: { ts: Date.now(), seq: nextSeq() }
              });
              break;
            }

            case "ping": {
              // respond with pong
              connector.send({ type: LobbyServerMessageType.LIST, payload: [], meta: { ts: Date.now(), seq: nextSeq() } });
              // note: you might prefer a separate control channel; kept minimal here
              break;
            }

            case "close": {
              // client asked to close the sub-connector
              connector.close(1000, evt.payload?.reason ?? "client close");
              break;
            }

            default:
              // unknown client event
              console.warn("[lobby-games] unknown client event", evt);
          }
        } catch (err) {
          console.error("[lobby-games] onClientMessage handler error", err);
        }
      });

      // when manager emits created/updated/deleted, forward to connector only if match filters
      const unsubCreated = this.onRoomCreated((id: string) => {
        try {
          const info = this.getGame(id)?.getGameInfo();
          if (!info) return;
          if (!clientFilters || matchesFilters(info, clientFilters)) {
            connector.send({
              type: LobbyServerMessageType.CREATED,
              payload: info,
              meta: { ts: Date.now(), seq: nextSeq(), id }
            });
          }
        } catch (err) {
          console.error("[lobby-games] send created error", err);
        }
      });

      const unsubUpdated = this.onRoomUpdated((id: string) => {
        try {
          const info = this.getGame(id)?.getGameInfo();
          if (!info) return;
          if (!clientFilters || matchesFilters(info, clientFilters)) {
            connector.send({
              type: LobbyServerMessageType.UPDATED,
              payload: info,
              meta: { ts: Date.now(), seq: nextSeq(), id }
            });
          }
        } catch (err) {
          console.error("[lobby-games] send updated error", err);
        }
      });

      const unsubDeleted = this.onRoomDeleted((id: string) => {
        try {
          // For deletions, we forward regardless; clientFilters may be used to ignore if desired
          connector.send({
            type: LobbyServerMessageType.DELETED,
            payload: { gameId: id },
            meta: { ts: Date.now(), seq: nextSeq(), id }
          });
        } catch (err) {
          console.error("[lobby-games] send deleted error", err);
        }
      });

      // clean up subscriptions on close/disconnect
      connector.onClose(() => {
        try { unsubCreated(); unsubDeleted(); unsubUpdated(); } catch { }
      });
      connector.onDisconnect(() => {
        try { unsubCreated(); unsubDeleted(); unsubUpdated(); } catch { }
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
    gameService.forceDispose();
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
      gameService.forceDispose();
    }
    this.gameServices.clear();
    console.log(`[GameServiceManager] All games cleaned up`);
  }
}

// 导出单例实例
export const gameServiceManager = GameServiceManager.getInstance();

import type { BombermanConfig, PlayerId, GameId } from "@generale/types";
import { BombermanGame, type BombermanGameEndResult } from "../instance/BombermanGame";
import { registerDomainHandler, unregisterDomainHandler } from "../../../plugins/websocket";

export class BombermanService {
  public gameId: GameId;
  private gameInstance: BombermanGame | null = null;
  private playerIds: PlayerId[] = [];
  private destroyed = false;

  constructor(gameId: GameId) {
    this.gameId = gameId;
    registerDomainHandler(`room-${gameId}`, () => {});
    registerDomainHandler(`game-${gameId}`, () => {});
    registerDomainHandler(`chat-${gameId}`, () => {});
  }

  startGame(config: BombermanConfig): void {
    this.gameInstance = new BombermanGame(config, this.playerIds);
    this.gameInstance.onEnd((result) => this.handleGameEnd(result));
    this.gameInstance.startTicking();
  }

  private handleGameEnd(result: BombermanGameEndResult): void {
    console.log(`Bomberman game ${this.gameId} ended: winner=${result.winnerId}, reason=${result.reason}`);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    unregisterDomainHandler(`room-${this.gameId}`);
    unregisterDomainHandler(`game-${this.gameId}`);
    unregisterDomainHandler(`chat-${this.gameId}`);
    this.gameInstance?.destroy();
  }
}

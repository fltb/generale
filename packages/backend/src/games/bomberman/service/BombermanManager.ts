import { BombermanService } from "./BombermanService";
import { registerDomainHandler } from "../../../plugins/websocket";

export class BombermanManager {
  private services = new Map<string, BombermanService>();

  constructor() {
    registerDomainHandler("lobby-bomberman", () => {});
  }

  createGame(_roomName: string): BombermanService {
    const id = `bomb_${Date.now()}`;
    const service = new BombermanService(id);
    this.services.set(id, service);
    return service;
  }

  getGame(id: string): BombermanService | undefined {
    return this.services.get(id);
  }

  removeGame(id: string): void {
    const service = this.services.get(id);
    if (service) {
      service.destroy();
      this.services.delete(id);
    }
  }
}

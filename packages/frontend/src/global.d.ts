/// <reference types="@solidjs/start/env" />
declare module "*.css";

interface Window {
  __test__?: {
    roomId: string | null;
    clickTile(x: number, y: number): void;
    panMap(dx: number, dy: number): void;
    zoomMap(scale: number): void;
    getViewport(): { x: number; y: number; scale: number } | null;
    getGameState(): Record<string, unknown> | null;
    getTileOwner(x: number, y: number): string | null;
    getPlayerArmies(): Array<{ id: string; army: number }>;
    waitForStatus(status: string, timeout?: number): Promise<void>;
    waitForWSConnected(timeout?: number): Promise<void>;
    waitForTileOwner(x: number, y: number, owner: string, timeout?: number): Promise<void>;
  };
}

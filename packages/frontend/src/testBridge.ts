import type { PlayerOperation, SyncedGameState } from "@generale/types";
import type { ClientConnectionManager, WSOpenPayloadBase } from "./ws/manager";

export interface TestBridge {
  gameState: SyncedGameState | null;
  viewportApi: {
    panMap: (dx: number, dy: number) => void;
    zoomMap: (scale: number) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    zoomReset: () => void;
    getViewport: () => { x: number; y: number; scale: number } | null;
  } | null;
  roomId: string | null;
  wsManager: ClientConnectionManager<WSOpenPayloadBase> | null;
  onOperationQueued: ((op: PlayerOperation) => void) | null;
  onClearQueue: (() => void) | null;
}

const bridge: TestBridge = {
  gameState: null,
  viewportApi: null,
  roomId: null,
  wsManager: null,
  onOperationQueued: null,
  onClearQueue: null,
};

export default bridge;

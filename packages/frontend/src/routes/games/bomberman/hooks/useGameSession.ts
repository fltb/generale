import type { BombermanOperation } from "@generale/types";

export function useBombermanGameSession() {
  // Simplified stub — connects to game domain via SubConnectorClient
  // Full implementation requires the actual WS connection manager
  function enqueueOp(_op: BombermanOperation) {
    // Will be wired to the game domain's send mechanism
  }

  return { enqueueOp };
}

import type { PlayerId } from "@generale/types";
import type { StateSyncState } from "./state-sync";

interface DisplaceableConnector {
  send(payload: unknown): void;
  close(): void;
}

/**
 * connector 替换（位移）工具：把给定 pid 的新 connector 写入 map，
 * 清理旧 connector 的状态，并向旧端发送 DISPLACED 通知后关闭。
 * GeneraleRoom / GeneraleGame / 未来游戏 Instance 复用同一套逻辑。
 */
export function displaceConnector<
  C extends DisplaceableConnector,
  S extends object,
  D extends { lastConfirmedOp: number },
>(
  pid: PlayerId,
  newConnector: C,
  connectors: Map<PlayerId, C>,
  stateSync: StateSyncState<S>,
  syncData: Map<PlayerId, D>,
  customEventType: unknown,
  displacedPayloadType: unknown,
): C | undefined {
  const stale = connectors.get(pid);
  connectors.set(pid, newConnector);
  stateSync.clear(pid);
  syncData.delete(pid);

  if (stale && stale !== newConnector) {
    try {
      stale.send({
        type: customEventType,
        payload: { type: displacedPayloadType },
      });
    } catch {
      /* ignore */
    }
    try {
      stale.close();
    } catch {
      /* ignore */
    }
  }

  return stale;
}

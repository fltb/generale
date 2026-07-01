import {
  type SyncedGameClientActions,
  SyncedGameClientActionTypes,
  type SyncedGameClientPlayerOperationPushAction,
  type SyncedGameState,
} from "@generale/types";

/**
 * 对局内本地乐观 applyEvent（给 useVersionedOptimisticState 用）。
 *
 * 只处理操作队列的本地显示：
 *  - PUSH: 把新指令追加到 playerOperationQueue（用于画箭头）
 *  - CLEAN_ALL: 清空队列
 *
 * 纯函数，无 UI / 连接依赖。
 */
export function applyGameEventLocal(state: SyncedGameState, action: SyncedGameClientActions): SyncedGameState {
  const base = structuredClone(state);
  switch (action.type) {
    case SyncedGameClientActionTypes.PUSH: {
      const ops = (action as SyncedGameClientPlayerOperationPushAction).payload ?? [];
      base.playerOperationQueue = [...(base.playerOperationQueue ?? []), ...ops];
      console.debug(`[game: apply useSynced]: push`, ops, base.playerOperationQueue);
      return base;
    }
    case SyncedGameClientActionTypes.CLEAN_ALL: {
      base.playerOperationQueue = [];
      console.debug(`[game: apply useSynced]: clean all`, base.playerOperationQueue);
      return base;
    }
    default:
      return base;
  }
}

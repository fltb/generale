import { compare } from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';

const MAX_PATCHES = 1000;

/**
 * 状态增量同步管理器。
 * 封装 snapshot vs patch 的判断逻辑（基线、patch 数量阈值），
 * 供 RoomInstance / GameInstance 及未来的其他游戏 Instance 复用。
 */
export class StateSyncState<TState extends object> {
  prevSentState = new Map<string, TState>();

  clear(pid: string) {
    this.prevSentState.delete(pid);
  }

  clearAll() {
    this.prevSentState.clear();
  }

  send(
    pid: string,
    forceSnapshot: boolean,
    current: TState,
    version: number,
    confirmedOp: number,
    onSnapshot: (state: TState, version: number, confirmedOp: number) => void,
    onPatch: (patches: Operation[], version: number, confirmedOp: number) => void,
  ) {
    if (!this.prevSentState.has(pid) || forceSnapshot) {
      onSnapshot(current, version, confirmedOp);
      this.prevSentState.set(pid, structuredClone(current));
      return;
    }

    const prev = this.prevSentState.get(pid)!;
    const patches = compare(prev, current);

    if (patches.length > MAX_PATCHES) {
      onSnapshot(current, version, confirmedOp);
    } else {
      onPatch(patches, version, confirmedOp);
    }

    this.prevSentState.set(pid, structuredClone(current));
  }
}

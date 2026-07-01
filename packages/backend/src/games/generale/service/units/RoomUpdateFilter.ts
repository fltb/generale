import type { GameId, PreGameRoomState } from "@generale/types";
import type { GeneraleRoom } from "../../instance/GeneraleRoom";

type EmitFn = (gameId: GameId) => void;

/**
 * 房间状态变更过滤器。
 * 监听 GeneraleRoom.onStateChange，只在影响房间列表展示的字段变化时通知 GeneraleManager。
 */
export class RoomUpdateFilter {
  private lastSnapshot?: PreGameRoomState;
  private filters: Array<(prev?: PreGameRoomState, curr?: PreGameRoomState) => boolean> = [];
  private unsubStateChange?: () => void;

  constructor(
    private readonly gameId: GameId,
    private readonly emit: EmitFn,
  ) {}

  attach(roomInstance: GeneraleRoom) {
    this.lastSnapshot = structuredClone(roomInstance.getState());

    const significantChange = this.buildSignificantChangeFilter();
    this.filters.push(significantChange);

    this.unsubStateChange = roomInstance.onStateChange((newState) => {
      const prev = this.lastSnapshot;
      this.lastSnapshot = structuredClone(newState);

      if (this.filters.length === 0) {
        this.emit(this.gameId);
        return;
      }
      for (const filter of this.filters) {
        try {
          if (filter(prev, newState)) {
            this.emit(this.gameId);
            return;
          }
        } catch (err) {
          console.error("[RoomUpdateFilter] filter error", err);
        }
      }
    });
  }

  detach() {
    this.unsubStateChange?.();
    this.filters = [];
  }

  private buildSignificantChangeFilter() {
    const playerListFp = (s?: PreGameRoomState) =>
      JSON.stringify((s?.players ?? []).map((p) => ({ id: p.id, name: p.name, isHost: p.isHost })));

    const mapSettingFp = (s?: PreGameRoomState) => {
      const ms = s?.mapSetting as { width?: number; height?: number; sizeLabel?: string } | undefined;
      if (!ms) return "";
      return JSON.stringify({ width: ms.width, height: ms.height, sizeLabel: ms.sizeLabel ?? null });
    };

    return (prev?: PreGameRoomState, curr?: PreGameRoomState) => {
      if ((prev?.players.length ?? 0) !== (curr?.players.length ?? 0)) return true;
      if ((prev?.hostId ?? "") !== (curr?.hostId ?? "")) return true;
      if ((prev?.started ?? false) !== (curr?.started ?? false)) return true;
      if ((prev?.playerLimit ?? 0) !== (curr?.playerLimit ?? 0)) return true;
      if ((prev?.roomType ?? "") !== (curr?.roomType ?? "")) return true;
      if (mapSettingFp(prev) !== mapSettingFp(curr)) return true;
      if (playerListFp(prev) !== playerListFp(curr)) return true;
      return false;
    };
  }
}

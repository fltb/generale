import {
  type SyncedPreGameState,
  type SyncedPreGameClientActions,
  SyncedPreGameClientActionTypes,
  PreGameMapType,
} from "@generale/types";
import { makeEmptyRoom } from "./defaults";

/**
 * 本地乐观 applyEvent（给 useVersionedOptimisticState 用）。
 *
 * 支持：ready/unready / change-setting / change-map / change-room-type /
 *      change-team / rename-team / delete-team 的本地显示。
 *
 * 纯函数：(state, action) -> nextState，无任何 UI / 连接依赖。
 */
export function applyPregameEventLocal(
  state: SyncedPreGameState | null,
  action: SyncedPreGameClientActions | any,
): SyncedPreGameState {
  const base: SyncedPreGameState = structuredClone(
    state ?? { room: makeEmptyRoom(""), selfId: "" },
  );
  const type = action.type;

  try {
    switch (type) {
      case SyncedPreGameClientActionTypes.READY: {
        const pid = base.selfId;
        if (base?.room?.players) {
          const p = base.room.players.find((x: any) => x.id === pid);
          if (p && !p.isHost) p.ready = 1;
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.UNREADY: {
        const pid = base.selfId;
        if (base?.room?.players) {
          const p = base.room.players.find((x: any) => x.id === pid);
          if (p && !p.isHost) p.ready = 0;
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.CHANGE_SETTING: {
        if (base?.room?.gameSetting && action.payload && typeof action.payload === "object") {
          base.room.gameSetting = { ...base.room.gameSetting, ...action.payload };
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.CHANGE_MAP: {
        base.room.mapSetting = action.payload;
        return base;
      }
      case SyncedPreGameClientActionTypes.CHANGE_ROOM_TYPE: {
        // 与服务端 changeRoomType 镜像：切换 roomType 并联动重置 mapSetting
        const next = action.payload?.roomType;
        if (next !== "standard" && next !== "custom") return base;
        if (base.room.roomType === next) return base;
        if (next === "standard") {
          base.room.mapSetting = {
            type: PreGameMapType.Random,
            width: 20,
            height: 20,
            tileFrequency: {},
            sizeLabel: "medium",
          } as any;
        } else {
          const ms: any = base.room.mapSetting;
          const w = typeof ms?.width === "number" ? ms.width : 20;
          const h = typeof ms?.height === "number" ? ms.height : 20;
          base.room.mapSetting = {
            type: PreGameMapType.Custom,
            width: w,
            height: h,
            tileFrequency: {},
            customData: "",
          } as any;
        }
        base.room.roomType = next;
        return base;
      }
      // ---------------- 本地乐观：创建 / 重命名 / 删除 队伍 ----------------
      case SyncedPreGameClientActionTypes.CHANGE_TEAM: {
        // payload: { name?: string }
        return base;
      }
      case SyncedPreGameClientActionTypes.RENAME_TEAM: {
        // payload: { teamId, name }
        const { teamId, name } = action.payload ?? {};
        if (teamId && base.room.teams) {
          const t = base.room.teams.find(tt => tt.id === teamId);
          if (t && typeof name === 'string') t.name = name.slice(0, 60);
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.DELETE_TEAM: {
        // payload: { teamId }
        const { teamId } = action.payload ?? {};
        if (teamId && base.room.teams) {
          // Only remove if no members here (local check). Server will authoritative decide.
          const memberCount = base.room.players.filter(p => p.teamId === teamId).length;
          if (memberCount === 0) {
            base.room.teams = base.room.teams.filter(t => t.id !== teamId);
            base.room.teamCount = base.room.teams.length;
          }
        }
        return base;
      }
      // --------------------------------------------------------------------
      default:
        return base;
    }
  } catch (err) {
    console.error("[applyPregameEventLocal] error", err, action);
    return state ?? base;
  }
}

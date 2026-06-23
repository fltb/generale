import { PlayerId, TeamId, ServerSyncConnector } from "@generale/types";
import type { ChatSenderMeta } from "@generale/types/src/game/chat";

export interface IBaseInstance<CEvt, SEvt> {
    destroy(): void;
    canJoin(id: PlayerId): {success: true} | {success: false, message: string};
    addPlayer(user: {id: PlayerId, name: string}, connector: ServerSyncConnector<CEvt, SEvt>): { success: true } | { success: false, message: string };
}

/**
 * ChatInstance 需要的最小房间名册视图。
 * GameService 负责注入 RoomInstance（唯一持有完整房间状态的实例），
 * ChatInstance 通过此接口获取鉴权和展示所需的元数据，不再依赖具体 Instance 类型。
 */
export interface IRoomRoster {
    canJoin(playerId: PlayerId): { success: true } | { success: false; message: string };
    getPlayerChatMeta(playerId: PlayerId): ChatSenderMeta | null;
    getPlayersForTeamChat(): Array<{ id: PlayerId; teamId?: TeamId; status: string }>;
}
import type { ChatSenderMeta } from "@generale/types";
import { PlayerId, ServerSyncConnector, TeamId } from "@generale/types";

export interface IBaseInstance<CEvt, SEvt> {
  destroy(): void;
  canJoin(id: PlayerId): { success: true } | { success: false; message: string };
  addPlayer(
    user: { id: PlayerId; name: string },
    connector: ServerSyncConnector<CEvt, SEvt>,
  ): { success: true } | { success: false; message: string };
}

export interface IRoomRoster {
  canJoin(playerId: PlayerId): { success: true } | { success: false; message: string };
  getPlayerChatMeta(playerId: PlayerId): ChatSenderMeta | null;
  getPlayersForTeamChat(): Array<{ id: PlayerId; teamId?: TeamId; status: string }>;
}

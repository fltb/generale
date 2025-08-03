import { PlayerId, ServerSyncConnector } from "@generale/types";

export interface IBaseInstance<CEvt, SEvt> {
    destroy(): void;
    canJoin(id: PlayerId): {success: true} | {success: false, message: string};
    addPlayer(user: {id: PlayerId, name: string}, connector: ServerSyncConnector<CEvt, SEvt>): { success: true } | { success: false, message: string };
}
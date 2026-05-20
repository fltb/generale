import type { GameInfoRoute, ListGamesQuery } from "../../api";

export enum LobbyServerMessageType {
    LIST = "room-list",
    CREATED = "room-created",
    UPDATED = "room-updated",
    DELETED = "room-deleted"
}

export interface LobbyServerRoomListMessage {
    type: LobbyServerMessageType.LIST
    payload: GameInfoRoute[]
    meta: {
        ts: number
        seq: number
    }
}

export interface LobbyServerRoomCreatedMessage {
    type: LobbyServerMessageType.CREATED
    payload: GameInfoRoute
    meta: {
        ts: number
        seq: number
        id: string
    }
}

export interface LobbyServerRoomUpdatedMessage {
    type: LobbyServerMessageType.UPDATED
    payload: GameInfoRoute
    meta: {
        ts: number
        seq: number
        id: string
    }
}

export interface LobbyServerRoomDeletedMessage {
    type: LobbyServerMessageType.DELETED
    payload: {
        gameId: string
    }
    meta: {
        ts: number
        seq: number
        id: string
    }
}

export type LobbyMessage =
    | LobbyServerRoomListMessage
    | LobbyServerRoomCreatedMessage
    | LobbyServerRoomUpdatedMessage
    | LobbyServerRoomDeletedMessage;


export enum LobbyClientEventType {
  REQUEST_LIST = "request-list",
  SET_FILTERS = "set-filters",
  SYNC_FROM_SEQ = "sync-from-seq",
  PING = "ping",
  PONG = "pong",
  CLOSE = "close"
}

export interface LobbyClientRequestListEvent {
  type: LobbyClientEventType.REQUEST_LIST
  payload: {
    filters?: ListGamesQuery
    offset?: number
    limit?: number
  }
}

export interface LobbyClientSetFiltersEvent {
  type: LobbyClientEventType.SET_FILTERS
  payload: {
    filters?: ListGamesQuery
  }
}

export interface LobbyClientSyncFromSeqEvent {
  type: LobbyClientEventType.SYNC_FROM_SEQ
  payload: {
    lastSeenSeq: number
  }
}

export interface LobbyClientPingEvent {
  type: LobbyClientEventType.PING
}

export interface LobbyClientPongEvent {
  type: LobbyClientEventType.PONG
}

export interface LobbyClientCloseEvent {
  type: LobbyClientEventType.CLOSE
  payload: {
    reason?: string
  }
}

export type LobbyClientEvent =
  | LobbyClientRequestListEvent
  | LobbyClientSetFiltersEvent
  | LobbyClientSyncFromSeqEvent
  | LobbyClientPingEvent
  | LobbyClientPongEvent
  | LobbyClientCloseEvent;

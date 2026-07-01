import type { GameId, PlayerId } from "../core-type";

export enum BasePlayerStatus {
  Lobby = "lobby",
  Playing = "playing",
  Disconnected = "disconnected",
  Spectating = "spectating",
}

export interface BasePlayerInfo {
  id: PlayerId;
  name: string;
  displayName?: string;
  avatarThumbUrl?: string;
  isHost: boolean;
  status: BasePlayerStatus;
}

export interface BaseRoomState {
  gameId: GameId;
  hostId: PlayerId;
  players: BasePlayerInfo[];
  playerLimit: number;
  started: boolean;
  gameConfig: unknown;
}

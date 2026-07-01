import type { GameId, PlayerId, TeamId } from "./core-type";
import type { GameType } from "./game-type";

export interface GameResultParticipant {
  playerId: PlayerId;
  rank: number;
  score: number;
  teamId?: TeamId;
}

export interface GameResultRow {
  id: string;
  gameId: GameId;
  gameType: GameType;
  endedAt: number;
  durationMs: number;
  participants: GameResultParticipant[];
  stateSnapshot?: unknown;
}

// src/services/gameApi.ts
import { api } from "./base";
import type {
  CreateGameReqBody,
  CreateGameSuccessResp,
  GameInfoSuccessResp,
  ListGamesSuccessResp,
  ConnectWsSuccessResp,
  ErrorResp,
  ListGamesQuery
} from "@generale/types/dist/api";

/**
 * POST /game/create
 */
export async function createGameApi(payload: CreateGameReqBody): Promise<CreateGameSuccessResp> {
  return api<CreateGameSuccessResp, ErrorResp>("/api/game/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * GET /game/info/:gameId
 */
export async function getGameInfoApi(gameId: string): Promise<GameInfoSuccessResp> {
  return api<GameInfoSuccessResp, ErrorResp>(`/api/game/info/${encodeURIComponent(gameId)}`, {
    method: "GET",
  });
}

/**
 * GET /game/list
 * Accepts an optional query object (ListGamesQuery)
 */
export async function listGamesApi(query?: Partial<ListGamesQuery>): Promise<ListGamesSuccessResp> {
  const qs = query ? "?" + new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)])
  ).toString() : "";
  return api<ListGamesSuccessResp, ErrorResp>(`/api/game/list${qs}`, {
    method: "GET",
  });
}

/**
 * GET /game/connect/:gameId/:playerId
 * NOTE: server returns domains/phase etc for websocket preparation
 */
export async function prepareConnectApi(gameId: string, playerId: string): Promise<ConnectWsSuccessResp> {
  return api<ConnectWsSuccessResp, ErrorResp>(
    `/api/game/connect/${encodeURIComponent(gameId)}/${encodeURIComponent(playerId)}`,
    { method: "GET" }
  );
}

// src/services/gameApi.ts

import type {
  ConnectWsSuccessResp,
  CreateGameReqBody,
  CreateGameSuccessResp,
  ErrorResp,
  GameInfoSuccessResp,
  ListGamesQuery,
  ListGamesSuccessResp,
} from "@generale/types/dist/api";
import { api } from "~/api/base";

/**
 * POST /game/create
 */
export function createGameApi(payload: CreateGameReqBody): Promise<CreateGameSuccessResp> {
  return api<CreateGameSuccessResp, ErrorResp>("/api/game/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * GET /game/info/:gameId
 */
export function getGameInfoApi(gameId: string): Promise<GameInfoSuccessResp> {
  return api<GameInfoSuccessResp, ErrorResp>(`/api/game/info/${encodeURIComponent(gameId)}`, {
    method: "GET",
  });
}

/**
 * GET /game/list
 * Accepts an optional query object (ListGamesQuery)
 */
export function listGamesApi(query?: Partial<ListGamesQuery>): Promise<ListGamesSuccessResp> {
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  return api<ListGamesSuccessResp, ErrorResp>(`/api/game/list${qs}`, {
    method: "GET",
  });
}

/**
 * GET /game/connect/:gameId
 * NOTE: server returns domains/phase etc for websocket preparation
 */
export function prepareConnectApi(gameId: string): Promise<ConnectWsSuccessResp> {
  return api<ConnectWsSuccessResp, ErrorResp>(`/api/game/connect/${encodeURIComponent(gameId)}`, { method: "GET" });
}

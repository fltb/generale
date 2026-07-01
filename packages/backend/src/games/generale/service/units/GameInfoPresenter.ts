import type { GameId, GameInfoSuccessResp, GamePhase } from "@generale/types";
import { mapService } from "../../../../services/mapService";
import type { GeneraleGame } from "../../instance/GeneraleGame";
import type { GeneraleRoom } from "../../instance/GeneraleRoom";

export interface GameInfoInput {
  gameId: GameId;
  roomName: string;
  phase: GamePhase;
  maxPlayers: number;
  roomType: "standard" | "custom";
  mapSizeConfig: { width: number; height: number } | "small" | "medium" | "large";
  roomInstance: GeneraleRoom | null;
  gameInstance: GeneraleGame | null;
}

export function buildGameInfo(input: GameInfoInput): GameInfoSuccessResp["data"] {
  const { gameId, roomName, phase, maxPlayers, roomType, mapSizeConfig, roomInstance, gameInstance } = input;

  const status = phaseToStatus(phase);

  const { players, hostId, hostName, resolvedMaxPlayers } = collectPlayers(
    phase,
    roomInstance,
    gameInstance,
    maxPlayers,
  );

  const { mapField, roomTypeField, customMapId, customMapName } = resolveMapField(
    phase,
    roomInstance,
    roomType,
    mapSizeConfig,
  );

  const settings = normalizeSettings(roomTypeField, mapField, resolvedMaxPlayers, roomName);

  return {
    id: gameId,
    type: roomTypeField,
    map: mapField,
    roomName,
    hostId,
    hostName,
    players,
    settings,
    status,
    playerCount: players.length,
    maxPlayers: resolvedMaxPlayers,
    hasPassword: !!roomInstance?.getPassword(),
    customMapId: customMapId || undefined,
    customMapName: customMapName || undefined,
  } as GameInfoSuccessResp["data"];
}

function phaseToStatus(phase: GamePhase): "lobby" | "in-progress" | "finished" {
  switch (phase) {
    case "pregame":
      return "lobby";
    case "ingame":
      return "in-progress";
    default:
      return "finished";
  }
}

function collectPlayers(
  phase: GamePhase,
  roomInstance: GeneraleRoom | null,
  gameInstance: GeneraleGame | null,
  fallbackMax: number,
) {
  let players: Array<{ id: string; name: string; isHost: boolean }> = [];
  let hostId = "";
  let maxPlayers = fallbackMax;

  if (phase === "pregame" && roomInstance) {
    const state = roomInstance.getState();
    players = state.players.map((p) => ({
      id: String(p.id),
      name: String(p.displayName ?? p.name ?? ""),
      isHost: Boolean(p.isHost),
    }));
    maxPlayers = state.playerLimit ?? maxPlayers;
    hostId = String(state.hostId ?? "");
  } else if (phase === "ingame" && gameInstance) {
    const state = gameInstance.getState();
    const display: Record<string, { displayName?: string; name?: string }> =
      (
        gameInstance as unknown as {
          getSettings?(): { playerDisplay?: Record<string, { displayName?: string; name?: string }> };
        }
      ).getSettings?.()?.playerDisplay ?? {};
    players = Object.entries(state.players).map(([id, _p]) => ({
      id: String(id),
      name: String(display[id]?.displayName ?? display[id]?.name ?? ""),
      isHost: false,
    }));
    maxPlayers = Math.max(maxPlayers, Object.keys(state.players).length);
  }

  const hostName = players.find((p) => p.id === hostId)?.name ?? "";
  return { players, hostId, hostName, resolvedMaxPlayers: maxPlayers };
}

function resolveMapField(
  phase: GamePhase,
  roomInstance: GeneraleRoom | null,
  roomType: "standard" | "custom",
  mapSizeConfig: GameInfoInput["mapSizeConfig"],
) {
  let mapField: { width: number; height: number } | "small" | "medium" | "large" | undefined = mapSizeConfig;
  let roomTypeField = roomType;
  let customMapId: string | undefined;
  let customMapName: string | undefined;

  if (phase === "pregame" && roomInstance) {
    const state = roomInstance.getState();
    roomTypeField = state.roomType;
    const ms = state.mapSetting as { sizeLabel?: string; width?: number; height?: number; customMapId?: string };
    if (state.roomType === "standard" && ms?.sizeLabel) {
      mapField = ms.sizeLabel as "small" | "medium" | "large";
    } else if (ms && typeof ms.width === "number" && typeof ms.height === "number") {
      mapField = { width: ms.width, height: ms.height };
    }
    if (ms?.customMapId) {
      customMapId = ms.customMapId;
      const meta = mapService.getMeta(ms.customMapId);
      customMapName = meta?.name;
    }
  }

  return { mapField, roomTypeField, customMapId, customMapName };
}

function normalizeSettings(
  roomType: "standard" | "custom",
  mapField: { width: number; height: number } | "small" | "medium" | "large" | undefined,
  maxPlayers: number,
  _roomName: string,
) {
  if (roomType === "custom") {
    return {
      maxPlayers,
      mapSize: mapField as { width: number; height: number },
      type: "custom" as const,
    };
  }
  // standard: mapSize 可选，非预设标签时不发
  if (mapField && typeof mapField === "string") {
    return { maxPlayers, mapSize: mapField, type: "standard" as const };
  }
  return { maxPlayers, type: "standard" as const };
}

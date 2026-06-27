import type {
  GamePhase,
  GameId,
} from '@generale/types';
import type { RoomInstance } from '../../instance/RoomInstance';
import type { GameInstance } from '../../instance/GameInstance';
import type { GameInfoSuccessResp } from '@generale/types';
import { mapService } from '../../../services/mapService';

export interface GameInfoInput {
  gameId: GameId;
  roomName: string;
  phase: GamePhase;
  maxPlayers: number;
  roomType: 'standard' | 'custom';
  mapSizeConfig: { width: number; height: number } | 'small' | 'medium' | 'large';
  roomInstance: RoomInstance | null;
  gameInstance: GameInstance | null;
}

export function buildGameInfo(input: GameInfoInput): GameInfoSuccessResp['data'] {
  const { gameId, roomName, phase, maxPlayers, roomType, mapSizeConfig, roomInstance, gameInstance } = input;

  const status = phaseToStatus(phase);

  const { players, hostId, hostName, resolvedMaxPlayers } = collectPlayers(
    phase, roomInstance, gameInstance, maxPlayers,
  );

  const { mapField, roomTypeField, customMapId, customMapName } = resolveMapField(phase, roomInstance, roomType, mapSizeConfig);

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
  } as GameInfoSuccessResp['data'];
}

function phaseToStatus(phase: GamePhase): 'lobby' | 'in-progress' | 'finished' {
  switch (phase) {
    case 'pregame': return 'lobby';
    case 'ingame': return 'in-progress';
    default: return 'finished';
  }
}

function collectPlayers(
  phase: GamePhase,
  roomInstance: RoomInstance | null,
  gameInstance: GameInstance | null,
  fallbackMax: number,
) {
  let players: Array<{ id: string; name: string; isHost: boolean }> = [];
  let hostId = '';
  let maxPlayers = fallbackMax;

  if (phase === 'pregame' && roomInstance) {
    const state = roomInstance.getState();
    players = state.players.map(p => ({
      id: String(p.id),
      name: String(p.displayName ?? p.name ?? ''),
      isHost: Boolean(p.isHost),
    }));
    maxPlayers = state.playerLimit ?? maxPlayers;
    hostId = String(state.hostId ?? '');
  } else if (phase === 'ingame' && gameInstance) {
    const state = gameInstance.getState();
    const display: Record<string, any> = (gameInstance as any).getSettings?.()?.playerDisplay ?? {};
    players = Object.entries(state.players).map(([id, _p]: any) => ({
      id: String(id),
      name: String(display[id]?.displayName ?? display[id]?.name ?? ''),
      isHost: false,
    }));
    maxPlayers = Math.max(maxPlayers, Object.keys(state.players).length);
  }

  const hostName = players.find(p => p.id === hostId)?.name ?? '';
  return { players, hostId, hostName, resolvedMaxPlayers: maxPlayers };
}

function resolveMapField(
  phase: GamePhase,
  roomInstance: RoomInstance | null,
  roomType: 'standard' | 'custom',
  mapSizeConfig: GameInfoInput['mapSizeConfig'],
) {
  let mapField: { width: number; height: number } | 'small' | 'medium' | 'large' | undefined = mapSizeConfig as any;
  let roomTypeField = roomType;
  let customMapId: string | undefined;
  let customMapName: string | undefined;

  if (phase === 'pregame' && roomInstance) {
    const state = roomInstance.getState();
    roomTypeField = state.roomType;
    const ms: any = state.mapSetting;
    if (state.roomType === 'standard' && ms?.sizeLabel) {
      mapField = ms.sizeLabel as 'small' | 'medium' | 'large';
    } else if (ms && typeof ms.width === 'number' && typeof ms.height === 'number') {
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
  roomType: 'standard' | 'custom',
  mapField: { width: number; height: number } | 'small' | 'medium' | 'large' | undefined,
  maxPlayers: number,
  _roomName: string,
) {
  if (roomType === 'custom') {
    return {
      maxPlayers,
      mapSize: mapField as { width: number; height: number },
      type: 'custom' as const,
    };
  }
  // standard: mapSize 可选，非预设标签时不发
  if (mapField && typeof mapField === 'string') {
    return { maxPlayers, mapSize: mapField, type: 'standard' as const };
  }
  return { maxPlayers, type: 'standard' as const };
}

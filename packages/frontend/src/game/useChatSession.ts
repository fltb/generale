import { createMemo } from "solid-js";
import {
  GamePhase,
  PreGamePlayerStatus,
  type ChatMessage,
  type ChatMessageScope,
  type ChatSenderMeta,
  type PreGamePlayerInfo,
  type PreGameRoomState,
} from "@generale/types";
import { useChat } from "~/hooks/useChat";

export interface UseChatSessionParams {
  domain: string;
  userId: string;
  phase?: GamePhase;
  selfStatus?: PreGamePlayerStatus;
  room?: PreGameRoomState | null;
  autoOpen?: boolean;
  initialFetchLimit?: number;
}

export function useChatSession(params: UseChatSessionParams) {
  const selfPlayer = createMemo<PreGamePlayerInfo | undefined>(() =>
    params.room?.players.find(p => p.id === params.userId)
  );

  const selfMeta = createMemo<ChatSenderMeta | undefined>(() => {
    const player = selfPlayer();
    if (!player) return undefined;
    const team = params.room?.teams.find(t => t.id === player.teamId);
    return {
      teamId: player.teamId,
      teamName: team?.name ?? player.teamId,
      teamMode: params.room?.teamMode ?? "ffa",
      status: player.status,
      presence:
        player.status === PreGamePlayerStatus.Playing
          ? "game"
          : player.status === PreGamePlayerStatus.Spectating
            ? "spectator"
            : "room",
      tileColor: player.tileColor,
      avatarThumbUrl: player.avatarThumbUrl,
      displayName: player.displayName,
    };
  });

  const chat = useChat({
    domain: params.domain,
    userId: params.userId,
    autoOpen: params.autoOpen ?? true,
    initialFetchLimit: params.initialFetchLimit ?? 30,
    getOptimisticMeta: selfMeta,
  });

  const canTeamChat = createMemo(() => {
    const meta = selfMeta();
    return meta?.teamMode === "team"
      && meta?.presence === "game"
      && !!meta.teamId;
  });

  function parseOutgoing(raw: string): { content: string; scope?: ChatMessageScope } | null {
    const value = raw.trim();
    if (!value) return null;
    const match = /^\/team(?:\s+|$)([\s\S]*)$/i.exec(value);
    if (!match) return { content: value };
    const content = (match[1] ?? "").trim();
    if (!content || !canTeamChat()) return null;
    return { content, scope: "team" };
  }

  function send(raw: string): boolean {
    const parsed = parseOutgoing(raw);
    if (!parsed) return false;
    chat.sendMessage(parsed.content, parsed.scope);
    return true;
  }

  function messageDisplayName(message: ChatMessage) {
    return message.meta?.displayName || message.playerName;
  }

  function presenceLabel(message: ChatMessage) {
    if (message.type === "system" || message.playerId === "system") return "系统";
    switch (message.meta?.presence) {
      case "spectator":
        return "旁观者";
      case "room":
        return params.phase === GamePhase.INGAME ? "房间内" : undefined;
      case "game":
      default:
        return undefined;
    }
  }

  function teamLabel(message: ChatMessage) {
    if (message.meta?.teamMode !== "team") return undefined;
    return message.meta?.teamName ?? message.meta?.teamId;
  }

  function colorHex(message: ChatMessage) {
    const color = message.meta?.tileColor;
    if (typeof color !== "number") return undefined;
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  return {
    ...chat,
    selfMeta,
    canTeamChat,
    send,
    messageDisplayName,
    presenceLabel,
    teamLabel,
    colorHex,
  };
}

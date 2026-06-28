import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { useChatSession } from "~/game/useChatSession";
import { GamePhase } from "@generale/types";

const mockSendMessage = vi.hoisted(() => vi.fn());
const mockFetchMoreHistory = vi.hoisted(() => vi.fn());
const mockConnect = vi.hoisted(() => vi.fn());
const mockDisconnect = vi.hoisted(() => vi.fn());

vi.mock("~/hooks/useChat", () => ({
  useChat: vi.fn(() => ({
    connected: () => true,
    messages: () => [],
    loadingHistory: () => false,
    hasMoreHistory: () => true,
    connect: mockConnect,
    disconnect: mockDisconnect,
    sendMessage: mockSendMessage,
    fetchMoreHistory: mockFetchMoreHistory,
  })),
}));

describe("useChatSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns expected API shape", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    expect(result!).toHaveProperty("connected");
    expect(result!).toHaveProperty("messages");
    expect(result!).toHaveProperty("loadingHistory");
    expect(result!).toHaveProperty("hasMoreHistory");
    expect(result!).toHaveProperty("selfMeta");
    expect(result!).toHaveProperty("canTeamChat");
    expect(result!).toHaveProperty("send");
    expect(result!).toHaveProperty("messageDisplayName");
    expect(result!).toHaveProperty("presenceLabel");
    expect(result!).toHaveProperty("teamLabel");
    expect(result!).toHaveProperty("colorHex");
    expect(result!).toHaveProperty("connect");
    expect(result!).toHaveProperty("disconnect");
    expect(result!).toHaveProperty("sendMessage");
    expect(result!).toHaveProperty("fetchMoreHistory");
  });

  it("delegates connect/disconnect to useChat", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    result!.connect();
    expect(mockConnect).toHaveBeenCalled();

    result!.disconnect();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it("send wraps useChat.sendMessage with scope", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    const sent = result!.send("hello world");
    expect(sent).toBe(true);
    expect(mockSendMessage).toHaveBeenCalledWith("hello world", undefined);
  });

  it("send returns false for empty string", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    const sent = result!.send("   ");
    expect(sent).toBe(false);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("selfMeta returns undefined when no room provided", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    expect(result!.selfMeta()).toBeUndefined();
  });

  it("messageDisplayName falls back to playerName", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    const msg = { playerName: "Bob", meta: undefined } as any;
    expect(result!.messageDisplayName(msg)).toBe("Bob");
  });

  it("messageDisplayName uses meta.displayName when available", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    const msg = { playerName: "Bob", meta: { displayName: "Alice" } } as any;
    expect(result!.messageDisplayName(msg)).toBe("Alice");
  });

  it("presenceLabel returns Chinese labels for spectator and room", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
        phase: GamePhase.INGAME,
      });
    });

    expect(result!.presenceLabel({ meta: { presence: "spectator" } } as any)).toBe("旁观者");
    expect(result!.presenceLabel({ meta: { presence: "room" }, playerId: "u1" } as any)).toBe("房间内");
  });

  it("presenceLabel returns undefined for game presence", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    expect(result!.presenceLabel({ meta: { presence: "game" } } as any)).toBeUndefined();
  });

  it("presenceLabel returns 系统 for system messages", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    expect(result!.presenceLabel({ type: "system", playerId: "system" } as any)).toBe("系统");
  });

  it("teamLabel returns undefined when teamMode is not team", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    expect(result!.teamLabel({ meta: { teamMode: "ffa" } } as any)).toBeUndefined();
  });

  it("colorHex formats tileColor as hex string", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    expect(result!.colorHex({ meta: { tileColor: 0xff0000 } } as any)).toBe("#ff0000");
    expect(result!.colorHex({ meta: { tileColor: 0x00ff00 } } as any)).toBe("#00ff00");
  });

  it("colorHex returns undefined when tileColor is not a number", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    expect(result!.colorHex({ meta: {} } as any)).toBeUndefined();
  });

  it("canTeamChat returns false without team room data", () => {
    let result: ReturnType<typeof useChatSession>;
    createRoot(() => {
      result = useChatSession({
        domain: "chat-test",
        userId: "u1",
      });
    });

    expect(result!.canTeamChat()).toBe(false);
  });
});

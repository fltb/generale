import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { GamePhase, PreGamePlayerStatus } from "@generale/types";

const mockChat = vi.hoisted(() => ({
  messages: vi.fn().mockReturnValue([]),
  connected: vi.fn().mockReturnValue(true),
  loadingHistory: vi.fn().mockReturnValue(false),
  hasMoreHistory: vi.fn().mockReturnValue(false),
  fetchMoreHistory: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn().mockReturnValue(true),
  canTeamChat: vi.fn().mockReturnValue(false),
  messageDisplayName: vi.fn().mockImplementation((m: any) => m.playerId),
  selfMeta: vi.fn(),
  presenceLabel: vi.fn(),
  teamLabel: vi.fn(),
  colorHex: vi.fn(),
}));

vi.mock("~/routes/games/generale/hooks/useChatSession", () => ({
  useChatSession: () => mockChat,
}));

import { ChatPanel } from "~/components/ChatPanel";

describe("ChatPanel", () => {
  it("renders title", () => {
    render(() => <ChatPanel domain="test" userId="u1" />);
    expect(screen.getByText("Game Chat")).toBeInTheDocument();
  });

  it("shows empty state when no messages", () => {
    render(() => <ChatPanel domain="test" userId="u1" />);
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });

  it("shows connection badge 在线", () => {
    render(() => <ChatPanel domain="test" userId="u1" />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("shows connection badge 离线 when disconnected", () => {
    mockChat.connected.mockReturnValue(false);
    render(() => <ChatPanel domain="test" userId="u1" />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("renders messages", () => {
    const now = Date.now();
    mockChat.messages.mockReturnValue([
      { id: "m1", playerId: "u1", playerName: "User1", content: "Hello", timestamp: now, type: "user" },
      { id: "m2", playerId: "u2", playerName: "User2", content: "World", timestamp: now, type: "user" },
    ]);
    render(() => <ChatPanel domain="test" userId="u1" />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("World")).toBeInTheDocument();
  });

  it("connect button disabled when connected", () => {
    mockChat.connected.mockReturnValue(true);
    render(() => <ChatPanel domain="test" userId="u1" />);
    const btns = screen.getAllByText("Connect");
    for (const btn of btns) {
      expect(btn.closest("button")).toBeDisabled();
    }
  });

  it("disconnect button enabled when connected", () => {
    mockChat.connected.mockReturnValue(true);
    render(() => <ChatPanel domain="test" userId="u1" />);
    const btns = screen.getAllByText("Disconnect");
    for (const btn of btns) {
      expect(btn.closest("button")).not.toBeDisabled();
    }
  });

  it("disconnect button disabled when not connected", () => {
    mockChat.connected.mockReturnValue(false);
    render(() => <ChatPanel domain="test" userId="u1" />);
    const btns = screen.getAllByText("Disconnect");
    for (const btn of btns) {
      expect(btn.closest("button")).toBeDisabled();
    }
  });

  it("send button disabled when input empty", () => {
    mockChat.connected.mockReturnValue(true);
    render(() => <ChatPanel domain="test" userId="u1" />);
    const sendBtn = screen.getByText("Send").closest("button")!;
    expect(sendBtn).toBeDisabled();
  });

  it("renders role badge 房间玩家 when no phase and no status", () => {
    mockChat.connected.mockReturnValue(true);
    render(() => <ChatPanel domain="test" userId="u1" />);
    expect(screen.getByText("Room Player")).toBeInTheDocument();
  });

  it("renders role badge 游戏玩家 when playing", () => {
    render(() => <ChatPanel domain="test" userId="u1" selfStatus={PreGamePlayerStatus.Playing} />);
    expect(screen.getByText("In-Game Player")).toBeInTheDocument();
  });

  it("renders role badge 旁观者 when spectating", () => {
    render(() => <ChatPanel domain="test" userId="u1" selfStatus={PreGamePlayerStatus.Spectating} />);
    expect(screen.getByText("Spectator")).toBeInTheDocument();
  });

  it("renders role badge 大厅等待 when phase is INGAME", () => {
    render(() => <ChatPanel domain="test" userId="u1" phase={GamePhase.INGAME} />);
    expect(screen.getByText("Lobby")).toBeInTheDocument();
  });

  it("calls send on button click with non-empty input", () => {
    mockChat.connected.mockReturnValue(true);
    mockChat.send.mockReturnValue(true);
    render(() => <ChatPanel domain="test" userId="u1" />);
    const textarea = screen.getByRole("textbox");
    fireEvent.input(textarea, { target: { value: "test message" } });
    const sendBtn = screen.getByText("Send").closest("button")!;
    expect(sendBtn).not.toBeDisabled();
    fireEvent.click(sendBtn);
    expect(mockChat.send).toHaveBeenCalledWith("test message");
  });

  it("renders history button as 已到顶 when no more history", () => {
    mockChat.hasMoreHistory.mockReturnValue(false);
    render(() => <ChatPanel domain="test" userId="u1" />);
    expect(screen.getByText("No more")).toBeInTheDocument();
  });

  it("renders history button as 历史 when has more history", () => {
    mockChat.messages.mockReturnValue([
      { id: "m1", playerId: "u1", playerName: "User1", content: "X", timestamp: Date.now(), type: "user" },
    ]);
    mockChat.hasMoreHistory.mockReturnValue(true);
    render(() => <ChatPanel domain="test" userId="u1" />);
    expect(screen.getByText("History")).toBeInTheDocument();
  });
});

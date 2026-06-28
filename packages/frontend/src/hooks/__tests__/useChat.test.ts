import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";

vi.mock("~/hooks/useWebsocket", () => ({
  useWS: vi.fn(),
}));

import { useWS } from "~/hooks/useWebsocket";
import { useChat } from "../useChat";

function createMockChain() {
  const cbs: Record<string, Function> = {};
  let _ready = false;
  const sub = {
    get ready() {
      return _ready;
    },
    set ready(v: boolean) {
      _ready = v;
    },
    onOpen: vi.fn((cb: Function) => {
      cbs.open = cb;
    }),
    onMessage: vi.fn((cb: Function) => {
      cbs.message = cb;
    }),
    onDisconnect: vi.fn((cb: Function) => {
      cbs.disconnect = cb;
    }),
    onClose: vi.fn((cb: Function) => {
      cbs.close = cb;
    }),
    send: vi.fn(),
    close: vi.fn(),
  };
  const manager = {
    getOrCreateSub: vi.fn(() => sub),
    openDomain: vi.fn(),
    connect: vi.fn(),
    isConnected: false,
  };
  return { sub, cbs, manager };
}

async function setupChat(options: { autoOpen?: boolean } = {}) {
  const { sub, cbs, manager } = createMockChain();
  vi.mocked(useWS).mockReturnValue(manager as any);

  let chat!: ReturnType<typeof useChat>;
  let dispose!: () => void;

  await new Promise<void>((resolve) => {
    createRoot((d) => {
      dispose = d;
      chat = useChat({
        domain: "test-chat",
        userId: "u1",
        ...options,
      });
      setTimeout(resolve, 10);
    });
  });

  return { chat, cbs, sub, manager, dispose };
}

describe("useChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initial state has empty messages and not connected", async () => {
    const { chat, dispose } = await setupChat({ autoOpen: false });
    expect(chat.messages()).toEqual([]);
    expect(chat.connected()).toBe(false);
    expect(chat.loadingHistory()).toBe(false);
    expect(chat.hasMoreHistory()).toBe(true);
    dispose();
  });

  it("sendMessage adds optimistic message and buffers", async () => {
    const { chat, dispose } = await setupChat({ autoOpen: false });
    chat.sendMessage("hello world");
    expect(chat.messages().length).toBe(1);
    expect(chat.messages()[0].content).toBe("hello world");
    expect(chat.messages()[0].id).toContain("local_");
    expect(chat.messages()[0].playerId).toBe("u1");
    dispose();
  });

  it("handles messages_batch server event", async () => {
    const { chat, cbs, dispose } = await setupChat({ autoOpen: false });

    cbs.message!({
      type: "messages_batch",
      messages: [
        {
          id: "m1",
          playerId: "u2",
          playerName: "Bob",
          content: "hi",
          timestamp: 100,
          type: "user",
        },
        {
          id: "m2",
          playerId: "u1",
          playerName: "Alice",
          content: "hey",
          timestamp: 200,
          type: "user",
        },
      ],
      isEnd: true,
    });

    expect(chat.messages().length).toBe(2);
    expect(chat.hasMoreHistory()).toBe(false);
    expect(chat.loadingHistory()).toBe(false);
    dispose();
  });

  it("replaces optimistic message on new_message ack for matching content and userId", async () => {
    const { chat, cbs, dispose } = await setupChat({ autoOpen: false });

    chat.sendMessage("hello");
    expect(chat.messages().length).toBe(1);
    const tempId = chat.messages()[0].id;
    expect(tempId).toContain("local_");

    cbs.message!({
      type: "new_message",
      message: {
        id: "server-msg-1",
        playerId: "u1",
        playerName: "Alice",
        content: "hello",
        timestamp: 300,
        type: "user",
      },
    });

    expect(chat.messages().length).toBe(1);
    expect(chat.messages()[0].id).toBe("server-msg-1");
    expect(chat.messages()[0].content).toBe("hello");
    dispose();
  });

  it("appends new_message when not matching optimistic entry", async () => {
    const { chat, cbs, dispose } = await setupChat({ autoOpen: false });

    cbs.message!({
      type: "new_message",
      message: {
        id: "m99",
        playerId: "u2",
        playerName: "Bob",
        content: "from other",
        timestamp: 400,
        type: "user",
      },
    });

    expect(chat.messages().length).toBe(1);
    expect(chat.messages()[0].id).toBe("m99");
    dispose();
  });

  it("sets connected false on disconnect", async () => {
    const { chat, cbs, sub, dispose } = await setupChat({ autoOpen: false });

    expect(chat.connected()).toBe(false);

    sub.ready = true;
    cbs.open!();
    expect(chat.connected()).toBe(true);

    cbs.disconnect!(new Error("lost connection"));
    expect(chat.connected()).toBe(false);
    dispose();
  });

  it("sets connected false on close", async () => {
    const { chat, cbs, sub, dispose } = await setupChat({ autoOpen: false });

    sub.ready = true;
    cbs.open!();
    expect(chat.connected()).toBe(true);

    cbs.close!(1000, "normal");
    expect(chat.connected()).toBe(false);
    dispose();
  });

  it("fetchMoreHistory sends fetch_history and sets loadingHistory", async () => {
    const { chat, cbs, sub, dispose } = await setupChat({ autoOpen: false });

    // Simulate sub ready state matching real _triggerOpen behavior
    sub.ready = true;
    cbs.open!();
    vi.clearAllMocks();

    chat.fetchMoreHistory("m1", 20);
    expect(chat.loadingHistory()).toBe(true);
    expect(sub.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "fetch_history", beforeId: "m1", limit: 20 }),
    );
    dispose();
  });

  it("does not send empty message", async () => {
    const { chat, sub, dispose } = await setupChat({ autoOpen: false });
    chat.sendMessage("   ");
    expect(chat.messages().length).toBe(0);
    expect(sub.send).not.toHaveBeenCalled();
    dispose();
  });

  it("cleanup closes sub and clears pending", async () => {
    const { chat, sub, dispose } = await setupChat({ autoOpen: false });
    chat.sendMessage("test");
    dispose();
    expect(sub.close).toHaveBeenCalled();
  });
});

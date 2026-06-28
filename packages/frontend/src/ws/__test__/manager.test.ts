// src/ws/__test__/manager.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { ClientConnectionManager } from "../manager"; // 调整为你的路径，如果不在同目录请改

// --- Fake WebSocket ---
class FakeWebSocket {
  static lastInstance: FakeWebSocket | null = null;

  // emulate DOM WebSocket constants
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  public onopen: ((ev?: Event) => void) | null = null;
  public onmessage: ((ev: { data: string }) => void) | null = null;
  public onclose: ((ev?: { code: number; reason?: string }) => void) | null = null;
  public onerror: ((ev?: Event) => void) | null = null;
  public readyState = FakeWebSocket.CONNECTING;
  public sent: string[] = [];
  public url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.lastInstance = this;

    // simulate async open to allow manager to set handlers first
    setTimeout(() => {
      this.readyState = FakeWebSocket.OPEN;
      if (this.onopen) this.onopen();
    }, 0);
  }

  send(data: unknown) {
    // store as string to mimic browser WS behavior (string frames)
    try {
      this.sent.push(typeof data === "string" ? data : JSON.stringify(data));
    } catch {
      // fallback
      this.sent.push(String(data));
    }
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code: 1000, reason: "closed" });
  }

  // helper: simulate incoming server message object (will be stringified)
  _emitObj(obj: unknown) {
    const raw = typeof obj === "string" ? obj : JSON.stringify(obj);
    if (this.onmessage) this.onmessage({ data: raw });
  }
}

beforeEach(() => {
  (globalThis as { WebSocket: new (...args: string[]) => void }).WebSocket = FakeWebSocket as unknown as new (...args: string[]) => void;
});

describe("ClientConnectionManager basic flows (fake ws)", () => {
  it("receives connection_ack and stores connectionId", async () => {
    const manager = new ClientConnectionManager("ws://localhost/ws");
    manager.connect(true);

    // wait for FakeWebSocket creation + open tick
    await new Promise((r) => setTimeout(r, 5));
    const ws = FakeWebSocket.lastInstance!;
    expect(ws).toBeTruthy();

    // simulate server sends connection_ack
    ws._emitObj({ type: "connection_ack", payload: { connectionId: "conn-abc" } });
    // small wait to allow internal processing
    await new Promise((r) => setTimeout(r, 1));
    expect(manager.connectionId).toBe("conn-abc");
  });

  it("opens domain and routes server 'open' -> onOpen callback", async () => {
    const manager = new ClientConnectionManager("ws://localhost/ws");
    manager.connect(true);
    await new Promise((r) => setTimeout(r, 5));
    const ws = FakeWebSocket.lastInstance!;

    // create sub and register onOpen
    const sub = manager.getOrCreateSub("game");

    let opened = false;
    sub.onOpen(() => {
      opened = true;
    });

    // request server to open domain (client side will send open request)
    manager.openDomain("game", {});

    // check client sent an open request to server
    await new Promise((r) => setTimeout(r, 5));
    expect(ws.sent.length).toBeGreaterThan(0);
    const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(lastSent).toMatchObject({ domain: "game", type: "open" });

    // now simulate server informs client that domain opened:
    ws._emitObj({ domain: "game", type: "open", payload: { userid: "userX" } });
    await new Promise((r) => setTimeout(r, 1));
    expect(opened).toBe(true);
  });

  it("routes server 'message' to sub.onMessage and client send produces JSON message", async () => {
    const manager = new ClientConnectionManager("ws://localhost/ws");
    manager.connect(true);
    await new Promise((r) => setTimeout(r, 5));
    const ws = FakeWebSocket.lastInstance!;

    const sub = manager.getOrCreateSub<{ action: string }, { event: string }>("lobby");
    let recv: unknown = null;
    sub.onMessage((p) => {
      recv = p;
    });

    // simulate server opening domain first
    ws._emitObj({ domain: "lobby", type: "open", payload: { userid: "u" } });
    await new Promise((r) => setTimeout(r, 1));
    expect(sub.ready).toBe(true);

    // simulate server sending a message
    ws._emitObj({ domain: "lobby", type: "message", payload: { event: "started" } });
    await new Promise((r) => setTimeout(r, 1));
    expect(recv).toEqual({ event: "started" });

    // test client send (SubConnectorClient.send)
    sub.send({ action: "join" });
    await new Promise((r) => setTimeout(r, 5));
    const sent = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(sent).toEqual({ domain: "lobby", type: "message", payload: { action: "join" } });
  });

  it("close via sub.close sends close message", async () => {
    const manager = new ClientConnectionManager("ws://localhost/ws");
    manager.connect(true);
    await new Promise((r) => setTimeout(r, 5));
    const ws = FakeWebSocket.lastInstance!;

    const sub = manager.getOrCreateSub("room");
    // simulate server open
    ws._emitObj({ domain: "room", type: "open", payload: { userid: "u" } });
    await new Promise((r) => setTimeout(r, 1));
    expect(sub.ready).toBe(true);

    // call sub.close() -> should send close message out
    sub.close(4000, "bye");
    await new Promise((r) => setTimeout(r, 5));
    const last = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(last).toEqual({ domain: "room", type: "close", payload: { code: 4000, reason: "bye" } });
  });
});

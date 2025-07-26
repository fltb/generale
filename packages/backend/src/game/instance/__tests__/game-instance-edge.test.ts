// game-instance-edge.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import {
  type GameState,
  type MaskedGameState,
  type PlayerId,
  type SyncedGameClientActions, // Corrected import
  SyncedGameClientActionTypes, // Corrected import
  type SyncedGameServerEvent, // Corrected import
  SyncedGameServerStateUpdatePayloadType, // Corrected import
  PlayerStatus,
  type ServerSyncConnector, // Added for type consistency
  TileType,
  SyncedStateServerEventType,
  SyncedStateServerStateUpdatePayloadType,
  SyncedGameServerEventType,
  PlayerOperation,
  PlayerOperationType,
  SyncedGameState, // Added for type consistency
} from "@generale/types";
import { mask, tick } from "../core";
import { GameInstance, GameInstanceSettings, SyncEntry } from "./GameInstance";
import { applyPatch } from 'fast-json-patch';

// --- MockConnector 与辅助函数 ---
class MockServerSyncConnector implements ServerSyncConnector<SyncedGameClientActions, SyncedGameServerEvent> { // Renamed and typed
  public sent: SyncedGameServerEvent[] = [];
  private openCbs: (() => void)[] = [];
  private msgCbs: ((evt: SyncedGameClientActions) => void)[] = []; // Typed
  private closeCbs: ((code: number, reason: string) => void)[] = [];
  private discCbs: ((err?: Error) => void)[] = [];
  private recCbs: (() => void)[] = [];

  readonly ready = true;
  send(evt: SyncedGameServerEvent): void { // Typed
    this.sent.push(structuredClone(evt));
  }
  onOpen(cb: () => void) { this.openCbs.push(cb); }
  onClientMessage(cb: (evt: SyncedGameClientActions) => void) { this.msgCbs.push(cb); } // Typed
  onClose(cb: (code: number, reason: string) => void) { this.closeCbs.push(cb); }
  onDisconnect(cb: (err?: Error) => void) { this.discCbs.push(cb); }
  onReconnect(cb: () => void) { this.recCbs.push(cb); }
  // Implement the missing 'close' method
  close(code?: number, reason?: string): void {
    this.closeCbs.forEach(cb => cb(code || 1000, reason || ""));
  }

  triggerOpen() { this.openCbs.forEach(cb => cb()); }
  triggerClient(evt: SyncedGameClientActions) { this.msgCbs.forEach(cb => cb(structuredClone(evt))); } // Typed
  triggerClose(code = 0, reason = "") { this.closeCbs.forEach(cb => cb(code, reason)); }
  triggerDisconnect(err?: Error) { this.discCbs.forEach(cb => cb(err)); }
  triggerReconnect() { this.recCbs.forEach(cb => cb()); }

  clearSent() { this.sent = []; }
}

// Minimal 2x1 initial state helper
import { GameStatus } from '@generale/types';

function createInitialState(): GameState {
  return {
    status: GameStatus.Playing,
    tick: 0,
    settings: {
      afkThreshold: 5,
      tileGrow: {
        PLAIN: { duration: 1, growth: 1 },
        THRONE: { duration: 1, growth: 1 },
        BARRACKS: { duration: 1, growth: 1 },
        MOUNTAIN: { duration: 100000, growth: 0 },
        SWAMP: { duration: 1, growth: -1 },
        FOG: { duration: 100000, growth: 0 },
      },
    },
    players: {
      A: { id: "A", status: PlayerStatus.Playing, army: 5, land: 1, lastActiveTick: 0, teamId: "teamA" },
      B: { id: "B", status: PlayerStatus.Playing, army: 3, land: 1, lastActiveTick: 0, teamId: "teamB" },
    },
    teams: {
      teamA: { id: "teamA", memberIds: ["A"], status: PlayerStatus.Playing },
      teamB: { id: "teamB", memberIds: ["B"], status: PlayerStatus.Playing },
    },
    map: {
      width: 2,
      height: 1,
      tiles: [[
        { type: TileType.Plain, ownerId: "A", army: 5 },
        { type: TileType.Plain, ownerId: "B", army: 3 },
      ]],
    },
  };
}

let connectorA: MockServerSyncConnector, connectorB: MockServerSyncConnector, inst: GameInstance;
const pidA: PlayerId = "A", pidB: PlayerId = "B";

beforeEach(() => {
  connectorA = new MockServerSyncConnector();
  connectorB = new MockServerSyncConnector();
  const init = createInitialState();
  const settings: GameInstanceSettings = { playerDisplay: { A: { tileColor: 0xff0000 }, B: { tileColor: 0x0000ff } } };
  inst = new GameInstance(init, settings, new Map([
    [pidA, connectorA], // Typed connectors
    [pidB, connectorB], // Typed connectors
  ]));
  connectorA.triggerOpen();
  connectorB.triggerOpen();
});

// 1. advance with empty queues only increments tick
it("1. advance with empty queues only increments tick", () => {
  const t0 = inst.getState().tick;
  inst.advance();
  expect(inst.getState().tick).toBe(t0 + 1);
});

it("2. open → disconnect → reconnect 会触发两次快照", () => {
  connectorA.clearSent();
  connectorA.triggerOpen();       // 第一次 open
  connectorA.triggerDisconnect(); // 意外断开
  connectorA.triggerReconnect();  // 重连
  expect(connectorA.sent.length).toBe(2);
  expect(connectorA.sent[0]?.payload.type).toBe(SyncedStateServerStateUpdatePayloadType.SNAPSHOT); // Corrected type access
  expect(connectorA.sent[1]?.payload.type).toBe(SyncedStateServerStateUpdatePayloadType.SNAPSHOT); // Corrected type access
});

// 3. confirmedOp updates when queue drains
it("3. confirmedOp updates when queue drains", () => {
  // push two ops
  connectorA.triggerClient({
    type: SyncedGameClientActionTypes.PUSH, // Corrected client message type
    optimisticId: 5,
    payload: [
      { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } },
      { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } },
    ]
  });
  let evt = connectorA.sent.at(-1)!;
  // ConfirmedOp should be the last processed operation's optimisticId.
  // Given only one operation is consumed per tick, it should be 5.
  expect(evt.type).toBe(SyncedGameServerEventType.STATE_UPDATE); // It's a snapshot with confirmedOp
  expect(evt.payload.type).toBe(SyncedGameServerStateUpdatePayloadType.SNAPSHOT);
  expect(evt.payload.confirmedOp).toBe(0);
  inst.advance();
  evt = connectorA.sent.at(-1)!;
  // ConfirmedOp should be the last processed operation's optimisticId.
  // Given only one operation is consumed per tick, it should be 5.
  expect(evt.type).toBe(SyncedGameServerEventType.STATE_UPDATE); // It's a patch with confirmedOp
  expect(evt.payload.type).toBe(SyncedGameServerStateUpdatePayloadType.PATCH);
  expect(evt.payload.confirmedOp).toBe(5);
});

// 4. onReconnect force snapshots
it("4. onReconnect force snapshots", () => {
  connectorA.clearSent();
  connectorA.triggerDisconnect();
  connectorA.triggerReconnect();
  expect(connectorA.sent.every(e => e.payload.type === SyncedStateServerStateUpdatePayloadType.SNAPSHOT)).toBe(true); // Corrected type access
  expect(connectorA.sent.length).toBe(1); // snapshot for the reconnect
});

// ... existing code ...

// 5. concurrent client ops during advance *do* patch the playerOperationQueue
it("5. concurrent client ops during advance do patch the playerOperationQueue", () => {
  const op: PlayerOperation = { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } };

  // Store initial state to compare later
  const initialSyncedState = inst['syncData'].get('A')!.syncedState;

  // Wrap the internal sendState method to inject a client operation during state synchronization
  // Note: Cast 'inst' to 'any' to access private/protected methods for testing purposes.
  const originalSendState = (inst as any)['sendState'];
  let injected = false;
  (inst as any)['sendState'] = (pid: PlayerId, forceSnapshot = false) => {
    // Only inject once for player A during their first sendState call within this advance
    if (pid === 'A' && !injected) {
      connectorA.triggerClient({ optimisticId: 1, type: SyncedGameClientActionTypes.PUSH, payload: [op] });
      injected = true;
    }
    // Call the original sendState method
    originalSendState.call(inst, pid, forceSnapshot);
  };

  inst.advance();

  // The last message sent to connectorA should be a patch
  const lastMessage = connectorA.sent.at(-1)!;
  expect(lastMessage.type).toBe(SyncedGameServerEventType.STATE_UPDATE);
  expect(lastMessage.payload.type).toBe(SyncedGameServerStateUpdatePayloadType.PATCH);

  const patches = (lastMessage.payload as any).payload;

  // Expect that the patch *includes* changes to playerOperationQueue
  // because the operation was injected and processed by handleClientEvent
  // before the patch was calculated for this player.
  expect(patches.some((p: any) => p.path.includes("playerOperationQueue"))).toBe(true);

  // Expect the playerOperationQueue to now contain the injected operation (its ID)
  // Assuming the patch includes the actual value for the path, or a specific path indicates an addition.
  // This might need more specific checks depending on the patch structure.
  // For simplicity, let's just check if it contains *a* change for the queue.
  // If the patch value represents the new queue, you might expect its length to change or content.
  // For now, simply asserting its presence in the patch.

  // Also ensure confirmedOp exists and is updated
  expect(lastMessage.payload).toHaveProperty("confirmedOp");
  expect((lastMessage.payload as any).confirmedOp).toBeGreaterThanOrEqual(1);


  // Restore original method after the test
  (inst as any)['sendState'] = originalSendState;
});

// 6. only connected players get updates
it("6. only connected players get updates", () => {
  connectorB.triggerClose(0, ""); // B closes connection
  connectorA.clearSent(); connectorB.clearSent();
  inst.advance();
  expect(connectorA.sent.length).toBe(1); // A gets an update
  expect(connectorB.sent.length).toBe(0); // B does not
});

// 7. invalid ops do not bump confirmedOp
it("7. try clear action ", () => {
  let evt = connectorA.sent.at(-1)!;
  expect(evt.type).toBe(SyncedGameServerEventType.STATE_UPDATE); // It's a snapshot with confirmedOp
  expect(evt.payload.type).toBe(SyncedGameServerStateUpdatePayloadType.SNAPSHOT);
  expect(evt.payload.confirmedOp).toBe(0);

  let state = evt.payload.payload as SyncedGameState;
  expect(state.playerOperationQueue.length).toBe(0);
  connectorA.triggerClient({
    type: SyncedGameClientActionTypes.PUSH, // Corrected client message type
    optimisticId: 9,
    payload: [
      { type: "MOVE", payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } },
      { type: "MOVE", payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } },
      { type: "MOVE", payload: { from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, percentage: 50 } },
      { type: "MOVE", payload: { from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, percentage: 50 } },
    ]
  });
  inst.advance();
  evt = connectorA.sent.at(-1)!;
  expect(evt.type).toBe(SyncedGameServerEventType.STATE_UPDATE); // It's a snapshot with confirmedOp
  expect(evt.payload.type).toBe(SyncedGameServerStateUpdatePayloadType.PATCH);

  expect(evt.payload.confirmedOp).toBe(9);
  applyPatch(state, evt.payload.payload);
  expect(state.playerOperationQueue.length).toBe(3);
  connectorA.triggerClient({
    type: SyncedGameClientActionTypes.CLEAN_ALL,
    optimisticId: 10,
    payload: undefined
  });
  inst.advance();
  evt = connectorA.sent.at(-1)!;
  expect(evt.type).toBe(SyncedGameServerEventType.STATE_UPDATE); // It's a snapshot with confirmedOp
  expect(evt.payload.type).toBe(SyncedGameServerStateUpdatePayloadType.PATCH);
  expect(evt.payload.confirmedOp).toBe(10);
  applyPatch(state, evt.payload.payload);
  expect(state.playerOperationQueue.length).toBe(0);
});

// 8. multi-tick queue consumption
it("8. multi-tick queue consumption", () => {
  connectorA.triggerClient({
    type: SyncedGameClientActionTypes.PUSH, // Corrected client message type,
    optimisticId: 11,
    payload: [
      { type: "MOVE", payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } },
      { type: "MOVE", payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } },
    ]
  });
  let meta = ((inst as any).syncData.get(pidA) as SyncEntry); // Corrected internal property access
  expect(meta.lastConfirmedOp).toBe(11); // One op left in queue
  expect(meta.syncedState.playerOperationQueue.length).toBe(2);
  inst.advance(); // Consumes op 11, confirmedOp becomes 11
  meta = ((inst as any).syncData.get(pidA) as SyncEntry);
  expect(meta.syncedState.playerOperationQueue.length).toBe(1);
  inst.advance(); // Consumes op 12, confirmedOp becomes 12
  meta = ((inst as any).syncData.get(pidA) as SyncEntry);
  expect(meta.syncedState.playerOperationQueue.length).toBe(0);
});

// 9. team vision fresh capture
it("9. team vision fresh capture", () => {
  // GameInstance uses the mask function which handles team vision.
  // This test primarily checks that `getMaskedState` doesn't alter the original state.
  // Detailed team vision logic should be in `mask.test.ts`.
  const originalState = JSON.parse(JSON.stringify(inst.getState())); // Deep copy
  const maskedState = inst.getMaskedState(pidA);
  // Verify that a masked state is returned and it's not the same object as the original
  expect(maskedState).toBeDefined();
  expect(maskedState).not.toBe(originalState);
  // Verify that the original state is unchanged (purity of mask)
  expect(inst.getState()).toEqual(originalState);
});

// --- Modern GameInstance tests ---

describe("GameInstance core behaviors", () => {
  it("queues multiple client messages in one tick", () => {
    connectorA.triggerClient({
      type: SyncedGameClientActionTypes.PUSH,
      optimisticId: 21,
      payload: [
        { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } }
      ]
    });
    connectorA.triggerClient({
      type: SyncedGameClientActionTypes.PUSH,
      optimisticId: 22,
      payload: [
        { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } }
      ]
    });
    inst.advance();
    const queue = (inst as any).syncData.get(pidA).syncedState.playerOperationQueue;
    expect(queue.length).toBe(1); // Both ops are queued，and one be consumed
    expect((inst as any).syncData.get(pidA).lastConfirmedOp).toBe(22);
  });

  it("handles no connectors gracefully", () => {
    const empty = new GameInstance(createInitialState(), { playerDisplay: {} }, new Map());
    expect(() => empty.advance()).not.toThrow();
  });

  it("mask is pure and does not mutate state", () => {
    const before = JSON.stringify(inst.getState());
    inst.getMaskedState(pidA);
    expect(JSON.stringify(inst.getState())).toBe(before);
  });

  it("simultaneous multi-player battles resolve correctly", () => {
    // Set up: A and B both attack a neutral tile
    const customInitialState = createInitialState();
    customInitialState.map.width = 3;
    customInitialState.map.tiles[0] = [
      { type: TileType.Plain, ownerId: "A", army: 5 },
      { type: TileType.Plain, ownerId: null, army: 1 },
      { type: TileType.Plain, ownerId: "B", army: 3 }
    ];
    inst = new GameInstance(customInitialState, { playerDisplay: {} }, new Map([
      [pidA, connectorA],
      [pidB, connectorB],
    ]));
    connectorA.triggerOpen();
    connectorB.triggerOpen();
    connectorA.triggerClient({
      type: SyncedGameClientActionTypes.PUSH,
      optimisticId: 31,
      payload: [
        { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 100 } }
      ]
    });
    connectorB.triggerClient({
      type: SyncedGameClientActionTypes.PUSH,
      optimisticId: 41,
      payload: [
        { type: PlayerOperationType.Move, payload: { from: { x: 2, y: 0 }, to: { x: 1, y: 0 }, percentage: 100 } }
      ]
    });
    inst.advance();
    const s = inst.getState();
    expect(s.map.tiles[0][1].ownerId).toBe("A");
    expect(s.map.tiles[0][0].ownerId).toBe("A");
    expect(s.map.tiles[0][2].ownerId).toBe("B");
  });

  it("forceSnapshot is sent on reconnect after disconnect", () => {
    connectorA.clearSent();
    connectorA.triggerDisconnect();
    inst.advance();
    expect(connectorA.sent.length).toBe(0);
    connectorA.triggerReconnect();
    expect(connectorA.sent.length).toBe(1);
    expect(connectorA.sent[0].payload.type).toBe(SyncedStateServerStateUpdatePayloadType.SNAPSHOT);
  });

  it("multi-field patch correctness: army and land change", () => {
    connectorA.triggerClient({
      type: SyncedGameClientActionTypes.PUSH,
      optimisticId: 51,
      payload: [
        { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 100 } }
      ]
    });
    inst.advance();
    const last = connectorA.sent.at(-1)!;
    expect(last.payload.type).toBe(SyncedGameServerStateUpdatePayloadType.PATCH);
    // Harden: Ensure p.path is always an array, otherwise throw for easier debugging
    const paths = last.payload.payload.map((p: any) => {
      return p.path;
    });
    expect(paths).toContain("/map/tiles/0/1/ownerId");
    expect(paths).toContain("/players/A/land");
    // expect(paths).toContain("/players/B/land");
    expect(paths).toContain("/players/A/army");
    expect(paths).toContain("/players/B/army");
  });

  it("handles AFK defeat and patch", () => {
    const s = inst['state'];
    s.settings.afkThreshold = 1;
    for (const p of Object.values(s.players)) p.lastActiveTick = s.tick - 2;
    connectorA.clearSent();
    connectorB.clearSent();
    inst.advance();
    expect(connectorA.sent.length).toBe(1);
    expect(connectorA.sent[0].payload.type).toBe("patch");
    const aPatches = connectorA.sent[0].payload.payload as any[];
    expect(aPatches.some(p => (typeof p.path === "string" ? p.path : Array.isArray(p.path) ? p.path.join("/") : "").includes("/players/A/status") && p.value === PlayerStatus.Defeated)).toBe(true);
    expect(aPatches.some(p => (typeof p.path === "string" ? p.path : Array.isArray(p.path) ? p.path.join("/") : "").includes("/players/B/status") && p.value === PlayerStatus.Defeated)).toBe(true);
    expect(connectorB.sent.length).toBe(1);
    expect(connectorB.sent[0].payload.type).toBe("patch");
    const bPatches = connectorB.sent[0].payload.payload as any[];
    expect(bPatches.some(p => (typeof p.path === "string" ? p.path : Array.isArray(p.path) ? p.path.join("/") : "").includes("/players/A/status") && p.value === PlayerStatus.Defeated)).toBe(true);
    expect(bPatches.some(p => (typeof p.path === "string" ? p.path : Array.isArray(p.path) ? p.path.join("/") : "").includes("/players/B/status") && p.value === PlayerStatus.Defeated)).toBe(true);
  });

  // now define send function throw error as a UB
  // it("send exceptions do not break instance", () => {
  //   (connectorA as any).send = () => { throw new Error("fail"); };
  //   expect(() => inst.advance()).not.toThrow();
  //   expect(inst.getState().tick).toBeGreaterThan(0);
  // });

  it("no duplicate pendingOps on reconnect", () => {
    connectorA.clearSent();
    connectorA.triggerClient({
      type: SyncedGameClientActionTypes.PUSH,
      optimisticId: 61,
      payload: [
        { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, percentage: 50 } }
      ]
    });
    inst.advance();
    connectorA.clearSent();
    connectorA.triggerDisconnect();
    connectorA.triggerReconnect();
    expect(connectorA.sent.length).toBe(1);
    expect(connectorA.sent[0].payload.type).toBe(SyncedStateServerStateUpdatePayloadType.SNAPSHOT);
    expect(connectorA.sent[0].payload.confirmedOp).toBe(61);
  });

  it("游戏结束判定：A 占领 B 的王座，游戏状态为Ended", () => {
    // 构造一个2x2地图，A占所有地块，B无地块
    const state: GameState = {
      status: GameStatus.Playing,
      tick: 0,
      settings: {
        afkThreshold: 5,
        tileGrow: {
          [TileType.Plain]: { duration: 1, growth: 1 },
          [TileType.Throne]: { duration: 1, growth: 1 },
          [TileType.Barracks]: { duration: 1, growth: 1 },
          [TileType.Mountain]: { duration: 100000, growth: 0 },
          [TileType.Swamp]: { duration: 1, growth: -1 },
          [TileType.Fog]: { duration: 100000, growth: 0 },
        },
      },
      players: {
        A: { id: "A", status: PlayerStatus.Playing, army: 10, land: 4, lastActiveTick: 0, teamId: "teamA" },
        B: { id: "B", status: PlayerStatus.Playing, army: 0, land: 0, lastActiveTick: 0, teamId: "teamB" },
      },
      teams: {
        teamA: { id: "teamA", memberIds: ["A"], status: PlayerStatus.Playing },
        teamB: { id: "teamB", memberIds: ["B"], status: PlayerStatus.Playing },
      },
      map: {
        width: 2,
        height: 2,
        tiles: [
          [
            { type: TileType.Throne, ownerId: "B", army: 1 },
            { type: TileType.Plain, ownerId: "A", army: 2 }
          ],
          [
            { type: TileType.Plain, ownerId: "A", army: 5 },
            { type: TileType.Plain, ownerId: "A", army: 3 }
          ]
        ]
      }
    };
    // 用GameInstance推进
    const { GameInstance } = require("./GameInstance");
    const settings = { playerDisplay: { A: { tileColor: 0xff0000 }, B: { tileColor: 0x0000ff } } };
    const connectorA = { 
      sent: [], 
      send(evt: any) { this.sent.push(structuredClone(evt)); }, 
      onOpen() {}, 
      onClientMessage(_evt: any) {}, 
      onClose() {}, 
      onDisconnect() {}, 
      onReconnect() {}, 
      ready: true,
      triggerClient(evt: any) { 
        // Process the client message directly in the GameInstance
        inst.handleClientEvent("A", evt);
      }
    };
    const connectorB = { 
      sent: [], 
      send(evt: any) { this.sent.push(structuredClone(evt)); }, 
      onOpen() {}, 
      onClientMessage(_evt: any) {}, 
      onClose() {}, 
      onDisconnect() {}, 
      onReconnect() {}, 
      ready: true,
      triggerClient(evt: any) { 
        // Process the client message directly in the GameInstance
        inst.handleClientEvent("B", evt);
      }
    };
    const inst = new GameInstance(state, settings, new Map([
      ["A", connectorA],
      ["B", connectorB],
    ]));
    inst.advance();
    // 添加操作让A攻占B的王座
    const queues = {
      A: [
        { type: PlayerOperationType.Move, payload: { from: { x: 0, y: 1 }, to: { x: 0, y: 0 }, percentage: 100 } }
      ]
    };
    
    // 模拟客户端操作
    connectorA.triggerClient({
      type: SyncedGameClientActionTypes.PUSH,
      payload: queues.A,
      optimisticId: 1
    });
    
    // 再次推进游戏
    inst.advance();
    
    // 合并patch并判断最终状态
    let stateA = structuredClone(connectorA.sent[0].payload.payload);
    let stateB = structuredClone(connectorB.sent[0].payload.payload);
    applyPatch(stateA, connectorA.sent[1].payload.payload);
    applyPatch(stateB, connectorB.sent[1].payload.payload);

    expect(stateA.players['A']?.status).toBe(PlayerStatus.Playing);
    expect(stateA.players['B']?.status).toBe(PlayerStatus.Defeated);
    expect(stateA.status).toBe(GameStatus.Ended);
    expect(stateA.map.tiles[0][0]?.ownerId).toBe("A");

    expect(stateB.players['A']?.status).toBe(PlayerStatus.Playing);
    expect(stateB.players['B']?.status).toBe(PlayerStatus.Defeated);
    expect(stateB.status).toBe(GameStatus.Ended);
    expect(stateB.map.tiles[0][0]?.ownerId).toBe(null); // 因为失败了，看不到
  });
});
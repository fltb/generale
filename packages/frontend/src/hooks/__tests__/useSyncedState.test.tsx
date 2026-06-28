import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { SyncedStateServerEventType, SyncedStateServerStateUpdatePayloadType } from "@generale/types";

vi.mock("~/hooks/useWebsocket", () => ({
  useWS: vi.fn(),
}));

import { useWS } from "~/hooks/useWebsocket";
import { useSyncedState } from "../useSyncedState";

type TestAction = { readonly optimisticId: number; readonly type: string; payload: number };

function applyEvent(state: { value: number }, action: TestAction): { value: number } {
  if (action.type === "SET") return { ...state, value: action.payload };
  return state;
}

function createMockManager() {
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

function TestHarness(props: { domain?: string; autoOpen?: boolean }) {
  const state = useSyncedState<{ value: number }, TestAction, unknown>({
    domain: props.domain ?? "test",
    initialState: { value: 0 },
    applyEvent,
    autoOpen: props.autoOpen ?? false,
  });

  return (
    <div>
      <div data-testid="state">{JSON.stringify(state.state())}</div>
      <div data-testid="ready">{String(state.isReady())}</div>
      <button
        data-testid="dispatch"
        onClick={() => state.dispatch({ type: "SET", payload: 42 }) as any}
      />
      <button data-testid="connect" onClick={() => state.connect()} />
      <button data-testid="disconnect" onClick={() => state.disconnect()} />
    </div>
  );
}

describe("useSyncedState", () => {
  let mockSub: ReturnType<typeof createMockManager>["sub"];
  let mockCbs: Record<string, Function>;
  let mockManager: ReturnType<typeof createMockManager>["manager"];

  beforeEach(() => {
    vi.clearAllMocks();
    const mgr = createMockManager();
    mockSub = mgr.sub;
    mockCbs = mgr.cbs;
    mockManager = mgr.manager;
    vi.mocked(useWS).mockReturnValue(mockManager as any);
  });

  it("returns initial merged state", () => {
    render(() => <TestHarness />);
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      value: 0,
    });
  });

  it("dispatch updates state optimistically and sends to server when sub is ready", () => {
    render(() => <TestHarness />);

    // Simulate sub becoming ready so _sendOrBuffer sends instead of buffers
    mockSub.ready = true;
    mockCbs.open?.(); // triggers hook's internal onOpen which sets up state

    fireEvent.click(screen.getByTestId("dispatch"));
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      value: 42,
    });
    expect(mockSub.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET", payload: 42 }),
    );
  });

  it("disconnect sets ready false", () => {
    render(() => <TestHarness />);
    expect(screen.getByTestId("ready").textContent).toBe("false");
  });

  it("handles STATE_UPDATE snapshot clearing pending event", () => {
    render(() => <TestHarness />);

    mockSub.ready = true;
    mockCbs.open?.();
    fireEvent.click(screen.getByTestId("dispatch"));

    // Server sends state-update with confirmedOp=9999 (clears all events)
    mockCbs.message!({
      type: SyncedStateServerEventType.STATE_UPDATE,
      payload: {
        type: SyncedStateServerStateUpdatePayloadType.SNAPSHOT,
        version: 1,
        confirmedOp: 9999,
        payload: { value: 200 },
      },
    });

    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      value: 200,
    });
  });

  it("keeps unconfirmed events after partial confirmedOp", () => {
    render(() => <TestHarness />);

    mockSub.ready = true;
    mockCbs.open?.();
    fireEvent.click(screen.getByTestId("dispatch")); // event id=1, payload=42

    // confirmedOp=0 keeps event 1, merged = snapshot + event 1
    mockCbs.message!({
      type: SyncedStateServerEventType.STATE_UPDATE,
      payload: {
        type: SyncedStateServerStateUpdatePayloadType.SNAPSHOT,
        version: 1,
        confirmedOp: 0,
        payload: { value: 100 },
      },
    });

    // Base = { value: 100 }, queue = [event 1(SET 42)]
    // Merged = applyEvent({ value: 100 }, SET 42) = { value: 42 }
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      value: 42,
    });
  });
});

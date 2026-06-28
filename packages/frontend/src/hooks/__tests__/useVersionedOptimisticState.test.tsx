import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";

import { useVersionedOptimisticState } from "../useVersionedOptimisticState";
import { SyncedStateServerStateUpdatePayloadType } from "@generale/types";

type TestAction = { readonly optimisticId: number; readonly type: string; payload: number };

function applyEvent(s: { value: number }, a: TestAction): { value: number } {
  if (a.type === "SET") return { ...s, value: a.payload };
  return s;
}

function Harness(props: { init: { value: number } }) {
  const state = useVersionedOptimisticState(props.init, 0, applyEvent);
  return (
    <div>
      <div data-testid="state">{JSON.stringify(state.mergedState())}</div>
      <div data-testid="version">{state.version()}</div>
      <div data-testid="pending">{JSON.stringify(state.getPendingEvents())}</div>
      <button
        data-testid="dispatch"
        onClick={() => state.dispatchOptimisticEvent({ type: "SET", payload: 42 })}
      />
      <button
        data-testid="dispatch-99"
        onClick={() => state.dispatchOptimisticEvent({ type: "SET", payload: 99 })}
      />
      <button
        data-testid="reconcile-snapshot"
        onClick={() =>
          state.reconcileFromServer({
            type: SyncedStateServerStateUpdatePayloadType.SNAPSHOT,
            version: 2,
            confirmedOp: 9999,
            payload: { value: 100 },
          })
        }
      />
      <button
        data-testid="reconcile-patch"
        onClick={() =>
          state.reconcileFromServer({
            type: SyncedStateServerStateUpdatePayloadType.PATCH,
            version: 3,
            confirmedOp: 0,
            payload: [{ op: "replace", path: "/value", value: 200 }],
          })
        }
      />
      <button
        data-testid="reconcile-confirm-all"
        onClick={() =>
          state.reconcileFromServer({
            type: SyncedStateServerStateUpdatePayloadType.SNAPSHOT,
            version: 3,
            confirmedOp: 9999,
            payload: { value: 300 },
          })
        }
      />
    </div>
  );
}

describe("useVersionedOptimisticState", () => {
  it("returns initial state", () => {
    render(() => <Harness init={{ value: 0 }} />);
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      value: 0,
    });
    expect(screen.getByTestId("version").textContent).toBe("0");
  });

  it("applies optimistic event to merged state", () => {
    render(() => <Harness init={{ value: 0 }} />);
    fireEvent.click(screen.getByTestId("dispatch"));
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      value: 42,
    });
  });

  it("maintains pending events list", () => {
    render(() => <Harness init={{ value: 0 }} />);
    fireEvent.click(screen.getByTestId("dispatch"));
    const pending = JSON.parse(screen.getByTestId("pending").textContent!);
    expect(pending.length).toBe(1);
    expect(pending[0].type).toBe("SET");
    expect(pending[0].payload).toBe(42);
  });

  it("reconcileFromServer snapshot + confirmedOp clears event and updates merged state", () => {
    render(() => <Harness init={{ value: 0 }} />);
    fireEvent.click(screen.getByTestId("dispatch"));
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({ value: 42 });

    fireEvent.click(screen.getByTestId("reconcile-snapshot"));
    // confirmedOp=1 cleared event 1, merged state = snapshot base
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({ value: 100 });
    expect(screen.getByTestId("version").textContent).toBe("2");
    expect(JSON.parse(screen.getByTestId("pending").textContent!).length).toBe(0);
  });

  it("reconcileFromServer with confirmedOp removes only confirmed events", () => {
    render(() => <Harness init={{ value: 0 }} />);

    fireEvent.click(screen.getByTestId("dispatch"));
    fireEvent.click(screen.getByTestId("dispatch-99"));
    expect(JSON.parse(screen.getByTestId("pending").textContent!).length).toBe(2);
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({ value: 99 });

    fireEvent.click(screen.getByTestId("reconcile-confirm-all"));
    // confirmedOp=9999 removes all pending events, merged = { value: 300 }
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({ value: 300 });
    expect(JSON.parse(screen.getByTestId("pending").textContent!).length).toBe(0);
    expect(screen.getByTestId("version").textContent).toBe("3");
  });

  it("reconcileFromServer patch applies changes while keeping unconfirmed events", () => {
    render(() => <Harness init={{ value: 0 }} />);
    fireEvent.click(screen.getByTestId("dispatch"));

    fireEvent.click(screen.getByTestId("reconcile-patch"));
    // confirmedOp=0 keeps all events, patch changes value to 200, then events re-applied
    // merged = applyEvent({ value: 200 }, SET(42)) = { value: 42 }
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({ value: 42 });
    expect(screen.getByTestId("version").textContent).toBe("3");
  });
});

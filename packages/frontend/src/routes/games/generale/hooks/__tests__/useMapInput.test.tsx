import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { useMapInput } from "~/routes/games/generale/hooks/render/useMapInput";
import { PlayerOperationType } from "@generale/types";

function makeMap(width = 10, height = 10) {
  const tiles = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "PLAIN", ownerId: null, army: 0 } as any)),
  );
  return { width, height, tiles } as any;
}

function makeMapWithThrone(throneX: number, throneY: number, ownerId: string, width = 10, height = 10) {
  const tiles = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: "PLAIN", ownerId: null, army: 0 } as any)),
  );
  if (tiles[throneY] && tiles[throneY][throneX]) {
    tiles[throneY][throneX] = { type: "THRONE", ownerId, army: 1 };
  }
  return { width, height, tiles } as any;
}

describe("useMapInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("active starts null", () => {
    let result: ReturnType<typeof useMapInput>;
    createRoot(() => {
      result = useMapInput({
        map: () => makeMap(),
        selfId: () => undefined,
      });
    });

    expect(result!.active()).toBeNull();
  });

  it("handleTileClick sets active cursor", () => {
    let result: ReturnType<typeof useMapInput>;
    createRoot(() => {
      result = useMapInput({
        map: () => makeMap(),
        selfId: () => undefined,
      });
    });

    result!.handleTileClick({ x: 3, y: 4 });
    expect(result!.active()).toEqual({ x: 3, y: 4 });
  });

  it("handleTileClick toggles off when clicking same coordinate", () => {
    let result: ReturnType<typeof useMapInput>;
    createRoot(() => {
      result = useMapInput({
        map: () => makeMap(),
        selfId: () => undefined,
      });
    });

    result!.handleTileClick({ x: 3, y: 4 });
    expect(result!.active()).toEqual({ x: 3, y: 4 });

    result!.handleTileClick({ x: 3, y: 4 });
    expect(result!.active()).toBeNull();
  });

  it("handleTileClick switches to new coordinate when different", () => {
    let result: ReturnType<typeof useMapInput>;
    createRoot(() => {
      result = useMapInput({
        map: () => makeMap(),
        selfId: () => undefined,
      });
    });

    result!.handleTileClick({ x: 1, y: 1 });
    result!.handleTileClick({ x: 5, y: 5 });
    expect(result!.active()).toEqual({ x: 5, y: 5 });
  });

  it("setActive works", () => {
    let result: ReturnType<typeof useMapInput>;
    createRoot(() => {
      result = useMapInput({
        map: () => makeMap(),
        selfId: () => undefined,
      });
    });

    result!.setActive({ x: 7, y: 3 });
    expect(result!.active()).toEqual({ x: 7, y: 3 });
  });

  it("arrow key dispatches move operation when cursor is active", () => {
    const onOperationQueued = vi.fn();
    let result: ReturnType<typeof useMapInput>;
    const map = makeMap(10, 10);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => undefined,
        onOperationQueued,
      });
    });

    result!.setActive({ x: 2, y: 2 });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));

    expect(onOperationQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PlayerOperationType.Move,
        payload: expect.objectContaining({
          from: { x: 2, y: 2 },
          to: { x: 3, y: 2 },
          percentage: 100,
        }),
      }),
    );
  });

  it("arrow key updates active cursor position", () => {
    let result: ReturnType<typeof useMapInput>;
    const map = makeMap(10, 10);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => undefined,
      });
    });

    result!.setActive({ x: 2, y: 2 });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(result!.active()).toEqual({ x: 2, y: 3 });
  });

  it("WASD keys work as arrow keys", () => {
    const onOperationQueued = vi.fn();
    let result: ReturnType<typeof useMapInput>;
    const map = makeMap(10, 10);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => undefined,
        onOperationQueued,
      });
    });

    result!.setActive({ x: 3, y: 3 });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
    expect(onOperationQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          from: { x: 3, y: 3 },
          to: { x: 3, y: 2 },
        }),
      }),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(onOperationQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          to: { x: 2, y: 2 },
        }),
      }),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s" }));
    expect(onOperationQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          to: { x: 2, y: 3 },
        }),
      }),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }));
    expect(onOperationQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          to: { x: 3, y: 3 },
        }),
      }),
    );
  });

  it("c key calls onClearQueue", () => {
    const onClearQueue = vi.fn();

    createRoot(() => {
      useMapInput({
        map: () => makeMap(),
        selfId: () => undefined,
        onClearQueue,
      });
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c" }));
    expect(onClearQueue).toHaveBeenCalledTimes(1);
  });

  it("C key also calls onClearQueue", () => {
    const onClearQueue = vi.fn();

    createRoot(() => {
      useMapInput({
        map: () => makeMap(),
        selfId: () => undefined,
        onClearQueue,
      });
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "C" }));
    expect(onClearQueue).toHaveBeenCalledTimes(1);
  });

  it("keyboard events without active cursor are ignored (except c)", () => {
    const onOperationQueued = vi.fn();

    createRoot(() => {
      useMapInput({
        map: () => makeMap(),
        selfId: () => undefined,
        onOperationQueued,
      });
    });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(onOperationQueued).not.toHaveBeenCalled();
  });

  it("arrow key to out-of-bounds tile is ignored", () => {
    const onOperationQueued = vi.fn();
    let result: ReturnType<typeof useMapInput>;
    const map = makeMap(5, 5);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => undefined,
        onOperationQueued,
      });
    });

    result!.setActive({ x: 4, y: 4 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(onOperationQueued).not.toHaveBeenCalled();
    expect(result!.active()).toEqual({ x: 4, y: 4 });
  });

  it("arrow key to out-of-bounds top is ignored", () => {
    const onOperationQueued = vi.fn();
    let result: ReturnType<typeof useMapInput>;
    const map = makeMap(5, 5);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => undefined,
        onOperationQueued,
      });
    });

    result!.setActive({ x: 2, y: 0 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    expect(onOperationQueued).not.toHaveBeenCalled();
    expect(result!.active()).toEqual({ x: 2, y: 0 });
  });

  it("arrow key to out-of-bounds left is ignored", () => {
    const onOperationQueued = vi.fn();
    let result: ReturnType<typeof useMapInput>;
    const map = makeMap(5, 5);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => undefined,
        onOperationQueued,
      });
    });

    result!.setActive({ x: 0, y: 2 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(onOperationQueued).not.toHaveBeenCalled();
    expect(result!.active()).toEqual({ x: 0, y: 2 });
  });

  it("non-directional keys are ignored", () => {
    const onOperationQueued = vi.fn();
    let result: ReturnType<typeof useMapInput>;
    const map = makeMap(10, 10);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => undefined,
        onOperationQueued,
      });
    });

    result!.setActive({ x: 5, y: 5 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onOperationQueued).not.toHaveBeenCalled();
  });

  it("auto-initializes cursor on own throne when available (effect-based)", async () => {
    let result: ReturnType<typeof useMapInput>;
    const map = makeMapWithThrone(4, 3, "p1", 10, 10);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => "p1",
      });
    });

    // The effect runs asynchronously, so we need to wait for microtasks
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(result!.active()).toEqual({ x: 4, y: 3 });
  });

  it("does not auto-initialize for spectator (no selfId)", () => {
    let result: ReturnType<typeof useMapInput>;
    const map = makeMapWithThrone(4, 3, "p1", 10, 10);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => undefined,
      });
    });

    expect(result!.active()).toBeNull();
  });

  it("user interaction overrides auto-initialized cursor", async () => {
    let result: ReturnType<typeof useMapInput>;
    const map = makeMapWithThrone(4, 3, "p1", 10, 10);

    createRoot(() => {
      result = useMapInput({
        map: () => map,
        selfId: () => "p1",
      });
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(result!.active()).toEqual({ x: 4, y: 3 });

    result!.handleTileClick({ x: 1, y: 1 });
    expect(result!.active()).toEqual({ x: 1, y: 1 });
  });
});

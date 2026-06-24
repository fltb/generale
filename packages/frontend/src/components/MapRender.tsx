import { For, Index, createMemo, createSignal, createEffect, onCleanup, onMount, type Component } from "solid-js";
import * as P from "solid-pixi";
import * as PIXI from "pixi.js";

import type { SyncedGameState, Coordinates, PlayerOperation } from "@generale/types";
import { PlayerOperationType, TileType } from "@generale/types";

import { MapTile } from "./MapTile";
import { type FaIconKey, createScaledFaIcon, destroyGcCache } from "~/utils/faIconGraphic";
import { DEFAULT_TILE_THEME, DIRECTION_ICON } from "~/game/render/tileTheme";
import { useMapInput } from "~/game/render/useMapInput";

export interface ViewportApi {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

export interface MapRenderProps {
  state: SyncedGameState;
  onOperationQueued?: (op: PlayerOperation) => void;
  selfId?: string;
  onClearQueue?: () => void;
  onViewportReady?: (api: ViewportApi) => void;
}

type DirectionKey = keyof typeof DIRECTION_ICON;

const OperationArrow: Component<{
  op: PlayerOperation;
  size: number;
  z?: number;
}> = (props) => {
  const [g, setG] = createSignal<PIXI.Graphics | undefined>(undefined);

  createEffect(() => {
    const graphics = g();
    if (!graphics) return;

    if (props.op.type !== PlayerOperationType.Move) {
      graphics.clear();
      try { graphics.removeChildren(); } catch { }
      return;
    }

    const payload = (props.op as any).payload;
    if (!payload) {
      graphics.clear();
      try { graphics.removeChildren(); } catch { }
      return;
    }

    const from: Coordinates = payload.from;
    const to: Coordinates = payload.to;

    const sx = (from.x + 0.5) * props.size;
    const sy = (from.y + 0.5) * props.size;
    const ex = (to.x + 0.5) * props.size;
    const ey = (to.y + 0.5) * props.size;

    graphics.clear();
    try { graphics.removeChildren(); } catch { }

    const dx = ex - sx;
    const dy = ey - sy;
    let dir: DirectionKey = "right";
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? "right" : "left";
    } else {
      dir = dy > 0 ? "down" : "up";
    }

    const arrowSize = Math.min(24, props.size * 0.4);
    const arrow = createScaledFaIcon(DIRECTION_ICON[dir], arrowSize, DEFAULT_TILE_THEME.colors.arrow);

    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;

    const offset = props.size * 0.05;
    const dxn = Math.sign(dx);
    const dyn = Math.sign(dy);

    try {
      arrow.x = mx + dxn * offset;
      arrow.y = my + dyn * offset;
      graphics.addChild(arrow);
    } catch (err) {
      console.warn("OperationArrow.addChild failed", err);
    }
  });

  // ref wrapper — 必须返回 cleanup 函数或 undefined
  return <P.Graphics ref={(inst) => { setG(inst); return () => setG(undefined); }} zIndex={props.z ?? 0} />;
};

export const MapRender: Component<MapRenderProps> = (props) => {
  destroyGcCache();
  onCleanup(() => destroyGcCache());

  const TILE_SIZE = DEFAULT_TILE_THEME.tileSize;
  const map = createMemo(() => props.state?.map ?? { width: 0, height: 0, tiles: [] });
  const iconTextures = createMemo<Record<TileType, FaIconKey | null>>(() => DEFAULT_TILE_THEME.tileIcon);

  // ---- viewport: drag + zoom ----
  const [viewX, setViewX] = createSignal(0);
  const [viewY, setViewY] = createSignal(0);
  const [viewScale, setViewScale] = createSignal(1);
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 5.0;
  const DRAG_THRESHOLD = 3;

  function clampView() {
    const s = viewScale();
    const m = map();
    const mapW = m.width * TILE_SIZE * s;
    const mapH = m.height * TILE_SIZE * s;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 200;

    let nx = viewX();
    let ny = viewY();

    nx = Math.max(-MARGIN, Math.min(vw - mapW + MARGIN, nx));
    ny = Math.max(-MARGIN, Math.min(vh - mapH + MARGIN, ny));

    if (nx !== viewX()) setViewX(nx);
    if (ny !== viewY()) setViewY(ny);
  }

  function centerMap() {
    const m = map();
    const mapW = m.width * TILE_SIZE;
    const mapH = m.height * TILE_SIZE;
    if (mapW === 0 || mapH === 0) return;
    const s = viewScale();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewX((vw - mapW * s) / 2);
    setViewY((vh - mapH * s) / 2);
  }

  // ---- zoom towards viewport center (keyboard / HUD buttons) ----
  function zoomTowardsCenter(factor: number) {
    const oldScale = viewScale();
    const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldScale * factor));
    if (newScale === oldScale) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const worldX = (cx - viewX()) / oldScale;
    const worldY = (cy - viewY()) / oldScale;
    setViewScale(newScale);
    setViewX(cx - worldX * newScale);
    setViewY(cy - worldY * newScale);
  }

  const viewportApi: ViewportApi = {
    zoomIn: () => zoomTowardsCenter(1.25),
    zoomOut: () => zoomTowardsCenter(1 / 1.25),
    zoomReset: () => { setViewScale(1); centerMap(); },
  };

  // ---- drag state (PixiJS events) ----
  let dragActive = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartViewX = 0;
  let dragStartViewY = 0;

  function handleDragStart(e: PIXI.FederatedPointerEvent) {
    if (e.button !== 0) return;
    dragActive = true;
    dragMoved = false;
    dragStartX = e.globalX;
    dragStartY = e.globalY;
    dragStartViewX = viewX();
    dragStartViewY = viewY();
  }

  function handleDragMove(e: PIXI.FederatedPointerEvent) {
    if (!dragActive) return;
    const dx = e.globalX - dragStartX;
    const dy = e.globalY - dragStartY;
    if (!dragMoved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      dragMoved = true;
    }
    if (!dragMoved) return;
    setViewX(dragStartViewX + dx);
    setViewY(dragStartViewY + dy);
  }

  function handleDragEnd() {
    dragActive = false;
  }

  const STAGE_HIT_AREA = new PIXI.Rectangle(-5000, -5000, 10000, 10000);

  onMount(() => {
    props.onViewportReady?.(viewportApi);

    const canvas = document.querySelector<HTMLCanvasElement>("canvas");

    const onWheel = (e: WheelEvent) => {
      if (!canvas) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const oldScale = viewScale();
      const factor = 1 - e.deltaY * 0.001 * (e.deltaMode === 1 ? 40 : 1);
      const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldScale * factor));
      if (newScale === oldScale) return;

      const worldX = (mx - viewX()) / oldScale;
      const worldY = (my - viewY()) / oldScale;
      setViewScale(newScale);
      setViewX(mx - worldX * newScale);
      setViewY(my - worldY * newScale);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "=" || e.key === "+") { e.preventDefault(); viewportApi.zoomIn(); }
      else if (e.key === "-") { e.preventDefault(); viewportApi.zoomOut(); }
      else if (e.key === "0") { e.preventDefault(); viewportApi.zoomReset(); }
    };

    canvas?.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", clampView);

    centerMap();

    onCleanup(() => {
      canvas?.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", clampView);
    });
  });

  createEffect(() => {
    viewX();
    viewY();
    viewScale();
    queueMicrotask(() => clampView());
  });

  // 输入逻辑（cursor active、点击选格、键盘移动）下沉到 useMapInput
  const input = useMapInput({
    map,
    selfId: () => props.selfId,
    onOperationQueued: props.onOperationQueued,
    onClearQueue: props.onClearQueue,
  });
  const active = input.active;

  const [gCursor, setGCursor] = createSignal<PIXI.Graphics | undefined>(undefined);

  createEffect(() => {
    const graphics = gCursor();
    graphics?.clear();
    const c = active();
    if (!graphics || !c) return;

    const cx = c.x;
    const cy = c.y;
    if (typeof cx !== "number" || typeof cy !== "number") {
      graphics.clear();
      return;
    }

    const x = cx * TILE_SIZE;
    const y = cy * TILE_SIZE;
    const pad = 2;

    // 直接设置 graphics 的位置到瓦片左上角（世界坐标下）
    graphics.x = x;
    graphics.y = y;

    graphics
      .rect(pad / 2, pad / 2, TILE_SIZE - pad, TILE_SIZE - pad)
      .stroke({ width: 3, color: DEFAULT_TILE_THEME.colors.cursor, alpha: 0.95 });

    graphics
      .rect(pad / 2, pad / 2, TILE_SIZE - pad, TILE_SIZE - pad)
      .stroke({ width: 6, color: DEFAULT_TILE_THEME.colors.cursor, alpha: 0.12 });
  });

  return (
    // stage：固定屏幕空间，捕获拖拽事件；world 在其内部作平移/缩放变换
    <P.Container
      name="stage"
      interactive
      hitArea={STAGE_HIT_AREA}
      onpointerdown={handleDragStart}
      onpointermove={handleDragMove}
      onpointerup={handleDragEnd}
      onpointerupoutside={handleDragEnd}
    >
      <P.Container x={viewX()} y={viewY()} scale={viewScale()} name="world" sortableChildren>
        {/* ===== map layer: tiles ===== */}
        <P.Container name="mapLayer">
          <Index each={map().tiles}>
            {(row, yIdx) => (
              <Index each={row() ?? []}>
                {(tile, xIdx) => {
                  const coord: Coordinates = { x: xIdx, y: yIdx };
                  return (
                    <MapTile
                      coord={coord}
                      tile={tile()}
                      size={TILE_SIZE}
                      playerDisplay={props.state.playerDisplay}
                      iconTextures={iconTextures()}
                      onClick={input.handleTileClick}
                    />
                  );
                }}
              </Index>
            )}
          </Index>
        </P.Container>

        {/* ===== entity layer ===== */}
        <P.Container name="entityLayer" />

        {/* ===== overlay layer: arrows / cursor / highlights ===== */}
        <P.Container name="overlayLayer">
          <For each={props.state.playerOperationQueue ?? []}>
            {(op, i) => <OperationArrow op={op} size={TILE_SIZE} z={100 + i()} />}
          </For>

          <P.Graphics
            ref={(inst) => {
              setGCursor(inst);
              return () => setGCursor(undefined);
            }}
            zIndex={999}
          />
        </P.Container>
      </P.Container>
    </P.Container>
  );
};

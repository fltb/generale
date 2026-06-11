import { For, Index, createMemo, createSignal, createEffect, onCleanup, type Component } from "solid-js";
import * as P from "solid-pixi";
import * as PIXI from "pixi.js";

import type { SyncedGameState, Coordinates, PlayerOperation } from "@generale/types";
import { PlayerOperationType, TileType } from "@generale/types";

import { MapTile } from "./MapTile";
import { type FaIconKey, createScaledFaIcon, destroyGcCache } from "~/utils/faIconGraphic";
import { DEFAULT_TILE_THEME, DIRECTION_ICON } from "~/game/render/tileTheme";
import { useMapInput } from "~/game/render/useMapInput";

export interface MapRenderProps {
  state: SyncedGameState;
  // 可选回调：若宿主想收到新增指令可以传入（非必须）
  onOperationQueued?: (op: PlayerOperation) => void;
  /** 当前客户端玩家 id，用于首帧把 cursor 自动放到自己的 throne 上 */
  selfId?: string;
  /** 按 'c' 键时调用：清空操作队列 */
  onClearQueue?: () => void;
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
  // 关键：每次地图视图挂载（= 进入一局对局）前清空 FA 图标的 GraphicsContext 缓存。
  // gcCache 是模块级、跨对局存活的；其中的 GraphicsContext 绑定在上一局 pixi 渲染器上，
  // 再次进入游戏时是新的渲染器，复用这些旧 context 会导致 faicon 画不出来
  // （"首次进入正常、再次进入出问题，刷新就好"正是这个症状——刷新清掉了整个模块缓存）。
  // 在组件体顶部同步清空，保证早于下面任何 MapTile 的图标 effect 构建图标。
  destroyGcCache();
  // 离开对局时也清一次，及时释放并让下一局从干净状态开始。
  onCleanup(() => destroyGcCache());

  const TILE_SIZE = DEFAULT_TILE_THEME.tileSize;
  const map = createMemo(() => props.state?.map ?? { width: 0, height: 0, tiles: [] });
  const iconTextures = createMemo<Record<TileType, FaIconKey | null>>(() => DEFAULT_TILE_THEME.tileIcon);

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

  const offsetX = 0;
  const offsetY = 0;

  return (
    // world container：所有地图内容都在这里（由外层的 Application 决定缩放/分辨率）
    <P.Container x={offsetX} y={offsetY} name="world" sortableChildren>
      {/* ===== map layer: tiles =====
          用 <Index> 而非 <For>：地图尺寸在一局内固定，按"格子位置"复用节点、只更新数据，
          避免 mergedState 每 tick structuredClone 出新数组导致 <For>（按引用 key）
          每 tick 销毁+重建全部 MapTile —— 那种churn会和 createScaledFaIcon 抢跑，
          造成"有概率图标/箭头画不出来"。 */}
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

      {/* ===== entity layer: (units / players) - keep separate in case you add sprites later ===== */}
      <P.Container name="entityLayer" />

      {/* ===== overlay layer: arrows / cursor / highlights - still in world space ===== */}
      <P.Container name="overlayLayer">
        {/* operation arrows (world-space coordinates inside OperationArrow) */}
        <For each={props.state.playerOperationQueue ?? []}>
          {(op, i) => <OperationArrow op={op} size={TILE_SIZE} z={100 + i()} />}
        </For>

        {/* single cursor graphics (we reuse and update it via gCursor signal + createEffect above) */}
        <P.Graphics
          ref={(inst) => {
            // 必须返回 cleanup 函数或 undefined
            setGCursor(inst);
            return () => setGCursor(undefined);
          }}
          zIndex={999}
        />
      </P.Container>
    </P.Container>
  );
};

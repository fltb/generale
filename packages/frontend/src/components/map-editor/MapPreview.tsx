import type { CustomMapTile } from "@generale/types";
import { TileType } from "@generale/types";
import { A } from "@solidjs/router";
import { createSignal, onCleanup, onMount } from "solid-js";
import * as P from "solid-pixi";
import { mapDetailApi } from "~/api/mapApi";
import { MapTile } from "~/components/MapTile";
import { DEFAULT_TILE_THEME } from "~/game/render/tileTheme";
import { createIconFactory } from "~/utils/faIconGraphic";
import { useT } from "~/i18n/useT";

const GRID_CELL = 24;

const EMPTY_DISPLAY: Record<string, { tileColor: number; name: string }> = {};

export default function MapPreview(props: { mapId: string }) {
  const { t } = useT();
  const [tiles, setTiles] = createSignal<CustomMapTile[][]>([]);
  const [width, setWidth] = createSignal(0);
  const [height, setHeight] = createSignal(0);
  const [name, setName] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");

  const [viewX, setViewX] = createSignal(0);
  const [viewY, setViewY] = createSignal(0);
  const [viewScale, setViewScale] = createSignal(1);
  const [isDrag, setIsDrag] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });
  const [viewStart, setViewStart] = createSignal({ x: 0, y: 0 });
  let containerRef!: HTMLDivElement;
  let appRef: { view: { getBoundingClientRect(): DOMRect } } | undefined;

  const iconFactory = createIconFactory();

  function handlePointerDown(e: { button: number; globalX: number; globalY: number }) {
    if (e.button !== 1 && e.button !== 2) return;
    setIsDrag(true);
    setDragStart({ x: e.globalX, y: e.globalY });
    setViewStart({ x: viewX(), y: viewY() });
  }

  function handlePointerMove(e: { globalX: number; globalY: number }) {
    if (!isDrag()) return;
    setViewX(viewStart().x + (e.globalX - dragStart().x));
    setViewY(viewStart().y + (e.globalY - dragStart().y));
  }

  function handlePointerUp() {
    setIsDrag(false);
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const ds = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(0.25, Math.min(4, viewScale() * ds));
    const canvas = appRef?.view;
    if (!canvas) {
      setViewScale(newScale);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setViewX(mx - (mx - viewX()) * (newScale / viewScale()));
    setViewY(my - (my - viewY()) * (newScale / viewScale()));
    setViewScale(newScale);
  }

  onMount(async () => {
    try {
      const res = await mapDetailApi(props.mapId, false);
      const data = res.data;
      setName(data.name);
      setWidth(data.width);
      setHeight(data.height);
      setTiles(
        (data.tiles || []).map((row: { type: string; army: number; ownerId?: string }[]) =>
          row.map((cell) => ({
            type: (cell.type as TileType) ?? TileType.Plain,
            army: typeof cell.army === "number" ? cell.army : 0,
            ...(cell.ownerId ? { ownerId: cell.ownerId } : {}),
          })),
        ),
      );
    } catch (e: unknown) {
      setError((e as Error).message || t("加载失败"));
    } finally {
      setLoading(false);
    }
    window.addEventListener("mouseup", handlePointerUp);
    containerRef?.addEventListener("wheel", handleWheel, { passive: false });
  });

  onCleanup(() => {
    iconFactory.destroy();
    window.removeEventListener("mouseup", handlePointerUp);
    containerRef?.removeEventListener("wheel", handleWheel);
  });

  return (
    <div class="flex flex-col h-full">
      <div class="p-3 bg-base-200 text-sm flex items-center gap-3 shrink-0">
        <A href="/maps" class="opacity-50 hover:opacity-100">
          {t("← 返回")}
        </A>
        <span class="font-medium">{loading() ? t("加载中...") : name() || t("地图预览")}</span>
        {!loading() && (
          <span class="opacity-50 text-xs">
            {width()}×{height()}
          </span>
        )}
        {error() && <span class="text-error text-xs">{error()}</span>}
      </div>
      <div
        class="flex-1 relative overflow-hidden bg-base-300"
        ref={containerRef}
        role="application"
        onContextMenu={(e) => e.preventDefault()}
      >
        <P.Application
          ref={(r) => {
            appRef = r;
          }}
          background={DEFAULT_TILE_THEME.colors.appBackground}
          antialias
        >
          <P.Container
            interactive
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onpointerup={handlePointerUp}
            hitArea={{ contains: () => true }}
          >
            <P.Container x={viewX()} y={viewY()} scale={viewScale()}>
              {tiles().map((row, y) =>
                row.map((cell, x) => (
                  <MapTile
                    coord={{ x, y }}
                    tile={{ type: cell.type, ownerId: null, army: cell.army }}
                    size={GRID_CELL}
                    playerDisplay={EMPTY_DISPLAY}
                    iconTextures={DEFAULT_TILE_THEME.tileIcon}
                    iconFactory={iconFactory}
                  />
                )),
              )}
            </P.Container>
          </P.Container>
        </P.Application>
      </div>
    </div>
  );
}

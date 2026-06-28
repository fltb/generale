import type { CreateMapReqBody, CustomMapTile, UpdateMapReqBody } from "@generale/types";
import { TileType } from "@generale/types";
import { A, useNavigate } from "@solidjs/router";
import * as PIXI from "pixi.js";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import * as P from "solid-pixi";
import {
  createMapApi,
  discardDraftApi,
  mapDetailApi,
  mapThumbnailUrl,
  updateMapApi,
  uploadMapThumbnailApi,
} from "~/api/mapApi";
import { MapTile } from "~/components/MapTile";
import { DEFAULT_TILE_THEME } from "~/game/render/tileTheme";
import { Button, Input } from "~/ui";
import { createIconFactory } from "~/utils/faIconGraphic";
import { useT } from "~/i18n/useT";

const TILE_COLORS: Record<string, string> = {
  [TileType.Plain]: "#d1d5db",
  [TileType.Throne]: "#f59e0b",
  [TileType.Barracks]: "#22c55e",
  [TileType.Mountain]: "#6b7280",
  [TileType.Swamp]: "#06b6d4",
};

const TILE_LABELS: Record<TileType, string> = {
  [TileType.Plain]: "平原",
  [TileType.Throne]: "王座",
  [TileType.Barracks]: "兵营",
  [TileType.Mountain]: "山地",
  [TileType.Swamp]: "沼泽",
  [TileType.Fog]: "迷雾",
};

const TILE_TYPES = Object.values(TileType).filter((v) => typeof v === "string" && v !== TileType.Fog) as TileType[];

const GRID_CELL = 24;
const MIN_SIZE = 10;
const MAX_SIZE = 200;

const EMPTY_DISPLAY: Record<string, { tileColor: number; name: string }> = {};

const PASSABLE_TYPES = new Set<TileType>([TileType.Plain, TileType.Throne, TileType.Barracks, TileType.Swamp]);

function defaultTile(): CustomMapTile {
  return { type: TileType.Plain, army: 0 };
}

interface MapEditorProps {
  mapId?: string;
  cloneFromId?: string;
}

export default function MapEditor(props: MapEditorProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [messageType, setMessageType] = createSignal<"error" | "success">("success");
  const [width, setWidth] = createSignal(20);
  const [height, setHeight] = createSignal(20);
  const [tiles, setTiles] = createSignal<CustomMapTile[][]>([]);
  const [selectedType, setSelectedType] = createSignal<TileType>(TileType.Plain);
  const [selectedArmy, setSelectedArmy] = createSignal(0);
  const [editingMapId, setEditingMapId] = createSignal<string | null>(props.mapId || null);
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [undoStack, setUndoStack] = createSignal<CustomMapTile[][][]>([]);
  const [redoStack, setRedoStack] = createSignal<CustomMapTile[][][]>([]);
  const [viewX, setViewX] = createSignal(0);
  const [viewY, setViewY] = createSignal(0);
  const [viewScale, setViewScale] = createSignal(1);
  const [isDragPan, setIsDragPan] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });
  const [dragViewStart, setDragViewStart] = createSignal({ x: 0, y: 0 });
  const [isPainting, setIsPainting] = createSignal(false);
  const [hasDraft, setHasDraft] = createSignal(false);
  let hasCustomThumbnail = false;
  let appRef: { view: { getBoundingClientRect(): DOMRect } } | undefined;
  let containerRef!: HTMLDivElement;
  const [thumbnailBusy, setThumbnailBusy] = createSignal(false);
  const [thumbStamp, setThumbStamp] = createSignal(0);

  const iconFactory = createIconFactory();

  function initTiles(w: number, h: number) {
    const result: CustomMapTile[][] = [];
    for (let y = 0; y < h; y++) {
      result[y] = [];
      for (let x = 0; x < w; x++) result[y][x] = defaultTile();
    }
    setTiles(result);
  }

  function pushUndo() {
    const current = tiles();
    if (current.length === 0) return;
    setUndoStack((s) => [...s.slice(-50), current.map((r) => r.map((t) => ({ ...t })))]);
    setRedoStack([]);
  }

  function undo() {
    const stack = undoStack();
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    if (!prev) return;
    setRedoStack((s) => [...s, tiles().map((r) => r.map((t) => ({ ...t })))]);
    setUndoStack((s) => s.slice(0, -1));
    setTiles(prev.map((r) => r.map((t) => ({ ...t }))));
  }

  function redo() {
    const stack = redoStack();
    if (stack.length === 0) return;
    const nxt = stack[stack.length - 1];
    if (!nxt) return;
    setUndoStack((s) => [...s, tiles().map((r) => r.map((t) => ({ ...t })))]);
    setRedoStack((s) => s.slice(0, -1));
    setTiles(nxt.map((r) => r.map((t) => ({ ...t }))));
  }

  function resizeMap(nw: number, nh: number) {
    const newW = Math.max(MIN_SIZE, Math.min(MAX_SIZE, nw));
    const newH = Math.max(MIN_SIZE, Math.min(MAX_SIZE, nh));
    const current = tiles();
    if (current.length === 0) return;
    if (newW === width() && newH === height()) return;
    pushUndo();
    const result: CustomMapTile[][] = [];
    for (let y = 0; y < newH; y++) {
      result[y] = [];
      for (let x = 0; x < newW; x++) result[y][x] = current[y]?.[x] ? { ...current[y][x] } : defaultTile();
    }
    setWidth(newW);
    setHeight(newH);
    setTiles(result);
  }

  function screenToWorld(stageX: number, stageY: number) {
    const gx = Math.floor((stageX - viewX()) / viewScale() / GRID_CELL);
    const gy = Math.floor((stageY - viewY()) / viewScale() / GRID_CELL);
    if (gx < 0 || gx >= width() || gy < 0 || gy >= height()) return null;
    return { x: gx, y: gy };
  }

  function paintCell(gx: number, gy: number) {
    pushUndo();
    const type = selectedType();
    const army = PASSABLE_TYPES.has(type) ? selectedArmy() : 0;
    setTiles((prev) => prev.map((row, y) => row.map((t, x) => (x === gx && y === gy ? { type, army } : t))));
  }

  function handlePointerDown(e: { button: number; globalX: number; globalY: number }) {
    if (e.button === 1 || e.button === 2) {
      setIsDragPan(true);
      setDragStart({ x: e.globalX, y: e.globalY });
      setDragViewStart({ x: viewX(), y: viewY() });
      return;
    }
    if (e.button !== 0) return;
    const cell = screenToWorld(e.globalX, e.globalY);
    if (cell) {
      setIsPainting(true);
      paintCell(cell.x, cell.y);
    }
  }

  function handlePointerMove(e: { globalX: number; globalY: number }) {
    if (isDragPan()) {
      setViewX(dragViewStart().x + (e.globalX - dragStart().x));
      setViewY(dragViewStart().y + (e.globalY - dragStart().y));
      return;
    }
    if (!isPainting()) return;
    const cell = screenToWorld(e.globalX, e.globalY);
    if (!cell) return;
    const tileGrid = tiles(),
      cur = tileGrid[cell.y]?.[cell.x];
    const type = selectedType();
    const army = PASSABLE_TYPES.has(type) ? selectedArmy() : 0;
    if (!cur || cur.type !== type || cur.army !== army) paintCell(cell.x, cell.y);
  }

  function handlePointerUp(e: { button: number }) {
    if (e.button === 1 || e.button === 2) {
      setIsDragPan(false);
      return;
    }
    setIsPainting(false);
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
    const mx = e.clientX - rect.left,
      my = e.clientY - rect.top;
    setViewX(mx - (mx - viewX()) * (newScale / viewScale()));
    setViewY(my - (my - viewY()) * (newScale / viewScale()));
    setViewScale(newScale);
  }

  async function save(shouldPublish: boolean) {
    setSaving(true);
    setMessage("");
    try {
      const tilesData = tiles();
      const tileGrid = tilesData.map((row) => row.map((cell) => ({ type: cell.type, army: cell.army })));
      const base = { name: name(), description: description(), width: width(), height: height(), tiles: tileGrid };
      const editId = editingMapId();
      if (editId) {
        const body = shouldPublish ? { ...base, isPublic: true, isDraft: false } : base;
        await updateMapApi(editId, body as UpdateMapReqBody);
        if (shouldPublish) setHasDraft(false);
      } else {
        const body = { ...base, isPublic: shouldPublish, isDraft: !shouldPublish };
        const res = await createMapApi(body as CreateMapReqBody);
        setEditingMapId(res.data.id);
      }
      if (shouldPublish) {
        if (!hasCustomThumbnail) await generatePreview();
        navigate("/maps?tab=my");
      } else {
        setMessage(t("地图已保存"));
        setMessageType("success");
      }
    } catch (e: unknown) {
      setMessage(`${t("保存失败")}: ${(e as Error).message}`);
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function generatePreview() {
    const id = editingMapId();
    if (!id) {
      setMessage(t("请先保存地图"));
      setMessageType("error");
      return;
    }
    setThumbnailBusy(true);
    try {
      const w = width(),
        h = height();
      const grid = tiles();
      const MAX_DIM = 1024;
      const cellSize = Math.max(4, Math.floor(MAX_DIM / Math.max(w, h)));
      const cw = w * cellSize,
        ch = h * cellSize;

      const app = new PIXI.Application();
      await app.init({
        width: cw,
        height: ch,
        background: "#15101f",
        antialias: false,
        preserveDrawingBuffer: true,
        autoStart: false,
        sharedTicker: false,
      });

      const container = new PIXI.Container();
      const iconColorNum = DEFAULT_TILE_THEME.colors.tileIcon;

      for (let y = 0; y < h; y++) {
        const row = grid[y];
        if (!row) continue;
        for (let x = 0; x < w; x++) {
          const cell = row[x];
          if (!cell) continue;
          const px = x * cellSize,
            py = y * cellSize;

          const bgColor =
            cell.type === TileType.Fog ? DEFAULT_TILE_THEME.colors.fog : DEFAULT_TILE_THEME.colors.unowned;

          const bg = new PIXI.Graphics();
          bg.rect(px, py, cellSize, cellSize).fill({ color: bgColor });
          bg.rect(px, py, cellSize, cellSize).stroke({
            width: 1,
            color: DEFAULT_TILE_THEME.colors.gridStroke,
            alpha: DEFAULT_TILE_THEME.colors.gridStrokeAlpha,
          });
          container.addChild(bg);

          const iconKey = DEFAULT_TILE_THEME.tileIcon[cell.type];
          if (iconKey) {
            const iconSize = Math.round(cellSize * 0.6);
            const icon = iconFactory.createScaledIcon(iconKey, iconSize, iconColorNum);
            icon.x = px + cellSize / 2;
            icon.y = py + cellSize / 2;
            container.addChild(icon);
          }

          if (cell.army > 0) {
            const text = new PIXI.Text({
              text: String(cell.army),
              style: {
                fontSize: Math.max(6, Math.round(cellSize * 0.42)),
                fill: "#ffffff",
                stroke: { color: "#000000", width: 2 },
                fontWeight: "bold",
                fontFamily: "monospace",
              },
            });
            text.anchor.set(0.5);
            text.x = px + cellSize / 2;
            text.y = py + cellSize / 2;
            container.addChild(text);
          }
        }
      }

      app.stage.addChild(container);
      app.render();

      const canvas = app.canvas as HTMLCanvasElement;
      const blob = await new Promise<Blob | null>((r) => (canvas as HTMLCanvasElement).toBlob(r, "image/png"));
      app.destroy(true, { children: true });

      if (!blob) {
        setMessage(t("生成预览失败"));
        setMessageType("error");
        return;
      }
      await uploadMapThumbnailApi(id, new File([blob], "preview.png", { type: "image/png" }));
      setThumbStamp(Date.now());
      setMessage(t("预览图已生成"));
      setMessageType("success");
    } catch (e: unknown) {
      setMessage(`${t("预览失败")}: ${(e as Error).message}`);
      setMessageType("error");
    } finally {
      setThumbnailBusy(false);
    }
  }

  async function uploadThumbnail(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const editId = editingMapId();
    if (!(file && editId)) return;
    setThumbnailBusy(true);
    try {
      await uploadMapThumbnailApi(editId, file);
      setMessage(t("封面上传成功"));
      setMessageType("success");
      hasCustomThumbnail = true;
      setThumbStamp(Date.now());
    } catch (e: unknown) {
      setMessage(`${t("上传失败")}: ${(e as Error).message}`);
      setMessageType("error");
    } finally {
      setThumbnailBusy(false);
    }
    input.value = "";
  }

  async function loadMap(id: string) {
    try {
      const res = await mapDetailApi(id);
      const d = res.data;
      setName(d.name);
      setDescription(d.description || "");
      setWidth(d.width);
      setHeight(d.height);
      setTiles(
        (d.tiles || []).map((row) =>
          row.map((cell) => ({
            type: (cell.type as TileType) ?? TileType.Plain,
            army: typeof cell.army === "number" ? cell.army : 0,
          })),
        ),
      );
      setEditingMapId(id);
      setHasDraft(!!d.hasDraft);
      hasCustomThumbnail = !!d.hasCustomThumbnail;
    } catch (e: unknown) {
      setMessage(`${t("加载失败")}: ${(e as Error).message}`);
      setMessageType("error");
    }
  }

  async function discardDraft() {
    const id = editingMapId();
    if (!id) return;
    try {
      await discardDraftApi(id);
      setHasDraft(false);
      await loadMap(id);
      setMessage(t("草稿已放弃，已恢复已发布版本"));
      setMessageType("success");
    } catch (e: unknown) {
      setMessage(`${t("放弃草稿失败")}: ${(e as Error).message}`);
      setMessageType("error");
    }
  }

  onMount(async () => {
    if (props.mapId) await loadMap(props.mapId);
    else if (props.cloneFromId) {
      await loadMap(props.cloneFromId);
      setEditingMapId(null);
    } else initTiles(width(), height());
    window.addEventListener("mouseup", handlePointerUp);
    containerRef?.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
      }
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
      }
    });
  });

  onCleanup(() => {
    iconFactory.destroy();
    window.removeEventListener("mouseup", handlePointerUp);
    containerRef?.removeEventListener("wheel", handleWheel);
  });

  return (
    <div class="flex h-full">
      <div class="w-56 bg-base-200 p-3 flex flex-col gap-2 shrink-0">
        <A href="/maps" class="text-xs opacity-50 hover:opacity-100 mb-1">
          {t("← 返回地图工坊")}
        </A>

        <div>
          <div class="text-xs font-medium mb-0.5">{t("地图名称")}</div>
          <Input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder={t("输入地图名称")} size="sm" />
        </div>
        <div>
          <div class="text-xs font-medium mb-0.5">{t("描述")}</div>
          <Input
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
            placeholder={t("可选描述")}
            size="sm"
          />
        </div>

        <div class="flex gap-2">
          <div class="flex-1">
            <div class="text-xs font-medium mb-0.5">{t("宽")}</div>
            <Input
              type="number"
              value={String(width())}
              onInput={(e) => resizeMap(Number(e.currentTarget.value), height())}
              size="sm"
            />
          </div>
          <div class="flex-1">
            <div class="text-xs font-medium mb-0.5">{t("高")}</div>
            <Input
              type="number"
              value={String(height())}
              onInput={(e) => resizeMap(width(), Number(e.currentTarget.value))}
              size="sm"
            />
          </div>
        </div>

        <div>
          <div class="text-xs font-medium mb-0.5">{t("地形类型")}</div>
          <div class="grid grid-cols-2 gap-1">
            {TILE_TYPES.map((tileType) => (
              <button
                type="button"
                class={`px-2 py-1 text-xs rounded border font-semibold cursor-pointer ${
                  selectedType() === tileType
                    ? "ring-2 ring-primary border-primary"
                    : "border-base-300 hover:border-base-content/30"
                }`}
                style={{
                  "background-color": TILE_COLORS[tileType] ?? "#ccc",
                  color: "#111",
                  "text-shadow": "0 0 2px rgba(255,255,255,0.6)",
                }}
                onClick={() => setSelectedType(tileType)}
              >
                {t(TILE_LABELS[tileType])}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div class="text-xs font-medium mb-0.5">{t("兵力")}</div>
          <Show
            when={PASSABLE_TYPES.has(selectedType())}
            fallback={<div class="text-xs opacity-50">{t("该地形不可驻兵")}</div>}
          >
            <Input
              type="number"
              value={String(selectedArmy())}
              onInput={(e) => setSelectedArmy(Number(e.currentTarget.value))}
              size="sm"
            />
          </Show>
        </div>

        <Show when={editingMapId()}>
          <div class="border-t border-base-300 pt-2 flex flex-col gap-2">
            <div class="text-xs font-medium">{t("封面图片")}</div>

            <Show when={mapThumbnailUrl(editingMapId() as string)}>
              <img
                src={`${mapThumbnailUrl(editingMapId() as string)}?v=${thumbStamp()}`}
                alt={t("预览")}
                class="w-full rounded border border-base-300"
              />
            </Show>

            <p class="text-[10px] leading-relaxed opacity-50">
              {t("自定义封面：上传一张本地图片作为地图展示封面。上传后会标记为自定义封面，后续发布不再自动覆盖。")}
            </p>
            <label class="cursor-pointer">
              <span class={`btn btn-xs btn-ghost ${thumbnailBusy() ? "btn-disabled" : ""}`}>
                {thumbnailBusy() ? t("处理中...") : t("上传自定义封面")}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                class="hidden"
                onChange={uploadThumbnail}
                disabled={thumbnailBusy()}
              />
            </label>

            <p class="text-[10px] leading-relaxed opacity-50">
              {t("自动生成：根据当前地图格内容自动渲染一张预览图。适合没有自定义封面的地图，发布时会自动调用。")}
            </p>
            <Button variant="ghost" size="xs" onClick={generatePreview} disabled={thumbnailBusy()}>
              {thumbnailBusy() ? t("生成中...") : t("自动生成预览图")}
            </Button>
          </div>
        </Show>

        <div class="flex flex-col gap-1 text-xs opacity-50">
          <Show when={hasDraft()}>
            <div class="text-warning opacity-100">{t("正在编辑草稿 — 名称、描述等修改只保存到发布版")}</div>
          </Show>
          <div>{t("缩放:")} {(viewScale() * 100).toFixed(0)}%</div>
          <div>
            {t("尺寸:")} {width()} × {height()}
          </div>
          <div>{t("Ctrl+Z 撤销 / Ctrl+Y 重做")}</div>
          <div>{t("中键拖动 / 滚轮缩放")}</div>
        </div>

        <div class="flex flex-col gap-2 mt-4 pt-2 border-t border-base-300">
          <Button variant="ghost" size="sm" onClick={() => save(false)} disabled={saving() || !name()}>
            {saving() ? t("保存中...") : t("保存草稿")}
          </Button>
          <Show when={hasDraft()}>
            <Button variant="ghost" size="xs" onClick={discardDraft}>
              {t("放弃草稿")}
            </Button>
          </Show>
          <Button variant="primary" size="sm" onClick={() => save(true)} disabled={saving() || !name()}>
            {saving() ? t("发布中...") : t("发布地图")}
          </Button>
          {message() && (
            <div
              class={`text-xs ${messageType() === "error" ? "text-error" : "text-success"}`}
            >
              {message()}
            </div>
          )}
        </div>
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
              <Show when={tiles().length > 0}>
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
              </Show>
            </P.Container>
          </P.Container>
        </P.Application>
      </div>
    </div>
  );
}

import { PreGameMapType, type PreGameRoomState, TileType } from "@generale/types";
import { type Component, createSignal, For, Show } from "solid-js";
import { useT } from "~/i18n/useT";
import { Button, Input, Range } from "~/ui";

export interface PreGameRoomStateFromProps {
  state: PreGameRoomState["gameSetting"];
  map: PreGameRoomState["mapSetting"];
  onChange: (state: PreGameRoomState["gameSetting"]) => void;
}

/**
 * PreGameRoomStateFrom
 * 基本表单：编辑 speed, afkThreshold, 以及 tileGrow 下每个 tile 的 duration/growth
 */
export const PreGameRoomStateFrom: Component<PreGameRoomStateFromProps> = (props) => {
  const { t } = useT();
  const [tileGrowOpen, setTileGrowOpen] = createSignal(false);
  // 将更新立即回传给父组件（并更新本地）
  const commit = (next: PreGameRoomState["gameSetting"]) => {
    props.onChange(next);
  };

  /** 离散倍速档位：拖动条只在这些值之间跳；与后端 cap (MAX_TICKS_PER_SEC=4) 对齐 */
  const SPEED_PRESETS = [0.5, 1, 2, 3, 4];
  const MAX_TICKS_PER_SEC = 4;

  /** 当前 speed 在 SPEED_PRESETS 里的索引；找不到精确命中就取最近的一档 */
  const speedIndex = () => {
    const s = props.state.speed;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < SPEED_PRESETS.length; i++) {
      const d = Math.abs((SPEED_PRESETS[i] as number) - s);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  const onSpeedChange = (v: number) => {
    const next = { ...props.state, speed: clampNumber(v, 0.5, 4) };
    commit(next);
  };

  const effectiveTicksPerSec = () => Math.min(MAX_TICKS_PER_SEC, Math.max(0.1, props.state.speed));

  // 更新 afkThreshold（整数 >= 0）
  const onAfkChange = (v: number) => {
    const next = { ...props.state, afkThreshold: Math.max(0, Math.floor(v)) };
    commit(next);
  };

  // 更新 tileGrow 中某个 tile 的字段（duration 或 growth）
  const onTileGrowChange = (tileType: TileType, field: "duration" | "growth", v: number) => {
    const prev = props.state;
    const prevTileGrow = prev.tileGrow;
    const prevEntry = prevTileGrow[tileType] ?? { duration: 0, growth: 0 };

    const newEntry = {
      ...prevEntry,
      [field]: field === "duration" ? Math.max(0, v) : v,
    };

    const newTileGrow = { ...prevTileGrow, [tileType]: newEntry };
    const next: PreGameRoomState["gameSetting"] = { ...prev, tileGrow: newTileGrow };
    commit(next);
  };

  // 小工具：限制浮点数范围
  function clampNumber(v: number, min: number, max: number) {
    if (Number.isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
  }

  return (
    <form class="p-4 space-y-6 bg-base-100 rounded-lg shadow-sm">
      <div>
        <label class="label" for="state-speed">
          <span class="label-text">
            {t("Game Speed")} {props.state.speed.toFixed(1)}×
            <span class="opacity-60 ml-2">{t("({n} ticks/sec)", { n: effectiveTicksPerSec().toFixed(1) })}</span>
          </span>
          <span class="label-text-alt">{t("Range 0.5 — 4")}</span>
        </label>

        {/* range 控件：min/max/step 用"档位索引"，每次拖动都落在 SPEED_PRESETS 的某档 */}
        <Range
          id="state-speed"
          variant="primary"
          min={0}
          max={SPEED_PRESETS.length - 1}
          step={1}
          value={String(speedIndex())}
          class="w-full"
          list="speed-preset-marks"
          onInput={(e) => {
            const idx = Number((e.currentTarget as HTMLInputElement).value);
            const v = SPEED_PRESETS[Math.max(0, Math.min(SPEED_PRESETS.length - 1, idx))] as number;
            onSpeedChange(v);
          }}
        />
        {/* slider 下方刻度标签，让用户一眼看到每档值 */}
        <div class="flex justify-between text-xs opacity-70 px-1 mt-1">
          <For each={SPEED_PRESETS}>{(s) => <span>{s}×</span>}</For>
        </div>
        {/* datalist 让浏览器在 slider 上画小刻度（chromium 系支持，其它浏览器静默忽略） */}
        <datalist id="speed-preset-marks">
          <For each={SPEED_PRESETS}>{(_, i) => <option value={String(i())} />}</For>
        </datalist>
      </div>

      <div>
        <label class="label" for="state-afk">
          <span class="label-text">{t("AFK Threshold")}</span>
          <span class="label-text-alt">{t("Unit: tick (integer)")}</span>
        </label>
        <Input
          id="state-afk"
          type="number"
          bordered
          min={0}
          step={1}
          value={String(props.state.afkThreshold)}
          class="w-40"
          onInput={(e) => onAfkChange(Number((e.currentTarget as HTMLInputElement).value))}
        />
      </div>

      <Show when={Object.keys(props.state.tileGrow ?? {}).length > 0 && props.map.type !== PreGameMapType.Random}>
        <div>
          <button
            type="button"
            class="flex items-center gap-1 text-sm w-full mb-1"
            onClick={() => setTileGrowOpen((o) => !o)}
          >
            <span class={tileGrowOpen() ? "rotate-90" : ""} style="transition:transform 0.15s;display:inline-block">
              ▸
            </span>
            {t("Tile Growth Rules (tileGrow)")}
            <span class="text-xs opacity-50 ml-1">{t("Set duration and growth for each tile type")}</span>
          </button>

          <Show when={tileGrowOpen()}>
            <div class="grid gap-4 mt-2">
              <For
                each={(
                  Object.entries(props.state.tileGrow ?? {}) as [TileType, { duration?: number; growth?: number }][]
                ).filter(([type, _]) => type !== TileType.Fog)}
              >
                {([tileType, cfg]) => {
                  const dur = cfg?.duration ?? 0;
                  const growth = cfg?.growth ?? 0;

                  return (
                    <div class="border rounded p-3 bg-base-200">
                      <div class="flex justify-between items-center">
                        <div class="font-medium">{tileType}</div>
                        <div class="text-sm opacity-70">{t("(tile type)")}</div>
                      </div>

                      <div class="grid sm:grid-cols-2 gap-3 mt-3">
                        <div>
                          <label class="label" for={`state-dur-${tileType}`}>
                            <span class="label-text">duration</span>
                            <span class="label-text-alt">{">"}= 0</span>
                          </label>
                          <Input
                            id={`state-dur-${tileType}`}
                            type="number"
                            bordered
                            min={0}
                            step={1}
                            value={String(dur)}
                            class="w-full"
                            onInput={(e) => onTileGrowChange(tileType, "duration", Number(e.currentTarget.value))}
                          />
                        </div>

                        <div>
                          <label class="label" for={`state-growth-${tileType}`}>
                            <span class="label-text">growth</span>
                          </label>
                          <Input
                            id={`state-growth-${tileType}`}
                            type="number"
                            bordered
                            step={1}
                            value={String(growth)}
                            class="w-full"
                            onInput={(e) => onTileGrowChange(tileType, "growth", Number(e.currentTarget.value))}
                          />
                        </div>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      <div class="flex justify-end">
        {/* 这里给个显式的“应用”按钮（可选） */}
        <Button type="button" variant="primary" onClick={() => props.onChange(props.state)}>
          {t("Apply Settings")}
        </Button>
      </div>
    </form>
  );
};

import { type Component, For, Show } from "solid-js";
import {
  type PreGameMapSetting,
  PreGameMapType,
  type PreGameRandomMapSetting,
  type PreGameCustomMapSetting,
  type PreGameImportedMapSetting,
  type PreGameRoomType,
  type PreGameStandardSizeLabel,
  PRESET_SIZES,
  TileType,
} from "@generale/types";

export interface PreGameMapSettingFormProps {
  setting: PreGameMapSetting;
  /** 房间类型；standard 仅允许预设尺寸，custom 维持原行为 */
  roomType?: PreGameRoomType;
  onChange: (next: PreGameMapSetting) => void;
}

/**
 * PreGameMapSettingForm
 * 支持三种类型：
 * - Random: width, height, tileFrequency
 * - Custom: width, height, tileFrequency, customData (简化为文本)
 * - Imported: mapName
 *
 * 每次修改都会立即调用 onChange(next)
 */
export const PreGameMapSettingForm: Component<PreGameMapSettingFormProps> = (props) => {
  const tileTypes = Object.values(TileType) as TileType[];

  // 与 @generale/types 共享的预设表
  const presetSizes = PRESET_SIZES;

  // standard 房间专用：点击预设按钮，发送只含合法 sizeLabel 的 payload，
  // 服务端会按 PRESET_SIZES 回填宽高并固定 type=Random。
  const applyStandardPreset = (label: PreGameStandardSizeLabel) => {
    const dims = presetSizes[label];
    const next: PreGameRandomMapSetting = {
      type: PreGameMapType.Random,
      width: dims.width,
      height: dims.height,
      tileFrequency: {},
      sizeLabel: label,
    };
    props.onChange(next);
  };

  // 切换地图类型时尽量保留公共字段（width/height/tileFrequency）
  const switchTo = (type: PreGameMapType) => {
    let next: PreGameMapSetting;
    const current = props.setting as any;

    if (type === PreGameMapType.Random) {
      // compactRandom: 默认选 medium（20x20），并不暴露 tileFrequency
      next = {
        type,
        width: current.width ?? presetSizes.medium.width,
        height: current.height ?? presetSizes.medium.height,
        tileFrequency: {}, // keep an empty object (not shown in compact mode)
      } as PreGameRandomMapSetting;
    } else if (type === PreGameMapType.Custom) {
      next = {
        type,
        width: current.width ?? 32,
        height: current.height ?? 24,
        tileFrequency: { ...(current.tileFrequency ?? {}) },
        customData: (current as PreGameCustomMapSetting).customData ?? "",
      } as PreGameCustomMapSetting;
    } else {
      next = {
        type,
        mapName: (current as PreGameImportedMapSetting).mapName ?? "",
      } as PreGameImportedMapSetting;
    }

    props.onChange(next);
  };

  const isCustomRoom = () => props.roomType === "custom";
  const CUSTOM_MIN = 10;
  const CUSTOM_MAX = 500;

  const clampSize = (v: number) => {
    const n = Math.floor(v);
    if (isCustomRoom()) return Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, n));
    return Math.max(1, n);
  };

  const setWidth = (w: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const next = { ...cur, width: clampSize(w) } as PreGameRandomMapSetting | PreGameCustomMapSetting;
      props.onChange(next);
    }
  };

  const setHeight = (h: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const next = { ...cur, height: clampSize(h) } as PreGameRandomMapSetting | PreGameCustomMapSetting;
      props.onChange(next);
    }
  };

  const setTileFreq = (tile: TileType, v: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const prev = (cur as PreGameRandomMapSetting | PreGameCustomMapSetting).tileFrequency ?? {};
      const nextTileFreq = { ...prev, [tile]: Math.max(0, Number(v)) };
      const next = { ...(cur as any), tileFrequency: nextTileFreq } as PreGameRandomMapSetting | PreGameCustomMapSetting;
      props.onChange(next);
    }
  };

  const setMapName = (name: string) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Imported) {
      const next = { ...(cur as PreGameImportedMapSetting), mapName: name };
      props.onChange(next);
    }
  };

  const setCustomData = (data: string) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Custom) {
      const next = { ...(cur as PreGameCustomMapSetting), customData: data };
      props.onChange(next);
    }
  };

  // 预置尺寸选择（仅在 compactRandom 模式下对 Random 可见）
  const applyPresetSize = (preset: keyof typeof presetSizes) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const { width, height } = presetSizes[preset];
      const next = { ...(cur as any), width, height } as PreGameRandomMapSetting | PreGameCustomMapSetting;
      props.onChange(next);
    } else {
      // 如果当前不是 Random，但在 UI 点击了 preset，我们先切换到 Random（compact），然后赋值
      const next: PreGameMapSetting = {
        type: PreGameMapType.Random,
        width: presetSizes[preset].width,
        height: presetSizes[preset].height,
        tileFrequency: {},
      } as PreGameRandomMapSetting;
      props.onChange(next);
    }
  };

  // 一些快速操作：均衡所有地形频率、重置为默认尺寸
  const balanceFrequencies = () => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const evenly = Math.max(0, Math.floor(100 / Math.max(1, Object.keys(TileType).length)));
      const newFreq: Partial<Record<TileType, number>> = {};
      (Object.values(TileType) as TileType[]).forEach((t) => (newFreq[t] = evenly));
      const next = { ...(cur as any), tileFrequency: newFreq } as PreGameRandomMapSetting | PreGameCustomMapSetting;
      props.onChange(next);
    }
  };

  const resetSize = () => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const next = { ...(cur as any), width: 32, height: 24 } as PreGameRandomMapSetting | PreGameCustomMapSetting;
      props.onChange(next);
    }
  };

  const isCompactRandom = true;

  // standard 房间：UI 只展示三个预设按钮；custom 房间：完整自定义表单。
  // 必须用响应式的 <Show> 而不是 if/return —— Solid 组件函数只执行一次，
  // 早返回会把 props.roomType 锁在首次渲染时的值，后续切房间模式不会更新。
  const currentLabel = () =>
    props.setting.type === PreGameMapType.Random
      ? (props.setting as PreGameRandomMapSetting).sizeLabel
      : undefined;

  return (
    <Show
      when={props.roomType !== "standard"}
      fallback={
        <div class="p-4 bg-base-100 rounded-lg shadow-sm space-y-3">
          <div>
            <label class="label">
              <span class="label-text">预置尺寸</span>
              <span class="label-text-alt">standard 模式仅支持 small / medium / large</span>
            </label>
            <div class="btn-group">
              <button
                class={`btn btn-sm ${currentLabel() === "small" ? "btn-active" : ""}`}
                onClick={() => applyStandardPreset("small")}
              >Small (10×10)</button>
              <button
                class={`btn btn-sm ${currentLabel() === "medium" ? "btn-active" : ""}`}
                onClick={() => applyStandardPreset("medium")}
              >Medium (20×20)</button>
              <button
                class={`btn btn-sm ${currentLabel() === "large" ? "btn-active" : ""}`}
                onClick={() => applyStandardPreset("large")}
              >Large (40×40)</button>
            </div>
          </div>
        </div>
      }
    >
    <div class="p-4 bg-base-100 rounded-lg shadow-sm space-y-4">
      <div class="form-control">
        <label class="label">
          <span class="label-text">地图类型</span>
        </label>
        <div class="btn-group">
          <button
            class={`btn btn-sm ${props.setting.type === PreGameMapType.Random ? "btn-active" : ""}`}
            onClick={() => switchTo(PreGameMapType.Random)}
          >
            随机
          </button>
          <button
            class={`btn btn-sm ${props.setting.type === PreGameMapType.Custom ? "btn-active" : ""}`}
            onClick={() => switchTo(PreGameMapType.Custom)}
          >
            自定义
          </button>
          <button
            class={`btn btn-sm ${props.setting.type === PreGameMapType.Imported ? "btn-active" : ""}`}
            onClick={() => switchTo(PreGameMapType.Imported)}
          >
            导入
          </button>
        </div>
      </div>

      {/* 如果是 Random 或 Custom 才需要显示尺寸；但当 compactRandom 且当前为 Random 时，尺寸以预置呈现 */}
      <Show when={props.setting.type === PreGameMapType.Random || props.setting.type === PreGameMapType.Custom}>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">
              <span class="label-text">宽度 (width)</span>
              <Show when={isCustomRoom()}>
                <span class="label-text-alt">{CUSTOM_MIN} - {CUSTOM_MAX}</span>
              </Show>
            </label>
            <input
              type="number"
              min={isCustomRoom() ? CUSTOM_MIN : 1}
              max={isCustomRoom() ? CUSTOM_MAX : undefined}
              step={1}
              value={String((props.setting as any).width ?? (isCompactRandom ? presetSizes.medium.width : 32))}
              class="input input-bordered w-40"
              onInput={(e) => setWidth(Number((e.currentTarget as HTMLInputElement).value))}
              disabled={!isCustomRoom() && isCompactRandom && props.setting.type === PreGameMapType.Random}
            />
          </div>

          <div>
            <label class="label">
              <span class="label-text">高度 (height)</span>
              <Show when={isCustomRoom()}>
                <span class="label-text-alt">{CUSTOM_MIN} - {CUSTOM_MAX}</span>
              </Show>
            </label>
            <input
              type="number"
              min={isCustomRoom() ? CUSTOM_MIN : 1}
              max={isCustomRoom() ? CUSTOM_MAX : undefined}
              step={1}
              value={String((props.setting as any).height ?? (isCompactRandom ? presetSizes.medium.height : 24))}
              class="input input-bordered w-40"
              onInput={(e) => setHeight(Number((e.currentTarget as HTMLInputElement).value))}
              disabled={!isCustomRoom() && isCompactRandom && props.setting.type === PreGameMapType.Random}
            />
          </div>
        </div>

        {/* compactRandom: 显示预置按钮（small/medium/large），并隐藏 tileFrequency 等详细项；custom 房间不显示预设 */}
        <Show when={!isCustomRoom() && isCompactRandom && props.setting.type === PreGameMapType.Random}>
          <div>
            <label class="label">
              <span class="label-text">预置尺寸（房间模式）</span>
              <span class="label-text-alt">前端临时写死 small / medium / large</span>
            </label>
            <div class="btn-group">
              <button class={`btn btn-xs`} onClick={() => applyPresetSize("small")}>Small (10×10)</button>
              <button class={`btn btn-xs`} onClick={() => applyPresetSize("medium")}>Medium (20×20)</button>
              <button class={`btn btn-xs`} onClick={() => applyPresetSize("large")}>Large (40×40)</button>
            </div>
          </div>
        </Show>

        {/* 当不是 compactRandom 时，显示地形频率编辑 */}
        <Show when={!isCompactRandom}>
          <div>
            <label class="label">
              <span class="label-text">地形频率 (tileFrequency)</span>
              <span class="label-text-alt">{'数值越大越常见 (>=0)'}</span>
            </label>

            <div class="grid gap-3">
              <For each={tileTypes}>
                {(t) => {
                  const val = ((props.setting as any).tileFrequency ?? {})[t] ?? 0;
                  return (
                    <div class="flex items-center gap-3">
                      <div class="w-32">{t}</div>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={String(val)}
                        class="input input-bordered w-28"
                        onInput={(e) => setTileFreq(t, Number((e.currentTarget as HTMLInputElement).value))}
                      />
                      <div class="text-sm opacity-60">当前: {val}</div>
                    </div>
                  );
                }}
              </For>
            </div>

            <div class="flex gap-2 mt-3">
              <button class="btn btn-xs" onClick={() => balanceFrequencies()}>
                均衡频率
              </button>
              <button class="btn btn-xs" onClick={() => resetSize()}>
                重置尺寸
              </button>
            </div>
          </div>
        </Show>

        <Show when={props.setting.type === PreGameMapType.Custom}>
          <div>
            <label class="label">
              <span class="label-text">Custom 数据 (customData)</span>
              <span class="label-text-alt">任意 JSON/text（用于测试）</span>
            </label>
            <textarea
              class="textarea textarea-bordered w-full"
              value={String((props.setting as any).customData ?? "")}
              onInput={(e) => setCustomData((e.currentTarget as HTMLTextAreaElement).value)}
              rows={4}
            />
          </div>
        </Show>
      </Show>

      <Show when={props.setting.type === PreGameMapType.Imported}>
        <div>
          <label class="label">
            <span class="label-text">地图名 (mapName)</span>
          </label>
          <input
            type="text"
            class="input input-bordered w-64"
            value={String((props.setting as any).mapName ?? "")}
            onInput={(e) => setMapName((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
      </Show>

      <div class="flex justify-end">
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => props.onChange(props.setting)}
        >
          应用（回传当前 setting）
        </button>
      </div>
    </div>
    </Show>
  );
};

export default PreGameMapSettingForm;

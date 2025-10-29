import { type Component, For, Show } from "solid-js";
import {
  type PreGameMapSetting,
  PreGameMapType,
  type PreGameRandomMapSetting,
  type PreGameCustomMapSetting,
  type PreGameImportedMapSetting,
  TileType,
} from "@generale/types";

export interface PreGameMapSettingFormProps {
  setting: PreGameMapSetting;
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

  // 切换地图类型时尽量保留公共字段（width/height/tileFrequency）
  const switchTo = (type: PreGameMapType) => {
    let next: PreGameMapSetting;
    const current = props.setting as any;

    if (type === PreGameMapType.Random) {
      next = {
        type,
        width: current.width ?? 32,
        height: current.height ?? 24,
        tileFrequency: { ...(current.tileFrequency ?? {}) },
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

  const setWidth = (w: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const next = { ...cur, width: Math.max(1, Math.floor(w)) } as PreGameRandomMapSetting | PreGameCustomMapSetting;
      props.onChange(next);
    }
  };

  const setHeight = (h: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const next = { ...cur, height: Math.max(1, Math.floor(h)) } as PreGameRandomMapSetting | PreGameCustomMapSetting;
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

  return (
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

      <Show when={props.setting.type === PreGameMapType.Random || props.setting.type === PreGameMapType.Custom}>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="label">
              <span class="label-text">宽度 (width)</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={String((props.setting as any).width ?? 32)}
              class="input input-bordered w-40"
              onInput={(e) => setWidth(Number((e.currentTarget as HTMLInputElement).value))}
            />
          </div>

          <div>
            <label class="label">
              <span class="label-text">高度 (height)</span>
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={String((props.setting as any).height ?? 24)}
              class="input input-bordered w-40"
              onInput={(e) => setHeight(Number((e.currentTarget as HTMLInputElement).value))}
            />
          </div>
        </div>

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
  );
};

export default PreGameMapSettingForm;

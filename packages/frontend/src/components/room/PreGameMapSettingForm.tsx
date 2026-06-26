import { type Component, For, Show, createSignal } from "solid-js";
import { Button, Input, Textarea } from "~/ui";
import { MapSelector } from "~/components/map-editor/MapSelector";
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
  roomType?: PreGameRoomType;
  onChange: (next: PreGameMapSetting) => void;
}

export const PreGameMapSettingForm: Component<PreGameMapSettingFormProps> = (props) => {
  const tileTypes = Object.values(TileType) as TileType[];
  const isImported = () => props.setting.type === PreGameMapType.Imported;
  const currentMapId = () => (props.setting as any).customMapId as string | undefined;
  const [advancedOpen, setAdvancedOpen] = createSignal(false);

  const applyStandardPreset = (label: PreGameStandardSizeLabel) => {
    const dims = PRESET_SIZES[label];
    props.onChange({ type: PreGameMapType.Random, width: dims.width, height: dims.height, tileFrequency: {}, sizeLabel: label } as PreGameRandomMapSetting);
  };

  const switchGenType = (type: PreGameMapType) => {
    const cur = props.setting as any;
    if (type === PreGameMapType.Random) {
      props.onChange({ type, width: cur.width ?? 32, height: cur.height ?? 24, tileFrequency: {} } as PreGameRandomMapSetting);
    } else {
      props.onChange({ type, width: cur.width ?? 32, height: cur.height ?? 24, tileFrequency: { ...(cur.tileFrequency ?? {}) }, customData: (cur as PreGameCustomMapSetting).customData ?? "" } as PreGameCustomMapSetting);
    }
  };

  const selectCustomMap = (id: string) => {
    if (!id) { clearCustomMap(); return; }
    props.onChange({ type: PreGameMapType.Imported, customMapId: id } as PreGameImportedMapSetting);
  };

  const clearCustomMap = () => {
    props.onChange({ type: PreGameMapType.Custom, width: 32, height: 24, tileFrequency: {}, customData: "" } as PreGameCustomMapSetting);
  };

  const setWidth = (w: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom)
      props.onChange({ ...cur, width: Math.max(10, Math.min(500, Math.floor(w))) } as any);
  };
  const setHeight = (h: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom)
      props.onChange({ ...cur, height: Math.max(10, Math.min(500, Math.floor(h))) } as any);
  };
  const setTileFreq = (tile: TileType, v: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const prev = (cur as any).tileFrequency ?? {};
      props.onChange({ ...(cur as any), tileFrequency: { ...prev, [tile]: Math.max(0, Number(v)) } } as any);
    }
  };
  const setCustomData = (data: string) => {
    if (props.setting.type === PreGameMapType.Custom)
      props.onChange({ ...(props.setting as PreGameCustomMapSetting), customData: data });
  };
  const currentLabel = () => props.setting.type === PreGameMapType.Random ? (props.setting as PreGameRandomMapSetting).sizeLabel : undefined;

  return (
    <Show
      when={props.roomType !== "standard"}
      fallback={
        <div class="p-4 bg-base-100 rounded-lg shadow-sm space-y-3">
          <div>
            <label class="label"><span class="label-text">预置尺寸</span></label>
            <div class="btn-group">
              <Button size="sm" active={currentLabel() === "small"} onClick={() => applyStandardPreset("small")}>Small (10×10)</Button>
              <Button size="sm" active={currentLabel() === "medium"} onClick={() => applyStandardPreset("medium")}>Medium (20×20)</Button>
              <Button size="sm" active={currentLabel() === "large"} onClick={() => applyStandardPreset("large")}>Large (40×40)</Button>
            </div>
          </div>
        </div>
      }
    >
      {/* ========== custom room ========== */}
      <div class="p-4 bg-base-100 rounded-lg shadow-sm space-y-3">

        {/* --- Imported: locked --- */}
        <Show when={isImported()}>
          <div class="alert alert-info text-sm py-2"><span>已选择自定义地图，随机生成参数已禁用。</span></div>
          <div class="flex items-end gap-2">
            <div class="flex-1"><MapSelector value={currentMapId() ?? ''} onChange={selectCustomMap} placeholder="从地图工坊选择..." /></div>
            <Button size="sm" variant="ghost" onClick={clearCustomMap}>清除</Button>
          </div>
        </Show>

        {/* --- Gen mode + dimensions (not imported) --- */}
        <Show when={!isImported()}>
          <div class="flex items-center gap-2">
            <div class="btn-group">
              <Button size="sm" active={props.setting.type === PreGameMapType.Random} onClick={() => switchGenType(PreGameMapType.Random)}>随机</Button>
              <Button size="sm" active={props.setting.type === PreGameMapType.Custom} onClick={() => switchGenType(PreGameMapType.Custom)}>自定义</Button>
            </div>
            <Input type="number" bordered min={10} max={500} step={1} value={String((props.setting as any).width ?? 32)}
              class="w-20" size="sm" onInput={(e) => setWidth(Number(e.currentTarget.value))} placeholder="宽" />
            <span class="text-xs opacity-40">×</span>
            <Input type="number" bordered min={10} max={500} step={1} value={String((props.setting as any).height ?? 24)}
              class="w-20" size="sm" onInput={(e) => setHeight(Number(e.currentTarget.value))} placeholder="高" />
          </div>
        </Show>

        {/* --- Map selector (only when NOT imported, avoid duplicate) --- */}
        <Show when={!isImported()}>
          <div>
            <label class="label py-1"><span class="label-text text-xs">自定义地图</span><span class="label-text-alt">选择预设地图替代随机生成</span></label>
            <MapSelector value={currentMapId() ?? ''} onChange={selectCustomMap} placeholder="留空使用随机生成" />
          </div>
        </Show>

        {/* --- Advanced: tile frequency + custom data (collapsible) --- */}
        <Show when={!isImported()}>
          <button type="button" class="flex items-center gap-1 text-xs opacity-50 hover:opacity-100 w-full" onClick={() => setAdvancedOpen(o => !o)}>
            <span class={advancedOpen() ? 'rotate-90' : ''} style="transition:transform 0.15s;display:inline-block">▸</span>
            高级生成设置
          </button>
          <Show when={advancedOpen()}>
            <div class="space-y-3">
              <div>
                <label class="label py-1"><span class="label-text text-xs">地形频率</span><span class="label-text-alt">数值越大越常见</span></label>
                <div class="grid gap-1">
                  <For each={tileTypes}>
                    {(t) => {
                      const val = ((props.setting as any).tileFrequency ?? {})[t] ?? 0;
                      return (
                        <div class="flex items-center gap-2">
                          <div class="w-16 text-xs">{t}</div>
                          <Input type="number" bordered min={0} step={1} value={String(val)} class="w-20" size="xs" onInput={(e) => setTileFreq(t, Number(e.currentTarget.value))} />
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
              <Show when={props.setting.type === PreGameMapType.Custom}>
                <div>
                  <label class="label py-1"><span class="label-text text-xs">自定义数据</span></label>
                  <Textarea bordered class="w-full" value={String((props.setting as any).customData ?? "")} onInput={(e) => setCustomData(e.currentTarget.value)} rows={3} />
                </div>
              </Show>
            </div>
          </Show>
        </Show>

      </div>
    </Show>
  );
};

export default PreGameMapSettingForm;

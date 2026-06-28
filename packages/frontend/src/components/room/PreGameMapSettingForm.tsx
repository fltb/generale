import {
  PRESET_SIZES,
  type PreGameCustomMapSetting,
  type PreGameImportedMapSetting,
  type PreGameMapSetting,
  PreGameMapType,
  type PreGameRandomMapSetting,
  type PreGameRoomType,
  type PreGameStandardSizeLabel,
  TileType,
} from "@generale/types";
import { type Component, createSignal, For, Show } from "solid-js";
import { MapSelector } from "~/components/map-editor/MapSelector";
import { Button, Input, Textarea } from "~/ui";
import { useT } from "~/i18n/useT";

export interface PreGameMapSettingFormProps {
  setting: PreGameMapSetting;
  roomType?: PreGameRoomType;
  onChange: (next: PreGameMapSetting) => void;
}

export const PreGameMapSettingForm: Component<PreGameMapSettingFormProps> = (props) => {
  const { t } = useT();
  const tileTypes = Object.values(TileType) as TileType[];
  const isImported = () => props.setting.type === PreGameMapType.Imported;
  const currentMapId = () =>
    props.setting.type === PreGameMapType.Imported
      ? (props.setting as PreGameImportedMapSetting).customMapId
      : undefined;
  const [advancedOpen, setAdvancedOpen] = createSignal(false);

  const applyStandardPreset = (label: PreGameStandardSizeLabel) => {
    const dims = PRESET_SIZES[label];
    props.onChange({
      type: PreGameMapType.Random,
      width: dims.width,
      height: dims.height,
      tileFrequency: {},
      sizeLabel: label,
    } as PreGameRandomMapSetting);
  };

  const switchGenType = (type: PreGameMapType) => {
    const cur = props.setting as PreGameRandomMapSetting | PreGameCustomMapSetting;
    if (type === PreGameMapType.Random) {
      props.onChange({
        type,
        width: cur.width ?? 32,
        height: cur.height ?? 24,
        tileFrequency: {},
      } as PreGameRandomMapSetting);
    } else {
      props.onChange({
        type,
        width: cur.width ?? 32,
        height: cur.height ?? 24,
        tileFrequency: { ...(cur.tileFrequency ?? {}) },
        customData: (cur as PreGameCustomMapSetting).customData ?? "",
      } as PreGameCustomMapSetting);
    }
  };

  const selectCustomMap = (id: string) => {
    if (!id) {
      clearCustomMap();
      return;
    }
    props.onChange({ type: PreGameMapType.Imported, customMapId: id } as PreGameImportedMapSetting);
  };

  const clearCustomMap = () => {
    props.onChange({
      type: PreGameMapType.Custom,
      width: 32,
      height: 24,
      tileFrequency: {},
      customData: "",
    } as PreGameCustomMapSetting);
  };

  const setWidth = (w: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom)
      props.onChange({ ...cur, width: Math.max(10, Math.min(500, Math.floor(w))) } as
        | PreGameRandomMapSetting
        | PreGameCustomMapSetting);
  };
  const setHeight = (h: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom)
      props.onChange({ ...cur, height: Math.max(10, Math.min(500, Math.floor(h))) } as
        | PreGameRandomMapSetting
        | PreGameCustomMapSetting);
  };
  const setTileFreq = (tile: TileType, v: number) => {
    const cur = props.setting;
    if (cur.type === PreGameMapType.Random || cur.type === PreGameMapType.Custom) {
      const cur2 = cur as PreGameRandomMapSetting | PreGameCustomMapSetting;
      const prev = cur2.tileFrequency ?? {};
      props.onChange({ ...cur2, tileFrequency: { ...prev, [tile]: Math.max(0, Number(v)) } } as
        | PreGameRandomMapSetting
        | PreGameCustomMapSetting);
    }
  };
  const setCustomData = (data: string) => {
    if (props.setting.type === PreGameMapType.Custom)
      props.onChange({ ...(props.setting as PreGameCustomMapSetting), customData: data });
  };
  const currentLabel = () =>
    props.setting.type === PreGameMapType.Random ? (props.setting as PreGameRandomMapSetting).sizeLabel : undefined;

  return (
    <Show
      when={props.roomType !== "standard"}
      fallback={
        <div class="p-4 bg-base-100 rounded-lg shadow-sm space-y-3">
          <div>
            <div class="label">
              <span class="label-text">{t("Preset Size")}</span>
            </div>
            <div class="btn-group">
              <Button size="sm" active={currentLabel() === "small"} onClick={() => applyStandardPreset("small")}>
                Small (10×10)
              </Button>
              <Button size="sm" active={currentLabel() === "medium"} onClick={() => applyStandardPreset("medium")}>
                Medium (20×20)
              </Button>
              <Button size="sm" active={currentLabel() === "large"} onClick={() => applyStandardPreset("large")}>
                Large (40×40)
              </Button>
            </div>
          </div>
        </div>
      }
    >
      {/* ========== custom room ========== */}
      <div class="p-4 bg-base-100 rounded-lg shadow-sm space-y-3">
        {/* --- Imported: locked --- */}
        <Show when={isImported()}>
          <div class="alert alert-info text-sm py-2">
            <span>{t("Custom map selected. Random generation parameters disabled.")}</span>
          </div>
          <div class="flex items-end gap-2">
            <div class="flex-1">
              <MapSelector value={currentMapId() ?? ""} onChange={selectCustomMap} placeholder={t("Select from map workshop...")} />
            </div>
            <Button size="sm" variant="ghost" onClick={clearCustomMap}>
              {t("Clear")}
            </Button>
          </div>
        </Show>

        {/* --- Gen mode + dimensions (not imported) --- */}
        <Show when={!isImported()}>
          <div class="flex items-center gap-2">
            <div class="btn-group">
              <Button
                size="sm"
                active={props.setting.type === PreGameMapType.Random}
                onClick={() => switchGenType(PreGameMapType.Random)}
              >
                {t("Random")}
              </Button>
              <Button
                size="sm"
                active={props.setting.type === PreGameMapType.Custom}
                onClick={() => switchGenType(PreGameMapType.Custom)}
              >
                {t("Custom")}
              </Button>
            </div>
            <Input
              type="number"
              bordered
              min={10}
              max={500}
              step={1}
              value={String(
                props.setting.type !== PreGameMapType.Imported
                  ? (props.setting as PreGameRandomMapSetting | PreGameCustomMapSetting).width
                  : 32,
              )}
              class="w-20"
              size="sm"
              onInput={(e) => setWidth(Number(e.currentTarget.value))}
              placeholder="宽"
            />
            <span class="text-xs opacity-40">×</span>
            <Input
              type="number"
              bordered
              min={10}
              max={500}
              step={1}
              value={String(
                props.setting.type !== PreGameMapType.Imported
                  ? (props.setting as PreGameRandomMapSetting | PreGameCustomMapSetting).height
                  : 24,
              )}
              class="w-20"
              size="sm"
              onInput={(e) => setHeight(Number(e.currentTarget.value))}
              placeholder="高"
            />
          </div>
        </Show>

        {/* --- Map selector (only when NOT imported, avoid duplicate) --- */}
        <Show when={!isImported()}>
          <div>
            <div class="label py-1">
              <span class="label-text text-xs">{t("Custom Map")}</span>
              <span class="label-text-alt">{t("Choose a preset map instead of random generation")}</span>
            </div>
            <MapSelector value={currentMapId() ?? ""} onChange={selectCustomMap} placeholder="留空使用随机生成" />
          </div>
        </Show>

        {/* --- Advanced: tile frequency + custom data (collapsible) --- */}
        <Show when={!isImported()}>
          <button
            type="button"
            class="flex items-center gap-1 text-xs opacity-50 hover:opacity-100 w-full"
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            <span class={advancedOpen() ? "rotate-90" : ""} style="transition:transform 0.15s;display:inline-block">
              ▸
            </span>
            {t("Advanced Generation Settings")}
          </button>
          <Show when={advancedOpen()}>
            <div class="space-y-3">
              <div>
                <div class="label py-1">
                  <span class="label-text text-xs">{t("Tile Frequency")}</span>
                  <span class="label-text-alt">数值越大越常见</span>
                </div>
                <div class="grid gap-1">
                  <For each={tileTypes}>
                    {(t) => {
                      const val =
                        (props.setting as PreGameRandomMapSetting | PreGameCustomMapSetting).tileFrequency?.[t] ?? 0;
                      return (
                        <div class="flex items-center gap-2">
                          <div class="w-16 text-xs">{t}</div>
                          <Input
                            type="number"
                            bordered
                            min={0}
                            step={1}
                            value={String(val)}
                            class="w-20"
                            size="xs"
                            onInput={(e) => setTileFreq(t, Number(e.currentTarget.value))}
                          />
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
              <Show when={props.setting.type === PreGameMapType.Custom}>
                <div>
                  <div class="label py-1">
                    <span class="label-text text-xs">{t("Custom Data")}</span>
                  </div>
                  <Textarea
                    bordered
                    class="w-full"
                    value={String(
                      props.setting.type === PreGameMapType.Custom
                        ? ((props.setting as PreGameCustomMapSetting).customData ?? "")
                        : "",
                    )}
                    onInput={(e) => setCustomData(e.currentTarget.value)}
                    rows={3}
                  />
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

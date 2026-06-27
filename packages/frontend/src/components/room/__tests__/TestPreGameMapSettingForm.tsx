import { type PreGameMapSetting, PreGameMapType, TileType } from "@generale/types";
import { createSignal, For, Show } from "solid-js";
import { PreGameMapSettingForm } from "../PreGameMapSettingForm";

export const TestPreGameMapSettingForm = () => {
  const defaultRandom: PreGameMapSetting = {
    type: PreGameMapType.Random,
    width: 32,
    height: 24,
    tileFrequency: {
      [TileType.Plain]: 40,
      [TileType.Throne]: 1,
      [TileType.Barracks]: 5,
      [TileType.Mountain]: 2,
      [TileType.Swamp]: 3,
      [TileType.Fog]: 0,
    },
  };

  const [setting, setSetting] = createSignal<PreGameMapSetting>(defaultRandom);
  const [logs, setLogs] = createSignal<string[]>([]);

  const pushLog = (s: string) => setLogs((p) => [`${new Date().toLocaleTimeString()} - ${s}`, ...p]);

  const handleChange = (next: PreGameMapSetting) => {
    setSetting(next);
    pushLog(`onChange -> ${JSON.stringify(next)}`);
  };

  const toRandom = () => {
    const rnd: PreGameMapSetting = {
      type: PreGameMapType.Random,
      width: 40,
      height: 30,
      tileFrequency: {
        [TileType.Plain]: 50,
        [TileType.Throne]: 1,
      },
    };
    handleChange(rnd);
  };

  const toCustom = () => {
    const c: PreGameMapSetting = {
      type: PreGameMapType.Custom,
      width: 20,
      height: 12,
      tileFrequency: {
        [TileType.Plain]: 30,
        [TileType.Barracks]: 3,
      },
      customData: '{"note":"custom map"}',
    } as any;
    handleChange(c);
  };

  const toImported = () => {
    const i: PreGameMapSetting = {
      type: PreGameMapType.Imported,
      mapName: "island_v1",
    } as any;
    handleChange(i);
  };

  return (
    <div class="p-5 space-y-4">
      <h2 class="text-xl font-bold">🧪 PreGameMapSettingForm 测试</h2>

      <div class="flex items-center gap-3">
        <div>
          <div>
            当前类型: <strong>{setting().type}</strong>
          </div>
          <Show when={setting().type !== PreGameMapType.Imported}>
            <div>
              尺寸:{" "}
              <strong>
                {(setting() as any).width} × {(setting() as any).height}
              </strong>
            </div>
          </Show>
          <Show when={setting().type === PreGameMapType.Imported}>
            <div>
              mapName: <strong>{(setting() as any).mapName}</strong>
            </div>
          </Show>
        </div>

        <div class="btn-group">
          <button type="button" class="btn btn-sm" onClick={() => toRandom()}>
            切到 Random
          </button>
          <button type="button" class="btn btn-sm" onClick={() => toCustom()}>
            切到 Custom
          </button>
          <button type="button" class="btn btn-sm" onClick={() => toImported()}>
            切到 Imported
          </button>
          <button
            type="button"
            class="btn btn-sm"
            onClick={() => {
              setSetting(defaultRandom);
              pushLog("重置为默认 Random");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div class="border p-4 rounded">
        <PreGameMapSettingForm setting={setting()} onChange={(s) => handleChange(s)} />
      </div>

      <div>
        <h3 class="font-semibold">快速操作</h3>
        <div class="flex gap-2 mt-2 flex-wrap">
          <button
            type="button"
            class="btn btn-xs"
            onClick={() => handleChange({ type: PreGameMapType.Random, width: 16, height: 12, tileFrequency: {} })}
          >
            Tiny Random
          </button>
          <button
            type="button"
            class="btn btn-xs"
            onClick={() =>
              handleChange({
                type: PreGameMapType.Custom,
                width: 100,
                height: 100,
                tileFrequency: {},
                customData: "{}",
              } as any)
            }
          >
            Huge Custom
          </button>
        </div>
      </div>

      <div>
        <h3 class="font-semibold">当前 tileFrequency（若存在）</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <For each={Object.entries(((setting() as any).tileFrequency ?? {}) as Record<string, number>)}>
            {([k, v]) => (
              <div class="p-2 border rounded">
                <div class="font-medium">{k}</div>
                <div class="text-sm">frequency: {v}</div>
              </div>
            )}
          </For>
        </div>
      </div>

      <div>
        <h3 class="font-semibold">事件日志</h3>
        <div class="max-h-48 overflow-auto border rounded p-2 mt-2">
          <For each={logs()}>{(l) => <div class="text-xs truncate">{l}</div>}</For>
        </div>
      </div>
    </div>
  );
};

export default TestPreGameMapSettingForm;

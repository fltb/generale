import { createSignal, For, Show } from "solid-js";
import { PreGameRoomStateFrom } from "../StateForm";
import { TileType } from "@generale/types";

export const TestPreGameRoomStateFrom = () => {
  // 初始 gameSetting 测试数据
  const initial = {
    speed: 1,
    afkThreshold: 10,
    tileGrow: {
      [TileType.Plain]: { duration: 5, growth: 1 },
      [TileType.Barracks]: { duration: 1, growth: 1 },
      [TileType.Throne]: { duration: 1, growth: 1 },
    },
  };

  const [state, setState] = createSignal(initial);
  const [logs, setLogs] = createSignal<string[]>([]);

  const pushLog = (s: string) =>
    setLogs((prev) => [`${new Date().toLocaleTimeString()} - ${s}`, ...prev]);

  // 传给子组件的 onChange：记录并同步本地 state（模拟父组件处理）
  const handleChange = (next: typeof initial) => {
    setState(next);
    pushLog(`onChange -> ${JSON.stringify(next)}`);
  };

  // 快速操作：修改 speed / afk / 单个 tile 的 duration/growth（模拟用户或外部变更）
  const setSpeed = (v: number) => {
    const nxt = { ...state(), speed: v };
    handleChange(nxt);
  };

  const setAfk = (v: number) => {
    const nxt = { ...state(), afkThreshold: v };
    handleChange(nxt);
  };

  const changeTile = (tile: TileType, field: "duration" | "growth", v: number) => {
    const prev = state();
    const prevEntry = prev.tileGrow[tile] ?? { duration: 0, growth: 0 };
    const newEntry = { ...prevEntry, [field]: v };
    const newTileGrow = { ...prev.tileGrow, [tile]: newEntry };
    const nxt = { ...prev, tileGrow: newTileGrow };
    handleChange(nxt);
  };

  const randomize = () => {
    const rnd = Math.round(Math.random() * 20) / 10;
    setSpeed(0.5 + rnd % 3);
    setAfk(Math.floor(Math.random() * 30));
    pushLog("随机化设置");
  };

  return (
    <div class="p-5 space-y-4">
      <h2 class="text-xl font-bold">🧪 PreGameRoomStateFrom 测试</h2>

      <div class="flex items-center gap-3">
        <div>
          <div>speed: <strong>{state().speed}</strong></div>
          <div>afkThreshold: <strong>{state().afkThreshold}</strong></div>
        </div>

        <button class="btn btn-sm" onClick={() => setState(initial)}>重置为初始</button>
        <button class="btn btn-sm" onClick={() => randomize()}>随机化</button>
      </div>

      <div class="border p-4 rounded">
        <PreGameRoomStateFrom
          state={state()}
          onChange={(s) => handleChange(s)}
        />
      </div>

      <div>
        <h3 class="font-semibold">快速操作（直接调用 onChange 的等价操作）</h3>
        <div class="flex gap-2 mt-2 flex-wrap">
          <button class="btn btn-xs" onClick={() => setSpeed(0.5)}>speed = 0.5</button>
          <button class="btn btn-xs" onClick={() => setSpeed(3)}>speed = 3</button>
          <button class="btn btn-xs" onClick={() => setAfk(0)}>afk = 0</button>
          <button class="btn btn-xs" onClick={() => setAfk(60)}>afk = 60</button>

          <button class="btn btn-xs" onClick={() => changeTile(TileType.Plain, "duration", (state().tileGrow[TileType.Plain]?.duration ?? 0) + 1)}>
            PLAIN duration +1
          </button>
          <button class="btn btn-xs" onClick={() => changeTile(TileType.Plain, "growth", (state().tileGrow[TileType.Plain]?.growth ?? 0) + 1)}>
            PLAIN growth +1
          </button>

          <button class="btn btn-xs" onClick={() => changeTile(TileType.Barracks, "duration", 0)}>BARRACKS duration = 0</button>
          <button class="btn btn-xs" onClick={() => changeTile(TileType.Mountain, "growth", 5)}>MOUNTAIN growth = 5</button>
        </div>
      </div>

      <div>
        <h3 class="font-semibold">当前 tileGrow</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <For each={Object.entries(state().tileGrow)}>
            {([tile, cfg]) => (
              <div class="p-2 border rounded">
                <div class="font-medium">{tile}</div>
                <div class="text-sm">duration: {cfg.duration}</div>
                <div class="text-sm">growth: {cfg.growth}</div>
              </div>
            )}
          </For>
        </div>
      </div>

      <div>
        <h3 class="font-semibold">事件日志</h3>
        <div class="max-h-48 overflow-auto border rounded p-2 mt-2">
          <Show when={logs().length === 0}>
            <div class="text-sm opacity-60">尚无事件，操作组件或点击快速操作后会在这里记录日志。</div>
          </Show>

          <For each={logs()}>
            {(l) => <div class="text-xs truncate">{l}</div>}
          </For>
        </div>
      </div>
    </div>
  );
};

import { createSignal, For, Show } from "solid-js";
import { PreGameControls } from "../PreGameControls";

export const TestPreGameControls = () => {
  const [started, setStarted] = createSignal(false);
  const [isHost, setIsHost] = createSignal(false);

  // 记录回调事件，便于观察
  const [logs, setLogs] = createSignal<string[]>([]);

  const pushLog = (msg: string) =>
    setLogs((prev) => [`${new Date().toLocaleTimeString()} - ${msg}`, ...prev]);

  // 回调实现（测试用）
  const handleReadyToggle = (ready: boolean) => {
    pushLog(`onReadyToggle -> ready=${ready}`);
  };

  const handleStartGame = () => {
    pushLog("onStartGame called");
    setStarted(true);
  };

  const handleLeave = () => {
    pushLog("onLeave called");
  };

  const handleDisband = () => {
    pushLog("onDisband called");
    // 模拟解散房间后重置状态
    setStarted(false);
    setIsHost(false);
  };

  return (
    <div class="p-5 space-y-4">
      <h2 class="text-xl font-bold">🧪 PreGameControls 测试</h2>

      <div class="flex items-center gap-3">
        <div>
          <div>当前身份: <strong>{isHost() ? "Host" : "Player"}</strong></div>
          <div>游戏已开始: <strong>{started() ? "Yes" : "No"}</strong></div>
        </div>

        <button class="btn btn-sm" onClick={() => setIsHost(true)}>切换为 Host</button>
        <button class="btn btn-sm" onClick={() => setIsHost(false)}>切换为 普通玩家</button>
        <button class="btn btn-sm" onClick={() => { setStarted(false); pushLog("手动将 started 设为 false"); }}>Reset started</button>
        <button class="btn btn-sm" onClick={() => { setStarted(true); pushLog("手动将 started 设为 true"); }}>Set started</button>
      </div>

      <div class="border p-4 rounded">
        <PreGameControls
          started={started()}
          isHost={isHost()}
          onReadyToggle={(r) => handleReadyToggle(r)}
          onStartGame={() => handleStartGame()}
          onLeave={() => handleLeave()}
          onDisband={() => handleDisband()}
        />
      </div>

      <div>
        <h3 class="font-semibold">快速操作（直接触发回调，用于测试）</h3>
        <div class="flex gap-2 mt-2">
          <button class="btn btn-xs" onClick={() => handleReadyToggle(true)}>模拟准备(true)</button>
          <button class="btn btn-xs" onClick={() => handleReadyToggle(false)}>模拟准备(false)</button>
          <button class="btn btn-xs" onClick={() => handleStartGame()}>模拟开始游戏</button>
          <button class="btn btn-xs" onClick={() => handleLeave()}>模拟离开</button>
          <button class="btn btn-xs btn-error" onClick={() => handleDisband()}>模拟解散</button>
        </div>
      </div>

      <div>
        <h3 class="font-semibold">事件日志</h3>
        <div class="max-h-48 overflow-auto border rounded p-2 mt-2">
          <Show when={logs().length === 0}>
            <div class="text-sm opacity-60">尚无事件，点击控件进行测试后会在这里显示日志。</div>
          </Show>
          <For each={logs()}>
            {(l) => <div class="text-xs truncate">{l}</div>}
          </For>
        </div>
      </div>
    </div>
  );
};

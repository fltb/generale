// src/components/RoomIntegrationTest.tsx
import { type Component, createSignal, For } from "solid-js";
import RoomWithSync from "../Room";

export const RoomIntegrationTest: Component = () => {
  const [domain, setDomain] = createSignal<string>("");
  const [playerId, setPlayerId] = createSignal<string>("");
  const [playerName, setPlayerName] = createSignal<string>("");
  const [mounted, setMounted] = createSignal(false);
  const [logs, setLogs] = createSignal<string[]>([]);

  const pushLog = (s: string) => setLogs((l) => [...l, `${new Date().toLocaleTimeString()} ${s}`]);

  // mount / unmount RoomWithSync
  const handleMount = () => {
    if (!domain() || !playerId()) {
      pushLog("请先填写 domain 和 playerId");
      return;
    }
    setMounted(true);
    pushLog(`Mounted RoomWithSync domain=${domain()} playerId=${playerId()}`);
  };

  const handleUnmount = () => {
    setMounted(false);
    pushLog("Unmounted RoomWithSync");
  };

  // helper: call backend test route to emit custom event to domain
  const emitCustom = async (payload: any) => {
    if (!domain()) {
      pushLog("domain required");
      return;
    }
    try {
      const res = await fetch(`/game/test/emit-custom`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domain(), payload }),
      });
      const json = await res.json();
      pushLog(`emitCustom -> ${JSON.stringify(json)}`);
    } catch (e: any) {
      pushLog(`emitCustom error: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <div class="p-4 space-y-4">
      <h3 class="font-bold">RoomIntegrationTest — 使用 RoomWithSync</h3>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          class="input input-bordered"
          placeholder="domain (e.g. game/abc123)"
          value={domain()}
          onInput={(e) => setDomain((e.currentTarget as HTMLInputElement).value)}
        />
        <input
          class="input input-bordered"
          placeholder="playerId"
          value={playerId()}
          onInput={(e) => setPlayerId((e.currentTarget as HTMLInputElement).value)}
        />
        <input
          class="input input-bordered"
          placeholder="playerName"
          value={playerName()}
          onInput={(e) => setPlayerName((e.currentTarget as HTMLInputElement).value)}
        />
      </div>

      <div class="flex gap-2">
        <button class="btn btn-primary" onClick={handleMount} disabled={mounted()}>
          Mount Room
        </button>
        <button class="btn btn-ghost" onClick={handleUnmount} disabled={!mounted()}>
          Unmount Room
        </button>
        <button
          class="btn btn-sm"
          onClick={() =>
            emitCustom({ type: "KICKED", reason: `test kick from ${playerName() || playerId()}` })
          }
        >
          Emit KICKED (server)
        </button>
        <button
          class="btn btn-sm"
          onClick={() => emitCustom({ type: "DISBANDED", reason: "test disband" })}
        >
          Emit DISBANDED (server)
        </button>
        <button
          class="btn btn-sm"
          onClick={() =>
            emitCustom({ type: "GAME_STARTED", reason: "test start" })
          }
        >
          Emit GAME_STARTED (server)
        </button>
      </div>

      <div class="border rounded p-4 bg-base-100">
        <div class="mb-2 font-medium">Mounted Room</div>
        <div>
          {/* conditionally render RoomWithSync with current props */}
          <For each={[mounted()]}>
            {(m) =>
              m ? (
                <RoomWithSync
                  domain={domain()}
                  playerId={playerId()}
                  playerName={playerName()}
                />
              ) : (
                <div class="text-sm opacity-60">Room not mounted</div>
              )
            }
          </For>
        </div>
      </div>

      <div class="border rounded p-4 bg-base-100">
        <div class="mb-2 font-medium">Logs</div>
        <div class="max-h-48 overflow-auto space-y-1 text-xs">
          <For each={logs()}>
            {(l) => <div>{l}</div>}
          </For>
        </div>
      </div>
    </div>
  );
};

export default RoomIntegrationTest;

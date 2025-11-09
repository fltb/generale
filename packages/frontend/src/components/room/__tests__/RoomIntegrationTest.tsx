// src/components/RoomIntegrationTest.tsx
import { type Component, createSignal, For, Show } from "solid-js";
import RoomWithSync from "../Room";
import { WebSocketProvider } from "~/hooks/useWebsocket";
import type { GameId } from "@generale/types";

/**
 * Integration test using /api/game/connect/:gameId/:playerId
 * Two independent panels: Host and Guest. Each panel has its own WS connection.
 */

const RoomIntegrationTest: Component = () => {
  // Host state
  const [hostDomain, setHostDomain] = createSignal<string>("");
  const [hostPlayerId, setHostPlayerId] = createSignal<string>("");
  const [hostPlayerName, setHostPlayerName] = createSignal<string>("host_alice");
  const [hostMounted, setHostMounted] = createSignal(false);
  const loc = window.location;

  const [hostWsUrl, setHostWsUrl] = createSignal<string>((window.location.protocol === "https:" ? "wss:" : "ws:") + "//" + window.location.host + "/api/ws");
  const [hostGameId, setHostGameId] = createSignal<GameId | null>(null);

  // Guest state
  const [guestDomain, setGuestDomain] = createSignal<string>("");
  const [guestPlayerId, setGuestPlayerId] = createSignal<string>("");
  const [guestPlayerName, setGuestPlayerName] = createSignal<string>("guest_bob");
  const [guestMounted, setGuestMounted] = createSignal(false);
  const [guestWsUrl, setGuestWsUrl] = createSignal<string>((loc.protocol === "https:" ? "wss:" : "ws:") + "//" + loc.host + "/api/ws");

  // logs
  const [logs, setLogs] = createSignal<string[]>([]);
  const pushLog = (s: string) =>
    setLogs((l) => [...l, `${new Date().toLocaleTimeString()} ${s}`]);

  // helper to call connect endpoint
  async function callConnect(gameId: GameId, playerId: string) {
    try {
      const url = `/api/game/connect/${encodeURIComponent(String(gameId))}/${encodeURIComponent(
        playerId
      )}`;
      pushLog(`callConnect -> GET ${url}`);
      const res = await fetch(url, { method: "GET" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        pushLog(`connect failed ${res.status} ${JSON.stringify(json)}`);
        return null;
      }
      pushLog(`connect resp ${JSON.stringify(json)}`);
      return json?.data ?? null;
    } catch (err: any) {
      pushLog(`connect error: ${err?.message ?? String(err)}`);
      return null;
    }
  }

  // --- Host actions ---
  async function createRoomAsHost() {
    pushLog("Host: createRoom...");
    try {
      const res = await fetch("/api/game/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: hostPlayerName(),
          gameSettings: { maxPlayers: 6 },
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        pushLog(`Host create failed ${res.status} ${txt}`);
        return;
      }
      const data = await res.json();
      pushLog(`Host create result ${JSON.stringify(data)}`);
      const d = data?.data;
      if (d) {
        setHostGameId(d.gameId);
        // server may not return playerId on create (per your route), generate a local one
        const newPid =
          d.playerId && d.playerId.length > 0
            ? d.playerId
            : `${hostPlayerName()}_${Date.now()}`;
        setHostPlayerId(newPid);

        // immediately call connect to get domains
        const connectData = await callConnect(d.gameId, newPid);
        if (connectData) {
          // connectData.domains expected to be an array of domain names (e.g. ["pregame-<id>"])
          const domains = connectData.domains;
          if (Array.isArray(domains) && domains.length > 0) {
            setHostDomain(domains[0]);
            pushLog(`Host domain set to ${domains[0]}`);
          } else if (connectData.domain) {
            setHostDomain(connectData.domain);
            pushLog(`Host domain set to ${connectData.domain}`);
          } else {
            // fallback to convention if API doesn't return domains
            const fallback = `pregame-${d.gameId}`;
            setHostDomain(fallback);
            pushLog(`Host fallback domain set to ${fallback}`);
          }
        } else {
          const fallback = `pregame-${d.gameId}`;
          setHostDomain(fallback);
          pushLog(`Host connect returned no data, fallback domain ${fallback}`);
        }
      }
    } catch (err: any) {
      pushLog("Host create error: " + (err?.message ?? String(err)));
    }
  }

  const handleMountHost = () => {
    if (!hostDomain() || !hostPlayerId()) {
      pushLog("Host：请先填写 domain 和 playerId（先 Create Room / callConnect）");
      return;
    }
    setHostMounted(true);
    pushLog(`Mounted Host Room domain=${hostDomain()} playerId=${hostPlayerId()}`);
  };
  const handleUnmountHost = () => {
    setHostMounted(false);
    pushLog("Unmounted Host Room");
  };

  // --- Guest actions ---
  async function createGuest() {
    if (!hostGameId()) {
      pushLog("Guest: no gameId available (先在 Host 创建房间)");
      return;
    }
    // generate guest playerId if not provided
    const genPid = `${guestPlayerName()}_${Date.now()}`;
    setGuestPlayerId(genPid);
    pushLog(`Guest: generated playerId=${genPid}, calling connect...`);

    const connectData = await callConnect(hostGameId()!, genPid);
    if (connectData) {
      const domains = connectData.domains;
      if (Array.isArray(domains) && domains.length > 0) {
        setGuestDomain(domains[0]);
        pushLog(`Guest domain set to ${domains[0]}`);
      } else if (connectData.domain) {
        setGuestDomain(connectData.domain);
        pushLog(`Guest domain set to ${connectData.domain}`);
      } else {
        const fallback = `pregame-${hostGameId()}`;
        setGuestDomain(fallback);
        pushLog(`Guest fallback domain set to ${fallback}`);
      }
    } else {
      const fallback = `pregame-${hostGameId()}`;
      setGuestDomain(fallback);
      pushLog(`Guest connect returned no data, fallback domain ${fallback}`);
    }
  }

  const handleMountGuest = () => {
    if (!guestDomain() || !guestPlayerId()) {
      pushLog("Guest：请先填写 domain 和 playerId（先 Create Room -> CreateGuest）");
      return;
    }
    setGuestMounted(true);
    pushLog(`Mounted Guest Room domain=${guestDomain()} playerId=${guestPlayerId()}`);
  };
  const handleUnmountGuest = () => {
    setGuestMounted(false);
    pushLog("Unmounted Guest Room");
  };

  // helper: server-side emit custom event to domain (same endpoint used earlier)
  const emitCustomToDomain = async (payload: any) => {
    const domainToUse = hostDomain() || guestDomain();
    if (!domainToUse) {
      pushLog("emitCustom: need domain (create or connect first)");
      return;
    }
    try {
      const res = await fetch(`/game/test/emit-custom`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: domainToUse, payload }),
      });
      const json = await res.json();
      pushLog(`emitCustom -> ${JSON.stringify(json)}`);
    } catch (e: any) {
      pushLog(`emitCustom error: ${e?.message ?? String(e)}`);
    }
  };

  return (
    <div class="p-4 space-y-6">
      <h3 class="font-bold">RoomIntegrationTest — Host & Guest 双实例（独立 WS / 使用 /api/game/connect）</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Host Panel */}
        <div class="border rounded p-4 space-y-3 bg-base-100">
          <div class="font-medium">Host（房主）</div>
          <div class="grid grid-cols-1 gap-2">
            <input
              class="input input-bordered"
              value={hostPlayerName()}
              onInput={(e) => setHostPlayerName((e.currentTarget as HTMLInputElement).value)}
              placeholder="host playerName"
            />
            <input
              class="input input-bordered"
              value={hostWsUrl()}
              onInput={(e) => setHostWsUrl((e.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <div class="flex gap-2">
            <button class="btn btn-primary" onClick={createRoomAsHost}>Create Room (host)</button>
            <button class="btn" onClick={() => {
              const manual = prompt("Set host playerId (optional):", hostPlayerId() || "");
              if (manual !== null) setHostPlayerId(manual);
            }}>Set playerId</button>
            <button class="btn btn-primary" onClick={handleMountHost} disabled={hostMounted()}>Mount Host</button>
            <button class="btn btn-ghost" onClick={handleUnmountHost} disabled={!hostMounted()}>Unmount Host</button>
          </div>

          <div class="text-xs opacity-80">
            Domain: <span class="font-mono">{hostDomain() || "—"}</span><br />
            playerId: <span class="font-mono">{hostPlayerId() || "—"}</span><br />
            gameId: <span class="font-mono">{hostGameId() ?? "—"}</span>
          </div>

          <Show when={hostMounted()}>
            <WebSocketProvider
              url={hostWsUrl()}
              getToken={() => (hostPlayerId() ? `token_for_${hostPlayerId()}` : undefined)}
              autoConnect={false}
            >
              <div class="mt-2">
                <RoomWithSync
                  gameId={hostGameId() ?? ("" as any)}
                  domain={hostDomain()}
                  playerId={hostPlayerId()}
                  playerName={hostPlayerName()}
                />
              </div>
            </WebSocketProvider>
          </Show>
        </div>

        {/* Guest Panel */}
        <div class="border rounded p-4 space-y-3 bg-base-100">
          <div class="font-medium">Guest（非房主）</div>
          <div class="grid grid-cols-1 gap-2">
            <input
              class="input input-bordered"
              value={guestPlayerName()}
              onInput={(e) => setGuestPlayerName((e.currentTarget as HTMLInputElement).value)}
              placeholder="guest playerName"
            />
            <input
              class="input input-bordered"
              value={guestWsUrl()}
              onInput={(e) => setGuestWsUrl((e.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <div class="flex gap-2">
            <button class="btn btn-secondary" onClick={createGuest}>Connect as Guest (connect)</button>
            <button class="btn" onClick={() => {
              const manual = prompt("Set guest playerId (optional):", guestPlayerId() || "");
              if (manual !== null) setGuestPlayerId(manual);
            }}>Set playerId</button>
            <button class="btn btn-primary" onClick={handleMountGuest} disabled={guestMounted()}>Mount Guest</button>
            <button class="btn btn-ghost" onClick={handleUnmountGuest} disabled={!guestMounted()}>Unmount Guest</button>
          </div>

          <div class="text-xs opacity-80">
            Domain: <span class="font-mono">{guestDomain() || "—"}</span><br />
            playerId: <span class="font-mono">{guestPlayerId() || "—"}</span>
          </div>

          <Show when={guestMounted()}>
            <WebSocketProvider
              url={guestWsUrl()}
              getToken={() => (guestPlayerId() ? `token_for_${guestPlayerId()}` : undefined)}
              autoConnect={false}
            >
              <div class="mt-2">
                <RoomWithSync
                  gameId={hostGameId() ?? ("" as any)}
                  domain={guestDomain()}
                  playerId={guestPlayerId()}
                  playerName={guestPlayerName()}
                />
              </div>
            </WebSocketProvider>
          </Show>
        </div>
      </div>

      <div class="flex gap-2">
        <button class="btn btn-sm" onClick={() => emitCustomToDomain({ type: "KICKED", reason: "test kick" })}>Emit KICKED (server)</button>
        <button class="btn btn-sm" onClick={() => emitCustomToDomain({ type: "DISBANDED", reason: "test disband" })}>Emit DISBANDED (server)</button>
        <button class="btn btn-sm" onClick={() => emitCustomToDomain({ type: "GAME_STARTED", reason: "test start" })}>Emit GAME_STARTED (server)</button>
      </div>

      <div class="border rounded p-4 bg-base-100">
        <div class="mb-2 font-medium">Logs</div>
        <div class="max-h-48 overflow-auto space-y-1 text-xs">
          <For each={logs()}>
            {(l) => <div class="font-mono text-xs">{l}</div>}
          </For>
        </div>
      </div>
    </div>
  );
};

export default RoomIntegrationTest;

// src/components/GameRoomTesterWithHook.tsx
import { type Component, createSignal, createEffect, onCleanup } from "solid-js";
import { WebSocketProvider, useWS } from "~/hooks/useWebsocket";
import type { WSContextBase } from "~/ws/manager";
import type { SubConnectorClient, ClientConnectionManager } from "~/ws/manager";

/**
 * Inner tester — runs inside WebSocketProvider and uses manager from useWS()
 */
const InnerTester: Component<{
  gameId: string | null;
  playerId: string | null;
  playerName: string;
  domainPrimary: string | null;
  wsUrl: string;
}> = (props) => {
  const manager = useWS() as ClientConnectionManager<WSContextBase>;
  const [connected, setConnected] = createSignal(false);
  const [subOpen, setSubOpen] = createSignal(false);
  const [roomState, setRoomState] = createSignal<any>(null);
  const [logs, setLogs] = createSignal<string[]>([]);

  let sub: SubConnectorClient<any, any, WSContextBase> | null = null;
  let autoOpened = false;

  function pushLog(s: string) {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} ${s}`]);
    console.log("[InnerTester]", s);
  }

  // subscribe manager connection signal
  createEffect(() => {
    if (!manager) return;
    try {
      const isConn = manager.isConnectedSignal[0]();
      setConnected(isConn);
      pushLog(`WS connected = ${isConn}`);
    } catch (e) {
      console.error("manager isConnectedSignal error", e);
    }
  });

  // Watch props.playerId -> if set and not connected, connect automatically
  createEffect(() => {
    const pid = props.playerId;
    if (!manager) return;
    if (pid && !manager.isConnected) {
      pushLog(`playerId available (${pid}). auto-connecting WS...`);
      try {
        manager.connect(true);
      } catch (e) {
        pushLog("manager.connect threw: " + String(e));
      }
    }
  });

  // When connected and domain available, automatically open pregame sub once
  createEffect(() => {
    if (!manager) return;
    if (!connected()) return;
    if (!props.domainPrimary) return;
    if (subOpen()) return;
    if (autoOpened) return;

    // auto open pregame sub
    (async () => {
      pushLog(`Auto-opening pregame domain ${props.domainPrimary}`);
      // create local sub and attach handlers BEFORE sending openDomain
      sub = manager.getOrCreateSub(props.domainPrimary!, { userid: props.playerId ?? "unknown", username: props.playerName });

      sub.onOpen(() => {
        setSubOpen(true);
        pushLog(`sub ${props.domainPrimary} opened`);
      });

      sub.onMessage((payload: any) => {
        pushLog(`sub message: ${JSON.stringify(payload)}`);

        // try to interpret server sync message
        try {
          const maybe = payload?.payload ?? payload;
          if (maybe?.type === "snapshot") {
            setRoomState(maybe.payload);
            pushLog("applied snapshot (maybe.type === 'snapshot')");
            return;
          }
          if (payload?.type === "state-update" && payload?.payload?.type === "snapshot") {
            setRoomState(payload.payload.payload);
            pushLog("applied snapshot (state-update)");
            return;
          }
          if (maybe?.room) {
            setRoomState(maybe);
            pushLog("applied snapshot (payload.room)");
            return;
          }
          if (payload?.payload?.payload?.room) {
            setRoomState(payload.payload.payload);
            pushLog("applied snapshot (nested)");
            return;
          }
        } catch (err) {
          console.error("parse sub message error", err);
        }
      });

      sub.onClose(() => {
        setSubOpen(false);
        pushLog("sub closed");
      });
      sub.onDisconnect((err) => {
        setSubOpen(false);
        pushLog("sub disconnected: " + (err?.message ?? ""));
      });

      // Ensure server-side handler is registered first.
      // In your flow you already register on /api/test/register-domain from createRoom flow.
      // Here we simply request open (server should already have handler).
      try {
        manager.openDomain(props.domainPrimary!, { userid: props.playerId!, username: props.playerName });
        pushLog(`openDomain(${props.domainPrimary}) requested`);
        autoOpened = true;
      } catch (e) {
        pushLog("manager.openDomain threw: " + String(e));
      }
    })();
  });

  // Toggle ready (send action to server)
  function toggleReady() {
    if (!sub || !sub.ready) {
      pushLog("sub not ready");
      return;
    }
    const me = props.playerId!;
    const rs = roomState();
    const my = rs?.room?.players?.find((p: any) => p.id === me) ?? rs?.players?.find((p: any) => p.id === me);
    const amReady = !!(my?.ready && Number(my.ready) === 1);
    const actionType = amReady ? "player-unready" : "player-ready";
    const optimisticId = Date.now();
    const action = { optimisticId, type: actionType };
    sub.send(action);
    pushLog(`sent action ${actionType} optimistic=${optimisticId}`);
  }

  onCleanup(() => {
    try { sub?.close(); } catch {}
  });

  return (
    <div style={`border:1px solid #ddd;padding:0.75rem;background:#fff`}>
      <div style={`margin-bottom:0.5rem`}>
        <strong>WS:</strong> {connected() ? "connected" : "disconnected"} &nbsp;
        <strong>Sub:</strong> {subOpen() ? "OPEN" : "CLOSED"}
      </div>

      <div style={`display:flex; gap:0.5rem; margin-bottom:0.5rem`}>
        <button onClick={() => manager.connect(true)} disabled={connected()}>Connect WS</button>
        <button onClick={() => manager.close()} disabled={!connected()}>Close WS</button>
        <button onClick={() => {
          // manual open (in case you disabled auto-open)
          if (!props.domainPrimary) { pushLog("no domainPrimary"); return; }
          pushLog("Manual open pressed");
          // reuse the same open logic as auto-open effect: create sub then manager.openDomain
          sub = manager.getOrCreateSub(props.domainPrimary!, { userid: props.playerId ?? "unknown", username: props.playerName });
          sub.onOpen(() => { setSubOpen(true); pushLog(`sub ${props.domainPrimary} opened (manual)`); });
          sub.onMessage((p) => { pushLog(`sub message (manual): ${JSON.stringify(p)}`); setRoomState(p?.payload?.payload ?? p); });
          manager.openDomain(props.domainPrimary!, { userid: props.playerId!, username: props.playerName });
          pushLog(`openDomain(${props.domainPrimary}) requested (manual)`);
        }} disabled={!connected() || subOpen() || !props.domainPrimary}>Open pregame sub</button>

        <button onClick={toggleReady} disabled={!subOpen()}>Toggle Ready</button>
      </div>

      <div style={`display:flex; gap:1rem`}>
        <div style={`flex:1; border:1px solid #eee; padding:0.5rem; background:#fafafa`}>
          <div style={`font-weight:600`}>Room State</div>
          <pre style={`white-space:pre-wrap; font-size:0.9rem`}>{JSON.stringify(roomState(), null, 2)}</pre>
        </div>

        <div style={`width:380px; border:1px solid #eee; padding:0.5rem; background:#fff`}>
          <div style={`font-weight:600`}>Logs</div>
          <div style={`height:260px; overflow:auto; font-family:monospace; font-size:0.9rem`}>
            <ul style={`padding-left:0.8rem`}>
              {logs().map(l => <li><code>{l}</code></li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Wrapper — create room + provide WebSocketProvider
 */
const GameRoomTesterWithHook: Component = () => {
  const [playerName, setPlayerName] = createSignal("alice");
  const [gameId, setGameId] = createSignal<string | null>(null);
  const [playerId, setPlayerId] = createSignal<string | null>(null);
  const [domainPrimary, setDomainPrimary] = createSignal<string | null>(null);
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  const [wsUrl, setWsUrl] = createSignal(`${proto}//${loc.host}/api/ws`);

  const [logs, setLogs] = createSignal<string[]>([]);
  function pushLog(s: string) { setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} ${s}`]); console.log("[CreateFlow]", s); }

  // create room: call backend, then set gameId. Backend create returns playerId '' in your current server impl,
  // so we generate a client-side playerId to act as the user identity for the test.
  async function createRoom() {
    pushLog("createRoom...");
    try {
      const res = await fetch("/api/game/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: playerName(), gameSettings: { maxPlayers: 6 } })
      });
      if (!res.ok) {
        const txt = await res.text();
        pushLog(`create failed ${res.status} ${txt}`);
        return;
      }
      const data = await res.json();
      pushLog(`create result ${JSON.stringify(data)}`);
      const d = data?.data;
      if (d) {
        setGameId(d.gameId);
        // if backend didn't produce playerId, generate one for testing:
        const newPid = d.playerId && d.playerId.length > 0 ? d.playerId : `${playerName()}_${Date.now()}`;
        setPlayerId(newPid);
        // prepare domainPrimary (pregame)
        setDomainPrimary(`pregame-${d.gameId}`);
        pushLog(`using playerId=${newPid}, domainPrimary=pregame-${d.gameId}`);
        // Also register server-side domain handler for this pregame so server can accept opens
        try {
          const reg = await fetch("/api/test/register-domain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: `pregame-${d.gameId}` })
          });
          pushLog(`register pregame domain returned ${reg.status}`);
          const reg2 = await fetch("/api/test/register-domain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: `chat-${d.gameId}` })
          });
          pushLog(`register chat domain returned ${reg2.status}`);
        } catch (err: any) {
          pushLog("register domain error: " + String(err));
        }
      }
    } catch (err: any) {
      pushLog("create error: " + (err?.message ?? String(err)));
    }
  }

  return (
    <div style={`padding:1rem; max-width:980px`}>
      <h3>GameService PreGame Tester (useWebsocket)</h3>

      <div style={`display:flex; gap:0.5rem; margin-bottom:0.5rem; align-items:center`}>
        <input value={playerName()} onInput={(e) => setPlayerName((e.target as HTMLInputElement).value)} placeholder="player name" />
        <input value={wsUrl()} onInput={(e) => setWsUrl((e.target as HTMLInputElement).value)} style={`width:320px`} />
        <button onClick={createRoom}>Create Room</button>
      </div>

      <div style={`margin-bottom:0.5rem`}>
        <strong>GameId:</strong> {gameId() ?? "—"} &nbsp;
        <strong>PlayerId:</strong> {playerId() ?? "—"} &nbsp;
        <strong>Domain:</strong> {domainPrimary() ?? "—"}
      </div>

      {/* Provide WebSocketProvider with token getter bound to playerId() */}
      <WebSocketProvider
        url={wsUrl()}
        getToken={() => playerId() ? `token_for_${playerId()}` : `token_for_alice`}
        autoConnect={false}
      >
        <InnerTester
          gameId={gameId()}
          playerId={playerId()}
          playerName={playerName()}
          domainPrimary={domainPrimary()}
          wsUrl={wsUrl()}
        />
      </WebSocketProvider>

      <div style={`margin-top:0.75rem`}>
        <strong>Create logs:</strong>
        <ul>
          {logs().map(l => <li><code>{l}</code></li>)}
        </ul>
      </div>
    </div>
  );
};

export default GameRoomTesterWithHook;

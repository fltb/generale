import {
  type Component,
  createSignal,
  createEffect,
  onCleanup,
  Show,
} from "solid-js";
import { WebSocketProvider } from "~/hooks/useWebsocket";
import { useSyncedState } from "~/hooks/useSyncedState";
import {
  SyncedPreGameClientActionTypes,
  type SyncedPreGameClientActions,
  type SyncedPreGameState,
  type PreGameRoomState,
} from "@generale/types";

/**
 * 本地乐观 applyEvent（给 useVersionedOptimisticState 用）
 * 只做最小修改：ready / change setting / change map / change team
 */
function applyPregameEventLocal(
  state: SyncedPreGameState | null,
  action: any
): SyncedPreGameState {
  const base: SyncedPreGameState = structuredClone(
    state ?? { room: null as any, selfId: "" }
  );
  const type = action?.type;
  const payload = action?.payload ?? {};

  try {
    switch (type) {
      case SyncedPreGameClientActionTypes.READY: {
        const pid = payload.playerId ?? base.selfId;
        if (base?.room?.players) {
          const p = base.room.players.find((x: any) => x.id === pid);
          if (p) p.ready = 1;
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.UNREADY: {
        const pid = payload.playerId ?? base.selfId;
        if (base?.room?.players) {
          const p = base.room.players.find((x: any) => x.id === pid);
          if (p) p.ready = 0;
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.CHANGE_SETTING: {
        if (base?.room?.gameSetting && payload && typeof payload === "object") {
          base.room.gameSetting = { ...base.room.gameSetting, ...payload };
        }
        return base;
      }
      case SyncedPreGameClientActionTypes.CHANGE_MAP: {
        if (payload) base.room.mapSetting = payload;
        return base;
      }
      case SyncedPreGameClientActionTypes.CHANGE_TEAM: {
        if (payload?.teamId && payload?.playerId && base?.room?.players) {
          const p = base.room.players.find(
            (x: any) => x.id === payload.playerId
          );
          if (p) p.teamId = payload.teamId;
        }
        return base;
      }
      default:
        return base;
    }
  } catch (err) {
    console.error("[applyPregameEventLocal] error", err, action);
    return state ?? base;
  }
}

/**
 * Inner tester component: lives inside WebSocketProvider
 */
const Inner: Component<{
  gameId: string | null;
  playerId: string | null;
  playerName: string;
  domainPrimary: string;
  wsUrl: string;
}> = (props) => {
  const [logs, setLogs] = createSignal<string[]>([]);
  function pushLog(s: string) {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} ${s}`]);
    console.debug("[GameRoomSyncTester]", s);
  }

  const [manualText, setManualText] = createSignal("hello server");
  const [settingKey, setSettingKey] = createSignal("afkThreshold");
  const [settingVal, setSettingVal] = createSignal("30");

  // IMPORTANT: always call the hook (don't conditionally call). Use empty placeholders initially.
  const synced = useSyncedState<
    SyncedPreGameState,
    SyncedPreGameClientActions,
    any
  >({
    domain: props.domainPrimary,
    initialState: { room: null as any, selfId: props.playerId ?? "" },
    initialVersion: 0,
    applyEvent: applyPregameEventLocal,
    onCustomEvent: (evt) => {
      pushLog(`[custom event] ${JSON.stringify(evt)}`);
    },
    context: { userid: props.playerId ?? "", username: props.playerName ?? "" },
    autoOpen: false, // we control open/connect via connect()
  });

  // When domain & playerId become available, call connect() to ensure manager connects and domain opens.
  createEffect(() => {
    const domain = props.domainPrimary;
    const pid = props.playerId;
    if (domain && pid) {
      pushLog(
        `domain & pid available -> connect synced (domain=${domain} pid=${pid})`
      );
      try {
        // update context if useSyncedState implementation reads context only on connect/open
        // call connect() to ensure ws connected and domain open requested
        synced.connect();
      } catch (e) {
        pushLog("synced.connect threw: " + String(e));
      }
    }
  });

  // Log sub ready changes (poll using isReady)
  createEffect(() => {
    try {
      pushLog(`synced.isReady() = ${synced.isReady()}`);
    } catch (e) {
      // ignore while uninitialized
    }
  });

  function currentState() {
    try {
      return synced ? synced.state() : null;
    } catch {
      return null;
    }
  }

  function connectAndOpen() {
    pushLog("connect() -> triggering connection + domain open");
    try {
      synced.connect();
    } catch (err) {
      pushLog("connect error: " + String(err));
    }
  }

  function disconnectSub() {
    synced.disconnect();
    pushLog("disconnect sub (synced.disconnect) called");
  }

  async function toggleReady() {
    const state = currentState();
    const me = props.playerId!;
    const my = state?.room?.players?.find((p: any) => p.id === me) ?? null;
    const amReady = !!(my?.ready && Number(my.ready) === 1);
    const actionType = amReady
      ? SyncedPreGameClientActionTypes.UNREADY
      : SyncedPreGameClientActionTypes.READY;
    const action = { type: actionType };

    pushLog(`commit ${actionType} (optimistic)`);
    const res = synced.dispatch(action);
    pushLog(`commit resolved: ${JSON.stringify(res)}`);
  }

  async function changeSetting() {
    const key = settingKey();
    let parsed = settingVal();
    const patch: Partial<PreGameRoomState["gameSetting"]> = {
      [key]: parsed,
    };
    const action = {
      type: SyncedPreGameClientActionTypes.CHANGE_SETTING,
      payload: patch,
    };

    pushLog(`commit change-setting ${JSON.stringify(patch)}`);
    try {
      const res = synced.dispatch(action);
      pushLog("change-setting confirmed: " + JSON.stringify(res));
    } catch (err) {
      pushLog("change-setting failed: " + String(err));
    }
  }

  async function startGame() {
    const action: any = { type: SyncedPreGameClientActionTypes.START_GAME };
    pushLog("commit start-game");
    try {
      const res = await synced.commit(action, 10000);
      pushLog("start-game confirmed: " + JSON.stringify(res));
    } catch (err) {
      pushLog("start-game failed: " + String(err));
    }
  }

  async function kickPlayer() {
    const target = prompt("kick playerId:");
    if (!target) return;
    const action: any = {
      type: SyncedPreGameClientActionTypes.KICK_PLAYER,
      payload: { playerId: target },
    };
    pushLog(`dispatch kick-player -> ${target}`);
    synced.dispatch(action);
  }

  async function dispatchCustom() {
    const action = { type: "client-custom", payload: { text: manualText() } };
    const id = synced.dispatch(action as any);
    pushLog(
      `dispatched custom action optimisticId=${id}, payload=${JSON.stringify(
        action.payload
      )}`
    );
  }

  onCleanup(() => {
    pushLog("Inner unmount cleanup");
  });

  return (
    <div style={`border:1px solid #ddd;padding:0.75rem;background:#fff`}>
      <div style={`margin-bottom:0.5rem`}>
        <strong>Domain:</strong> {props.domainPrimary ?? "—"} &nbsp;
        <strong>Player:</strong> {props.playerId ?? "—"} ({props.playerName})
        <strong> IsSynced: </strong> {synced.isReady() ? "true" : "false"}
      </div>

      <div style={`display:flex; gap:0.5rem; margin-bottom:0.5rem`}>
        <button onClick={connectAndOpen}>Connect & Open</button>
        <button onClick={disconnectSub}>Close Sub</button>
        <button onClick={toggleReady}>Toggle Ready</button>
        <button onClick={changeSetting}>Change Setting</button>
        <button onClick={startGame}>Start Game</button>
        <button onClick={kickPlayer}>Kick Player</button>
        <button onClick={dispatchCustom}>Dispatch Custom</button>
      </div>

      <div
        style={`display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem`}
      >
        <label>Setting key:</label>
        <input
          value={settingKey()}
          onInput={(e) => setSettingKey((e.target as HTMLInputElement).value)}
          style={`width:140px`}
        />
        <label>Value:</label>
        <input
          value={settingVal()}
          onInput={(e) => setSettingVal((e.target as HTMLInputElement).value)}
          style={`width:80px`}
        />
      </div>

      <div
        style={`display:flex; gap:0.5rem; align-items:center; margin-bottom:0.5rem`}
      >
        <label>Manual text:</label>
        <input
          value={manualText()}
          onInput={(e) => setManualText((e.target as HTMLInputElement).value)}
          style={`flex:1; min-width:220px`}
        />
      </div>

      <div style={`display:flex; gap:1rem`}>
        <div
          style={`flex:1; border:1px solid #eee; padding:0.5rem; background:#fafafa`}
        >
          <div style={`font-weight:600`}>Merged Room State</div>
          <pre style={`white-space:pre-wrap; font-size:0.9rem`}>
            {JSON.stringify(currentState(), null, 2)}
          </pre>
        </div>

        <div
          style={`width:420px; border:1px solid #eee; padding:0.5rem; background:#fff`}
        >
          <div style={`font-weight:600`}>Logs</div>
          <div
            style={`height:260px; overflow:auto; font-family:monospace; font-size:0.9rem`}
          >
            <ul style={`padding-left:0.8rem`}>
              {logs().map((l) => (
                <li>
                  <code>{l}</code>
                </li>
              ))}
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
const GameRoomStateSyncTester: Component = () => {
  const [playerName, setPlayerName] = createSignal("alice");
  const [gameId, setGameId] = createSignal<string | null>(null);
  const [playerId, setPlayerId] = createSignal<string | null>(null);
  const [domainPrimary, setDomainPrimary] = createSignal<string | null>(null);
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  const [wsUrl, setWsUrl] = createSignal(`${proto}//${loc.host}/api/ws`);

  const [logs, setLogs] = createSignal<string[]>([]);
  function pushLog(s: string) {
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} ${s}`]);
    console.log("[CreateFlow]", s);
  }

  async function createRoom() {
    pushLog("createRoom...");
    try {
      const res = await fetch("/api/game/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName(),
          gameSettings: { maxPlayers: 6 },
        }),
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
        const newPid =
          d.playerId && d.playerId.length > 0
            ? d.playerId
            : `${playerName()}_${Date.now()}`;
        setPlayerId(newPid);
        setDomainPrimary(`pregame-${d.gameId}`);
        pushLog(`using playerId=${newPid}, domainPrimary=pregame-${d.gameId}`);
      }
    } catch (err: any) {
      pushLog("create error: " + (err?.message ?? String(err)));
    }
  }

  return (
    <div style={`padding:1rem; max-width:980px`}>
      <h3>GameRoom State Sync Tester (useSyncedState)</h3>

      <div
        style={`display:flex; gap:0.5rem; margin-bottom:0.5rem; align-items:center`}
      >
        <input
          value={playerName()}
          onInput={(e) => setPlayerName((e.target as HTMLInputElement).value)}
          placeholder="player name"
        />
        <input
          value={wsUrl()}
          onInput={(e) => setWsUrl((e.target as HTMLInputElement).value)}
          style={`width:320px`}
        />
        <button onClick={createRoom}>Create Room</button>
      </div>

      <div style={`margin-bottom:0.5rem`}>
        <strong>GameId:</strong> {gameId() ?? "—"} &nbsp;
        <strong>PlayerId:</strong> {playerId() ?? "—"} &nbsp;
        <strong>Domain:</strong> {domainPrimary() ?? "—"}
      </div>

      <WebSocketProvider
        url={wsUrl()}
        getToken={() => (playerId() ? `token_for_${playerId()}` : undefined)}
        autoConnect={false}
      >
        <Show when={domainPrimary() !== null}>
          <Inner
            gameId={gameId()}
            playerId={playerId()}
            playerName={playerName()}
            domainPrimary={domainPrimary()!}
            wsUrl={wsUrl()}
          />
        </Show>
      </WebSocketProvider>

      <div style={`margin-top:0.75rem`}>
        <strong>Create logs:</strong>
        <ul>
          {logs().map((l) => (
            <li>
              <code>{l}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default GameRoomStateSyncTester;

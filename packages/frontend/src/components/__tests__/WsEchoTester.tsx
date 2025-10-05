// src/components/WsEchoTester.tsx
import { type Component, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import {
  ClientConnectionManager,
  SubConnectorClient,
  type WSContextBase
} from "../../ws/manager"; // 调整为你项目实际路径

const WsEchoTester: Component = () => {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  const defaultWsUrl = `${proto}//${loc.host}/api/ws`;

  const [wsUrl, setWsUrl] = createSignal<string>(defaultWsUrl);
  const [token, setToken] = createSignal<string>("token_for_alice");

  const [connected, setConnected] = createSignal<boolean>(false);
  const [connectionId, setConnectionId] = createSignal<string | null>(null);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [echoOpen, setEchoOpen] = createSignal<boolean>(false);
  const [lastReply, setLastReply] = createSignal<any>(null);
  const [messageText, setMessageText] = createSignal<string>("hello from client");

  let manager: ClientConnectionManager<WSContextBase> | null = null;
  let echoSub: SubConnectorClient<any, any, WSContextBase> | null = null;

  function pushLog(line: string) {
    // also output to browser console for easier debugging
    console.log("[WsEchoTester]", line);
    setLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} ${line}`]);
  }

  onMount(() => {
    console.log("WsEchoTester mounted");
    pushLog("Mounted");
  });

  // connect: create manager and wire up its isConnectedSignal
  function connect() {
    console.log("connect() called");
    pushLog("Try connect");

    if (manager && manager.isConnected) {
      pushLog("Already connected");
      return;
    }

    manager = new ClientConnectionManager(wsUrl(), () => token());
    // defensive: log manager created
    console.log("manager created:", manager);

    // local reactive subscription to manager.isConnectedSignal
    createEffect(() => {
      // note: manager exists in this scope because we just set it
      try {
        const isConn = manager!.isConnectedSignal[0]();
        setConnected(isConn);
        pushLog(`Connection status: ${isConn ? "connected" : "disconnected"}`);
      } catch (e) {
        console.error("isConnectedSignal read error", e);
      }
    });

    // poll for connectionId because manager exposes it as plain property (not reactive)
    const poll = setInterval(() => {
      try {
        if (manager && manager.connectionId) {
          if (manager.connectionId !== connectionId()) {
            setConnectionId(manager.connectionId);
            pushLog(`Got connectionId: ${manager.connectionId}`);
          }
        }
      } catch (e) {
        console.error("poll error", e);
      }
    }, 200);

    // cleanup the poll when component unmounts
    onCleanup(() => clearInterval(poll));

    // finally connect
    try {
      manager.connect(true);
      pushLog("Connecting...");
    } catch (e) {
      console.error("manager.connect threw", e);
      pushLog("manager.connect threw: " + String(e));
    }
  }

  // small debug button to confirm clicks fire
  function debugClick() {
    console.log("debugClick invoked");
    pushLog("debugClick invoked");
  }

  function disconnect() {
    console.log("disconnect() called");
    if (!manager) {
      pushLog("Not connected");
      return;
    }
    manager.close();
    pushLog("Requested disconnect");
    setConnectionId(null);
    setEchoOpen(false);
    manager = null;
  }

  // call backend API to register domain handler
  async function registerDomainOnServer(domain: string) {
    pushLog(`Registering domain '${domain}' on server...`);
    console.log("fetch -> /api/test/register-domain", { domain });
    try {
      const res = await fetch("/api/test/register-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain })
      });
      pushLog(`fetch returned status ${res.status}`);
      if (!res.ok) {
        const txt = await res.text();
        pushLog(`Register failed: ${res.status} ${res.statusText} - ${txt}`);
        return false;
      }
      const data = await res.json().catch(() => null);
      pushLog(`Register result: ${JSON.stringify(data)}`);
      return true;
    } catch (err: any) {
      console.error("registerDomainOnServer error", err);
      pushLog(`Register error: ${err?.message ?? String(err)}`);
      return false;
    }
  }

  // Open echo: first register server-side handler, then request open domain
  async function openEcho() {
    console.log("openEcho() called");
    if (!manager) {
      pushLog("Not connected");
      return;
    }

    // create/open local subconnector and attach handlers BEFORE sending openDomain
    echoSub = manager.getOrCreateSub("echo", { userid: "alice", username: "Alice" });

    echoSub.onOpen(() => {
      setEchoOpen(true);
      pushLog("Echo sub opened (server acknowledged)");
    });

    echoSub.onMessage((payload) => {
      pushLog("Echo reply -> " + JSON.stringify(payload));
      setLastReply(payload);
    });

    echoSub.onClose((code, reason) => {
      setEchoOpen(false);
      pushLog(`Echo sub closed: ${code ?? "?"} ${reason ?? ""}`);
    });

    echoSub.onDisconnect((err) => {
      setEchoOpen(false);
      pushLog(`Echo sub disconnected: ${err?.message ?? "?"}`);
    });

    // 1) register server-side handler through API
    const registered = await registerDomainOnServer("echo");
    if (!registered) {
      pushLog("Server registration failed; abort opening domain");
      return;
    }

    // 2) ask server to open the domain (server-side now has handler)
    try {
      manager.openDomain("echo", { userid: "alice", username: "Alice" });
      pushLog("Requested open for 'echo' domain");
    } catch (e) {
      console.error("manager.openDomain threw", e);
      pushLog("manager.openDomain threw: " + String(e));
    }
  }

  function sendEcho() {
    if (!echoSub) {
      pushLog("Echo sub not created/opened");
      return;
    }
    if (!echoSub.ready) {
      pushLog("Echo sub not ready yet");
      return;
    }
    const payload = { text: messageText(), ts: Date.now() };
    // send via subconnector
    echoSub.send(payload);
    pushLog("Sent -> " + JSON.stringify(payload));
  }

  // auto cleanup on component unmount
  onCleanup(() => {
    try {
      manager?.close();
    } catch {}
  });

  // update connectionId if manager gains one
  createEffect(() => {
    const m = manager;
    if (m && m.connectionId) {
      setConnectionId(m.connectionId);
    }
  });

  return (
    <div style={`padding:1rem; font-family: system-ui, -apple-system, 'Segoe UI', Roboto; max-width: 760px;`}>
      <h3>WS Echo Tester (Solid)</h3>

      <div style={`display:flex; gap:0.5rem; align-items:center; margin:0.5rem 0;`}>
        <input
          value={wsUrl()}
          onInput={(e) => setWsUrl((e.target as HTMLInputElement).value)}
          style={`flex:1`}
        />
        <input
          value={token()}
          onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          placeholder="token"
        />
        <button onClick={connect} disabled={connected()}>Connect</button>
        <button onClick={disconnect} disabled={!connected()}>Disconnect</button>
        <button onClick={debugClick}>Debug Click</button>
      </div>

      <div style={`margin-bottom:0.5rem`}>
        <strong>Status:</strong> {connected() ? "Connected" : "Disconnected"} &nbsp;
        <strong>ConnectionId:</strong> {connectionId() ?? "—"} &nbsp;
        <strong>Echo sub:</strong> {echoOpen() ? "OPEN" : "CLOSED"}
      </div>

      <div style={`display:flex; gap:0.5rem; margin-bottom:0.5rem;`}>
        <button onClick={openEcho} disabled={!connected() || echoOpen()}>CLICK TO TRY OPEN</button>
        <input
          value={messageText()}
          onInput={(e) => setMessageText((e.target as HTMLInputElement).value)}
          style={`flex:1`}
        />
        <button onClick={sendEcho} disabled={!echoOpen()}>Send Echo</button>
      </div>

      <div style={`border:1px solid #eee; padding:0.5rem; height:260px; overflow:auto; background:#fafafa`}>
        <div style={`font-size:0.9rem; color:#666`}>Logs</div>
        <ul style={`padding-left:1rem`}>
          {logs().map((l) => <li><code>{l}</code></li>)}
        </ul>
      </div>

      <div style={`margin-top:0.5rem`}>
        <strong>Last Echo Reply:</strong>
        <pre style={`background:#f7f7f7; padding:0.5rem`}>{JSON.stringify(lastReply(), null, 2)}</pre>
      </div>
    </div>
  );
};

export default WsEchoTester;

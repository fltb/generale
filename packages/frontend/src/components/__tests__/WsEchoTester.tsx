// src/components/WsEchoTester.tsx
import { type Component, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { WebSocketProvider, useWS } from "../../hooks/useWebsocket"; // 调整为你项目实际路径
import type { SubConnectorClient } from "../../ws/manager"; // 调整为你项目实际路径
import type { WSContextBase } from "../../ws/manager";

const InnerEchoTester: Component = () => {
  const manager = useWS(); // 从 provider 拿到 manager
  const [connected, setConnected] = createSignal<boolean>(false);
  const [connectionId, setConnectionId] = createSignal<string | null>(null);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [echoOpen, setEchoOpen] = createSignal<boolean>(false);
  const [lastReply, setLastReply] = createSignal<any>(null);
  const [messageText, setMessageText] = createSignal<string>("hello from client");

  let echoSub: SubConnectorClient<any, any, WSContextBase> | null = null;

  function pushLog(line: string) {
    console.log("[WsEchoTester]", line);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} ${line}`]);
  }

  onMount(() => {
    pushLog("Inner mounted");
  });

  // 订阅 manager 的连接状态信号
  createEffect(() => {
    if (!manager) return;
    try {
      const isConn = manager.isConnectedSignal[0]();
      setConnected(isConn);
      pushLog(`Connection status: ${isConn ? "connected" : "disconnected"}`);
    } catch (e) {
      console.error("subscribe manager.isConnectedSignal error", e);
    }
  });

  // 轮询 connectionId（manager.connectionId 不是 reactive）
  const pollId = setInterval(() => {
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

  onCleanup(() => clearInterval(pollId));

  function connect() {
    if (!manager) {
      pushLog("manager missing");
      return;
    }
    if (manager.isConnected) {
      pushLog("Already connected");
      return;
    }
    pushLog("Calling manager.connect()");
    try {
      manager.connect(true);
    } catch (e) {
      console.error("manager.connect threw", e);
      pushLog("manager.connect threw: " + String(e));
    }
  }

  function disconnect() {
    if (!manager) {
      pushLog("Not connected (manager missing)");
      return;
    }
    manager.close();
    pushLog("Requested disconnect");
    setConnectionId(null);
    setEchoOpen(false);
    echoSub = null;
  }

  // call backend API to register domain handler
  async function registerDomainOnServer(domain: string) {
    pushLog(`Registering domain '${domain}' on server...`);
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

  // open echo: attach local callbacks then ask server open
  async function openEcho() {
    if (!manager) {
      pushLog("Not connected (no manager)");
      return;
    }
    if (!manager.isConnected) {
      pushLog("WS not connected yet");
      return;
    }

    // create local sub (client-side mirror)
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

    // 1) register server-side handler
    const registered = await registerDomainOnServer("echo");
    if (!registered) {
      pushLog("Server registration failed; abort opening domain");
      return;
    }

    // 2) request server to open the domain
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
    echoSub.send(payload);
    pushLog("Sent -> " + JSON.stringify(payload));
  }

  return (
    <div style={`padding:1rem; font-family: system-ui, -apple-system, 'Segoe UI', Roboto; max-width: 760px;`}>
      <h3>WS Echo Tester (useWebsocket)</h3>

      <div style={`display:flex; gap:0.5rem; align-items:center; margin:0.5rem 0;`}>
        <input
          value={`/api/ws`}
          disabled
          style={`flex:1; opacity:0.6`}
        />
        <button onClick={connect} disabled={connected()}>Connect</button>
        <button onClick={disconnect} disabled={!connected()}>Disconnect</button>
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

/**
 * 包装 Provider：把 token 与 url 注入进去
 * 把 autoConnect 设为 false（组件内手动 Connect）
 */
const WsEchoTester: Component = () => {
  const [token, setToken] = createSignal<string>("token_for_alice");
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  const wsUrlDefault = `${proto}//${loc.host}/api/ws`;

  return (
    <WebSocketProvider
      url={wsUrlDefault}
      getToken={() => token()}
      autoConnect={false}
    >
      <InnerEchoTester />
    </WebSocketProvider>
  );
};

export default WsEchoTester;

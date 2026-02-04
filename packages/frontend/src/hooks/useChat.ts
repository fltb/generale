// src/hooks/useChat.ts
import { createSignal, onMount, onCleanup } from "solid-js";
import type {
  ChatClientToServer,
  ChatServerToClient,
  ChatMessage,
} from "@generale/types";
import { useWS } from "~/hooks/useWebsocket";
import type { SubConnectorClient } from "~/ws/manager";

/**
 * useChat - 和 useSyncedState 的 sub lifecycle 对齐的实现
 */
export function useChat(options: {
  domain: string;
  userId: string;
  userName: string;
  autoOpen?: boolean;
  initialFetchLimit?: number;
}) {
  const {
    domain,
    userId,
    userName,
    autoOpen = true,
    initialFetchLimit = 30,
  } = options;

  const wsMgr = useWS();

  const [connected, setConnected] = createSignal(false);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = createSignal(false);
  const [hasMoreHistory, setHasMoreHistory] = createSignal(true);

  let sub: SubConnectorClient<ChatClientToServer, ChatServerToClient> | null = null;

  // pending outgoing while sub not ready
  const pendingOut: ChatClientToServer[] = [];

  // optimistic map: tempId -> content
  const optimisticMap = new Map<string, string>();

  function makeTempId() {
    return `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }

  // ---- ensure and attach ----
  function ensureSubAndAttach() {
    if (!wsMgr) return;
    if (!sub) {
      sub = wsMgr.getOrCreateSub<ChatClientToServer, ChatServerToClient>(domain, {
        userid: userId,
        username: userName,
      });

      // attach handlers once
      sub.onOpen(() => {
        try {
          _onOpen();
        } catch (e) {
          console.error("[useChat] onOpen handler error", e);
        }
      });

      sub.onMessage((m) => {
        try {
          _onMessage(m);
        } catch (e) {
          console.error("[useChat] onMessage handler error", e);
        }
      });

      sub.onDisconnect((err?: Error) => {
        try {
          _onDisconnect(err);
        } catch (e) {
          console.error("[useChat] onDisconnect handler error", e);
        }
      });

      sub.onClose((code?: number, reason?: string) => {
        try {
          _onClose(code, reason);
        } catch (e) {
          console.error("[useChat] onClose handler error", e);
        }
      });

      // ensure open request if not ready (same pattern as useSyncedState)
      if (!sub.ready) {
        try {
          wsMgr.openDomain(domain, { userid: userId, username: userName });
        } catch (e) {
          console.warn("[useChat] openDomain failed in ensureSubAndAttach", e);
        }
      }
    }
  }

  function _sendOrBuffer(obj: ChatClientToServer) {
    try {
      ensureSubAndAttach();
    } catch (e) {
      console.warn("[useChat] ensureSubAndAttach failed", e);
    }

    if (sub && sub.ready) {
      try {
        sub.send(obj);
      } catch (e) {
        console.warn("[useChat] send failed, buffering", e);
        pendingOut.push(obj);
      }
    } else {
      // try to nudge manager if socket connected but domain not opened
      try {
        if (wsMgr && wsMgr.isConnected) {
          wsMgr.openDomain(domain, { userid: userId, username: userName });
        }
      } catch (e) {
        // ignore
      }
      pendingOut.push(obj);
    }
  }

  function _flushPendingOut() {
    while (pendingOut.length > 0) {
      const p = pendingOut.shift()!;
      try {
        if (sub && sub.ready) {
          sub.send(p);
        } else {
          // cannot send yet, put back and stop
          pendingOut.unshift(p);
          break;
        }
      } catch (e) {
        // put back and stop
        pendingOut.unshift(p);
        break;
      }
    }
  }

  // ---- lifecycle handlers ----
  function _onOpen() {
    setConnected(true);
    // flush any buffered outgoing
    _flushPendingOut();
    // request recent messages
    try {
      sub?.send({ type: "fetch_recent", limit: initialFetchLimit } as ChatClientToServer);
    } catch (e) {
      // if send fails we'll rely on flush later
    }
  }

  function _onMessage(msg: ChatServerToClient) {
    if (!msg) return;
    switch (msg.type) {
      case "messages_batch": {
        const batch = msg.messages ?? [];
        setMessages((cur) => {
          if (cur.length === 0) return [...batch];
          const exist = new Set(cur.map((m) => m.id));
          const prepend = batch.filter((m) => !exist.has(m.id));
          return [...prepend, ...cur];
        });
        if (msg.isEnd === true) setHasMoreHistory(false);
        setLoadingHistory(false);
        break;
      }
      case "new_message": {
        const m = msg.message;

        // 1️⃣ 先尝试匹配 optimistic（只对自己发的）
        for (const [tempId, content] of optimisticMap.entries()) {
          if (
            content === m.content &&
            m.playerId === userId
          ) {
            setMessages((cur) => {
              const idx = cur.findIndex((x) => x.id === tempId);
              if (idx >= 0) {
                const copy = [...cur];
                copy[idx] = m; // 用真实消息替换
                return copy;
              }
              return cur;
            });

            optimisticMap.delete(tempId);
            return; // 不要再 append
          }
        }

        // 2️⃣ 非 optimistic：正常去重 append
        setMessages((cur) =>
          cur.some((x) => x.id === m.id) ? cur : [...cur, m]
        );
        break;
      }
      case "send_result": {
        // server may reply with status; we don't strictly need to handle
        break;
      }
      default:
        break;
    }
  }

  function _onDisconnect(err?: Error) {
    setConnected(false);
  }

  function _onClose(code?: number, reason?: string) {
    setConnected(false);
  }

  // ---- connect / disconnect helpers (align with useSyncedState) ----
  function waitForManagerConnected(timeoutMs = 3000): Promise<void> {
    return new Promise((resolve) => {
      if (!wsMgr) return resolve();
      if (wsMgr.isConnected) return resolve();
      const start = Date.now();
      const iv = window.setInterval(() => {
        if (wsMgr.isConnected) {
          clearInterval(iv);
          return resolve();
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          return resolve();
        }
      }, 50);
    });
  }

  async function connect() {
    try {
      if (!wsMgr || !wsMgr.isConnected) {
        wsMgr.connect(true);
      }

      await waitForManagerConnected(5000);

      // create/attach sub BEFORE requesting open
      ensureSubAndAttach();

      if (autoOpen) {
        try {
          wsMgr.openDomain(domain, { userid: userId, username: userName });
        } catch (e) {
          console.warn("[useChat] openDomain threw", e);
        }
      }
    } catch (e) {
      console.warn("[useChat] connect error", e);
    }
  }

  function disconnect() {
    try {
      if (sub) {
        try {
          sub.close();
        } catch { }
        sub = null;
      }
      setConnected(false);
    } catch (e) {
      console.warn("[useChat] disconnect error", e);
    }
  }

  // ---- public actions ----
  function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed) return;

    const tempId = makeTempId();
    const optimistic: ChatMessage = {
      id: tempId,
      playerId: userId,
      playerName: userName,
      content: trimmed,
      timestamp: Date.now(),
      type: "user",
    };

    // add optimistic locally
    setMessages((cur) => [...cur, optimistic]);
    optimisticMap.set(tempId, trimmed);

    // prepare payload
    const payload: ChatClientToServer = { type: "send_message", content: trimmed } as ChatClientToServer;

    // send or buffer
    _sendOrBuffer(payload);
  }

  function fetchMoreHistory(beforeId?: string, limit = 30) {
    const payload: ChatClientToServer = {
      type: "fetch_history",
      beforeId: beforeId ?? "",
      limit,
    } as ChatClientToServer;

    setLoadingHistory(true);
    _sendOrBuffer(payload);
  }

  // ---- lifecycle mount/unmount ----
  onMount(() => {
    try {
      // try attach if wsMgr already exists (safe no-op if already attached)
      ensureSubAndAttach();
      if (autoOpen) {
        connect();
      }
    } catch (e) {
      console.warn("[useChat] onMount ensureSub failed", e);
    }
  });

  onCleanup(() => {
    try {
      sub?.close();
      sub = null;
    } catch { }
    pendingOut.length = 0;
    optimisticMap.clear();
  });

  return {
    connected,
    messages,
    loadingHistory,
    hasMoreHistory,
    connect,
    disconnect,
    sendMessage,
    fetchMoreHistory,
  };
}

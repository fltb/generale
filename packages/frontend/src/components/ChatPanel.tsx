// src/components/chat/ChatPanel.tsx
import { type Component, For, createSignal, createEffect } from "solid-js";
import { useChat } from "~/hooks/useChat";
import type { ChatMessage } from "@generale/types";

export interface ChatPanelProps {
  domain: string;
  userId: string;
  userName: string;
  autoOpen?: boolean;
  initialFetchLimit?: number;
  class?: string;
  placeholder?: string;
}

export const ChatPanel: Component<ChatPanelProps> = (props) => {
  const {
    messages,
    connected,
    loadingHistory,
    hasMoreHistory,
    sendMessage,
    fetchMoreHistory,
    connect,
    disconnect,
  } = useChat({
    domain: props.domain,
    userId: props.userId,
    userName: props.userName,
    autoOpen: props.autoOpen ?? true,
    initialFetchLimit: props.initialFetchLimit ?? 30,
  });

  const [input, setInput] = createSignal("");
  let listEl: HTMLDivElement | undefined;

  // ---- send ----
  function doSend() {
    const val = input().trim();
    if (!val) return;

    sendMessage(val);
    setInput("");

    // scroll to bottom after DOM update
    queueMicrotask(() => {
      if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
      }
    });
  }

  // ---- auto scroll on new message ----
  createEffect(() => {
    messages(); // track
    if (!listEl) return;
    listEl.scrollTop = listEl.scrollHeight;
  });

  // ---- keyboard ----
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  }

  return (
    <div
      class={`flex flex-col gap-2 border border-base-300 rounded p-2 ${
        props.class ?? ""
      }`}
    >
      {/* header */}
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium">聊天</div>
        <div class="text-xs opacity-60">
          {connected() ? "已连接" : "离线"}
        </div>
      </div>

      {/* controls */}
      <div class="flex items-center gap-2">
        <button class="btn btn-xs" onClick={connect}>
          连接
        </button>
        <button class="btn btn-xs btn-ghost" onClick={disconnect}>
          断开
        </button>
        <div class="ml-auto text-xs opacity-60">
          {loadingHistory()
            ? "加载中…"
            : hasMoreHistory()
            ? "有更多历史"
            : "已到顶"}
        </div>
      </div>

      {/* message list */}
      <div
        ref={listEl}
        class="bg-base-200 rounded p-2 overflow-auto"
        style={{ height: "220px" }}
      >
        <div class="flex flex-col gap-2">
          <For each={messages()}>
            {(m: ChatMessage) => (
              <div class="text-sm">
                <div class="flex items-center gap-2">
                  <div class="text-xs opacity-60 w-24">
                    {new Date(m.timestamp).toLocaleTimeString()}
                  </div>
                  <div class="font-medium">{m.playerName}</div>
                  {m.playerId === "system" && (
                    <div class="text-xs opacity-60">(系统)</div>
                  )}
                </div>
                <div class="ml-24 break-words">{m.content}</div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* input */}
      <div class="flex gap-2">
        <textarea
          class="textarea textarea-sm flex-1"
          placeholder={
            props.placeholder ??
            "输入消息，Enter 发送，Shift+Enter 换行"
          }
          value={input()}
          onInput={(e) =>
            setInput((e.target as HTMLTextAreaElement).value)
          }
          onKeyDown={onKey}
        />
        <button class="btn btn-primary btn-sm" onClick={doSend}>
          发送
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;

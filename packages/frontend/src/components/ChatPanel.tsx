// src/components/chat/ChatPanel.tsx
import { type Component, For, Show, createSignal, createEffect, createMemo } from "solid-js";
import { useChatSession } from "~/game/useChatSession";
import { Button, Badge, Panel, Textarea } from "~/ui";
import {
  GamePhase,
  PreGamePlayerStatus,
  type ChatMessage,
  type PreGameRoomState,
} from "@generale/types";

export interface ChatPanelProps {
  domain: string;
  userId: string;
  phase?: GamePhase;
  selfStatus?: PreGamePlayerStatus;
  room?: PreGameRoomState | null;
  autoOpen?: boolean;
  initialFetchLimit?: number;
  class?: string;
  listClass?: string;
  placeholder?: string;
  transparent?: boolean;
}

export const ChatPanel: Component<ChatPanelProps> = (props) => {
  const chat = useChatSession({
    domain: props.domain,
    userId: props.userId,
    get phase() { return props.phase; },
    get selfStatus() { return props.selfStatus; },
    get room() { return props.room; },
    autoOpen: props.autoOpen ?? true,
    initialFetchLimit: props.initialFetchLimit ?? 30,
  });

  const {
    messages,
    connected,
    loadingHistory,
    hasMoreHistory,
    fetchMoreHistory,
    connect,
    disconnect,
  } = chat;

  const [input, setInput] = createSignal("");
  let listEl: HTMLDivElement | undefined;

  const role = createMemo(() => {
    const status = props.selfStatus;
    const phase = props.phase;

    if (status === PreGamePlayerStatus.Spectating) {
      return { label: "旁观者", variant: "info" as const };
    }
    if (status === PreGamePlayerStatus.Playing) {
      return { label: "游戏玩家", variant: "success" as const };
    }
    if (phase === GamePhase.INGAME) {
      return { label: "大厅等待", variant: "warning" as const };
    }
    return { label: "房间玩家", variant: "neutral" as const };
  });

  const connectionBadge = createMemo(() =>
    connected()
      ? { label: "在线", variant: "success" as const }
      : { label: "离线", variant: "outline" as const }
  );

  // ---- send ----
  function doSend() {
    const val = input().trim();
    if (!val) return;

    if (!chat.send(val)) return;
    setInput("");

    // scroll to bottom after DOM update
    queueMicrotask(() => {
      if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
      }
    });
  }

  function loadMore() {
    const first = messages()[0];
    if (!first || loadingHistory() || !hasMoreHistory()) return;

    const oldHeight = listEl?.scrollHeight ?? 0;
    fetchMoreHistory(first.id);

    queueMicrotask(() => {
      if (!listEl) return;
      listEl.scrollTop = listEl.scrollHeight - oldHeight;
    });
  }

  // ---- auto scroll on new message ----
  createEffect(() => {
    const current = messages(); // track
    if (!listEl) return;
    const last = current[current.length - 1];
    if (!last) return;
    const distanceFromBottom =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    if (distanceFromBottom < 80 || last.playerId === props.userId) {
      listEl.scrollTop = listEl.scrollHeight;
    }
  });

  // ---- keyboard ----
  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  }

  return (
    <Panel
      tone="base-100"
      class={`flex h-full min-h-0 flex-col gap-3 ${props.transparent ? "!bg-transparent !shadow-none !border-0" : ""} ${props.class ?? ""}`}
      title={
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold">战局聊天</div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <Badge variant={role().variant}>{role().label}</Badge>
            <Badge variant={connectionBadge().variant}>{connectionBadge().label}</Badge>
          </div>
        </div>
      }
      titleClass="mb-1"
    >
      <div class="flex items-center gap-2">
        <Button size="xs" variant="ghost" disabled={connected()} onClick={connect}>
          连接
        </Button>
        <Button size="xs" variant="ghost" disabled={!connected()} onClick={disconnect}>
          断开
        </Button>
        <Button
          size="xs"
          variant="ghost"
          class="ml-auto"
          disabled={loadingHistory() || !hasMoreHistory() || messages().length === 0}
          onClick={loadMore}
        >
          {loadingHistory() ? "加载中" : hasMoreHistory() ? "历史" : "已到顶"}
        </Button>
      </div>

      <div
        ref={listEl}
        class={`min-h-0 flex-1 overflow-auto ${props.transparent ? "bg-base-300/20" : "bg-base-200"} p-2 pixel-border ${props.listClass ?? ""}`}
        style={{ height: "260px" }}
      >
        <Show
          when={messages().length > 0}
          fallback={
            <div class="flex h-full items-center justify-center text-sm opacity-60">
              暂无消息
            </div>
          }
        >
          <div class="flex flex-col gap-2">
            <For each={messages()}>
              {(m: ChatMessage) => (
                <div
                  class={`text-sm ${m.playerId === props.userId ? "text-primary" : ""}`}
                >
                  <div class="flex items-center gap-1.5">
                    <div class="w-16 shrink-0 text-xs opacity-60">
                      {new Date(m.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <Show when={m.scope === "team"}>
                      <Badge variant="success" class="badge-xs">小队</Badge>
                    </Show>
                    <Show when={chat.teamLabel(m)}>
                      {(team) => <Badge variant="outline" class="badge-xs">{team()}</Badge>}
                    </Show>
                    <Show when={chat.presenceLabel(m)}>
                      {(presence) => <Badge variant="info" class="badge-xs">{presence()}</Badge>}
                    </Show>
                    <Show when={chat.colorHex(m)}>
                      {(color) => (
                        <span
                          class="inline-block w-5 h-5 shrink-0 pixel-border"
                          style={{ "background-color": color() }}
                          aria-hidden="true"
                        />
                      )}
                    </Show>
                    <Show
                      when={m.meta?.avatarThumbUrl}
                      fallback={
                        <span class="grid h-5 w-5 shrink-0 place-items-center rounded bg-base-300 text-[10px] font-semibold">
                          {chat.messageDisplayName(m).slice(0, 1).toUpperCase()}
                        </span>
                      }
                    >
                      {(avatar) => (
                        <img
                          src={avatar()}
                          alt=""
                          class="h-5 w-5 shrink-0 rounded object-cover"
                        />
                      )}
                    </Show>
                    <div class="min-w-0 truncate font-medium">
                      {chat.messageDisplayName(m)}
                    </div>
                    {/* <div class="shrink-0 text-xs opacity-50">#{m.playerId}</div> */}
                  </div>
                  <div class="ml-16 whitespace-pre-wrap wrap-break-word text-base-content">
                    {m.content}
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>

      <div class="flex items-end gap-2">
        <Textarea
          bordered
          class="textarea-sm min-h-16 flex-1 resize-none"
          placeholder={
            props.placeholder ??
            (chat.canTeamChat()
              ? "输入消息，/team 小队聊天"
              : "输入消息，Enter 发送，Shift+Enter 换行")
          }
          value={input()}
          maxLength={500}
          disabled={!connected()}
          onInput={(e) =>
            setInput((e.target as HTMLTextAreaElement).value)
          }
          onKeyDown={onKey}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={!connected() || input().trim().length === 0}
          onClick={doSend}
        >
          发送
        </Button>
      </div>
    </Panel>
  );
};

export default ChatPanel;

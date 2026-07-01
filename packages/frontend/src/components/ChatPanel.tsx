import { type ChatMessage, GamePhase, PreGamePlayerStatus, type PreGameRoomState } from "@generale/types";
import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { useT } from "~/i18n/useT";
import { useChatSession } from "~/routes/games/generale/hooks/useChatSession";
import { Badge, Button, Panel, Textarea } from "~/ui";

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
  const { t } = useT();
  const chat = useChatSession({
    domain: props.domain,
    userId: props.userId,
    get phase() {
      return props.phase;
    },
    get selfStatus() {
      return props.selfStatus;
    },
    get room() {
      return props.room;
    },
    autoOpen: props.autoOpen ?? true,
    initialFetchLimit: props.initialFetchLimit ?? 30,
  });

  const { messages, connected, loadingHistory, hasMoreHistory, fetchMoreHistory, connect, disconnect } = chat;

  const [input, setInput] = createSignal("");
  let listEl: HTMLDivElement | undefined;

  const role = createMemo(() => {
    const status = props.selfStatus;
    const phase = props.phase;

    if (status === PreGamePlayerStatus.Spectating) {
      return { label: t("Spectator"), variant: "info" as const };
    }
    if (status === PreGamePlayerStatus.Playing) {
      return { label: t("In-Game Player"), variant: "success" as const };
    }
    if (phase === GamePhase.INGAME) {
      return { label: t("Lobby"), variant: "warning" as const };
    }
    return { label: t("Room Player"), variant: "neutral" as const };
  });

  const connectionBadge = createMemo(() =>
    connected()
      ? { label: t("Online"), variant: "success" as const }
      : { label: t("Offline"), variant: "outline" as const },
  );

  function doSend() {
    const val = input().trim();
    if (!val) return;

    if (!chat.send(val)) return;
    setInput("");

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

  createEffect(() => {
    const current = messages();
    if (!listEl) return;
    const last = current[current.length - 1];
    if (!last) return;
    const distanceFromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    if (distanceFromBottom < 80 || last.playerId === props.userId) {
      listEl.scrollTop = listEl.scrollHeight;
    }
  });

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
            <div class="text-sm font-semibold">{t("Game Chat")}</div>
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
          {t("Connect")}
        </Button>
        <Button size="xs" variant="ghost" disabled={!connected()} onClick={disconnect}>
          {t("Disconnect")}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          class="ml-auto"
          disabled={loadingHistory() || !hasMoreHistory() || messages().length === 0}
          onClick={loadMore}
        >
          {loadingHistory() ? t("Loading") : hasMoreHistory() ? t("History") : t("No more")}
        </Button>
      </div>

      <div
        ref={listEl}
        data-testid="chat-messages"
        class={`min-h-0 flex-1 overflow-auto ${props.transparent ? "bg-base-300/20" : "bg-base-200"} p-2 pixel-border ${props.listClass ?? ""}`}
        style={{ height: "260px" }}
      >
        <Show
          when={messages().length > 0}
          fallback={
            <div class="flex h-full items-center justify-center text-sm opacity-60">{t("No messages yet")}</div>
          }
        >
          <div class="flex flex-col gap-2">
            <For each={messages()}>
              {(m: ChatMessage) => (
                <div class={`text-sm ${m.playerId === props.userId ? "text-primary" : ""}`}>
                  <div class="flex items-center gap-1.5">
                    <div class="w-16 shrink-0 text-xs opacity-60">
                      {new Date(m.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <Show when={m.scope === "team"}>
                      <Badge variant="success" class="badge-xs">
                        {t("Team")}
                      </Badge>
                    </Show>
                    <Show when={chat.teamLabel(m)}>
                      {(team) => (
                        <Badge variant="outline" class="badge-xs">
                          {team()}
                        </Badge>
                      )}
                    </Show>
                    <Show when={chat.presenceLabel(m)}>
                      {(presence) => (
                        <Badge variant="info" class="badge-xs">
                          {presence()}
                        </Badge>
                      )}
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
                      {(avatar) => <img src={avatar()} alt="" class="h-5 w-5 shrink-0 rounded object-cover" />}
                    </Show>
                    <div class="min-w-0 truncate font-medium">{chat.messageDisplayName(m)}</div>
                  </div>
                  <div class="ml-16 whitespace-pre-wrap wrap-break-word text-base-content">
                    {/* biome-ignore lint/suspicious/noExplicitAny: i18nKey is dynamic string, not a literal TranslationKey */}
                    {m.i18nKey ? (t as any)(m.i18nKey, m.i18nParams) : m.content}
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
              ? t("Type a message, /team for team chat")
              : t("Type a message, Enter to send, Shift+Enter for newline"))
          }
          value={input()}
          maxLength={500}
          disabled={!connected()}
          onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          onKeyDown={onKey}
        />
        <Button size="sm" variant="primary" disabled={!connected() || input().trim().length === 0} onClick={doSend}>
          {t("Send")}
        </Button>
      </div>
    </Panel>
  );
};

export default ChatPanel;

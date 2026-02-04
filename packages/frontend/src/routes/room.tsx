import {
  type Component,
  createSignal,
  createEffect,
  Show,
  Switch,
  Match,
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";

import RoomWithSync, {
  type RoomWithSyncProps,
} from "~/components/room/Room";
import GameWithSync from "~/components/game/Game";
import ChatPanel from "~/components/ChatPanel"; // <-- 确认路径
import { prepareConnectApi } from "~/api/gameApi";

import {
  GamePhase,
  SyncedPreGameServerEventPayloadType,
} from "@generale/types";

const RoomRoute: Component = () => {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [playerId, setPlayerId] = createSignal<string | null>(null);
  const [playerName, setPlayerName] = createSignal<string | null>(null);
  const [domainPrimary, setDomainPrimary] = createSignal<string | null>(null);
  const [domainChat, setDomainChat] = createSignal<string | null>(null);

  const [phase, setPhase] = createSignal<GamePhase>(GamePhase.PREGAME);

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // chat floating visible (默认在拿到 chat 域后打开)
  const [chatVisible, setChatVisible] = createSignal(false);

  /**
   * 初始 / 刷新连接信息（authoritative）
   * ⚠️ pregame → ingame 必须重新调用
   */
  async function refreshConnectionInfo() {
    if (!params.id) return;

    setLoading(true);
    setError(null);

    try {
      const resp = await prepareConnectApi(params.id);
      if (!resp?.success) {
        setError((resp as any)?.error ?? "Connect failed");
        return;
      }

      const data = resp.data;
      setPlayerId(data.playerId);
      setPlayerName("Guest"); // TODO:: get player name by api
      setPhase(data.phase);
      setDomainPrimary(data.domains.primary);

      setDomainChat(data.domains.chat);
      setChatVisible(true);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  /** 首次进入 room */
  createEffect(() => {
    if (!params.id) return;
    refreshConnectionInfo();
  });

  /**
   * 子组件（Room / Game）统一上报事件
   * 👉 这里是「真正的状态机入口」
   */
  const handleStateUpdate: RoomWithSyncProps["onStateUpdate"] = async (
    next
  ) => {
    if (!next?.event) return;

    const evt = next.event;

    switch (evt.type) {
      case SyncedPreGameServerEventPayloadType.KICKED: {
        setError(evt.reason ?? "你已被移出房间");
        setPhase(GamePhase.ENDED);
        break;
      }

      case SyncedPreGameServerEventPayloadType.DISBANDED: {
        setError("房间已解散");
        setPhase(GamePhase.ENDED);
        break;
      }

      case SyncedPreGameServerEventPayloadType.GAME_STARTED: {
        /**
         * ⚠️ 核心修复点
         *
         * GAME_STARTED 只是 notification
         * 不能直接切 UI
         * 必须重新向 server 要 game-* domain
         */
        await refreshConnectionInfo();
        break;
      }

      default:
        break;
    }
  };

  return (
    <main class="container mx-auto p-6">
      <Switch>
        <Match when={error()}>
          <div class="alert alert-error mb-4">
            <span>{error()}</span>
            <button
              class="btn btn-sm btn-ghost mt-2"
              onClick={() => navigate("/")}
            >
              返回大厅
            </button>
          </div>
        </Match>

        <Match when={loading()}>
          <div class="card p-4 mb-4">Preparing connection…</div>
        </Match>

        {/* ---------- PREGAME ---------- */}
        <Match
          when={
            phase() === GamePhase.PREGAME &&
            domainPrimary() &&
            playerId()
          }
        >
          <RoomWithSync
            domain={domainPrimary()!}
            gameId={params.id!}
            playerId={playerId()!}
            playerName={playerName() ?? "Guest"}
            autoOpen
            onStateUpdate={handleStateUpdate}
          />
        </Match>

        {/* ---------- INGAME ---------- */}
        <Match
          when={
            phase() === GamePhase.INGAME &&
            domainPrimary() &&
            playerId()
          }
        >
          <GameWithSync
            domain={domainPrimary()!} // ⚠️ 必须是 game-*
            gameId={params.id!}
            playerId={playerId()!}
            onStateUpdate={handleStateUpdate}
          />
        </Match>

        {/* ---------- ENDED ---------- */}
        <Match when={phase() === GamePhase.ENDED}>
          <div class="card p-6">
            <div class="mb-4">游戏已结束</div>
            <button
              class="btn btn-primary"
              onClick={() => navigate("/")}
            >
              返回大厅
            </button>
          </div>
        </Match>
      </Switch>

      {/* ---------- Chat floating window (bottom-right) ---------- */}
      <Show when={domainChat() && playerId()}>
        <div class="fixed bottom-4 right-4 z-50">
          {/* Minimized button */}
          <Show when={!chatVisible()}>
            <button
              class="btn btn-circle btn-primary shadow-lg"
              aria-label="打开聊天"
              onClick={() => setChatVisible(true)}
              title="打开聊天"
            >
              💬
            </button>
          </Show>

          {/* Expanded panel */}
          <Show when={chatVisible()}>
            <div class="w-80 md:w-96 bg-base-100 border border-base-300 rounded-lg shadow-lg overflow-hidden">
              <div class="flex items-center justify-between p-2 border-b border-base-300">
                <div class="text-sm font-medium">聊天</div>
                <div class="flex items-center gap-2">
                  <button
                    class="btn btn-xs btn-ghost"
                    onClick={() => {
                      // collapse to minimized button
                      setChatVisible(false);
                    }}
                    title="收起"
                  >
                    收起
                  </button>
                  <button
                    class="btn btn-xs btn-ghost"
                    onClick={() => {
                      // close & disconnect from chat domain (optional)
                      // 如果需要断开可以清 domainChat / 调用 wsMgr.closeDomain(domainChat())
                      setChatVisible(false);
                    }}
                    title="关闭"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div class="p-2">
                <ChatPanel
                  domain={domainChat()!}
                  userId={playerId()!}
                  userName={playerName() ?? "Guest"}
                  autoOpen
                />
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </main>
  );
};

export default RoomRoute;
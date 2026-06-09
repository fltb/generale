import {
  type Component,
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
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
  PreGamePlayerStatus,
  SyncedPreGameServerEventPayloadType,
} from "@generale/types";

const RoomRoute: Component = () => {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [playerId, setPlayerId] = createSignal<string | null>(null);
  const [playerName, setPlayerName] = createSignal<string | null>(null);

  // 分离的 domain signals，避免互相覆盖导致重复 mount
  const [pregameDomain, setPregameDomain] = createSignal<string | null>(null);
  const [gameDomain, setGameDomain] = createSignal<string | null>(null);
  const [chatDomain, setChatDomain] = createSignal<string | null>(null);

  const [phase, setPhase] = createSignal<GamePhase>(GamePhase.PREGAME);
  // 自己在房间内的状态：Lobby = 在大厅；Playing = 已被锁入游戏；Disconnected 本地不会出现
  // （客户端断线时根本看不到任何 self）
  const [selfStatus, setSelfStatus] = createSignal<PreGamePlayerStatus>(PreGamePlayerStatus.Lobby);

  // RoomWithSync 暴露的 dispatcher，用于观战玩家在 GameWithSync 里点"退出观战"时
  // 把 LEAVE_SPECTATE 发到 pregame 域。Room 卸载时会传 null 进来。
  const [roomApi, setRoomApi] = createSignal<{ leaveSpectate: () => void } | null>(null);

  // 服务端在 resume 之前会通过 pregame 域发一次 GAME_ENDED；此 signal 为 true 时
  // 表示"游戏刚结束、结算 UI 正显示中"，Match 在此期间维持 GameWithSync 挂载，
  // 不被 selfStatus 翻位（Playing -> Lobby）立刻 unmount。
  // 由 Game.tsx 的"回到房间"按钮或 5s 计时器调 onDismissGameEnd 清掉。
  const [gameJustEnded, setGameJustEnded] = createSignal(false);
  // gameJustEnded 的兜底计时器：万一 Game.tsx 没机会调 dismiss（异常 unmount 等），
  // ~15s 后强制走 dismiss 路径，避免房间永远卡在隐藏。
  const GAME_END_FALLBACK_MS = 15_000;
  let gameEndFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  function cancelGameEndFallback() {
    if (gameEndFallbackTimer) {
      clearTimeout(gameEndFallbackTimer);
      gameEndFallbackTimer = null;
    }
  }
  onCleanup(() => cancelGameEndFallback());

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // chat floating visible (默认在拿到 chat 域后打开)
  const [chatVisible, setChatVisible] = createSignal(false);

  /**
   * 初始 / 刷新连接信息（authoritative）
   * 只更新对应 domain，避免覆盖另一个 domain 导致组件重建。
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

      // player info
      setPlayerId(prev => (prev !== data.playerId ? data.playerId : prev));
      setPlayerName(prev => (prev ?? "Guest") || "Guest");

      // authoritative phase
      setPhase(prev => (prev !== data.phase ? data.phase : prev));

      // domains: prefer explicit fields if provided
      const dPregame = data.domains?.pregame ?? null;
      const dPrimary = data.domains?.primary ?? null;
      const dChat = data.domains?.chat ?? null;

      // Update pregame domain if provided; if not provided but primary is pregame-*,
      // fall back to primary. INGAME 时若服务端返回 primary=pregame-*（表示当前用户
      // 没在游戏里，应作为 Lobby 进房间），也使用它。
      if (dPregame) {
        if (pregameDomain() !== dPregame) setPregameDomain(dPregame);
      } else if (dPrimary && dPrimary.startsWith('pregame-')) {
        if (pregameDomain() !== dPrimary) setPregameDomain(dPrimary);
      }

      // Update game domain only if primary is actually a game-* domain
      // （INGAME 时若用户不在游戏中，primary 会是 pregame-*，那时不要写 gameDomain）
      if (data.phase === GamePhase.INGAME && dPrimary && dPrimary.startsWith('game-')) {
        if (gameDomain() !== dPrimary) setGameDomain(dPrimary);
      }

      // chat domain update
      if (dChat && chatDomain() !== dChat) setChatDomain(dChat);

      // IMPORTANT: do not clear pregameDomain when entering INGAME.
      // We intentionally keep it so RoomWithSync can remain connected.
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
   * 当 selfStatus 变成 Spectating 而 gameDomain 还没拿到时，重新 prepareConnect。
   *
   * 不再在 Lobby 时主动清 gameDomain ——
   * 1) 它在 selfStatus 默认 Lobby（F5 后刚 mount，state 还没回来）的首次执行里会把
   *    刚 setGameDomain 出来的合法 game-* 域立刻清掉，导致 Playing 玩家始终拿不到
   *    gameDomain，Match 不命中 → 白屏。
   * 2) gameDomain 保留也不会让 GameWithSync 错误挂载，因为 Match 还要求
   *    selfStatus ∈ {Playing, Spectating}；Lobby 不会进游戏 UI。
   * 3) 同一个 gameId 的 game-${id} 域始终有效，复用即可。
   */
  createEffect(() => {
    const status = selfStatus();
    if (status === PreGamePlayerStatus.Spectating && !gameDomain()) {
      refreshConnectionInfo();
    }
  });

  /**
   * 子组件（Room / Game）上报的非 GAME_ENDED 自定义事件。GAME_ENDED 已经走专用
   * onGameEndedReceived / onDismissGameEnd 两个 callback，下面 switch 不再处理。
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
         * GAME_STARTED 只是 notification（服务器权威）
         * 我们需要再次请求连接信息以拿到 game-* domain。
         */
        await new Promise(res => setTimeout(res, 1000));
        await refreshConnectionInfo();
        break;
      }

      default:
        break;
    }
  };

  /**
   * 服务端的 GAME_ENDED 到达（RoomWithSync 在 pregame 域收到时调）。
   * 只在 phase===INGAME 期间生效；如果用户已经 dismiss（phase 已切回 PREGAME），
   * 后到的 GAME_ENDED 视为陈旧事件忽略，避免把刚清掉的 gameJustEnded 又拉回 true。
   */
  function handleGameEndedReceived() {
    if (phase() !== GamePhase.INGAME) return;
    if (gameJustEnded()) return;
    setGameJustEnded(true);
    cancelGameEndFallback();
    gameEndFallbackTimer = setTimeout(() => {
      console.warn("[room] gameJustEnded fallback timer fired -> force dismiss");
      handleDismissGameEnd();
    }, GAME_END_FALLBACK_MS);
  }

  /**
   * 用户按"回到房间" / Game.tsx 的 5s 计时器 / fallback 计时器调用。
   * 无条件转回 PREGAME 视图：取消挂载游戏、refresh。
   * 不清 gameDomain —— 同 gameId 下一局复用，且清掉会触发首帧白屏 race（见历史 fix）。
   */
  function handleDismissGameEnd() {
    cancelGameEndFallback();
    setGameJustEnded(false);
    setPhase(GamePhase.PREGAME);
    refreshConnectionInfo();
  }

  /**
   * 单一真源：现在该不该把 GameWithSync 放在屏幕上？
   * Match 和 RoomWithSync.visible 都从这里读，避免两处条件漂移。
   * 这里不考虑 gameDomain / playerId 等基础设施就绪条件——它们由 Match 单独 guard，
   * 但房间的可见性不应该被它们的缺失反过来锁死（缺它们时仍应回退到房间页）。
   */
  const showingGameUI = createMemo(() =>
    phase() === GamePhase.INGAME
    && (
      selfStatus() === PreGamePlayerStatus.Playing
      || selfStatus() === PreGamePlayerStatus.Spectating
      || gameJustEnded()
    )
  );

  return (
    <main class="container mx-auto p-6">
      <Switch>
        <Match when={!!error()}>
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

        {/* ---------- INGAME (显示 game UI) ----------
            - Playing 玩家：作为对局参与者打开 GameWithSync
            - Spectating 玩家：作为观战者打开 GameWithSync（read-only，禁用 surrender/操作）
            - Lobby 玩家：继续看 RoomWithSync（下面挂载）
            - gameJustEnded：游戏刚结束，结算 overlay 显示中，维持挂载等用户/计时器 dismiss */}
        <Match when={showingGameUI() && gameDomain() && playerId()}>
          <GameWithSync
            domain={gameDomain()!} // MUST be game-*
            gameId={params.id!}
            playerId={playerId()!}
            spectate={selfStatus() === PreGamePlayerStatus.Spectating}
            onStateUpdate={handleStateUpdate}
            onDismissGameEnd={handleDismissGameEnd}
            onLeaveSpectate={() => roomApi()?.leaveSpectate()}
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

      {/* ---------------------------------------------------------
          RoomWithSync：**只挂载一次**，通过 visible 控制显示（避免反复 mount/unmount）
          保持连接在 INGAME 期间也不关闭（hidden but still mounted）
         --------------------------------------------------------- */}
      <Show when={pregameDomain() && playerId()}>
        <RoomWithSync
          domain={pregameDomain()!}
          gameId={params.id!}
          playerId={playerId()!}
          playerName={playerName() ?? "Guest"}
          autoOpen
          // 房间和游戏 UI 二选一：游戏在屏上时房间隐藏，反之可见。
          visible={!showingGameUI()}
          onStateUpdate={handleStateUpdate}
          onSelfStatusChange={(s) => setSelfStatus(s)}
          onGameEndedReceived={handleGameEndedReceived}
          onExposeApi={(api) => setRoomApi(api)}
        />
      </Show>

      {/* ---------- Chat floating window (bottom-right) ---------- */}
      <Show when={chatDomain() && playerId()}>
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
                  domain={chatDomain()!}
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

import { createSignal, createEffect, createMemo, onCleanup } from "solid-js";
import { prepareConnectApi } from "~/api/gameApi";
import {
  GamePhase,
  PreGamePlayerStatus,
  SyncedPreGameServerEventPayloadType,
} from "@generale/types";
import type { RoomWithSyncProps } from "~/components/room/Room";

/**
 * 房间路由的连接编排 + 阶段状态机。
 *
 * 把原先内联在 routes/room.tsx 里的全部连接/阶段逻辑下沉到这里：domain 分离、
 * phase / selfStatus、gameJustEnded 结算窗口及其兜底计时器、showingGameUI 单一真源、
 * refreshConnectionInfo 权威刷新。routes/room.tsx 仅剩渲染。
 *
 * 注意：这是历史上修过多个 race 的脆弱逻辑，搬运时严格保持 1:1，不做"顺手优化"。
 */
export function useRoomSession(gameId: () => string | undefined) {
  const [playerId, setPlayerId] = createSignal<string | null>(null);
  const [playerName, setPlayerName] = createSignal<string | null>(null);

  // 分离的 domain signals，避免互相覆盖导致重复 mount
  const [pregameDomain, setPregameDomain] = createSignal<string | null>(null);
  const [gameDomain, setGameDomain] = createSignal<string | null>(null);
  const [chatDomain, setChatDomain] = createSignal<string | null>(null);

  const [phase, setPhase] = createSignal<GamePhase>(GamePhase.PREGAME);
  // 自己在房间内的状态：Lobby = 在大厅；Playing = 已被锁入游戏；Disconnected 本地不会出现
  const [selfStatus, setSelfStatus] = createSignal<PreGamePlayerStatus>(PreGamePlayerStatus.Lobby);

  // RoomWithSync 暴露的 dispatcher，用于观战玩家在 GameWithSync 里点"退出观战"时
  // 把 LEAVE_SPECTATE 发到 pregame 域。Room 卸载时会传 null 进来。
  const [roomApi, setRoomApi] = createSignal<{ leaveSpectate: () => void } | null>(null);

  // 服务端在 resume 之前会通过 pregame 域发一次 GAME_ENDED；此 signal 为 true 时
  // 表示"游戏刚结束、结算 UI 正显示中"，Match 在此期间维持 GameWithSync 挂载，
  // 不被 selfStatus 翻位（Playing -> Lobby）立刻 unmount。
  const [gameJustEnded, setGameJustEnded] = createSignal(false);
  // 本次会话是否经由 GAME_STARTED 进入对局（区分"全新开局" vs "刷新/重连/观战进入进行中的对局"）。
  // 只有全新开局才放开局倒计时；重连进来不放。
  const [startedThisSession, setStartedThisSession] = createSignal(false);
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

  /**
   * 初始 / 刷新连接信息（authoritative）
   * 只更新对应 domain，避免覆盖另一个 domain 导致组件重建。
   */
  async function refreshConnectionInfo() {
    const id = gameId();
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const resp = await prepareConnectApi(id);
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
      // fall back to primary.
      if (dPregame) {
        if (pregameDomain() !== dPregame) setPregameDomain(dPregame);
      } else if (dPrimary && dPrimary.startsWith('pregame-')) {
        if (pregameDomain() !== dPrimary) setPregameDomain(dPrimary);
      }

      // Update game domain only if primary is actually a game-* domain
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
    if (!gameId()) return;
    refreshConnectionInfo();
  });

  /**
   * 当 selfStatus 变成 Spectating 而 gameDomain 还没拿到时，重新 prepareConnect。
   */
  createEffect(() => {
    const status = selfStatus();
    if (status === PreGamePlayerStatus.Spectating && !gameDomain()) {
      refreshConnectionInfo();
    }
  });

  /**
   * 子组件（Room / Game）上报的非 GAME_ENDED 自定义事件。
   */
  const handleStateUpdate: NonNullable<RoomWithSyncProps["onStateUpdate"]> = async (next) => {
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
        setStartedThisSession(true); // 标记为全新开局 -> 放倒计时
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
   */
  function handleDismissGameEnd() {
    cancelGameEndFallback();
    setGameJustEnded(false);
    setStartedThisSession(false); // 回到房间，清掉"全新开局"标记
    setPhase(GamePhase.PREGAME);
    refreshConnectionInfo();
  }

  /**
   * 单一真源：现在该不该把 GameWithSync 放在屏幕上？
   */
  const showingGameUI = createMemo(() =>
    phase() === GamePhase.INGAME
    && (
      selfStatus() === PreGamePlayerStatus.Playing
      || selfStatus() === PreGamePlayerStatus.Spectating
      || gameJustEnded()
    )
  );

  return {
    // signals / accessors
    playerId,
    playerName,
    pregameDomain,
    gameDomain,
    chatDomain,
    phase,
    selfStatus,
    setSelfStatus,
    roomApi,
    setRoomApi,
    loading,
    error,
    showingGameUI,
    startedThisSession,
    // handlers
    handleStateUpdate,
    handleGameEndedReceived,
    handleDismissGameEnd,
  };
}

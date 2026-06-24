import {
  type Component,
  createSignal,
  Show,
  Switch,
  Match,
} from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";

import RoomWithSync from "~/components/room/Room";
import GameWithSync from "~/components/game/Game";
import ChatPanel from "~/components/ChatPanel";
import { useRoomSession } from "~/game/useRoomSession";
import { Button, Card, Alert } from "~/ui";

import {
  GamePhase,
  PreGamePlayerStatus,
} from "@generale/types";

const RoomRoute: Component = () => {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();

  // 连接编排 + 阶段状态机全部委托给控制器
  const session = useRoomSession(() => params.id);

  // chat floating visible（纯 UI 开关，留在视图层）
  const [chatVisible, setChatVisible] = createSignal(true);

  return (
    <main class="container mx-auto p-6">
      <Switch>
        <Match when={!!session.error()}>
          <Alert variant="error" class="mb-4">
            <span>{session.error()}</span>
            <Button
              size="sm"
              variant="ghost"
              class="mt-2"
              onClick={() => navigate("/")}
            >
              返回大厅
            </Button>
          </Alert>
        </Match>

        <Match when={session.loading()}>
          <Card class="p-4 mb-4">Preparing connection…</Card>
        </Match>

        {/* ---------- INGAME (显示 game UI) ----------
            - Playing 玩家：作为对局参与者打开 GameWithSync
            - Spectating 玩家：作为观战者打开 GameWithSync（read-only，禁用 surrender/操作）
            - Lobby 玩家：继续看 RoomWithSync（下面挂载）
            - gameJustEnded：游戏刚结束，结算 overlay 显示中，维持挂载等用户/计时器 dismiss */}
        <Match when={session.showingGameUI() && session.gameDomain() && session.playerId()}>
          <GameWithSync
            domain={session.gameDomain()!} // MUST be game-*
            gameId={params.id!}
            playerId={session.playerId()!}
            spectate={session.selfStatus() === PreGamePlayerStatus.Spectating}
            freshStart={session.startedThisSession()}
            onStateUpdate={session.handleStateUpdate}
            onDismissGameEnd={session.handleDismissGameEnd}
            onLeaveSpectate={() => session.roomApi()?.leaveSpectate()}
          />
        </Match>

        {/* ---------- ENDED ---------- */}
        <Match when={session.phase() === GamePhase.ENDED}>
          <Card class="p-6">
            <div class="mb-4">游戏已结束</div>
            <Button
              variant="primary"
              onClick={() => navigate("/")}
            >
              返回大厅
            </Button>
          </Card>
        </Match>
      </Switch>

      {/* ---------------------------------------------------------
          RoomWithSync：**只挂载一次**，通过 visible 控制显示（避免反复 mount/unmount）
          保持连接在 INGAME 期间也不关闭（hidden but still mounted）
         --------------------------------------------------------- */}
      <Show when={session.roomDomain() && session.playerId()}>
        <RoomWithSync
          domain={session.roomDomain()!}
          gameId={params.id!}
          playerId={session.playerId()!}
          autoOpen
          // 房间和游戏 UI 二选一：游戏在屏上时房间隐藏，反之可见。
          visible={!session.showingGameUI()}
          onStateUpdate={session.handleStateUpdate}
          onSelfStatusChange={(s) => session.setSelfStatus(s)}
          onRoomStateChange={(room) => session.setRoomState(room)}
          onGameEndedReceived={session.handleGameEndedReceived}
          onExposeApi={(api) => session.setRoomApi(api)}
        />
      </Show>

      {/* ---------- Chat floating window (bottom-left) ----------
          战局聊天跟 route 同级挂载，pregame / ingame 共享 chat-* domain。
          玻璃态半透明设计：不影响地图等游戏画面的可见性。 */}
      <Show when={session.chatDomain() && session.playerId()}>
        <div class="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)]">
          {/* Minimized button */}
          <Show when={!chatVisible()}>
            <Button
              circle
              variant="primary"
              class="shadow-lg bg-primary/80 backdrop-blur-sm"
              aria-label="打开聊天"
              onClick={() => setChatVisible(true)}
              title="打开聊天"
            >
              💬
            </Button>
          </Show>

          {/* Expanded panel */}
          <Show when={chatVisible()}>
            <div class="w-[min(24rem,calc(100vw-2rem))] overflow-hidden bg-base-100/75 backdrop-blur-sm shadow-lg pixel-border">
              <div class="flex items-center justify-between gap-3 border-b border-base-300/50 p-2">
                <div class="min-w-0">
                  <div class="truncate text-sm font-medium">聊天</div>
                  <div class="truncate text-xs opacity-60">
                    {session.phase() === GamePhase.INGAME ? "游戏中" : "准备阶段"}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setChatVisible(false)}
                  title="收起"
                >
                  收起
                </Button>
              </div>

              <div class="p-2">
                <ChatPanel
                  domain={session.chatDomain()!}
                  userId={session.playerId()!}
                  phase={session.phase()}
                  selfStatus={session.selfStatus()}
                  room={session.roomState()}
                  autoOpen
                  transparent
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

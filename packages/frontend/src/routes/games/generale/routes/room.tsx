import { GamePhase, PreGamePlayerStatus } from "@generale/types";
import { Title, Meta } from "@solidjs/meta";
import { useNavigate, useParams } from "@solidjs/router";
import { createEffect, type Component, createSignal, Match, Show, Switch } from "solid-js";
import { useT } from "~/i18n/useT";
import ChatPanel from "~/components/ChatPanel";
import GameWithSync from "~/routes/games/generale/components/game/Game";
import ConnectedRoom from "~/routes/games/generale/components/room/ConnectedRoom";
import { useRoomSession } from "~/routes/games/generale/hooks/useRoomSession";
import bridge from "~/testBridge";
import { Alert, Button, Card, Input } from "~/ui";
import GeneraleLayout from "~/routes/games/generale/components/game/GeneraleLayout";
import { ProtectedRoute } from "~/components/ProtectedRoute";

const RoomRoute: Component = () => {
  const params = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { t } = useT();
  const searchParams = new URLSearchParams(window.location.search);
  const joinPassword = searchParams.get("join");
  if (joinPassword) {
    sessionStorage.setItem("room-invite-pw", joinPassword);
    navigate(location.pathname, { replace: true });
  }

  const session = useRoomSession(() => params.id);

  const [chatVisible, setChatVisible] = createSignal(true);

  createEffect(() => {
    if (params.id) bridge.roomId = params.id;
  });

  return (
    <ProtectedRoute>
      <GeneraleLayout>
        <main class="container mx-auto p-6">
          <Title>
            {t("Game Room")} — {t("General E")}
          </Title>
          <Meta name="description" content={t("Join or spectate a General E game room.")} />
          <Meta property="og:title" content={`${t("Game Room")} — ${t("General E")}`} />
          <Meta property="og:description" content={t("Join or spectate a General E game room.")} />
          <Meta property="og:image" content="/og-image.svg" />
          <Meta property="og:type" content="website" />
          <Switch>
            <Match when={!!session.error()}>
              <Alert variant="error" class="mb-4">
                <span>{session.error()}</span>
                <Button size="sm" variant="ghost" class="mt-2" onClick={() => navigate("/")}>
                  {t("Back to Lobby")}
                </Button>
              </Alert>
            </Match>

            <Match when={session.loading()}>
              <Card class="p-4 mb-4">{t("Preparing connection...")}</Card>
            </Match>

            {/* 密码房间入口提示 */}
            <Match when={session.needsPassword()}>
              <Card class="p-6 max-w-md mx-auto mt-8">
                <h2 class="text-lg font-semibold mb-4">{t("Room requires password")}</h2>
                <Show
                  when={session.wrongPassword()}
                  fallback={<p class="text-sm opacity-70 mb-4">{t("Password required")}</p>}
                >
                  <p class="text-error text-sm mb-4">{t("Wrong password, try again")}</p>
                </Show>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const pw = (
                      (e.target as HTMLFormElement).elements.namedItem("pw") as HTMLInputElement
                    ).value.trim();
                    if (pw) session.setPassword(pw);
                  }}
                >
                  <div class="flex items-center gap-2">
                    <Input bordered type="password" name="pw" placeholder={t("Enter room password")} class="w-64" />
                    <Button variant="primary" type="submit">
                      {t("Join")}
                    </Button>
                  </div>
                </form>
              </Card>
            </Match>

            {/* ---------- INGAME (显示 game UI) ---------- */}
            <Match when={session.showingGameUI() && session.gameDomain() && session.playerId()}>
              <GameWithSync
                domain={session.gameDomain() as string}
                gameId={params.id as string}
                playerId={session.playerId() as string}
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
                <div class="mb-4">{t("Game ended")}</div>
                <Button variant="primary" onClick={() => navigate("/")}>
                  {t("Back to Lobby")}
                </Button>
              </Card>
            </Match>
          </Switch>

          {/* ---------------------------------------------------------
          RoomWithSync：**只挂载一次**。
          密码已输入 或 roomDomain 就绪后才挂载。
         --------------------------------------------------------- */}
          <Show when={session.roomDomain() && session.playerId() && !session.needsPassword()}>
            <ConnectedRoom
              domain={session.roomDomain() as string}
              gameId={params.id as string}
              playerId={session.playerId() as string}
              visible={!session.showingGameUI()}
              password={session.roomPassword() ?? undefined}
              onStateUpdate={session.handleStateUpdate}
              onSelfStatusChange={(s) => session.setSelfStatus(s)}
              onRoomStateChange={(room) => session.setRoomState(room)}
              onGameEndedReceived={session.handleGameEndedReceived}
              onExposeApi={(api) => session.setRoomApi(api)}
            />
          </Show>

          {/* ---------- Chat floating window (bottom-right) ---------- */}
          <Show when={session.chatDomain() && session.playerId()}>
            <div class="fixed bottom-4 right-4 z-50 max-w-[calc(100vw-2rem)]">
              <Show when={!chatVisible()}>
                <Button
                  circle
                  variant="primary"
                  class="shadow-lg bg-primary/80 backdrop-blur-sm"
                  aria-label={t("Open chat")}
                  onClick={() => setChatVisible(true)}
                  title={t("Open chat")}
                >
                  💬
                </Button>
              </Show>

              <Show when={chatVisible()}>
                <div class="w-[min(24rem,calc(100vw-2rem))] overflow-hidden bg-base-100/75 backdrop-blur-sm shadow-lg pixel-border">
                  <div class="flex items-center justify-between gap-3 border-b border-base-300/50 p-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-medium">{t("Chat")}</div>
                      <div class="truncate text-xs opacity-60">
                        {session.phase() === GamePhase.INGAME ? t("In Game") : t("Lobby")}
                      </div>
                    </div>
                    <Button size="xs" variant="ghost" onClick={() => setChatVisible(false)} title={t("Collapse")}>
                      {t("Collapse")}
                    </Button>
                  </div>

                  <div class="p-2">
                    <ChatPanel
                      domain={session.chatDomain() as string}
                      userId={session.playerId() as string}
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
      </GeneraleLayout>
    </ProtectedRoute>
  );
};

export default RoomRoute;

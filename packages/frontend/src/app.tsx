// src/app.tsx

import { Link, MetaProvider } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import { AuthProvider } from "./hooks/useAuth";
import "./index.css";
import { createSignal, onMount, Suspense } from "solid-js";
import { WebSocketProvider } from "./hooks/useWebsocket";
import { I18nProvider } from "./i18n/I18nProvider";
import CookieConsent from "./components/CookieConsent";
import PlatformShell from "./components/platform/PlatformShell";
import GeneraleLayout from "./components/game/GeneraleLayout";
import Home from "./routes";
import LoginPage from "./routes/login";
import ProfilePage from "./routes/profile";
import PublicProfilePage from "./routes/profile-view";
import ForgotPasswordPage from "./routes/forgot-password";
import ResetPasswordPage from "./routes/reset-password";
import VerifyEmailPage from "./routes/verify-email";
import ConfirmEmailChangePage from "./routes/confirm-email-change";
import TermsPage from "./routes/terms";
import AboutPage from "./routes/about";
import NotfoundPage from "./routes/[...404]";
import GeneraleHub from "./routes/generale/index";
import MapEditorPage from "./routes/map-editor";
import MapPreviewPage from "./routes/map-preview";
import MapsPage from "./routes/maps";
import RoomRoute from "./routes/room";
import Test from "./routes/test";
import bridge from "./testBridge";

const queryClient = new QueryClient();

const defaultWsUrl =
  (import.meta.env?.VITE_WS_URL as string | undefined) ??
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`;

// ── test mode ──
const searchParams = new URLSearchParams(location.search);
const IS_TEST_MODE = searchParams.has("__test__");

function exposeTestBridge() {
  const waitFor = (
    condition: () => boolean,
    timeoutMs: number,
    pollMs = 100,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (condition()) {
          clearInterval(iv);
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          reject(new Error("waitFor timed out"));
        }
      }, pollMs);
    });
  };

  Object.defineProperty(window, "__test__", {
    value: {
      get roomId() {
        return bridge.roomId;
      },

      clickTile(x: number, y: number) {
        bridge.onOperationQueued?.({
          type: "MOVE" as never,
          payload: { from: { x, y }, to: { x, y }, percentage: 100 },
        });
      },

      panMap(dx: number, dy: number) {
        bridge.viewportApi?.panMap(dx, dy);
      },

      zoomMap(scale: number) {
        bridge.viewportApi?.zoomMap(scale);
      },

      getViewport() {
        return bridge.viewportApi?.getViewport() ?? null;
      },

      getGameState() {
        return bridge.gameState ? structuredClone(bridge.gameState) : null;
      },

      getTileOwner(x: number, y: number) {
        const state = bridge.gameState;
        if (!state?.map?.tiles) return null;
        return state.map.tiles[x]?.[y]?.ownerId ?? null;
      },

      getPlayerArmies() {
        const state = bridge.gameState;
        if (!state?.players) return [];
        return Object.values(state.players).map((p) => ({ id: p.id, army: p.army }));
      },

      waitForStatus(status: string, timeout = 30000) {
        return waitFor(() => {
          const s = bridge.gameState;
          return s?.status === status;
        }, timeout);
      },

      waitForWSConnected(timeout = 15000) {
        return waitFor(() => bridge.wsManager?.isConnected === true, timeout);
      },

      waitForTileOwner(x: number, y: number, owner: string, timeout = 10000) {
        return waitFor(() => {
          const state = bridge.gameState;
          return state?.map?.tiles[x]?.[y]?.ownerId === owner;
        }, timeout);
      },
    },
    writable: false,
    configurable: true,
  });
}

if (IS_TEST_MODE) {
  exposeTestBridge();
}

export default function App() {
  const [locale, setLocale] = createSignal("en");

  onMount(() => {
    const navLang = navigator.language?.startsWith("zh") ? "zh-CN" : "en";
    setLocale(navLang);
  });

  return (
    <I18nProvider locale={locale()}>
    <QueryClientProvider client={queryClient}>
      {/* MetaProvider must wrap anything that uses Title/useHead */}
      <MetaProvider>
        <Link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <AuthProvider>
          <WebSocketProvider url={defaultWsUrl} autoConnect={false}>
            <Router
              root={(props) => (
                <>
                <Suspense>{props.children}</Suspense>
                <CookieConsent />
                </>
              )}
            >
              {/* Platform routes — wrapped in PlatformShell */}
              <Route path="/" component={PlatformShell}>
                <Route path="/" component={Home} />
                <Route path="/test" component={Test} />
                <Route path="/login" component={LoginPage} />
                <Route path="/profile" component={ProfilePage} />
                <Route path="/profile/:userId" component={PublicProfilePage} />
                <Route path="/forgot-password" component={ForgotPasswordPage} />
                <Route path="/reset-password" component={ResetPasswordPage} />
                <Route path="/verify-email" component={VerifyEmailPage} />
                <Route path="/confirm-email-change" component={ConfirmEmailChangePage} />
                <Route path="/terms" component={TermsPage} />
                <Route path="/about" component={AboutPage} />
              </Route>

              {/* Generale Hub — wrapped in GeneraleLayout */}
              <Route path="/generale" component={GeneraleLayout}>
                <Route path="/" component={GeneraleHub} />
              </Route>

              {/* Flat game routes */}
              <Route path="/game/:id" component={RoomRoute} />
              <Route path="/maps" component={MapsPage} />
              <Route path="/maps/editor" component={MapEditorPage} />
              <Route path="/maps/editor/:id" component={MapEditorPage} />
              <Route path="/maps/preview/:id" component={MapPreviewPage} />

              {/* Catch-all 404 */}
              <Route path="*" component={NotfoundPage} />
            </Router>
          </WebSocketProvider>
        </AuthProvider>
      </MetaProvider>

      <SolidQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
    </I18nProvider>
  );
}

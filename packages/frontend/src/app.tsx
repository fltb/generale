// src/app.tsx

import { MetaProvider } from "@solidjs/meta";
import { Route, Router } from "@solidjs/router";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import { AuthProvider } from "./hooks/useAuth";
import "./index.css";
import { Suspense } from "solid-js";
import Nav from "./components/Nav";
import { WebSocketProvider } from "./hooks/useWebsocket";
import Home from "./routes";
import ConfirmEmailChangePage from "./routes/confirm-email-change";
import ForgotPasswordPage from "./routes/forgot-password";
import LoginPage from "./routes/login";
import MapEditorPage from "./routes/map-editor";
import MapPreviewPage from "./routes/map-preview";
import MapsPage from "./routes/maps";
import ProfilePage from "./routes/profile";
import PublicProfilePage from "./routes/profile-view";
import ResetPasswordPage from "./routes/reset-password";
import RoomRoute from "./routes/room";
import Test from "./routes/test";
import VerifyEmailPage from "./routes/verify-email";

const queryClient = new QueryClient();

const defaultWsUrl =
  (import.meta.env?.VITE_WS_URL as string | undefined) ??
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/ws`;

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* MetaProvider must wrap anything that uses Title/useHead */}
      <MetaProvider>
        <AuthProvider>
          <WebSocketProvider url={defaultWsUrl} autoConnect={false}>
            <Router
              root={(props) => (
                <>
                  <Nav />
                  <Suspense>{props.children}</Suspense>
                </>
              )}
            >
              <Route path="/" component={Home} />
              <Route path="/test" component={Test} />
              <Route path="/login" component={LoginPage} />
              <Route path="/profile" component={ProfilePage} />
              <Route path="/profile/:userId" component={PublicProfilePage} />
              <Route path="/forgot-password" component={ForgotPasswordPage} />
              <Route path="/reset-password" component={ResetPasswordPage} />
              <Route path="/verify-email" component={VerifyEmailPage} />
              <Route path="/confirm-email-change" component={ConfirmEmailChangePage} />
              <Route path="/game/:id" component={RoomRoute} />
              <Route path="/maps" component={MapsPage} />
              <Route path="/maps/editor" component={MapEditorPage} />
              <Route path="/maps/editor/:id" component={MapEditorPage} />
              <Route path="/maps/preview/:id" component={MapPreviewPage} />
            </Router>
          </WebSocketProvider>
        </AuthProvider>
      </MetaProvider>

      <SolidQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

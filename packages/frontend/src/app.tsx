// src/app.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import { MetaProvider } from "@solidjs/meta";
import { Router, Route } from "@solidjs/router";
import { AuthProvider } from "./hooks/useAuth";
import "./index.css";
import Home from "./routes";
import Test from "./routes/test";
import Nav from "./components/Nav";
import { Suspense } from "solid-js";
import LoginPage from "./routes/login";
import { WebSocketProvider } from "./hooks/useWebsocket";
import RoomRoute from "./routes/room";
import ProfilePage from "./routes/profile";
import PublicProfilePage from "./routes/profile-view";
import ForgotPasswordPage from "./routes/forgot-password";
import ResetPasswordPage from "./routes/reset-password";
import ConfirmEmailChangePage from "./routes/confirm-email-change";
import VerifyEmailPage from "./routes/verify-email";
import MapsPage from "./routes/maps";
import MapEditorPage from "./routes/map-editor";
import MapPreviewPage from "./routes/map-preview";

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

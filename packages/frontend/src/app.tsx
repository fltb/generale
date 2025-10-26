// src/app.tsx
import { Suspense } from "solid-js";
import { Application } from "solid-pixi"; // keep Application, P, useAsset where needed in components
import MapRenderTest from "./components/__tests__/MapRenderTest";
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";
import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { AuthProvider } from "./hooks/useAuth";
import "./index.css";
import WsEchoTester from "./components/__tests__/WsEchoTester";
import GameRoomTesterWithHook from "./components/__tests__/GameRoomTester";
import GameRoomStateSyncTester from "./components/__tests__/GameRoomStateSyncTester";
import { TestPlayerList } from "./components/room/__tests__/TestPlayerList";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Application
          background="#1099bb"
          resizeTo={window}
          resolution={window.devicePixelRatio}
          autoDensity={true}
          antialias={true}
        >
          <MapRenderTest />
        </Application>
        {/* <WsEchoTester /> */}
        <GameRoomTesterWithHook />
        <GameRoomStateSyncTester />
        <TestPlayerList />
        <Router
          root={(props) => (
            <MetaProvider>
              <Title>SolidStart - Basic</Title>
              <a href="/">Index</a>
              <a href="/about">About</a>
              <Suspense>{props.children}</Suspense>
            </MetaProvider>
          )}
        >
          {/* <FileRoutes /> */}
        </Router>
      </AuthProvider>

      <SolidQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

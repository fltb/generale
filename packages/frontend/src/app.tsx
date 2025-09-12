import { MetaProvider, Title } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";
import { SolidQueryDevtools } from "@tanstack/solid-query-devtools";

import "./app.css";
import { AuthProvider } from "./hooks/useAuth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
          <FileRoutes />
        </Router>
      </AuthProvider>
      <SolidQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

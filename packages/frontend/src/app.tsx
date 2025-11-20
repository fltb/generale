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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 1000 * 60, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});



export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* MetaProvider must wrap anything that uses Title/useHead */}
      <MetaProvider>
        <AuthProvider>
          <Router
            root={props => (
              <>
                <Nav />
                <Suspense>{props.children}</Suspense>
              </>
            )}
          >
            <Route path="/" component={Home} />
            <Route path="/test" component={Test} />
            <Route path="/login" component={LoginPage} />
          </Router>
        </AuthProvider>
      </MetaProvider>

      <SolidQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

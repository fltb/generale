import { useNavigate } from "@solidjs/router";
import { type JSX, onMount, Show } from "solid-js";
import { useAuth } from "~/hooks/useAuth";

export function ProtectedRoute(props: { children: JSX.Element }) {
  const auth = useAuth();
  const nav = useNavigate();

  onMount(() => {
    if (!(auth.user || auth.isLoading)) {
      nav("/login");
    }
  });

  return (
    <Show when={auth.user} fallback={<p>Checking login status...</p>}>
      {props.children}
    </Show>
  );
}

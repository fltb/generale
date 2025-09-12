import { useAuth } from "~/hooks/useAuth";
import { useNavigate } from "@solidjs/router";
import { Show, onMount } from "solid-js";

export function ProtectedRoute(props: { children: any }) {
  const auth = useAuth();
  const nav = useNavigate();

  onMount(() => {
    if (!auth.user && !auth.isLoading) {
      nav("/login");
    }
  });

  return (
    <Show when={auth.user} fallback={<p>Checking login status...</p>}>
      {props.children}
    </Show>
  );
}

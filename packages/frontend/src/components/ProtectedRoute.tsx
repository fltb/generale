import { useNavigate } from "@solidjs/router";
import { type JSX, onMount, Show } from "solid-js";
import { useAuth } from "~/hooks/useAuth";
import { useT } from "~/i18n/useT";

export function ProtectedRoute(props: { children: JSX.Element }) {
  const { t } = useT();
  const auth = useAuth();
  const nav = useNavigate();

  onMount(() => {
    if (!(auth.user || auth.isLoading)) {
      nav("/login");
    }
  });

  return (
    <Show when={auth.user} fallback={<p>{t("Checking login status...")}</p>}>
      {props.children}
    </Show>
  );
}

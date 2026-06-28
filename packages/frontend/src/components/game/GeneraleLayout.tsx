import { A } from "@solidjs/router";
import { createMemo, Show, type JSX } from "solid-js";
import Avatar from "~/components/Avatar";
import LogoIcon from "~/components/LogoIcon";
import { useAuth } from "~/hooks/useAuth";
import { MuteToggle } from "~/ui";

interface Props {
  children?: JSX.Element;
}

export default function GeneraleLayout(props: Props) {
  const auth = useAuth();
  const currentPath = createMemo(() => window.location.pathname);

  return (
    <div>
      <nav class="bg-base-100 border-b-2 border-base-300 px-6 flex items-center justify-between h-14">
        <div class="flex items-center gap-6 text-sm">
          <A href="/" class="flex items-center gap-2 text-primary">
            <LogoIcon size={28} />
            <span class="font-semibold text-base-content">General E</span>
          </A>
          <div class="flex items-center gap-4">
            <A
              href="/"
              class="border-b-2 border-transparent hover:border-primary text-base-content/50 hover:text-base-content"
            >
              ← Platform
            </A>
            <A
              href="/generale"
              class={`border-b-2 ${
                currentPath() === "/generale"
                  ? "border-primary text-base-content"
                  : "border-transparent text-base-content/50 hover:text-base-content"
              }`}
            >
              General E
            </A>
            <A
              href="/maps"
              class={`border-b-2 ${
                currentPath().startsWith("/maps")
                  ? "border-primary text-base-content"
                  : "border-transparent text-base-content/50 hover:text-base-content"
              }`}
            >
              Maps
            </A>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <MuteToggle />
          <Show when={auth.user}>
            <Avatar
              src={auth.user?.avatarThumbUrl ?? auth.user?.avatarUrl ?? ""}
              alt={auth.user?.displayName || auth.user?.username || auth.user?.email}
              size={28}
            />
          </Show>
        </div>
      </nav>
      {props.children}
    </div>
  );
}

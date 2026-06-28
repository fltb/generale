import { A, useLocation } from "@solidjs/router";
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
  const location = useLocation();
  const isRoomsActive = createMemo(() => location.pathname === "/generale" || location.pathname.startsWith("/game/"));
  const isMapsActive = createMemo(() => location.pathname.startsWith("/maps"));

  return (
    <div>
      <nav class="bg-base-100 border-b-2 border-base-300 px-6 flex items-center justify-between h-14">
        <div class="flex items-center gap-6 text-sm">
          <A href="/" class="flex items-center gap-2 text-primary">
            <LogoIcon size={28} />
            <span class="font-semibold text-primary text-sm tracking-wide">GENERAL E</span>
          </A>
          <div class="flex items-center gap-1">
            <A
              href="/generale"
              class={`px-3 py-1.5 text-sm ${
                isRoomsActive()
                  ? "text-base-content bg-base-300"
                  : "text-base-content/50 hover:text-base-content hover:bg-base-300/50"
              }`}
            >
              Rooms
            </A>
            <A
              href="/maps"
              class={`px-3 py-1.5 text-sm ${
                isMapsActive()
                  ? "text-base-content bg-base-300"
                  : "text-base-content/50 hover:text-base-content hover:bg-base-300/50"
              }`}
            >
              Maps
            </A>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <A
            href="/"
            class="text-xs text-base-content/30 hover:text-base-content/70"
          >
            ← Platform
          </A>
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

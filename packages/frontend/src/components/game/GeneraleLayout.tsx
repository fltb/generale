import { A, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createMemo, createSignal, type JSX, onCleanup, Show } from "solid-js";
import Avatar from "~/components/Avatar";
import LogoIcon from "~/components/LogoIcon";
import { useAuth } from "~/hooks/useAuth";
import { MuteToggle } from "~/ui";
import { GAME_NAME } from "~/config";
import { useT } from "~/i18n/useT";

interface Props {
  children?: JSX.Element;
}

export default function GeneraleLayout(props: Props) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, setLocale } = useT();
  const [open, setOpen] = createSignal(false);

  const isRoomsActive = createMemo(() => location.pathname === "/generale" || location.pathname.startsWith("/game/"));
  const isMapsActive = createMemo(() => location.pathname.startsWith("/maps") && !location.pathname.startsWith("/maps/editor"));
  const isEditorActive = createMemo(() => location.pathname.startsWith("/maps/editor"));
  const showSidebar = createMemo(() => !location.pathname.startsWith("/game/") && !location.pathname.startsWith("/maps/editor"));

  createEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!open()) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const menu = document.getElementById("game-nav-user-menu");
      const btn = document.getElementById("game-nav-user-button");
      if (menu && btn && !menu.contains(target) && !btn.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handler);
    onCleanup(() => document.removeEventListener("click", handler));
  });

  async function handleLogout() {
    await auth.logout();
    setOpen(false);
    navigate("/login", { replace: true });
  }

  return (
    <div class="flex flex-col min-h-screen">
      {/* Top nav */}
      <nav class="bg-base-100 border-b-2 border-base-300 px-6 flex items-center justify-between h-14 shrink-0">
        <div class="flex items-center gap-2">
          <A href="/" class="text-base-content/40 hover:text-base-content flex items-center px-1" aria-label="Back to Platform">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M19 12H5m7-7-7 7 7 7" />
            </svg>
          </A>
          <span class="text-base-content/15 select-none">|</span>
          <A href="/generale" class="flex items-center gap-2 text-primary">
            <LogoIcon size={28} />
            <span class="font-semibold text-primary text-sm tracking-wide">{GAME_NAME}</span>
          </A>
        </div>
        <div class="flex items-center gap-3">
          <MuteToggle />
          <button
            type="button"
            onClick={() => setLocale(locale() === "zh-CN" ? "en" : "zh-CN")}
            class="px-2 py-1 text-xs rounded border border-base-300 hover:bg-base-300 text-base-content/60 hover:text-base-content"
          >
            {locale() === "zh-CN" ? "EN" : "中文"}
          </button>
          <Show
            when={auth.user}
            fallback={
              <A href="/login" class="px-3 py-1 rounded bg-base-300 hover:bg-base-300/80 text-sm">
                Login
              </A>
            }
          >
            <div class="relative">
              <button
                type="button"
                id="game-nav-user-button"
                onClick={() => setOpen(!open())}
                class="flex items-center gap-2 rounded hover:bg-base-300 px-2 py-1"
              >
                <Avatar
                  src={auth.user?.avatarThumbUrl ?? auth.user?.avatarUrl ?? ""}
                  alt={auth.user?.displayName || auth.user?.username || auth.user?.email}
                  size={28}
                />
                <span class="text-sm max-w-[100px] truncate hidden sm:inline">{auth.user?.displayName || auth.user?.username || auth.user?.email || "User"}</span>
              </button>
              <div
                id="game-nav-user-menu"
                class={`absolute right-0 mt-2 w-44 bg-white text-gray-800 rounded shadow-lg z-50 ${
                  open() ? "block" : "hidden"
                }`}
              >
                <A href="/profile" class="block px-4 py-2 text-sm hover:bg-sky-100" onClick={() => setOpen(false)}>
                  Profile
                </A>
                <button
                  type="button"
                  onClick={handleLogout}
                  class="w-full text-left px-4 py-2 text-sm hover:bg-sky-100"
                >
                  Logout
                </button>
              </div>
            </div>
          </Show>
        </div>
      </nav>

      {/* Body */}
      <div class="flex flex-1">
        {/* Sidebar */}
        <Show when={showSidebar()}>
          <aside class="w-48 bg-base-200 border-r-2 border-base-300 flex flex-col py-4 shrink-0">
            <nav class="flex flex-col gap-1 px-3">
              <A
                href="/generale"
                class={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                  isRoomsActive()
                    ? "bg-base-300 text-base-content font-medium"
                    : "text-base-content/60 hover:text-base-content hover:bg-base-300/50"
                }`}
              >
                <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                Rooms
              </A>
              <A
                href="/maps"
                class={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                  isMapsActive()
                    ? "bg-base-300 text-base-content font-medium"
                    : "text-base-content/60 hover:text-base-content hover:bg-base-300/50"
                }`}
              >
                <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.553-.894L9 7l6-3 5.447 2.724A1 1 0 0 1 21 7.618v10.764a1 1 0 0 1-1.553.894L15 17l-6 3z" />
                </svg>
                Maps
              </A>
              <A
                href="/maps/editor"
                class={`flex items-center gap-3 px-3 py-2 rounded text-sm ${
                  isEditorActive()
                    ? "bg-base-300 text-base-content font-medium"
                    : "text-base-content/60 hover:text-base-content hover:bg-base-300/50"
                }`}
              >
                <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Editor
              </A>
            </nav>

            <div class="mt-auto px-3 pt-4 border-t border-base-300 mx-3">
              <A
                href="/"
                class="flex items-center gap-3 px-3 py-2 rounded text-sm text-base-content/40 hover:text-base-content hover:bg-base-300/50"
              >
                <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                Platform
              </A>
            </div>
          </aside>
        </Show>

        <main class="flex-1 min-w-0">{props.children}</main>
      </div>
    </div>
  );
}

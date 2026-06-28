// src/components/Nav.tsx

import { A, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, type JSX, onCleanup, Show } from "solid-js";
import Avatar from "~/components/Avatar";
import LogoIcon from "~/components/LogoIcon";
import { useAuth } from "~/hooks/useAuth";
import { MuteToggle } from "~/ui";

export default function Nav(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [open, setOpen] = createSignal(false);

  const isGamePage = () => location.pathname.startsWith("/generale") || location.pathname.startsWith("/game/");

  createEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!open()) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const menu = document.getElementById("nav-user-menu");
      const btn = document.getElementById("nav-user-button");
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
    <nav class="bg-base-100 text-base-content">
      <div class="flex items-center justify-between p-3">
        <div class="flex items-center gap-4">
          <A href="/" class="flex items-center gap-2 text-primary">
            <LogoIcon size={32} />
            <span class="font-semibold text-base-content">General E</span>
          </A>

          <Show when={!isGamePage()}>
            <A href="/generale" class="border-b-2 border-transparent hover:border-primary px-2 py-1 text-base-content/70 hover:text-base-content">
              Play
            </A>
          </Show>

          <Show when={isGamePage()}>
            <A href="/" class="border-b-2 border-transparent hover:border-primary px-2 py-1 text-base-content/70 hover:text-base-content">
              Platform
            </A>
            <A href="/generale" class={`border-b-2 px-2 py-1 ${location.pathname === "/generale" ? "border-primary text-base-content" : "border-transparent text-base-content/70 hover:text-base-content"}`}>
              General E
            </A>
          </Show>

          <A href="/about" class="border-b-2 border-transparent hover:border-primary px-2 py-1 text-base-content/70 hover:text-base-content">
            About
          </A>
        </div>

        <div class="flex items-center gap-6">
          <MuteToggle />

          <A href="/maps" class="border-b-2 border-transparent hover:border-primary px-2 py-1 text-base-content/70 hover:text-base-content">
            地图工坊
          </A>

          <div class="relative">
            <Show
              when={auth.user}
              fallback={
                <div class="flex items-center gap-3">
                  <A href="/login" class="px-3 py-1 rounded-md bg-base-300 hover:bg-base-200">
                    Login
                  </A>
                </div>
              }
            >
              <div class="flex items-center">
                <button
                  type="button"
                  id="nav-user-button"
                  onClick={() => setOpen(!open())}
                  class="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-base-300"
                >
                  <Avatar
                    src={auth.user?.avatarThumbUrl ?? auth.user?.avatarUrl ?? ""}
                    alt={auth.user?.displayName || auth.user?.username || auth.user?.email}
                    size={32}
                  />
                  <span>{auth.user?.displayName || auth.user?.username || auth.user?.email || "User"}</span>
                </button>

                <div
                  id="nav-user-menu"
                  class={`absolute right-0 mt-2 w-44 bg-base-100 text-base-content rounded-md shadow-lg ${
                    open() ? "block" : "hidden"
                  }`}
                >
                  <A href="/profile" class="block px-4 py-2 text-sm hover:bg-base-200" onClick={() => setOpen(false)}>
                    Profile
                  </A>
                  <button
                    type="button"
                    onClick={handleLogout}
                    class="w-full text-left px-4 py-2 text-sm hover:bg-base-200"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </nav>
  );
}

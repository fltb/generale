import { A, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, type JSX, onCleanup, Show } from "solid-js";
import { Suspense } from "solid-js";
import Avatar from "~/components/Avatar";
import LogoIcon from "~/components/LogoIcon";
import { useAuth } from "~/hooks/useAuth";
import { MuteToggle } from "~/ui";
import { PLATFORM_NAME } from "~/config";
import { useT } from "~/i18n/useT";

export default function PlatformShell(props: { children?: JSX.Element }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = createSignal(false);
  const { locale, setLocale } = useT();

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
    <>
      <nav class="bg-base-100 text-base-content border-b-2 border-base-300">
        <div class="flex items-center justify-between px-6 h-14">
          <div class="flex items-center gap-6">
            <A href="/" class="flex items-center gap-2 text-primary">
              <LogoIcon size={28} />
              <span class="font-semibold text-base-content">{PLATFORM_NAME}</span>
            </A>
            <div class="flex items-center gap-4 text-sm">
              <A
                href="/generale"
                class="border-b-2 border-transparent hover:border-primary text-base-content/70 hover:text-base-content"
              >
                Play
              </A>
              <A
                href="/about"
                class="border-b-2 border-transparent hover:border-primary text-base-content/70 hover:text-base-content"
              >
                About
              </A>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <MuteToggle />
            <div class="flex items-center gap-1">
              {[
                { code: "en", label: "EN" },
                { code: "zh-CN", label: "中文" },
              ].map((lang) => (
                <button
                  type="button"
                  onClick={() => setLocale(lang.code)}
                  class={`px-2 py-1 text-xs rounded border ${
                    locale() === lang.code
                      ? "border-base-content/30 bg-base-300 text-base-content"
                      : "border-base-300 hover:bg-base-300 text-base-content/40 hover:text-base-content"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
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
                  id="nav-user-button"
                  onClick={() => setOpen(!open())}
                  class="flex items-center gap-2 rounded hover:bg-base-300 px-2 py-1"
                >
                  <Avatar
                    src={auth.user?.avatarThumbUrl ?? auth.user?.avatarUrl ?? ""}
                    alt={auth.user?.displayName || auth.user?.username || auth.user?.email}
                    size={28}
                  />
                  <span class="text-sm">
                    {auth.user?.displayName || auth.user?.username || auth.user?.email || "User"}
                  </span>
                </button>
                <div
                  id="nav-user-menu"
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
        </div>
      </nav>
      <Suspense>{props.children}</Suspense>
    </>
  );
}

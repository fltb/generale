// src/components/Nav.tsx

import { A, useNavigate } from "@solidjs/router";
import { createEffect, createSignal, type JSX, onCleanup, Show } from "solid-js";
import Avatar from "~/components/Avatar";
import { useAuth } from "~/hooks/useAuth";
import { MuteToggle } from "~/ui";

/**
 * Navigation bar component
 *
 * 左: site logo -> "/"
 * 中: about -> "/about"
 * 右: user 区（折叠菜单）
 */
export default function Nav(): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = createSignal(false);

  // 点击页面其它地方时自动关闭菜单
  createEffect(() => {
    const handler = (e: MouseEvent) => {
      // 如果菜单是打开的，且点击目标不在菜单或触发按钮内，则关闭
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
    <nav class="bg-sky-800 text-gray-100">
      <div class="container mx-auto flex items-center justify-between p-3">
        {/* 左：Logo */}
        <div class="flex items-center space-x-3">
          <A href="/" class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center text-xl font-bold">G</div>
            <span class="font-semibold">General E</span>
          </A>
        </div>

        {/* ❗右侧整体：包含 About + 用户区 */}
        <div class="flex items-center gap-6">
          {/* 音效开关 */}
          <MuteToggle />

          {/* 右侧导航 */}
          <A href="/about" class="border-b-2 border-transparent hover:border-sky-400 px-2 py-1">
            About
          </A>

          <A href="/maps" class="border-b-2 border-transparent hover:border-sky-400 px-2 py-1">
            地图工坊
          </A>

          {/* 右：用户区 —— 原 user dropdown 直接保持不动 */}
          <div class="relative">
            <Show
              when={auth.user}
              fallback={
                <div class="flex items-center gap-3">
                  <A href="/login" class="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20">
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
                  class="flex items-center gap-2 px-3 py-1 rounded-md hover:bg-white/10"
                >
                  <Avatar
                    src={auth.user?.avatarThumbUrl ?? auth.user?.avatarUrl ?? ""}
                    alt={auth.user?.displayName || auth.user?.username || auth.user?.email}
                    size={32}
                  />
                  <span>{auth.user?.displayName || auth.user?.username || auth.user?.email || "User"}</span>
                </button>

                {/* 下拉菜单保留 */}
                <div
                  id="nav-user-menu"
                  class={`absolute right-0 mt-2 w-44 bg-white text-gray-800 rounded-md shadow-lg ${
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
      </div>
    </nav>
  );
}

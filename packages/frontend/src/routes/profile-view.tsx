import { Show, createMemo } from "solid-js";
import { useParams, useNavigate, A } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";

import { getProfileApi } from "~/api/profileApi";
import { useAuth } from "~/hooks/useAuth";
import Avatar from "~/components/Avatar";
import type { ProfileRespBody } from "@generale/types/dist/api";

/**
 * 公开 profile 查看页：`/profile/:userId`
 * - 看别人：只读，显示头像 + displayName + bio + 一些 meta
 * - 看自己：上面挂个提示链接跳到 /profile（编辑页）
 *
 * 注：路由表里 `/profile` 走自己编辑页，`/profile/:userId` 走这里。SolidJS Router
 * 不会把它们撞车。
 */
export default function PublicProfilePage() {
  const params = useParams<{ userId: string }>();
  const auth = useAuth();
  const nav = useNavigate();

  const query = useQuery<ProfileRespBody>(() => ({
    queryKey: ["profile", params.userId],
    queryFn: () => getProfileApi(params.userId),
    retry: false,
  }));

  const isSelf = createMemo(() => auth.user?.id === params.userId);
  const data = createMemo<ProfileRespBody | undefined>(() => query.data);
  const displayName = () => data()?.displayName ?? params.userId;

  return (
    <div class="container mx-auto p-6 max-w-2xl space-y-4">
      <button class="btn btn-sm btn-ghost" onClick={() => nav(-1 as any)}>← 返回</button>

      <Show
        when={!query.isLoading}
        fallback={<div class="p-4 opacity-70">加载中...</div>}
      >
        <Show
          when={!query.isError}
          fallback={<div class="alert alert-error">{query.error?.message ?? "无法加载该用户资料"}</div>}
        >
          <section class="card bg-base-200 p-6 flex flex-col items-center text-center space-y-3">
            <Avatar
              src={data()?.avatarUrl ?? "/api/avatars/default/original.webp"}
              size={128}
              alt={displayName()}
            />
            <h1 class="text-2xl font-bold">{displayName()}</h1>
            <Show when={data()?.bio}>
              <p class="opacity-80 whitespace-pre-wrap">{data()!.bio}</p>
            </Show>
          </section>

          <Show when={isSelf()}>
            <div class="alert alert-info">
              <span>这是你自己的公开资料 —— 想改昵称 / 头像 / 简介？</span>
              <A href="/profile" class="btn btn-sm btn-primary">前往编辑</A>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

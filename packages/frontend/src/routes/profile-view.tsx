import type { ErrorResp, ProfileRespBody } from "@generale/types/dist/api";
import { Title, Meta } from "@solidjs/meta";
import { A, useNavigate, useParams } from "@solidjs/router";
import { useQuery } from "@tanstack/solid-query";
import { createMemo, Show } from "solid-js";
import { useT } from "../i18n/useT";
import { ApiError } from "~/api/base";
import { getProfileApi } from "~/api/profileApi";
import Avatar from "~/components/Avatar";
import { useAuth } from "~/hooks/useAuth";

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
  const { t } = useT();

  const query = useQuery<ProfileRespBody>(() => ({
    queryKey: ["profile", params.userId],
    queryFn: () => getProfileApi(params.userId),
    retry: false,
  }));

  const data = createMemo<ProfileRespBody | undefined>(() => query.data);
  // 用 response 里的 userId 比较：URL 写的是 username 时也能判断"看的是不是自己"
  const isSelf = createMemo(() => !!data() && auth.user?.id === data()?.userId);
  const displayName = () => data()?.displayName ?? data()?.username ?? params.userId;

  // 区分"用户不存在 (404)" 和其它请求错误，给前者一个明确的 UI
  const notFound = createMemo(() => {
    const e = query.error;
    return e instanceof ApiError && (e as ApiError<ErrorResp>).status === 404;
  });

  return (
    <div class="container mx-auto p-6 max-w-2xl space-y-4">
      <Title>
        {t("Player Profile")} — {t("General E")}
      </Title>
      <Meta name="description" content={t("View player profile.")} />
      <Meta property="og:title" content={`${t("Player Profile")} — ${t("General E")}`} />
      <Meta property="og:description" content={t("View player profile.")} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <button type="button" class="btn btn-sm btn-ghost" onClick={() => nav(-1)}>
        {t("← Back")}
      </button>

      <Show when={!query.isLoading} fallback={<div class="p-4 opacity-70">{t("Loading...")}</div>}>
        <Show
          when={!query.isError}
          fallback={
            <Show
              when={notFound()}
              fallback={<div class="alert alert-error">{query.error?.message ?? t("Failed to load profile")}</div>}
            >
              {/* 404 专用 UI：明确说找不到，并显示用户输入的标识符方便检查拼写 */}
              <div class="card bg-base-200 p-8 flex flex-col items-center text-center space-y-3">
                <div class="text-5xl">🤷</div>
                <h1 class="text-2xl font-bold">{t("User not found")}</h1>
                <p class="opacity-70">
                  {t("No account found for")}{" "}
                  <span class="font-mono bg-base-300 px-2 py-0.5 rounded">{params.userId}</span>
                </p>
                <p class="text-sm opacity-60">{t("Check the username or ID for typos.")}</p>
                <A href="/" class="btn btn-primary btn-sm">
                  {t("Back to Home")}
                </A>
              </div>
            </Show>
          }
        >
          <section class="card bg-base-200 p-6 flex flex-col items-center text-center space-y-3">
            <Avatar src={data()?.avatarUrl ?? "/api/avatars/default/original.webp"} size={128} alt={displayName()} />
            <h1 class="text-2xl font-bold">{displayName()}</h1>
            <Show when={data()?.bio}>
              <p class="opacity-80 whitespace-pre-wrap">{data()?.bio}</p>
            </Show>
          </section>

          <Show when={isSelf()}>
            <div class="alert alert-info">
              <span>{t("This is your public profile — want to edit your display name / avatar / bio?")}</span>
              <A href="/profile" class="btn btn-sm btn-primary">
                {t("Go to edit")}
              </A>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

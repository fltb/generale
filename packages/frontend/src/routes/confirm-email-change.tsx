import type { ConfirmEmailChangeReqBody, ErrorResp, MessageResp } from "@generale/types/dist/api";
import { Title, Meta } from "@solidjs/meta";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { useT } from "../i18n/useT";
import { confirmEmailChangeApi } from "~/api/accountApi";
import type { ApiError } from "~/api/base";
import { useAuth } from "~/hooks/useAuth";

/**
 * 邮箱变更确认页：用户从邮件点过来，URL 带 token。
 * 自动 POST 一次；成功后刷新 /me（要是已登录的话）、3 秒后跳到 /profile。
 */
export default function ConfirmEmailChangePage() {
  const nav = useNavigate();
  const auth = useAuth();
  const { t } = useT();
  const [searchParams] = useSearchParams<{ token?: string }>();
  const token = createMemo(() => (searchParams.token ?? "").trim());

  const [fired, setFired] = createSignal(false);

  const mutation = useMutation<MessageResp, ApiError<ErrorResp>, ConfirmEmailChangeReqBody>(() => ({
    mutationFn: (body) => confirmEmailChangeApi(body),
    onSuccess: async () => {
      // 刷一遍 /me，让本地缓存里的 email 立刻同步；未登录就忽略
      try {
        await auth.refresh();
      } catch {
        /* ignore */
      }
      setTimeout(() => nav("/profile"), 2000);
    },
  }));

  // 自动触发：进入页面 + token 有值 → 跑一次
  createEffect(() => {
    if (fired()) return;
    const t = token();
    if (!t) return;
    setFired(true);
    mutation.mutate({ token: t });
  });

  return (
    <div class="p-4 max-w-md mx-auto">
      <Title>{t("Confirm Email Change")} — {t("General E")}</Title>
      <Meta name="description" content={t("Confirm your email change.")} />
      <Meta property="og:title" content={`${t("Confirm Email Change")} — ${t("General E")}`} />
      <Meta property="og:description" content={t("Confirm your email change.")} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <h1 class="text-2xl mb-4">{t("Confirm Email Change")}</h1>

      <Show when={token()} fallback={<div class="alert alert-error">{t("Missing token in link.")}</div>}>
        <Show when={mutation.isPending}>
          <div>{t("Confirming...")}</div>
        </Show>
        <Show when={mutation.isSuccess}>
          <div class="space-y-3">
            <div class="alert alert-success">{mutation.data?.message ?? t("Email updated")}</div>
            <p class="text-sm opacity-70">{t("Redirecting to profile page...")}</p>
            <A href="/profile" class="link">
              {t("Go to profile")}
            </A>
          </div>
        </Show>
        <Show when={mutation.isError}>
          <div class="space-y-3">
            <div class="alert alert-error">{mutation.error?.message ?? t("Confirmation failed")}</div>
            <A href="/profile" class="link">
              {t("Back to profile")}
            </A>
          </div>
        </Show>
      </Show>
    </div>
  );
}

import type { ErrorResp, MessageResp, VerifyReqBody } from "@generale/types/dist/api";
import { Title, Meta } from "@solidjs/meta";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { useT } from "../i18n/useT";
import type { ApiError } from "~/api/base";
import { useAuth } from "~/hooks/useAuth";

/**
 * 注册邮箱验证页：用户从邮件点过来，URL 带 token。
 * 挂载时自动 POST /api/verify，成功后引导去登录。
 */
export default function VerifyEmailPage() {
  const nav = useNavigate();
  const auth = useAuth();
  const { t } = useT();
  const [searchParams] = useSearchParams<{ token?: string }>();
  const token = createMemo(() => (searchParams.token ?? "").trim());
  const [fired, setFired] = createSignal(false);

  const mutation = useMutation<MessageResp, ApiError<ErrorResp>, VerifyReqBody>(() => ({
    mutationFn: (body) => auth.verify(body),
    onSuccess: () => {
      // 3 秒后自动跳登录
      setTimeout(() => nav("/login"), 3000);
    },
  }));

  createEffect(() => {
    if (fired()) return;
    const t = token();
    if (!t) return;
    setFired(true);
    mutation.mutate({ token: t });
  });

  return (
    <div class="p-4 max-w-md mx-auto">
      <Title>
        {t("Verify Email")} — {t("General E")}
      </Title>
      <Meta name="description" content={t("Confirm your email address.")} />
      <Meta property="og:title" content={`${t("Verify Email")} — ${t("General E")}`} />
      <Meta property="og:description" content={t("Confirm your email address.")} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <h1 class="text-2xl mb-4">{t("Verify your email address")}</h1>

      <Show when={token()} fallback={<div class="alert alert-error">{t("Missing token in link.")}</div>}>
        <Show when={mutation.isPending}>
          <div>{t("Verifying...")}</div>
        </Show>
        <Show when={mutation.isSuccess}>
          <div class="space-y-3">
            <div class="alert alert-success">{mutation.data?.message ?? t("Email verified successfully")}</div>
            <p class="text-sm opacity-70">{t("Redirecting to login page...")}</p>
            <A href="/login" class="link">
              {t("Login now")}
            </A>
          </div>
        </Show>
        <Show when={mutation.isError}>
          <div class="space-y-3">
            <div class="alert alert-error">{mutation.error?.message ?? t("Verification failed")}</div>
            <A href="/login" class="link">
              {t("Back to login")}
            </A>
          </div>
        </Show>
      </Show>
    </div>
  );
}

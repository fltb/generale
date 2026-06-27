import type { ErrorResp, MessageResp, VerifyReqBody } from "@generale/types/dist/api";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import type { ApiError } from "~/api/base";
import { useAuth } from "~/hooks/useAuth";

/**
 * 注册邮箱验证页：用户从邮件点过来，URL 带 token。
 * 挂载时自动 POST /api/verify，成功后引导去登录。
 */
export default function VerifyEmailPage() {
  const nav = useNavigate();
  const auth = useAuth();
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
      <h1 class="text-2xl mb-4">邮箱验证</h1>

      <Show when={token()} fallback={<div class="alert alert-error">链接缺少 token。</div>}>
        <Show when={mutation.isPending}>
          <div>正在验证...</div>
        </Show>
        <Show when={mutation.isSuccess}>
          <div class="space-y-3">
            <div class="alert alert-success">{mutation.data?.message ?? "邮箱验证成功"}</div>
            <p class="text-sm opacity-70">即将跳转到登录页...</p>
            <A href="/login" class="link">
              立即登录
            </A>
          </div>
        </Show>
        <Show when={mutation.isError}>
          <div class="space-y-3">
            <div class="alert alert-error">{mutation.error?.message ?? "验证失败"}</div>
            <A href="/login" class="link">
              返回登录
            </A>
          </div>
        </Show>
      </Show>
    </div>
  );
}

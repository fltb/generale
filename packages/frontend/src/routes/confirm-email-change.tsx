import { createMemo, createEffect, createSignal, Show } from "solid-js";
import { useSearchParams, useNavigate, A } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";

import { confirmEmailChangeApi } from "~/api/accountApi";
import { useAuth } from "~/hooks/useAuth";
import { ApiError } from "~/api/base";
import type {
  ConfirmEmailChangeReqBody,
  MessageResp,
  ErrorResp,
} from "@generale/types/dist/api";

/**
 * 邮箱变更确认页：用户从邮件点过来，URL 带 token。
 * 自动 POST 一次；成功后刷新 /me（要是已登录的话）、3 秒后跳到 /profile。
 */
export default function ConfirmEmailChangePage() {
  const nav = useNavigate();
  const auth = useAuth();
  const [searchParams] = useSearchParams<{ token?: string }>();
  const token = createMemo(() => (searchParams.token ?? "").trim());

  const [fired, setFired] = createSignal(false);

  const mutation = useMutation<MessageResp, ApiError<ErrorResp>, ConfirmEmailChangeReqBody>(() => ({
    mutationFn: (body) => confirmEmailChangeApi(body),
    onSuccess: async () => {
      // 刷一遍 /me，让本地缓存里的 email 立刻同步；未登录就忽略
      try { await auth.refresh(); } catch { /* ignore */ }
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
      <h1 class="text-2xl mb-4">确认邮箱变更</h1>

      <Show when={token()} fallback={<div class="alert alert-error">链接缺少 token。</div>}>
        <Show when={mutation.isPending}>
          <div>正在确认...</div>
        </Show>
        <Show when={mutation.isSuccess}>
          <div class="space-y-3">
            <div class="alert alert-success">{mutation.data?.message ?? "邮箱已更新"}</div>
            <p class="text-sm opacity-70">即将跳转到个人资料页...</p>
            <A href="/profile" class="link">立即前往</A>
          </div>
        </Show>
        <Show when={mutation.isError}>
          <div class="space-y-3">
            <div class="alert alert-error">{mutation.error?.message ?? "确认失败"}</div>
            <A href="/profile" class="link">返回个人资料</A>
          </div>
        </Show>
      </Show>
    </div>
  );
}

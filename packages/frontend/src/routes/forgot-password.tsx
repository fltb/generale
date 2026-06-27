import type { ErrorResp, MessageResp, RequestPasswordResetReqBody } from "@generale/types/dist/api";
import { A, useNavigate } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { createSignal, Show } from "solid-js";
import { forgotPasswordApi } from "~/api/accountApi";
import type { ApiError } from "~/api/base";

export default function ForgotPasswordPage() {
  const nav = useNavigate();
  const [email, setEmail] = createSignal("");

  const mutation = useMutation<MessageResp, ApiError<ErrorResp>, RequestPasswordResetReqBody>(() => ({
    mutationFn: (body) => forgotPasswordApi(body),
  }));

  function submit(e: Event) {
    e.preventDefault();
    if (!email().trim()) return;
    mutation.mutate({ email: email().trim() });
  }

  return (
    <div class="p-4 max-w-md mx-auto">
      <h1 class="text-2xl mb-4">找回密码</h1>

      <Show
        when={!mutation.isSuccess}
        fallback={
          <div class="space-y-4">
            <div class="alert alert-success">{mutation.data?.message ?? "如果该邮箱已注册，我们已发送重置链接"}</div>
            <p class="text-sm opacity-70">
              查看你的邮箱（包括垃圾邮件），点击邮件里的链接设置新密码。链接 10 分钟内有效。
            </p>
            <div class="flex gap-2">
              <button type="button" class="btn btn-ghost btn-sm" onClick={() => nav("/login")}>
                返回登录
              </button>
            </div>
          </div>
        }
      >
        <form class="flex flex-col gap-2" onSubmit={submit}>
          <p class="text-sm opacity-70">输入注册时使用的邮箱，我们会发送重置链接给你。</p>
          <input
            type="email"
            class="input input-bordered"
            placeholder="邮箱"
            value={email()}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
          />
          <button class="btn btn-primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "发送中..." : "发送重置链接"}
          </button>
          <Show when={mutation.isError}>
            <p class="text-error text-sm">{mutation.error?.message ?? "发送失败"}</p>
          </Show>
          <p class="mt-2 text-sm">
            <A href="/login" class="link">
              返回登录
            </A>
          </p>
        </form>
      </Show>
    </div>
  );
}

import type { ErrorResp, PasswordResetTokenRespBody, ResetPasswordReqBody } from "@generale/types/dist/api";
import { Title, Meta } from "@solidjs/meta";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { createMemo, createSignal, Show } from "solid-js";
import { resetPasswordApi } from "~/api/accountApi";
import type { ApiError } from "~/api/base";

export default function ResetPasswordPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams<{ token?: string }>();
  const token = createMemo(() => (searchParams.token ?? "").trim());

  const [newPassword, setNewPassword] = createSignal("");
  const [confirm, setConfirm] = createSignal("");
  const [localErr, setLocalErr] = createSignal<string | null>(null);

  const mutation = useMutation<PasswordResetTokenRespBody, ApiError<ErrorResp>, ResetPasswordReqBody>(() => ({
    mutationFn: (body) => resetPasswordApi(body),
  }));

  function submit(e: Event) {
    e.preventDefault();
    setLocalErr(null);
    if (newPassword().length < 8) {
      setLocalErr("新密码至少 8 位");
      return;
    }
    if (newPassword() !== confirm()) {
      setLocalErr("两次输入不一致");
      return;
    }
    if (!token()) {
      setLocalErr("链接缺少 token");
      return;
    }
    mutation.mutate({ token: token(), newPassword: newPassword() });
  }

  return (
    <div class="p-4 max-w-md mx-auto">
      <Title>Reset Password — General E</Title>
      <Meta name="description" content="Set a new password." />
      <Meta property="og:title" content="Reset Password — General E" />
      <Meta property="og:description" content="Set a new password." />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <h1 class="text-2xl mb-4">设置新密码</h1>

      <Show when={token()} fallback={<div class="alert alert-error">链接缺少 token，请重新发起找回密码。</div>}>
        <Show
          when={!mutation.isSuccess || mutation.data?.valid === false}
          fallback={
            <div class="space-y-4">
              <div class="alert alert-success">{mutation.data?.message ?? "密码已重置"}</div>
              <button type="button" class="btn btn-primary" onClick={() => nav("/login")}>
                去登录
              </button>
            </div>
          }
        >
          <form class="flex flex-col gap-2" onSubmit={submit}>
            <input
              type="password"
              class="input input-bordered"
              placeholder="新密码（至少 8 位）"
              value={newPassword()}
              onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
              required
              minLength={8}
            />
            <input
              type="password"
              class="input input-bordered"
              placeholder="再次输入新密码"
              value={confirm()}
              onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
              required
              minLength={8}
            />
            <button class="btn btn-primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "提交中..." : "重置密码"}
            </button>
            <Show when={localErr()}>
              <p class="text-error text-sm">{localErr()}</p>
            </Show>
            <Show when={mutation.isError || mutation.data?.valid === false}>
              <p class="text-error text-sm">{mutation.error?.message ?? mutation.data?.message ?? "重置失败"}</p>
            </Show>
            <p class="mt-2 text-sm">
              <A href="/login" class="link">
                返回登录
              </A>
            </p>
          </form>
        </Show>
      </Show>
    </div>
  );
}

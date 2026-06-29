import type { ErrorResp, PasswordResetTokenRespBody, ResetPasswordReqBody } from "@generale/types/dist/api";
import { Title, Meta } from "@solidjs/meta";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { createMemo, createSignal, Show } from "solid-js";
import { useT } from "../i18n/useT";
import { resetPasswordApi } from "~/api/accountApi";
import type { ApiError } from "~/api/base";

export default function ResetPasswordPage() {
  const nav = useNavigate();
  const { t } = useT();
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
      setLocalErr(t("New password must be at least 8 characters"));
      return;
    }
    if (newPassword() !== confirm()) {
      setLocalErr(t("Passwords do not match"));
      return;
    }
    if (!token()) {
      setLocalErr(t("Missing token in link"));
      return;
    }
    mutation.mutate({ token: token(), newPassword: newPassword() });
  }

  return (
    <div class="p-4 max-w-md mx-auto">
      <Title>
        {t("Reset Password")} — {t("General E")}
      </Title>
      <Meta name="description" content={t("Set a new password.")} />
      <Meta property="og:title" content={`${t("Reset Password")} — ${t("General E")}`} />
      <Meta property="og:description" content={t("Set a new password.")} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <h1 class="text-2xl mb-4">{t("Set New Password")}</h1>

      <Show
        when={token()}
        fallback={
          <div class="alert alert-error">{t("Missing token in link, please restart the password reset process.")}</div>
        }
      >
        <Show
          when={!mutation.isSuccess || mutation.data?.valid === false}
          fallback={
            <div class="space-y-4">
              <div class="alert alert-success">{mutation.data?.message ?? t("Password has been reset")}</div>
              <button type="button" class="btn btn-primary" onClick={() => nav("/login")}>
                {t("Go to login")}
              </button>
            </div>
          }
        >
          <form class="flex flex-col gap-2" onSubmit={submit}>
            <input
              type="password"
              class="input input-bordered"
              placeholder={t("New password (min 8 characters)")}
              value={newPassword()}
              onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
              required
              minLength={8}
            />
            <input
              type="password"
              class="input input-bordered"
              placeholder={t("Confirm new password")}
              value={confirm()}
              onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
              required
              minLength={8}
            />
            <button class="btn btn-primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t("Submitting...") : t("Reset Password")}
            </button>
            <Show when={localErr()}>
              <p class="text-error text-sm">{localErr()}</p>
            </Show>
            <Show when={mutation.isError || mutation.data?.valid === false}>
              <p class="text-error text-sm">{mutation.error?.message ?? mutation.data?.message ?? t("Reset failed")}</p>
            </Show>
            <p class="mt-2 text-sm">
              <A href="/login" class="link">
                {t("Back to login")}
              </A>
            </p>
          </form>
        </Show>
      </Show>
    </div>
  );
}

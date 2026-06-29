import type {
  AvatarUploadRespBody,
  ChangeEmailReqBody,
  ChangePasswordReqBody,
  ChangeUsernameReqBody,
  ChangeUsernameRespBody,
  ErrorResp,
  MessageResp,
  ProfileUpdateReqBody,
} from "@generale/types/dist/api";
import { Title, Meta } from "@solidjs/meta";
import { useNavigate } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import { useT } from "../i18n/useT";
import { changeEmailApi, changePasswordApi, changeUsernameApi } from "~/api/accountApi";
import type { ApiError } from "~/api/base";
import { patchMyProfileApi, uploadMyAvatarApi } from "~/api/profileApi";
import Avatar from "~/components/Avatar";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import { useAuth } from "~/hooks/useAuth";
import { getSettingsApi, updateSettingsApi } from "~/api/settingsApi";

const ACCEPTED_MIME = "image/png,image/jpeg,image/webp";

export default function ProfilePage() {
  const auth = useAuth();
  const nav = useNavigate();
  const { t, setLocale } = useT();
  const [settingsLanguage, setSettingsLanguage] = createSignal("en");

  onMount(async () => {
    try {
      const s = await getSettingsApi();
      if (s.language) setSettingsLanguage(s.language);
    } catch {}
  });

  async function handleLanguageChange(value: string) {
    setSettingsLanguage(value);
    setLocale(value);
    try {
      await updateSettingsApi("language", value);
    } catch {}
  }

  // 表单 state；初始值用 createMemo 从 auth.user 派生，user 拉到后第一次渲染会用真实值。
  // 后续用户在输入框里改的内容由 controlled signal 维护，不被 auth.user 拽回。
  const [displayName, setDisplayName] = createSignal<string | null>(null);
  const [bio, setBio] = createSignal<string | null>(null);

  const effectiveDisplayName = createMemo(() => displayName() ?? auth.user?.displayName ?? "");
  const effectiveBio = createMemo(() => bio() ?? auth.user?.bio ?? "");

  const [pendingFile, setPendingFile] = createSignal<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = createSignal<string | null>(null);

  const patchMutation = useMutation<MessageResp, ApiError<ErrorResp>, ProfileUpdateReqBody>(() => ({
    mutationFn: (body) => patchMyProfileApi(body),
    onSuccess: async () => {
      // 让 useAuth 重新拉一遍 /me，displayName / bio 会同步
      await auth.refresh();
      // 表单 local override 清掉，让 effectiveXxx 直接显示服务端值
      setDisplayName(null);
      setBio(null);
    },
  }));

  const uploadMutation = useMutation<AvatarUploadRespBody, ApiError<ErrorResp>, File>(() => ({
    mutationFn: (file) => uploadMyAvatarApi(file),
    onSuccess: async () => {
      await auth.refresh();
      // 清掉本地预览
      const prev = pendingPreviewUrl();
      if (prev) URL.revokeObjectURL(prev);
      setPendingFile(null);
      setPendingPreviewUrl(null);
    },
  }));

  function onPickFile(e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const file = target.files?.[0] ?? null;
    // 清掉旧 preview blob URL 防泄漏
    const prev = pendingPreviewUrl();
    if (prev) URL.revokeObjectURL(prev);
    if (!file) {
      setPendingFile(null);
      setPendingPreviewUrl(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert(t("Avatar too large: {size} KB (max 2048 KB)", { size: (file.size / 1024).toFixed(0) }));
      target.value = "";
      return;
    }
    setPendingFile(file);
    setPendingPreviewUrl(URL.createObjectURL(file));
  }

  function submitProfile() {
    const body: ProfileUpdateReqBody = {};
    const trimmed = effectiveDisplayName().trim();
    if (trimmed.length > 50) {
      alert(t("Display name max 50 characters"));
      return;
    }
    body.displayName = trimmed;
    body.bio = effectiveBio();
    patchMutation.mutate(body);
  }

  function submitAvatar() {
    const file = pendingFile();
    if (!file) return;
    uploadMutation.mutate(file);
  }

  // 当前展示的头像 URL：优先用本地预览（新选了文件但还没上传），否则用 server 返回的 avatarUrl
  const currentAvatarSrc = createMemo(() => pendingPreviewUrl() ?? auth.user?.avatarUrl ?? null);

  // ===================== 改密码 =====================
  const [pwCurrent, setPwCurrent] = createSignal("");
  const [pwNew, setPwNew] = createSignal("");
  const [pwConfirm, setPwConfirm] = createSignal("");
  const [pwLocalErr, setPwLocalErr] = createSignal<string | null>(null);

  const pwMutation = useMutation<MessageResp, ApiError<ErrorResp>, ChangePasswordReqBody>(() => ({
    mutationFn: (body) => changePasswordApi(body),
    onSuccess: () => {
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
    },
  }));

  function submitPassword() {
    setPwLocalErr(null);
    if (pwNew().length < 8) {
      setPwLocalErr(t("New password must be at least 8 characters"));
      return;
    }
    if (pwNew() !== pwConfirm()) {
      setPwLocalErr(t("New passwords do not match"));
      return;
    }
    pwMutation.mutate({ currentPassword: pwCurrent(), newPassword: pwNew() });
  }

  // ===================== 改邮箱 =====================
  const [emCurrent, setEmCurrent] = createSignal("");
  const [emNew, setEmNew] = createSignal("");

  const emMutation = useMutation<MessageResp, ApiError<ErrorResp>, ChangeEmailReqBody>(() => ({
    mutationFn: (body) => changeEmailApi(body),
    onSuccess: () => {
      setEmCurrent("");
      setEmNew("");
    },
  }));

  function submitEmail() {
    if (!(emNew().trim() && emCurrent())) return;
    emMutation.mutate({ currentPassword: emCurrent(), newEmail: emNew().trim() });
  }

  // ===================== 改用户名 =====================
  const [unInput, setUnInput] = createSignal("");
  const [unLocalErr, setUnLocalErr] = createSignal<string | null>(null);

  const unMutation = useMutation<ChangeUsernameRespBody, ApiError<ErrorResp>, ChangeUsernameReqBody>(() => ({
    mutationFn: (body) => changeUsernameApi(body),
    onSuccess: async () => {
      await auth.refresh();
      setUnInput("");
      setUnLocalErr(null);
    },
  }));

  const usernameCanChange = createMemo(() => {
    const at = auth.user?.usernameChangedAt;
    if (!at) return { can: true, daysLeft: 0 };
    const elapsed = Date.now() - new Date(at).getTime();
    const cooldown = 7 * 24 * 60 * 60 * 1000;
    if (elapsed >= cooldown) return { can: true, daysLeft: 0 };
    const left = Math.ceil((cooldown - elapsed) / (24 * 60 * 60 * 1000));
    return { can: false, daysLeft: left };
  });

  function submitUsername() {
    setUnLocalErr(null);
    const val = unInput().trim();
    if (val.length < 3) {
      setUnLocalErr(t("Username must be at least 3 characters"));
      return;
    }
    if (val.length > 50) {
      setUnLocalErr(t("Username max 50 characters"));
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(val)) {
      setUnLocalErr(t("Only letters, numbers, and . _ - allowed"));
      return;
    }
    if (val === auth.user?.username) {
      setUnLocalErr(t("New username is the same as current"));
      return;
    }
    unMutation.mutate({ username: val });
  }

  return (
    <ProtectedRoute>
      <Title>
        {t("Profile")} — {t("General E")}
      </Title>
      <Meta name="description" content={t("Manage your profile and settings.")} />
      <Meta property="og:title" content={`${t("Profile")} — ${t("General E")}`} />
      <Meta property="og:description" content={t("Manage your profile and settings.")} />
      <Meta property="og:image" content="/og-image.svg" />
      <Meta property="og:type" content="website" />
      <Show when={!auth.isLoading} fallback={<p class="p-4">{t("Loading...")}</p>}>
        <Show
          when={auth.user}
          fallback={
            (() => {
              nav("/login");
              return null;
            })() as unknown as Element
          }
        >
          <div class="container mx-auto p-6 max-w-2xl space-y-6">
            <h1 class="text-2xl font-bold">{t("Profile")}</h1>

            {/* ---------- Avatar ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">{t("Avatar")}</h2>
              <div class="flex items-center gap-4">
                <Avatar src={currentAvatarSrc() ?? ""} alt={auth.user?.displayName || auth.user?.username} size={96} />
                <div class="flex flex-col gap-2">
                  <input
                    type="file"
                    class="file-input file-input-bordered file-input-sm"
                    accept={ACCEPTED_MIME}
                    onChange={onPickFile}
                  />
                  <div class="text-xs opacity-60">{t("Supports PNG/JPG/WebP, max 2 MB")}</div>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      class="btn btn-sm btn-primary"
                      disabled={!pendingFile() || uploadMutation.isPending}
                      onClick={submitAvatar}
                    >
                      {uploadMutation.isPending ? t("Uploading...") : t("Upload new avatar")}
                    </button>
                    <Show when={pendingFile()}>
                      <button
                        type="button"
                        class="btn btn-sm btn-ghost"
                        onClick={() => {
                          const p = pendingPreviewUrl();
                          if (p) URL.revokeObjectURL(p);
                          setPendingFile(null);
                          setPendingPreviewUrl(null);
                        }}
                      >
                        {t("Cancel")}
                      </button>
                    </Show>
                  </div>
                  <Show when={uploadMutation.isError}>
                    <div class="text-error text-xs">{uploadMutation.error?.message ?? t("Upload failed")}</div>
                  </Show>
                </div>
              </div>
            </section>

            {/* ---------- Settings ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">{t("Settings")}</h2>
              <label class="flex items-center gap-3">
                <span class="label-text w-20">{t("Language")}</span>
                <select
                  class="select select-bordered select-sm flex-1"
                  value={settingsLanguage()}
                  onChange={(e) => handleLanguageChange(e.currentTarget.value)}
                >
                  <option value="en">English</option>
                  <option value="zh-CN">简体中文</option>
                </select>
              </label>
            </section>

            {/* ---------- Account Info + Change Username ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">{t("Account")}</h2>

              <div class="flex items-end gap-3 flex-wrap">
                <label class="flex-1 min-w-0">
                  <span class="label-text">
                    {t("Username")}
                    <Show when={auth.user?.usernameChangedAt}>
                      <span class="text-xs opacity-60 ml-1">
                        {t("(last changed: {date})", {
                          date: auth.user?.usernameChangedAt
                            ? new Date(auth.user.usernameChangedAt).toLocaleDateString()
                            : "",
                        })}
                      </span>
                    </Show>
                  </span>
                  <input
                    class="input input-bordered w-full"
                    maxLength={50}
                    placeholder={auth.user?.username}
                    value={unInput()}
                    onInput={(e) => setUnInput((e.target as HTMLInputElement).value)}
                    disabled={!usernameCanChange().can}
                  />
                  <Show when={!usernameCanChange().can}>
                    <span class="label-text-alt text-warning">
                      {t("{days} days until next change", { days: usernameCanChange().daysLeft })}
                    </span>
                  </Show>
                </label>
                <button
                  type="button"
                  class="btn btn-sm btn-primary shrink-0"
                  disabled={!usernameCanChange().can || unMutation.isPending || !unInput().trim()}
                  onClick={submitUsername}
                >
                  {unMutation.isPending ? t("Submitting...") : t("Change")}
                </button>
              </div>
              <Show when={unMutation.isSuccess}>
                <span class="text-success text-sm">{t("Username changed")}</span>
              </Show>
              <Show when={unLocalErr()}>
                <span class="text-error text-sm">{unLocalErr()}</span>
              </Show>
              <Show when={unMutation.isError}>
                <span class="text-error text-sm">{unMutation.error?.message ?? t("Change failed")}</span>
              </Show>

              <p class="text-sm">
                <span class="opacity-60 mr-2">{t("Email")}</span>
                <span>{auth.user?.email}</span>
              </p>
            </section>

            {/* ---------- Editable Info ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">{t("Profile")}</h2>

              <label class="block">
                <span class="label-text">{t("Display Name")}</span>
                <input
                  class="input input-bordered w-full"
                  maxLength={50}
                  placeholder={t("Leave empty to show username")}
                  value={effectiveDisplayName()}
                  onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                />
              </label>

              <label class="block">
                <span class="label-text">{t("Bio")}</span>
                <textarea
                  class="textarea textarea-bordered w-full"
                  maxLength={500}
                  rows={3}
                  value={effectiveBio()}
                  onInput={(e) => setBio((e.target as HTMLTextAreaElement).value)}
                />
                <span class="label-text-alt opacity-60">{effectiveBio().length} / 500</span>
              </label>

              <div class="flex gap-2 items-center">
                <button
                  type="button"
                  class="btn btn-primary"
                  disabled={patchMutation.isPending}
                  onClick={submitProfile}
                >
                  {patchMutation.isPending ? t("Saving...") : t("Save Changes")}
                </button>
                <Show when={patchMutation.isSuccess}>
                  <span class="text-success text-sm">{t("Saved")}</span>
                </Show>
                <Show when={patchMutation.isError}>
                  <span class="text-error text-sm">{patchMutation.error?.message ?? t("Save failed")}</span>
                </Show>
              </div>
            </section>

            {/* ---------- Change Password ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">{t("Change Password")}</h2>
              {/* Hidden username input: helps password managers associate the new password */}
              <input
                type="text"
                class="hidden"
                autocomplete="username"
                readonly
                tabIndex={-1}
                value={auth.user?.username ?? auth.user?.email ?? ""}
              />
              <input
                type="password"
                class="input input-bordered w-full"
                placeholder={t("Current password")}
                value={pwCurrent()}
                onInput={(e) => setPwCurrent((e.target as HTMLInputElement).value)}
                autocomplete="current-password"
              />
              <input
                type="password"
                class="input input-bordered w-full"
                placeholder={t("New password (min 8 characters)")}
                value={pwNew()}
                onInput={(e) => setPwNew((e.target as HTMLInputElement).value)}
                autocomplete="new-password"
              />
              <input
                type="password"
                class="input input-bordered w-full"
                placeholder={t("Confirm new password")}
                value={pwConfirm()}
                onInput={(e) => setPwConfirm((e.target as HTMLInputElement).value)}
                autocomplete="new-password"
              />
              <div class="flex gap-2 items-center">
                <button type="button" class="btn btn-primary" disabled={pwMutation.isPending} onClick={submitPassword}>
                  {pwMutation.isPending ? t("Submitting...") : t("Update Password")}
                </button>
                <Show when={pwMutation.isSuccess}>
                  <span class="text-success text-sm">{pwMutation.data?.message ?? t("Password updated")}</span>
                </Show>
                <Show when={pwLocalErr()}>
                  <span class="text-error text-sm">{pwLocalErr()}</span>
                </Show>
                <Show when={pwMutation.isError}>
                  <span class="text-error text-sm">{pwMutation.error?.message ?? t("Update failed")}</span>
                </Show>
              </div>
            </section>

            {/* ---------- Change Email ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">{t("Change Email")}</h2>
              <p class="text-sm opacity-70">
                {t("A confirmation link will be sent to your new email. The old email will also be notified.")}
              </p>
              <input
                type="email"
                class="input input-bordered w-full"
                placeholder={t("New email")}
                value={emNew()}
                onInput={(e) => setEmNew((e.target as HTMLInputElement).value)}
              />
              <input
                type="password"
                class="input input-bordered w-full"
                placeholder={t("Current password (verify identity)")}
                value={emCurrent()}
                onInput={(e) => setEmCurrent((e.target as HTMLInputElement).value)}
                autocomplete="current-password"
              />
              <div class="flex gap-2 items-center">
                <button type="button" class="btn btn-primary" disabled={emMutation.isPending} onClick={submitEmail}>
                  {emMutation.isPending ? t("Sending...") : t("Send confirmation email")}
                </button>
                <Show when={emMutation.isSuccess}>
                  <span class="text-success text-sm">{emMutation.data?.message ?? t("Confirmation email sent")}</span>
                </Show>
                <Show when={emMutation.isError}>
                  <span class="text-error text-sm">{emMutation.error?.message ?? t("Sending failed")}</span>
                </Show>
              </div>
            </section>

            {/* ---------- Logout ---------- */}
            <div class="flex justify-end">
              <button type="button" class="btn btn-outline" onClick={auth.logout}>
                {t("Logout")}
              </button>
            </div>
          </div>
        </Show>
      </Show>
    </ProtectedRoute>
  );
}

import { createSignal, createMemo, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";

import { useAuth } from "~/hooks/useAuth";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import Avatar from "~/components/Avatar";
import { patchMyProfileApi, uploadMyAvatarApi } from "~/api/profileApi";
import { changePasswordApi, changeEmailApi, changeUsernameApi } from "~/api/accountApi";
import { ApiError } from "~/api/base";
import type {
  ProfileUpdateReqBody,
  AvatarUploadRespBody,
  ChangePasswordReqBody,
  ChangeEmailReqBody,
  ChangeUsernameReqBody,
  ChangeUsernameRespBody,
  ErrorResp,
  MessageResp,
} from "@generale/types/dist/api";

const ACCEPTED_MIME = "image/png,image/jpeg,image/webp";

export default function ProfilePage() {
  const auth = useAuth();
  const nav = useNavigate();

  // 表单 state；初始值用 createMemo 从 auth.user 派生，user 拉到后第一次渲染会用真实值。
  // 后续用户在输入框里改的内容由 controlled signal 维护，不被 auth.user 拽回。
  const [displayName, setDisplayName] = createSignal<string | null>(null);
  const [bio, setBio] = createSignal<string | null>(null);

  const effectiveDisplayName = createMemo(
    () => displayName() ?? auth.user?.displayName ?? "",
  );
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

  const uploadMutation = useMutation<
    AvatarUploadRespBody,
    ApiError<ErrorResp>,
    File
  >(() => ({
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
      alert(`头像太大：${(file.size / 1024).toFixed(0)} KB（上限 2048 KB）`);
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
      alert("昵称最多 50 字符");
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
  const currentAvatarSrc = createMemo(
    () => pendingPreviewUrl() ?? auth.user?.avatarUrl ?? null,
  );

  // ===================== 改密码 =====================
  const [pwCurrent, setPwCurrent] = createSignal("");
  const [pwNew, setPwNew] = createSignal("");
  const [pwConfirm, setPwConfirm] = createSignal("");
  const [pwLocalErr, setPwLocalErr] = createSignal<string | null>(null);

  const pwMutation = useMutation<MessageResp, ApiError<ErrorResp>, ChangePasswordReqBody>(() => ({
    mutationFn: (body) => changePasswordApi(body),
    onSuccess: () => {
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
    },
  }));

  function submitPassword() {
    setPwLocalErr(null);
    if (pwNew().length < 8) { setPwLocalErr("新密码至少 8 位"); return; }
    if (pwNew() !== pwConfirm()) { setPwLocalErr("两次新密码不一致"); return; }
    pwMutation.mutate({ currentPassword: pwCurrent(), newPassword: pwNew() });
  }

  // ===================== 改邮箱 =====================
  const [emCurrent, setEmCurrent] = createSignal("");
  const [emNew, setEmNew] = createSignal("");

  const emMutation = useMutation<MessageResp, ApiError<ErrorResp>, ChangeEmailReqBody>(() => ({
    mutationFn: (body) => changeEmailApi(body),
    onSuccess: () => {
      setEmCurrent(""); setEmNew("");
    },
  }));

  function submitEmail() {
    if (!emNew().trim() || !emCurrent()) return;
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
    if (val.length < 3) { setUnLocalErr("用户名至少 3 个字符"); return; }
    if (val.length > 50) { setUnLocalErr("用户名最多 50 个字符"); return; }
    if (!/^[a-zA-Z0-9._-]+$/.test(val)) { setUnLocalErr("只允许字母、数字和 . _ -"); return; }
    if (val === auth.user?.username) { setUnLocalErr("新用户名与当前相同"); return; }
    unMutation.mutate({ username: val });
  }

  return (
    <ProtectedRoute>
      <Show
        when={!auth.isLoading}
        fallback={<p class="p-4">加载中...</p>}
      >
        <Show when={auth.user} fallback={(() => { nav("/login"); return null; })() as any}>
          <div class="container mx-auto p-6 max-w-2xl space-y-6">
            <h1 class="text-2xl font-bold">个人资料</h1>

            {/* ---------- 头像 ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">头像</h2>
              <div class="flex items-center gap-4">
                <Avatar
                  src={currentAvatarSrc()!}
                  alt={auth.user?.displayName || auth.user?.username}
                  size={96}
                />
                <div class="flex flex-col gap-2">
                  <input
                    type="file"
                    class="file-input file-input-bordered file-input-sm"
                    accept={ACCEPTED_MIME}
                    onChange={onPickFile}
                  />
                  <div class="text-xs opacity-60">支持 PNG / JPG / WebP，上限 2 MB</div>
                  <div class="flex gap-2">
                    <button
                      class="btn btn-sm btn-primary"
                      disabled={!pendingFile() || uploadMutation.isPending}
                      onClick={submitAvatar}
                    >
                      {uploadMutation.isPending ? "上传中..." : "上传新头像"}
                    </button>
                    <Show when={pendingFile()}>
                      <button
                        class="btn btn-sm btn-ghost"
                        onClick={() => {
                          const p = pendingPreviewUrl();
                          if (p) URL.revokeObjectURL(p);
                          setPendingFile(null);
                          setPendingPreviewUrl(null);
                        }}
                      >
                        取消
                      </button>
                    </Show>
                  </div>
                  <Show when={uploadMutation.isError}>
                    <div class="text-error text-xs">
                      {uploadMutation.error?.message ?? "上传失败"}
                    </div>
                  </Show>
                </div>
              </div>
            </section>

            {/* ---------- 账号信息 + 改用户名 ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">账号</h2>

              <div class="flex items-end gap-3 flex-wrap">
                <label class="flex-1 min-w-0">
                  <span class="label-text">
                    用户名
                    <Show when={auth.user?.usernameChangedAt}>
                      <span class="text-xs opacity-60 ml-1">
                        （上次修改：{new Date(auth.user!.usernameChangedAt!).toLocaleDateString()}）
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
                      {usernameCanChange().daysLeft} 天后可再次修改
                    </span>
                  </Show>
                </label>
                <button
                  class="btn btn-sm btn-primary shrink-0"
                  disabled={!usernameCanChange().can || unMutation.isPending || !unInput().trim()}
                  onClick={submitUsername}
                >
                  {unMutation.isPending ? "提交中..." : "修改"}
                </button>
              </div>
              <Show when={unMutation.isSuccess}>
                <span class="text-success text-sm">用户名已修改</span>
              </Show>
              <Show when={unLocalErr()}>
                <span class="text-error text-sm">{unLocalErr()}</span>
              </Show>
              <Show when={unMutation.isError}>
                <span class="text-error text-sm">
                  {unMutation.error?.message ?? "修改失败"}
                </span>
              </Show>

              <p class="text-sm">
                <span class="opacity-60 mr-2">邮箱</span>
                <span>{auth.user?.email}</span>
              </p>
            </section>

            {/* ---------- 可编辑信息 ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">资料</h2>

              <label class="block">
                <span class="label-text">昵称 (displayName)</span>
                <input
                  class="input input-bordered w-full"
                  maxLength={50}
                  placeholder="不填则显示用户名"
                  value={effectiveDisplayName()}
                  onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                />
              </label>

              <label class="block">
                <span class="label-text">个性签名 (bio)</span>
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
                  class="btn btn-primary"
                  disabled={patchMutation.isPending}
                  onClick={submitProfile}
                >
                  {patchMutation.isPending ? "保存中..." : "保存修改"}
                </button>
                <Show when={patchMutation.isSuccess}>
                  <span class="text-success text-sm">已保存</span>
                </Show>
                <Show when={patchMutation.isError}>
                  <span class="text-error text-sm">
                    {patchMutation.error?.message ?? "保存失败"}
                  </span>
                </Show>
              </div>
            </section>

            {/* ---------- 改密码 ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">修改密码</h2>
              {/* 隐藏的 username 输入：让浏览器密码管理器把新密码关联到 username（兜底 email），
                  而不是 displayName 这种可变字段。display:none 不影响 autofill 抓取。 */}
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
                placeholder="当前密码"
                value={pwCurrent()}
                onInput={(e) => setPwCurrent((e.target as HTMLInputElement).value)}
                autocomplete="current-password"
              />
              <input
                type="password"
                class="input input-bordered w-full"
                placeholder="新密码（至少 8 位）"
                value={pwNew()}
                onInput={(e) => setPwNew((e.target as HTMLInputElement).value)}
                autocomplete="new-password"
              />
              <input
                type="password"
                class="input input-bordered w-full"
                placeholder="再次输入新密码"
                value={pwConfirm()}
                onInput={(e) => setPwConfirm((e.target as HTMLInputElement).value)}
                autocomplete="new-password"
              />
              <div class="flex gap-2 items-center">
                <button class="btn btn-primary" disabled={pwMutation.isPending} onClick={submitPassword}>
                  {pwMutation.isPending ? "提交中..." : "更新密码"}
                </button>
                <Show when={pwMutation.isSuccess}>
                  <span class="text-success text-sm">{pwMutation.data?.message ?? "密码已更新"}</span>
                </Show>
                <Show when={pwLocalErr()}>
                  <span class="text-error text-sm">{pwLocalErr()}</span>
                </Show>
                <Show when={pwMutation.isError}>
                  <span class="text-error text-sm">{pwMutation.error?.message ?? "更新失败"}</span>
                </Show>
              </div>
            </section>

            {/* ---------- 改邮箱 ---------- */}
            <section class="card bg-base-200 p-4 space-y-3">
              <h2 class="text-lg font-semibold">修改邮箱</h2>
              <p class="text-sm opacity-70">
                提交后会发一封确认链接到<strong>新邮箱</strong>，点击链接才生效。旧邮箱也会收到通知。
              </p>
              <input
                type="email"
                class="input input-bordered w-full"
                placeholder="新邮箱"
                value={emNew()}
                onInput={(e) => setEmNew((e.target as HTMLInputElement).value)}
              />
              <input
                type="password"
                class="input input-bordered w-full"
                placeholder="当前密码（验证身份）"
                value={emCurrent()}
                onInput={(e) => setEmCurrent((e.target as HTMLInputElement).value)}
                autocomplete="current-password"
              />
              <div class="flex gap-2 items-center">
                <button class="btn btn-primary" disabled={emMutation.isPending} onClick={submitEmail}>
                  {emMutation.isPending ? "发送中..." : "发送确认邮件"}
                </button>
                <Show when={emMutation.isSuccess}>
                  <span class="text-success text-sm">{emMutation.data?.message ?? "已发送确认邮件"}</span>
                </Show>
                <Show when={emMutation.isError}>
                  <span class="text-error text-sm">{emMutation.error?.message ?? "发送失败"}</span>
                </Show>
              </div>
            </section>

            {/* ---------- 登出 ---------- */}
            <div class="flex justify-end">
              <button class="btn btn-outline" onClick={auth.logout}>
                退出登录
              </button>
            </div>
          </div>
        </Show>
      </Show>
    </ProtectedRoute>
  );
}

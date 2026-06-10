import { createSignal, createMemo, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useMutation } from "@tanstack/solid-query";

import { useAuth } from "~/hooks/useAuth";
import { ProtectedRoute } from "~/components/ProtectedRoute";
import Avatar from "~/components/Avatar";
import { patchMyProfileApi, uploadMyAvatarApi } from "~/api/profileApi";
import { ApiError } from "~/api/base";
import type {
  ProfileUpdateReqBody,
  AvatarUploadRespBody,
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

            {/* ---------- 基本信息（只读） ---------- */}
            <section class="card bg-base-200 p-4 space-y-2">
              <h2 class="text-lg font-semibold">账号</h2>
              <p class="text-sm">
                <span class="opacity-60 mr-2">用户名</span>
                <span class="font-mono">{auth.user?.username}</span>
              </p>
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

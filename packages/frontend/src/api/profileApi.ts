// profile-related API helpers.
//
// - PATCH /api/profile/me 走 JSON，复用 base 的 api()
// - POST  /api/profile/avatar 是 multipart/form-data，必须**不**手动设 Content-Type，
//   让浏览器自动带上 boundary。所以这里直接 fetch，不走 api()。
import { api, ApiError } from "./base";
import type {
  ProfileUpdateReqBody,
  AvatarUploadRespBody,
  ProfileRespBody,
  ErrorResp,
  MessageResp,
} from "@generale/types/dist/api";

/** 公开 profile 查询：任意 userId 都能查（不返回 email 等敏感字段） */
export function getProfileApi(userId: string): Promise<ProfileRespBody> {
  return api<ProfileRespBody, ErrorResp>(`/api/profile/${encodeURIComponent(userId)}`, {
    method: "GET",
  });
}

export async function patchMyProfileApi(
  body: ProfileUpdateReqBody
): Promise<MessageResp> {
  return api<MessageResp, ErrorResp>("/api/profile/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function uploadMyAvatarApi(
  file: File
): Promise<AvatarUploadRespBody> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/profile/avatar", {
    method: "POST",
    credentials: "include",
    body: form,
    // 故意不写 Content-Type：浏览器要自带 multipart boundary
  });
  const text = await res.text();
  let parsed: any = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const errData = (parsed as ErrorResp) ?? ({} as ErrorResp);
    const message = (errData as any)?.error ?? res.statusText ?? "Upload failed";
    throw new ApiError<ErrorResp>(message, res.status, errData);
  }
  return parsed as AvatarUploadRespBody;
}

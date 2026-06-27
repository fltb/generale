// src/services/authApi.ts

import type {
  ErrorResp,
  LoginReqBody,
  LogoutRespBody,
  MessageResp,
  RegisterReqBody,
  UserProfileRespBody,
  UserSuccessRespBody,
  VerifyReqBody,
} from "@generale/types/dist/api";
import { api } from "./base";

/**
 * GET /api/me
 */
export function meApi(): Promise<UserSuccessRespBody> {
  return api<UserSuccessRespBody, ErrorResp>("/api/me", { method: "GET" });
}

/**
 * POST /api/login
 */
export function loginApi(payload: LoginReqBody): Promise<UserSuccessRespBody> {
  return api<UserSuccessRespBody, ErrorResp>("/api/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * POST /api/register
 */
export function registerApi(payload: RegisterReqBody): Promise<MessageResp> {
  return api<MessageResp, ErrorResp>("/api/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * POST /api/logout
 */
export function logoutApi(): Promise<LogoutRespBody> {
  return api<LogoutRespBody, ErrorResp>("/api/logout", { method: "POST" });
}
/**
 * POST /api/verify
 */
export function verifyApi(body: VerifyReqBody): Promise<MessageResp> {
  return api<MessageResp, ErrorResp>("/api/verify", { method: "POST", body: JSON.stringify(body) });
}

/**
 * PATCH /api/me
 * 假设返回 UserSuccessRespBody（更新后返回 user）
 */
export function patchProfileApi(body: Partial<Pick<UserProfileRespBody, "email">>): Promise<UserSuccessRespBody> {
  return api<UserSuccessRespBody, ErrorResp>("/api/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// src/services/authApi.ts
import { api } from "./base";

import type {
    LoginReqBody,
    RegisterReqBody,
    UserSuccessRespBody,
    MessageResp,
    LogoutRespBody,
    UserProfileRespBody,
    ErrorResp,
    VerifyReqBody
} from "@generale/types";

/**
 * GET /api/me
 */
export async function meApi(): Promise<UserSuccessRespBody> {
    return api<UserSuccessRespBody, ErrorResp>("/api/me", { method: "GET" });
}

/**
 * POST /api/login
 */
export async function loginApi(payload: LoginReqBody): Promise<UserSuccessRespBody> {
    return api<UserSuccessRespBody, ErrorResp>("/api/login", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * POST /api/register
 */
export async function registerApi(payload: RegisterReqBody): Promise<MessageResp> {
    return api<MessageResp, ErrorResp>("/api/register", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

/**
 * POST /api/logout
 */
export async function logoutApi(): Promise<LogoutRespBody> {
    return api<LogoutRespBody, ErrorResp>("/api/logout", { method: "POST" });
}
/**
 * POST /api/verify
 */
export async function verifyApi(body: VerifyReqBody): Promise<MessageResp> {
    return api<MessageResp, ErrorResp>("/api/verify", { method: "POST", body: JSON.stringify(body) });
}


/**
 * PATCH /api/me
 * 假设返回 UserSuccessRespBody（更新后返回 user）
 */
export async function patchProfileApi(body: Partial<Pick<UserProfileRespBody, "email">>): Promise<UserSuccessRespBody> {
    return api<UserSuccessRespBody, ErrorResp>("/api/me", {
        method: "PATCH",
        body: JSON.stringify(body),
    });
}


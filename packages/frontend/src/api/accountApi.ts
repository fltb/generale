// 账号管理：忘记密码 / 改密码 / 改邮箱 / 改用户名 / 确认改邮箱
import { api } from "./base";
import type {
  RequestPasswordResetReqBody,
  ResetPasswordReqBody,
  ChangePasswordReqBody,
  ChangeEmailReqBody,
  ConfirmEmailChangeReqBody,
  ChangeUsernameReqBody,
  ChangeUsernameRespBody,
  MessageResp,
  PasswordResetTokenRespBody,
  ErrorResp,
} from "@generale/types/dist/api";

export function forgotPasswordApi(body: RequestPasswordResetReqBody): Promise<MessageResp> {
  return api<MessageResp, ErrorResp>("/api/forgot-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function resetPasswordApi(body: ResetPasswordReqBody): Promise<PasswordResetTokenRespBody> {
  return api<PasswordResetTokenRespBody, ErrorResp>("/api/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function changePasswordApi(body: ChangePasswordReqBody): Promise<MessageResp> {
  return api<MessageResp, ErrorResp>("/api/change-password", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function changeEmailApi(body: ChangeEmailReqBody): Promise<MessageResp> {
  return api<MessageResp, ErrorResp>("/api/change-email", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function confirmEmailChangeApi(body: ConfirmEmailChangeReqBody): Promise<MessageResp> {
  return api<MessageResp, ErrorResp>("/api/confirm-email-change", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function changeUsernameApi(body: ChangeUsernameReqBody): Promise<ChangeUsernameRespBody> {
  return api<ChangeUsernameRespBody, ErrorResp>("/api/me/username", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

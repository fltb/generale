// src/services/base.ts
import type { ErrorResp } from "@generale/types/dist/api";

/**
 * ApiError 包裹服务器返回的错误结构（通常为 ErrorResp），并保留 http status。
 * 泛型 E 允许你在特殊端点用不同的 error schema（如果需要）。
 */
export class ApiError<E = ErrorResp> extends Error {
  public status: number;
  public data?: E;

  constructor(message: string, status = 500, data?: E) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * 泛型 api helper：
 *   T - 成功返回类型
 *   E - 错误返回类型（默认使用 @generale/types 的 ErrorResp）
 */
export async function api<T = any, E = ErrorResp>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    ...opts,
  });

  const text = await res.text();
  let parsed: any = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    // 如果返回不是 JSON，保留原始文本
    parsed = text;
  }

  if (!res.ok) {
    // 尝试把后端的 error payload 解析为 E（例如 ErrorResp）
    const errData = (parsed as E) ?? ({} as E);
    const message = (errData && (errData as any).error) ?? res.statusText ?? "Request failed";
    throw new ApiError<E>(message, res.status, errData);
  }

  return parsed as T;
}

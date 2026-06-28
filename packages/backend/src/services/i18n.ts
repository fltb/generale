import { createT, type LocaleCode } from "@generale/i18n";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { userSettings } from "../db/schema";
import { sessionService } from "./sessionService";

const SUPPORTED: LocaleCode[] = ["en", "zh-CN"];

function parseAcceptLanguage(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const m = part.trim().match(/^([a-z]{2})(?:-[A-Z]{2})?(?:;q=[0-9.]+)?/);
      return m ? m[1] : null;
    })
    .filter((l): l is string => l !== null);
}

export function tForRequest(ctx: {
  cookie?: unknown;
  request?: { headers: Headers };
}) {
  let locale: LocaleCode = "en";
  const c = ctx.cookie as { sid?: { value?: string } } | undefined;

  const sid = c?.sid?.value;
  if (sid) {
    const session = sessionService.get(sid);
    if (session?.userId) {
      const row = db
        .select()
        .from(userSettings)
        .where(and(eq(userSettings.userId, session.userId), eq(userSettings.key, "language")))
        .get();
      if (row && (SUPPORTED as readonly string[]).includes(row.value)) {
        locale = row.value as LocaleCode;
      }
    }
  }

  if (locale === "en" && ctx.request?.headers) {
    const al = ctx.request.headers.get("Accept-Language");
    if (al) {
      const preferred = parseAcceptLanguage(al);
      const match = preferred.find((l) => (SUPPORTED as readonly string[]).includes(l));
      if (match) locale = match as LocaleCode;
    }
  }

  return createT(locale);
}

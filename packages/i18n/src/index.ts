import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";
import type { TranslationKey, TranslationDict } from "./types";

const locales: Record<string, TranslationDict> = {
  en,
  "zh-CN": zhCN,
};

export type LocaleCode = keyof typeof locales;

export function createT(locale: string) {
  const dict = locales[locale] ?? en;
  return (key: TranslationKey, params?: Record<string, string | number>): string => {
    let template = dict[key];
    if (template == null || template === "") {
      template = en[key];
    }
    if (template == null || template === "") {
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] Missing key: "${String(key)}"`);
      }
      return key;
    }
    return params
      ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`))
      : template;
  };
}

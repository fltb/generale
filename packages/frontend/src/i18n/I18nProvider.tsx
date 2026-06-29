import { createContext, createMemo, useContext, type JSX } from "solid-js";
import { translator, type BaseTemplateArgs } from "@solid-primitives/i18n";
import en from "@generale/i18n/locales/en.json";
import zhCN from "@generale/i18n/locales/zh-CN.json";
import type { TranslationKey } from "@generale/i18n";

type TT = (key: TranslationKey, params?: BaseTemplateArgs) => string;
type Dict = typeof en;

type TContext = { t: TT; setLocale: (l: string) => void; locale: () => string };

const I18nCtx = createContext<TContext>();

function resolve(str: string, params?: BaseTemplateArgs): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export function I18nProvider(props: { locale: string; setLocale: (l: string) => void; children: JSX.Element }) {
  const dict = createMemo((): Dict => {
    if (props.locale !== "zh-CN") return en;
    const merged: Dict = { ...en };
    for (const [k, v] of Object.entries(zhCN)) {
      if (v) (merged as Record<string, string>)[k] = v as string;
    }
    return merged;
  });
  const tRaw = translator(dict, resolve);
  const t: TT = (key, params) => tRaw(key as keyof Dict, params) as string;
  return (
    <I18nCtx.Provider value={{ t, setLocale: props.setLocale, locale: () => props.locale }}>
      {props.children}
    </I18nCtx.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nCtx);
  if (!ctx) {
    const fallbackT = (key: string, params?: Record<string, string | number | boolean>) => {
      if (!params) return key;
      return key.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
    };
    return { t: fallbackT, setLocale: () => {}, locale: () => "en" };
  }
  return ctx;
}

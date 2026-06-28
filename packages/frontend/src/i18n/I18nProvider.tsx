import { createContext, createMemo, useContext, type JSX } from "solid-js";
import { translator, type BaseTemplateArgs } from "@solid-primitives/i18n";
import en from "@generale/i18n/locales/en.json";
import zhCN from "@generale/i18n/locales/zh-CN.json";
import type { TranslationKey } from "@generale/i18n";

type TT = (key: TranslationKey, params?: BaseTemplateArgs) => string;
type Dict = typeof en;

const I18nCtx = createContext<{ t: TT; setLocale: (l: string) => void }>();

function resolve(str: string, params?: BaseTemplateArgs): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export function I18nProvider(props: {
  locale: string;
  setLocale: (l: string) => void;
  children: JSX.Element;
}) {
  const dict = createMemo((): Dict => (props.locale === "zh-CN" ? zhCN : en));
  const tRaw = translator(dict, resolve);
  const t: TT = (key, params) => tRaw(key as keyof Dict, params) as string;
  return (
    <I18nCtx.Provider value={{ t, setLocale: props.setLocale }}>
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
    return { t: fallbackT, setLocale: () => {} };
  }
  return ctx;
}

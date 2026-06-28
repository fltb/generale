import type { BaseTemplateArgs } from "@solid-primitives/i18n";
import type { TranslationKey } from "@generale/i18n";
import { useT as useTContext } from "./I18nProvider";

export function useT() {
  const ctx = useTContext();
  return { t: (key: TranslationKey, params?: BaseTemplateArgs) => ctx.t(key, params) as string, setLocale: ctx.setLocale, locale: ctx.locale };
}

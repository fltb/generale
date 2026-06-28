import { useI18n } from "@solid-primitives/i18n";
import type { TranslationKey } from "@generale/i18n";

export function useT() {
  const [tRaw, { locale, add, remove }] = useI18n();
  const t = (key: TranslationKey, params?: Record<string, string | number>): string =>
    tRaw(key, params);
  return { t, setLocale: locale, addLocale: add };
}

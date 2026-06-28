import { createI18nContext, I18nContext } from "@solid-primitives/i18n";
import en from "@generale/i18n/locales/en.json";
import zhCN from "@generale/i18n/locales/zh-CN.json";

const dict = { en, "zh-CN": zhCN };

export function I18nProvider(props: { locale: string; children: any }) {
  const value = createI18nContext(dict, props.locale);
  return (
    <I18nContext.Provider value={value}>
      {props.children}
    </I18nContext.Provider>
  );
}

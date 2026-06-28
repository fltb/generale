import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@solidjs/testing-library";

vi.mock("@solid-primitives/i18n", () => {
  const useI18n = () => {
    const t = (key: string, _params?: Record<string, string | number>, _defaultValue?: string) => key;
    const locale = () => "en" as const;
    const add = () => {};
    const remove = () => {};
    return [t, { locale, add, remove }];
  };
  return { useI18n };
});

afterEach(() => {
  cleanup();
});

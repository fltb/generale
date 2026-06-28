import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@solidjs/testing-library";

vi.mock("@solid-primitives/i18n", () => {
  const resolveTemplate = (str: string, params?: Record<string, string | number | boolean>) => {
    if (params) {
      return str.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
    }
    return str;
  };
  return {
    translator: () => (path: string, ...args: any[]) => {
      if (typeof path !== "string") return path;
      return resolveTemplate(path, args[0] as Record<string, string | number | boolean> | undefined);
    },
    resolveTemplate,
  };
});

afterEach(() => {
  cleanup();
});

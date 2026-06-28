import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";
import path from "path";

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/__tests__/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}", "src/ws/__test__/**/*.test.ts"],
    globals: false,
    server: {
      deps: {
        inline: ["solid-js"],
      },
    },
  },
});

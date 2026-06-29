import { defineConfig } from "@rsbuild/core";
import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginSolid } from "@rsbuild/plugin-solid";

const BACKEND_TARGET = process.env["BACKEND_TARGET"] || "http://localhost:3000";

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
      exclude: /[\\/]node_modules[\\/]/,
    }),
    pluginSolid(),
  ],
  source: {
    entry: {
      index: "./src/index.tsx",
    },
  },
  server: {
    host: "0.0.0.0",
    port: parseInt(process.env["FRONTEND_PORT"] || "5173", 10),
    proxy: {
      "/api": {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
      },

      "/api/ws": {
        target: BACKEND_TARGET,
        ws: true,
        changeOrigin: true,
      },

      "/robots.txt": {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },

      "/sitemap.xml": {
        target: BACKEND_TARGET,
        changeOrigin: true,
      },
    },
  },
});

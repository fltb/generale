import { defineConfig } from "@rsbuild/core";
import { pluginBabel } from "@rsbuild/plugin-babel";
import { pluginSolid } from "@rsbuild/plugin-solid";

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
    port: 5173, // 前端 dev port（按需修改）
    proxy: {
      // 1) 把所有 /api/* 的 HTTP 请求转发到后端 (http://localhost:3000)
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        secure: false, // dev 环境可设置 false（https 自签名时）
        // 不 rewrite path，因为后端期望 /api 前缀
        // pathRewrite: { "^/api": "" }  // 如果后端不需要 /api 前缀，可以启用
      },

      // 2) 明确为 websocket 升级添加代理（如果 /api 覆盖就已经能匹配，但显式写更清晰）
      "/api/ws": {
        target: "http://localhost:3000",
        ws: true,
        changeOrigin: true,
      },

      // 如果你使用了 rsbuild HMR 的特殊路径并需要代理，也可以在这里添加 /rsbuild-hmr
    },
  },
});

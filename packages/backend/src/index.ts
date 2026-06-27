import { createApp } from "./app";

const app = await createApp();

app.listen({
  port: process.env["PORT"] || 3000,
  hostname: process.env["HOST"] || "0.0.0.0",
});

console.log(`🦊 Generale Game Server is running at ${app.server?.hostname}:${app.server?.port}`);

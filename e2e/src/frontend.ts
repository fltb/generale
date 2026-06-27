import { spawn } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";

function getRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const port = (srv.address() as AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

export interface FrontendController {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export async function startFrontend(frontendDir: string, backendPort: number): Promise<FrontendController> {
  const port = await getRandomPort();

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    FRONTEND_PORT: String(port),
    BACKEND_TARGET: `http://127.0.0.1:${backendPort}`,
  };

  const proc = spawn("bunx", ["rsbuild", "dev"], {
    cwd: frontendDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (proc.stdout) {
    proc.stdout.on("data", (d: Buffer) => process.stdout.write(`[frontend] ${d.toString()}`));
  }
  if (proc.stderr) {
    proc.stderr.on("data", (d: Buffer) => process.stderr.write(`[frontend:err] ${d.toString()}`));
  }

  const url = `http://127.0.0.1:${port}`;

  // wait for frontend dev server
  let attempts = 0;
  while (attempts < 60) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) {
        console.log(`[e2e] frontend ready on ${url}`);
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
    attempts++;
  }
  if (attempts >= 60) {
    proc.kill();
    throw new Error("Frontend failed to start within 60s");
  }

  return {
    port,
    url,
    stop: async () => {
      proc.kill();
      await new Promise<void>((resolve) => {
        proc.on("exit", () => resolve());
        setTimeout(() => resolve(), 3000);
      });
    },
  };
}

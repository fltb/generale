import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

export interface BackendController {
  port: number;
  dbPath: string;
  stop: () => Promise<void>;
}

export async function startBackend(backendDir: string): Promise<BackendController> {
  const port = await getRandomPort();
  const dbDir = mkdtempSync(join(realpathSync(tmpdir()), "generale-e2e-"));
  const dbPath = join(dbDir, "test.sqlite");

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    DB_FILE_NAME: dbPath,
    PORT: String(port),
    HOST: "127.0.0.1",
    MIGRATIONS_FOLDER: join(backendDir, "drizzle"),
    EMAIL_METHOD: "none",
  };

  const proc = spawn("bun", ["run", "src/index.ts"], {
    cwd: backendDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (proc.stdout) {
    proc.stdout.on("data", (d: Buffer) => process.stdout.write(`[backend] ${d.toString()}`));
  }
  if (proc.stderr) {
    proc.stderr.on("data", (d: Buffer) => process.stderr.write(`[backend:err] ${d.toString()}`));
  }

  // wait for health endpoint
  const HEALTH_URL = `http://127.0.0.1:${port}/api/health`;
  let attempts = 0;
  while (attempts < 30) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) {
        console.log(`[e2e] backend ready on port ${port}`);
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  if (attempts >= 30) {
    proc.kill();
    throw new Error("Backend failed to start within 15s");
  }

  // run seed
  try {
    const seedProc = spawn("bun", ["run", "src/scripts/seed.ts"], {
      cwd: backendDir,
      env: { ...env, DB_FILE_NAME: dbPath },
      stdio: ["ignore", "inherit", "inherit"],
    });
    await new Promise<void>((resolve, reject) => {
      seedProc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`seed exited with code ${code}`));
      });
      seedProc.on("error", reject);
    });
  } catch (err) {
    proc.kill();
    throw err;
  }

  return {
    port,
    dbPath,
    stop: async () => {
      proc.kill();
      await new Promise<void>((resolve) => {
        proc.on("exit", () => resolve());
        setTimeout(() => resolve(), 2000);
      });
    },
  };
}

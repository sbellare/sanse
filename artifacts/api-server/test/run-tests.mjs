import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(testDir, "..");
const tempDir = await mkdtemp(path.join(artifactDir, ".test-run-"));
const bundledTest = path.join(tempDir, "inquiries.test.mjs");
const restartWorker = path.join(tempDir, "inquiry-restart-worker.mjs");

try {
  await mkdir(path.join(tempDir, "node_modules"));
  await symlink(
    path.resolve(artifactDir, "../../lib/db/node_modules/pg"),
    path.join(tempDir, "node_modules/pg"),
    "dir",
  );
  const buildOptions = {
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["express", "@replit/connectors-sdk", "pg", "pino"],
    absWorkingDir: artifactDir,
  };
  await Promise.all([
    build({
      ...buildOptions,
      entryPoints: [path.join(testDir, "inquiries.test.ts")],
      outfile: bundledTest,
    }),
    build({
      ...buildOptions,
      entryPoints: [path.join(testDir, "inquiry-restart-worker.ts")],
      outfile: restartWorker,
    }),
  ]);

  const result = spawnSync(process.execPath, [
    "--test",
    bundledTest,
    path.join(testDir, "vercel-typescript.test.mjs"),
  ], {
    stdio: "inherit",
    env: { ...process.env, INQUIRY_RESTART_WORKER_PATH: restartWorker },
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

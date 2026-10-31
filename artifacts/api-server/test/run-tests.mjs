import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = path.resolve(testDir, "..");
const tempDir = await mkdtemp(path.join(artifactDir, ".test-run-"));
const bundledTest = path.join(tempDir, "inquiries.test.mjs");

try {
  await build({
    entryPoints: [path.join(testDir, "inquiries.test.ts")],
    outfile: bundledTest,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["express", "@replit/connectors-sdk"],
    absWorkingDir: artifactDir,
  });

  const result = spawnSync(process.execPath, ["--test", bundledTest], {
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

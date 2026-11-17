import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { build } from "esbuild";

const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (file) =>
  JSON.parse(await readFile(path.join(artifactDir, file), "utf8"));

test("Vercel selects compiled JavaScript, not the TypeScript source entrypoint", async () => {
  const config = await readJson("vercel.json");
  const pkg = await readJson("package.json");
  assert.equal(config.framework, "express");
  assert.equal(config.buildCommand, "pnpm run build");
  assert.equal(config.outputDirectory, "dist");
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.json --noEmit/);

  const result = spawnSync("pnpm", ["run", "build"], {
    cwd: artifactDir,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);

  // Mirror @vercel/express's output-directory entrypoint search, including its
  // required Express import. Generated output is checked, not a TS-host mock.
  // Source: vercel/vercel/packages/express/src/build.ts
  const entrypoint = path.join(artifactDir, config.outputDirectory, "index.mjs");
  const source = await readFile(entrypoint, "utf8");
  assert.match(
    source,
    /(?:from|require|import)\s*(?:\(\s*)?["']express["']\s*(?:\))?/,
  );
  assert.equal(
    config.functions["dist/index.mjs"].includeFiles,
    "dist/**",
    "Vercel must retain the generated Pino worker files",
  );

  // Vercel's dependency tracer should encounter no local TypeScript: all
  // application and workspace-library imports were bundled as JavaScript.
  const traced = await build({
    entryPoints: [entrypoint],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    write: false,
    metafile: true,
  });
  const localTypeScript = Object.keys(traced.metafile.inputs)
    .filter((file) => /\.[cm]?tsx?$/.test(file));
  assert.deepEqual(localTypeScript, []);
});

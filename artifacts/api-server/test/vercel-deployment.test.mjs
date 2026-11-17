import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Vercel config deploys the website and API from the same repository root", async () => {
  const config = JSON.parse(await readFile(new URL("../../../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.buildCommand, "pnpm run build:vercel");
  assert.equal(config.outputDirectory, "artifacts/sanse-consulting/dist/public");
  assert.ok(config.functions["api/index.mjs"]);
  assert.equal(config.rewrites[0].source, "/api/:path*");
  assert.equal(config.rewrites[0].destination, "/api");
  assert.equal(config.rewrites.at(-1).destination, "/index.html");
  assert.equal(config.crons, undefined, "Hobby must not get an unsupported cron schedule");
  const entry = await readFile(new URL("../../../api/index.mjs", import.meta.url), "utf8");
  assert.match(entry, /dist\/vercel\.mjs/);
});

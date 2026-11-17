import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

test("Vercel can emit the health route using the API TypeScript config", () => {
  const artifactDir = fileURLToPath(new URL("../", import.meta.url));
  const configPath = path.join(artifactDir, "tsconfig.json");
  const fileName = path.join(artifactDir, "src/routes/health.ts");
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(error, undefined);

  // Match @vercel/node's per-file language service configuration. Its defaults
  // are applied before tsconfig inheritance, so module settings must be direct.
  config.files = [];
  config.include = [];
  Object.assign(config.compilerOptions, {
    sourceMap: true,
    inlineSourceMap: false,
    inlineSources: true,
    declaration: false,
    noEmit: false,
    outDir: "$$ts-node$$",
  });
  for (const key of [
    "out", "outFile", "composite", "declarationDir", "declarationMap",
    "emitDeclarationOnly", "tsBuildInfoFile", "incremental",
  ]) {
    delete config.compilerOptions[key];
  }
  config.compilerOptions.esModuleInterop ??= true;
  if (config.compilerOptions.module === undefined) {
    Object.assign(config.compilerOptions, {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: false,
    });
  }

  const parsed = ts.parseJsonConfigFileContent(
    config, ts.sys, artifactDir, undefined, configPath,
  );
  const service = ts.createLanguageService({
    ...ts.sys,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => "1",
    getScriptSnapshot(file) {
      const contents = ts.sys.readFile(file);
      return contents === undefined
        ? undefined
        : ts.ScriptSnapshot.fromString(contents);
    },
    getCurrentDirectory: () => artifactDir,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  });

  try {
    const diagnostics = [
      ...parsed.errors,
      ...ts.getPreEmitDiagnostics(service.getProgram()),
    ];
    assert.equal(diagnostics.length, 0, ts.formatDiagnostics(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => artifactDir,
      getNewLine: () => "\n",
    }));
    const output = service.getEmitOutput(fileName);
    assert.equal(output.emitSkipped, false);
    assert.ok(output.outputFiles.some((file) => file.name.endsWith(".js")));
  } finally {
    service.dispose();
  }
});

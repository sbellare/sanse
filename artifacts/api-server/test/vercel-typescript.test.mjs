import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

// Model @vercel/node's register/readConfig/fixConfig behavior, rather than
// tsc's project-reference-aware build. Vercel applies defaults before resolving
// "extends", so module settings inherited only from the workspace are replaced.
// Source: https://github.com/vercel/vercel/blob/main/packages/node/src/typescript.ts
test("Vercel-style TypeScript compilation emits every API source file", () => {
  const artifactDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const configPath = path.join(artifactDir, "tsconfig.json");
  const result = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(result.error, undefined);
  const config = result.config;
  Object.assign(config.compilerOptions, {
    sourceMap: true,
    inlineSourceMap: false,
    inlineSources: true,
    declaration: false,
    noEmit: false,
    outDir: "$$ts-node$$",
  });
  for (const option of [
    "out", "outFile", "composite", "declarationDir", "declarationMap",
    "emitDeclarationOnly", "tsBuildInfoFile", "incremental",
  ]) {
    delete config.compilerOptions[option];
  }
  config.compilerOptions.target ??= "ES2021";
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
  const formatHost = {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => artifactDir,
    getNewLine: () => "\n",
  };
  const format = (diagnostics) => ts.formatDiagnostics(diagnostics, formatHost);
  assert.deepEqual(parsed.errors, [], format(parsed.errors));

  const service = ts.createLanguageService({
    ...ts.sys,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => "1",
    getScriptSnapshot(fileName) {
      const content = ts.sys.readFile(fileName);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => artifactDir,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: () => ts.getDefaultLibFilePath(parsed.options),
    // Intentionally no getProjectReferences: Vercel's language-service host
    // does not expose project references to TypeScript.
  });
  try {
    for (const file of parsed.fileNames.filter((file) => !file.endsWith(".d.ts"))) {
      const output = service.getEmitOutput(file);
      const diagnostics = [
        ...service.getCompilerOptionsDiagnostics(),
        ...service.getSemanticDiagnostics(file),
        ...service.getSyntacticDiagnostics(file),
      ];
      const message = `${path.relative(artifactDir, file)}:\n${format(diagnostics)}`;
      assert.equal(output.emitSkipped, false, message);
      assert.ok(output.outputFiles.some((file) => file.name.endsWith(".js")), message);
    }
  } finally {
    service.dispose();
  }
});

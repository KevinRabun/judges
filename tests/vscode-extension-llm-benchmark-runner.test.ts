import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Stub vscode early before importing the module
const require = createRequire(import.meta.url);
const vscodeStub = {
  workspace: {
    getConfiguration: () => ({ get: () => undefined }),
    fs: {
      readFile: async () => new Uint8Array(),
      writeFile: async () => void 0,
      createDirectory: async () => void 0,
      delete: async () => void 0,
    },
    asRelativePath: (uri: { fsPath?: string } | string) =>
      typeof uri === "string" ? uri : (uri?.fsPath ?? String(uri)),
    workspaceFolders: [],
    findFiles: async () => [],
    openTextDocument: async () => ({ getText: () => "", languageId: "plaintext" }),
  },
  window: {
    createOutputChannel: () => ({ appendLine: () => void 0, show: () => void 0 }),
    showWarningMessage: () => void 0,
    showInformationMessage: () => void 0,
    showErrorMessage: () => void 0,
  },
  extensions: { getExtension: () => ({ packageJSON: { version: "test" } }) },
  CancellationError: class CancellationError extends Error {},
  Uri: { joinPath: (...parts: Array<string | { fsPath?: string }>) => ({ fsPath: parts.map(String).join("/") }) },
};
const vscodeModuleId = "vscode";
// Inject into require cache for CommonJS resolution used by esbuild transpiled code
// "vscode" isn't resolvable in a normal Node test environment, so monkey-patch the resolver.
// Use loose typing for Node internals in tests only
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Module: any = require("module");
const originalResolveFilename = Module._resolveFilename ?? (() => "");
Module._resolveFilename = function (request: string, parent: unknown, isMain: boolean, options: unknown) {
  if (request === vscodeModuleId) return vscodeModuleId;
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.cache[vscodeModuleId] = { exports: vscodeStub } as NodeModule;

// Stub @kevinrabun/judges/api to avoid package.exports resolution issues under tsx/node:test
const judgesApiModuleId = "@kevinrabun/judges/api";
Module._resolveFilename = function (request: string, parent: unknown, isMain: boolean, options: unknown) {
  if (request === vscodeModuleId) return vscodeModuleId;
  if (request === judgesApiModuleId) return judgesApiModuleId;
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.cache[judgesApiModuleId] = { exports: { JUDGES: [], BENCHMARK_CASES: [] } } as NodeModule;

// Import the module under test
const modulePath = pathToFileURL(path.resolve("vscode-extension/src/llm-benchmark-runner.ts")).href;
type RunnerModule = {
  __test: {
    truncateResponse: (s: string, max: number) => string;
    getBenchmarkConfig: () => { sampleSize: number; maxOutputTokens: number; concurrency: number; enabled: boolean };
    enforceHeapGuard: (maxHeapMb: number) => void;
  };
};
const importedModule: unknown = await import(modulePath);
const runner = importedModule as RunnerModule;
const { __test } = runner;

void test("truncateResponse truncates long strings", () => {
  const long = "abcdefghij"; // 10 chars
  const truncated = __test.truncateResponse(long, 5);
  assert.ok(truncated.startsWith("abcde"));
  assert.ok(truncated.includes("truncated 5 chars"));
});

void test("getBenchmarkConfig honors env overrides and default disabled", () => {
  const prev = { ...process.env };
  try {
    process.env.JUDGES_LLM_BENCHMARK_ENABLED = "true";
    process.env.JUDGES_LLM_BENCHMARK_SAMPLE_SIZE = "10";
    process.env.JUDGES_LLM_BENCHMARK_MAX_OUTPUT_TOKENS = "999";
    const cfg = __test.getBenchmarkConfig();
    assert.strictEqual(cfg.enabled, true);
    assert.strictEqual(cfg.sampleSize, 10);
    assert.strictEqual(cfg.maxOutputTokens, 999);
    assert.ok(cfg.concurrency >= 1);
  } finally {
    process.env = prev;
  }
});

void test("enforceHeapGuard throws when heap exceeds threshold", () => {
  // sanity for default config values
  const cfg = __test.getBenchmarkConfig();
  assert.strictEqual(cfg.enabled, false);

  const original = process.memoryUsage;
  const fakeUsage: NodeJS.MemoryUsage = {
    rss: 1024 * 1024 * 2048, // 2 GB
    heapTotal: 0,
    heapUsed: 1024 * 1024 * 2000, // 2000 MB
    external: 0,
    arrayBuffers: 0,
  } as NodeJS.MemoryUsage;
  const proc = process as NodeJS.Process & { memoryUsage: typeof process.memoryUsage };
  proc.memoryUsage = (() => fakeUsage) as typeof process.memoryUsage;
  try {
    assert.throws(() => __test.enforceHeapGuard(1500), /exceeded guard/);
  } finally {
    proc.memoryUsage = original;
  }
});

import { classifyFile } from "../src/evaluators/shared.js";
import { readFileSync } from "fs";

const files = [
  "src/cli.ts",
  "src/commands/benchmark.ts",
  "src/commands/tune.ts",
  "src/commands/auto-detect.ts",
  "src/cache.ts",
  "src/comparison.ts",
  "src/commands/language-packs.ts",
  "src/disk-cache.ts",
  "src/fix-history.ts",
  "src/presets.ts",
  "src/errors.ts",
  "src/language-patterns.ts",
  "src/evaluators/dependency-health.ts",
  "src/evaluators/testing.ts",
  "vscode-extension/src/diagnostics.ts",
  "vscode-extension/src/findings-panel.ts",
];

for (const f of files) {
  try {
    const code = readFileSync(f, "utf-8");
    console.log(`${f} => ${classifyFile(code, "typescript", f)}`);
  } catch {
    console.log(`${f} => FILE NOT FOUND`);
  }
}

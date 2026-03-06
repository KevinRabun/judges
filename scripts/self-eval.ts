/**
 * Self-evaluation script — runs judges panel on all judges source files.
 * Used to verify that the judges codebase has zero findings after FP filtering.
 */
import { evaluateWithTribunal } from "../src/evaluators/index.js";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const extMap: Record<string, string> = { ".ts": "typescript", ".tsx": "typescript" };
const files: string[] = [];

function walk(dir: string): void {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e === ".git" || e === "grammars") continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (extMap[extname(p)]) files.push(p);
  }
}

walk("src");
walk("vscode-extension/src");
walk("tests");

let totalFindings = 0;
for (const f of files) {
  const code = readFileSync(f, "utf-8");
  const lang = extMap[extname(f)]!;
  const verdict = evaluateWithTribunal(code, lang, undefined, { filePath: f });
  if (verdict.findings.length > 0) {
    console.log("");
    console.log("=== " + f + " (" + verdict.findings.length + " findings) ===");
    for (const finding of verdict.findings) {
      console.log(
        "  [" +
          finding.severity +
          "] " +
          finding.ruleId +
          ": " +
          finding.title +
          " (line " +
          (finding.line ?? "?") +
          ")",
      );
    }
    totalFindings += verdict.findings.length;
  }
}

console.log("");
console.log("TOTAL: " + totalFindings + " findings across " + files.length + " files");
if (totalFindings > 0) {
  process.exit(1);
}

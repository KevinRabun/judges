#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────
// Demo: Run the full Judges Panel against the sample vulnerable API
// ─────────────────────────────────────────────────────────────────────────────
// Usage:
//   npx tsx examples/demo.ts
//
// Prerequisites:
//   npm install (to pull in dependencies)
//   No build step needed — tsx runs TypeScript directly.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  evaluateWithTribunal,
  formatVerdictAsMarkdown,
} from "../src/evaluators/index.js";

// ─── Load the sample code ────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const samplePath = resolve(__dirname, "sample-vulnerable-api.ts");
const sampleCode = readFileSync(samplePath, "utf-8");

// ─── Run the full tribunal ───────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║           Judges Panel — Full Tribunal Demo                 ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log();
console.log(`Evaluating: ${samplePath}`);
console.log(`Code length: ${sampleCode.length} characters`);
console.log();

const verdict = evaluateWithTribunal(sampleCode, "typescript");

// ─── Print the formatted verdict ─────────────────────────────────────────────

console.log(formatVerdictAsMarkdown(verdict));

// ─── Print summary statistics ────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║                       Summary Stats                        ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log();
console.log(`  Overall Verdict : ${verdict.overallVerdict.toUpperCase()}`);
console.log(`  Overall Score   : ${verdict.overallScore}/100`);
console.log(`  Critical Issues : ${verdict.criticalCount}`);
console.log(`  High Issues     : ${verdict.highCount}`);
console.log(`  Total Findings  : ${verdict.evaluations.reduce((s, e) => s + e.findings.length, 0)}`);
console.log(`  Judges Run      : ${verdict.evaluations.length}`);
console.log();

// Per-judge breakdown
console.log("  Per-Judge Breakdown:");
console.log("  " + "─".repeat(60));
for (const evaluation of verdict.evaluations) {
  const icon =
    evaluation.verdict === "pass"
      ? "✅"
      : evaluation.verdict === "warning"
      ? "⚠️ "
      : "❌";
  const name = evaluation.judgeName.padEnd(28);
  const score = String(evaluation.score).padStart(3);
  const findings = String(evaluation.findings.length).padStart(2);
  console.log(
    `  ${icon} ${name} ${score}/100   ${findings} finding(s)`
  );
}

console.log();
console.log(`  Timestamp: ${verdict.timestamp}`);
console.log();

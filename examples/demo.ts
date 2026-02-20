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
  runAppBuilderWorkflow,
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

// ─── Run App Builder Workflow Demo ──────────────────────────────────────────

const workflow = runAppBuilderWorkflow({
  code: sampleCode,
  language: "typescript",
  context:
    "Demo API service used to illustrate production-readiness checks and remediation planning.",
  maxFindings: 5,
  maxTasks: 8,
});

const decisionLabel =
  workflow.releaseDecision === "do-not-ship"
    ? "Do not ship"
    : workflow.releaseDecision === "ship-with-caution"
    ? "Ship with caution"
    : "Ship now";

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║             App Builder Workflow Demo (3-Step)             ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log();
console.log(`  Decision       : ${decisionLabel}`);
console.log(`  Verdict        : ${workflow.verdict.toUpperCase()} (${workflow.score}/100)`);
console.log(
  `  Risk Counts    : Critical ${workflow.criticalCount} | High ${workflow.highCount} | Medium ${workflow.mediumCount}`
);
console.log(`  Summary        : ${workflow.summary}`);
console.log();

console.log("  Step 2 — Plain-Language Findings:");
if (workflow.plainLanguageFindings.length === 0) {
  console.log("  - No critical/high/medium findings detected.");
} else {
  for (const finding of workflow.plainLanguageFindings) {
    console.log(
      `  - [${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.title}`
    );
    console.log(`      What: ${finding.whatIsWrong}`);
    console.log(`      Why : ${finding.whyItMatters}`);
    console.log(`      Next: ${finding.nextAction}`);
  }
}
console.log();

console.log("  Step 3 — Prioritized Tasks:");
if (workflow.tasks.length === 0) {
  console.log("  - No tasks generated.");
} else {
  for (const task of workflow.tasks) {
    console.log(
      `  - ${task.priority} | ${task.owner.toUpperCase()} | Effort ${task.effort} | ${task.ruleId}`
    );
    console.log(`      Task: ${task.task}`);
    console.log(`      Done: ${task.doneWhen}`);
  }
}
console.log();

console.log("  AI-Fixable Now (P0/P1):");
if (workflow.aiFixableNow.length === 0) {
  console.log("  - None in this run.");
} else {
  for (const task of workflow.aiFixableNow) {
    console.log(`  - ${task.priority} ${task.ruleId}: ${task.task}`);
  }
}
console.log();

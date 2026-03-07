#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────────
// Quick Start: Evaluate code using the @kevinrabun/judges package API
// ─────────────────────────────────────────────────────────────────────────────
// Usage (after installing the package):
//   npm install @kevinrabun/judges
//   npx tsx examples/quickstart.ts
// ─────────────────────────────────────────────────────────────────────────────

import { evaluateCode, evaluateCodeSingleJudge, getJudgeSummaries } from "@kevinrabun/judges/api";

// ─── Sample code to review ──────────────────────────────────────────────────

const code = `
import express from "express";
const app = express();

app.get("/user", (req, res) => {
  const userId = req.query.id;
  const result = eval("getUser(" + userId + ")");  // SQL injection + eval
  res.send(result);
});

const password = "admin123";  // hardcoded secret

app.listen(3000);
`;

// ─── Full tribunal (all 39 judges) ──────────────────────────────────────────

console.log("=== Full Tribunal ===\n");
const verdict = evaluateCode(code, "typescript");

console.log(`Verdict : ${verdict.overallVerdict.toUpperCase()}`);
console.log(`Score   : ${verdict.overallScore}/100`);
console.log(`Findings: ${verdict.evaluations.reduce((s, e) => s + e.findings.length, 0)}`);
console.log();

// Show top 5 critical/high findings
const allFindings = verdict.evaluations.flatMap((e) => e.findings);
const topFindings = allFindings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 5);

for (const f of topFindings) {
  console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
}

// ─── Single judge ───────────────────────────────────────────────────────────

console.log("\n=== Single Judge: Cybersecurity ===\n");
const cyber = evaluateCodeSingleJudge("cybersecurity", code, "typescript");

console.log(`Score   : ${cyber.score}/100`);
console.log(`Findings: ${cyber.findings.length}`);
for (const f of cyber.findings) {
  console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
}

// ─── List all judges ────────────────────────────────────────────────────────

console.log("\n=== Available Judges ===\n");
const judges = getJudgeSummaries();
for (const j of judges) {
  console.log(`  ${j.id.padEnd(30)} ${j.name}`);
}

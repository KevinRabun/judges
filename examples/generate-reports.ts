#!/usr/bin/env tsx
// ─────────────────────────────────────────────────────────────────────────────
// Generate sample report files from the intentionally-vulnerable API example.
// Usage:  npx tsx examples/generate-reports.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { evaluateWithTribunal, formatVerdictAsMarkdown } from "../src/evaluators/index.js";
import { verdictToSarif } from "../src/formatters/sarif.js";

const examplesDir = dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const sampleFile = resolve(examplesDir, "sample-vulnerable-api.ts");

const code = readFileSync(sampleFile, "utf-8");
const verdict = evaluateWithTribunal(code, "typescript", undefined, {
  filePath: sampleFile,
});

// ── Markdown report ──────────────────────────────────────────────────────────
const md = formatVerdictAsMarkdown(verdict);
writeFileSync(resolve(examplesDir, "sample-report.md"), md, "utf-8");

// ── JSON report ──────────────────────────────────────────────────────────────
const json = JSON.stringify(verdict, null, 2);
writeFileSync(resolve(examplesDir, "sample-report.json"), json, "utf-8");

// ── SARIF report ─────────────────────────────────────────────────────────────
const sarif = JSON.stringify(verdictToSarif(verdict, "examples/sample-vulnerable-api.ts"), null, 2);
writeFileSync(resolve(examplesDir, "sample-report.sarif.json"), sarif, "utf-8");

const total = verdict.findings.length;
const crit = verdict.criticalCount;
const high = verdict.highCount;
console.log(`✅ Generated 3 sample reports (${total} findings, ${crit} critical, ${high} high)`);
console.log(`   - examples/sample-report.md`);
console.log(`   - examples/sample-report.json`);
console.log(`   - examples/sample-report.sarif.json`);

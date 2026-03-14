/**
 * Fix-verify — Re-run review on fixed code to confirm findings are resolved.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VerificationResult {
  timestamp: string;
  originalFile: string;
  originalCount: number;
  resolvedCount: number;
  remainingCount: number;
  newCount: number;
  resolved: Finding[];
  remaining: Finding[];
  newFindings: Finding[];
  resolutionRate: number;
}

// ─── Matching ───────────────────────────────────────────────────────────────

function findingKey(f: Finding): string {
  return [f.ruleId || "", f.title || "", String(f.severity || "")].join("|").toLowerCase();
}

function compareVerdicts(original: TribunalVerdict, updated: TribunalVerdict): VerificationResult {
  const origFindings = original.findings || [];
  const updFindings = updated.findings || [];

  const origKeys = new Set(origFindings.map(findingKey));
  const updKeys = new Set(updFindings.map(findingKey));

  const resolved = origFindings.filter((f) => !updKeys.has(findingKey(f)));
  const remaining = origFindings.filter((f) => updKeys.has(findingKey(f)));
  const newFindings = updFindings.filter((f) => !origKeys.has(findingKey(f)));

  const resolutionRate = origFindings.length > 0 ? Math.round((resolved.length / origFindings.length) * 100) : 100;

  return {
    timestamp: new Date().toISOString(),
    originalFile: "",
    originalCount: origFindings.length,
    resolvedCount: resolved.length,
    remainingCount: remaining.length,
    newCount: newFindings.length,
    resolved,
    remaining,
    newFindings,
    resolutionRate,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFixVerify(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges fix-verify — Verify that fixes resolved findings

Usage:
  judges fix-verify --original before.json --updated after.json
  judges fix-verify --original before.json --updated after.json --output report.json

Options:
  --original <path>     Original verdict JSON (before fixes)
  --updated <path>      Updated verdict JSON (after fixes)
  --output <path>       Write verification report to file
  --format json         JSON output
  --help, -h            Show this help

Compares two verdict files to show which findings were resolved,
which remain, and whether new findings were introduced.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const originalFile = argv.find((_a: string, i: number) => argv[i - 1] === "--original");
  const updatedFile = argv.find((_a: string, i: number) => argv[i - 1] === "--updated");
  const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");

  if (!originalFile || !updatedFile) {
    console.error("Error: Both --original and --updated are required.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(originalFile)) {
    console.error(`Error: File not found: ${originalFile}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(updatedFile)) {
    console.error(`Error: File not found: ${updatedFile}`);
    process.exitCode = 1;
    return;
  }

  let original: TribunalVerdict;
  let updated: TribunalVerdict;
  try {
    original = JSON.parse(readFileSync(originalFile, "utf-8")) as TribunalVerdict;
    updated = JSON.parse(readFileSync(updatedFile, "utf-8")) as TribunalVerdict;
  } catch {
    console.error("Error: Could not parse verdict files.");
    process.exitCode = 1;
    return;
  }

  const result = compareVerdicts(original, updated);
  result.originalFile = originalFile;

  if (outputFile) {
    mkdirSync(dirname(outputFile), { recursive: true });
    writeFileSync(outputFile, JSON.stringify(result, null, 2), "utf-8");
    console.log(`Verification report written to ${outputFile}`);
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\n  Fix Verification Report\n  ═════════════════════════════`);
  console.log(`    Original findings: ${result.originalCount}`);
  console.log(`    Resolved: ${result.resolvedCount} ✅`);
  console.log(`    Remaining: ${result.remainingCount} ⚠️`);
  console.log(`    New findings: ${result.newCount} ${result.newCount > 0 ? "🆕" : ""}`);
  console.log(`    Resolution rate: ${result.resolutionRate}%`);
  console.log();

  if (result.resolved.length > 0) {
    console.log("  Resolved Findings:");
    for (const f of result.resolved) {
      console.log(`    ✅ [${(f.severity || "").toUpperCase()}] ${f.title || f.ruleId}`);
    }
    console.log();
  }

  if (result.remaining.length > 0) {
    console.log("  Remaining Findings:");
    for (const f of result.remaining) {
      console.log(`    ⚠️ [${(f.severity || "").toUpperCase()}] ${f.title || f.ruleId}`);
    }
    console.log();
  }

  if (result.newFindings.length > 0) {
    console.log("  New Findings (introduced by fixes):");
    for (const f of result.newFindings) {
      console.log(`    🆕 [${(f.severity || "").toUpperCase()}] ${f.title || f.ruleId}`);
    }
    console.log();
  }
}

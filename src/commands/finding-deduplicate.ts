/**
 * Finding-deduplicate — Detect and deduplicate similar findings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DedupGroup {
  canonical: { ruleId: string; title: string; severity: string };
  count: number;
  indices: number[];
}

interface DedupReport {
  timestamp: string;
  originalCount: number;
  uniqueCount: number;
  duplicateCount: number;
  groups: DedupGroup[];
}

// ─── Dedup Logic ────────────────────────────────────────────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function areSimilar(a: Finding, b: Finding): boolean {
  // Same rule ID is a strong signal
  if (a.ruleId && b.ruleId && a.ruleId === b.ruleId) {
    // Check if titles are similar
    const titleA = normalizeText(a.title || "");
    const titleB = normalizeText(b.title || "");
    if (titleA === titleB) return true;
    // Check Jaccard similarity on words
    const wordsA = new Set(titleA.split(" "));
    const wordsB = new Set(titleB.split(" "));
    const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);
    if (union.size > 0 && intersection.size / union.size > 0.5) return true;
  }
  return false;
}

function groupFindings(findings: Finding[]): DedupGroup[] {
  const groups: DedupGroup[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < findings.length; i++) {
    if (assigned.has(i)) continue;
    const group: DedupGroup = {
      canonical: {
        ruleId: findings[i].ruleId || "unknown",
        title: findings[i].title || "",
        severity: findings[i].severity || "medium",
      },
      count: 1,
      indices: [i],
    };
    assigned.add(i);

    for (let j = i + 1; j < findings.length; j++) {
      if (assigned.has(j)) continue;
      if (areSimilar(findings[i], findings[j])) {
        group.count++;
        group.indices.push(j);
        assigned.add(j);
      }
    }
    groups.push(group);
  }

  return groups;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDeduplicate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-deduplicate — Detect and deduplicate similar findings

Usage:
  judges finding-deduplicate --file report.json
  judges finding-deduplicate --file report.json --format json

Options:
  --file <path>         Path to a tribunal verdict JSON file
  --format json         JSON output
  --help, -h            Show this help

Groups similar findings together and reports duplicates.
Uses rule ID matching and title similarity (Jaccard) to detect dupes.

Report saved to .judges/dedup-report.json.
`);
    return;
  }

  const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!filePath || !existsSync(filePath)) {
    console.error("Error: --file is required and must exist.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error("Error: Could not parse verdict file.");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];
  if (findings.length === 0) {
    console.log("No findings to deduplicate.");
    return;
  }

  const groups = groupFindings(findings);
  const duplicateCount = findings.length - groups.length;

  const report: DedupReport = {
    timestamp: new Date().toISOString(),
    originalCount: findings.length,
    uniqueCount: groups.length,
    duplicateCount,
    groups,
  };

  const outPath = join(".judges", "dedup-report.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nFinding Deduplication Report:");
  console.log("═".repeat(60));
  console.log(`  Original: ${findings.length}  Unique: ${groups.length}  Duplicates: ${duplicateCount}`);
  if (findings.length > 0) {
    console.log(`  Dedup ratio: ${((duplicateCount / findings.length) * 100).toFixed(1)}%`);
  }
  console.log("═".repeat(60));

  const dupeGroups = groups.filter((g) => g.count > 1);
  if (dupeGroups.length > 0) {
    console.log("\n  Duplicate Groups:");
    for (const g of dupeGroups) {
      console.log(`\n    [${g.canonical.severity.toUpperCase()}] ${g.canonical.ruleId} (${g.count}x)`);
      console.log(`      ${g.canonical.title}`);
      console.log(`      Indices: ${g.indices.join(", ")}`);
    }
  } else {
    console.log("\n  No duplicates found — all findings are unique.");
  }

  console.log("\n" + "═".repeat(60));
  console.log(`  Report saved to ${outPath}`);
}

/**
 * Review-dependency-graph — Visualize finding dependency relationships.
 */

import type { TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDependencyGraph(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges review-dependency-graph — Visualize finding relationships

Usage:
  judges review-dependency-graph --file <results.json> [options]

Options:
  --file <path>      Result file (required)
  --depth <n>        Relationship depth to explore (default: 2)
  --format json      JSON output
  --help, -h         Show this help

Analyzes findings for dependency relationships based on rule prefixes and categories.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  const findings = verdict.findings || [];

  // Group by rule prefix to find relationships
  const prefixGroups = new Map<string, string[]>();
  for (const f of findings) {
    const prefix = f.ruleId ? f.ruleId.split("-")[0] : "OTHER";
    if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
    prefixGroups.get(prefix)!.push(f.ruleId);
  }

  // Build edges: findings sharing line numbers are related
  const edges: { from: string; to: string; relationship: string }[] = [];
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i];
      const b = findings[j];
      const aLines = a.lineNumbers || [];
      const bLines = b.lineNumbers || [];
      const overlap = aLines.filter((l) => bLines.includes(l));
      if (overlap.length > 0) {
        edges.push({ from: a.ruleId, to: b.ruleId, relationship: `shared lines: ${overlap.join(",")}` });
      }
    }
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          nodes: findings.length,
          groups: [...prefixGroups.entries()].map(([prefix, rules]) => ({ prefix, count: rules.length })),
          edges,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nDependency Graph:`);
  console.log("═".repeat(60));
  console.log(`  ${findings.length} findings, ${prefixGroups.size} groups, ${edges.length} relationships`);
  console.log("─".repeat(60));

  console.log("\n  Groups:");
  for (const [prefix, rules] of [...prefixGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const unique = [...new Set(rules)];
    console.log(`    ${prefix.padEnd(12)} ${unique.length} rules (${rules.length} findings)`);
  }

  if (edges.length > 0) {
    console.log("\n  Relationships:");
    for (const e of edges.slice(0, 15)) {
      console.log(`    ${e.from} ↔ ${e.to}  (${e.relationship})`);
    }
    if (edges.length > 15) console.log(`    ... and ${edges.length - 15} more`);
  }
  console.log("═".repeat(60));
}

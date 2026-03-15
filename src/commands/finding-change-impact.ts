/**
 * Finding-change-impact — Assess the impact of code changes on existing findings.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChangedFile {
  path: string;
  linesAdded: number[];
  linesRemoved: number[];
}

interface ImpactResult {
  ruleId: string;
  title: string;
  severity: string;
  impactLevel: "direct" | "indirect" | "none";
  affectedLines: number[];
  filePath: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function assessImpact(findings: Finding[], changes: ChangedFile[]): ImpactResult[] {
  const results: ImpactResult[] = [];
  const changedLineSets = new Map<string, Set<number>>();
  for (const ch of changes) {
    const s = new Set<number>([...ch.linesAdded, ...ch.linesRemoved]);
    changedLineSets.set(ch.path, s);
  }

  for (const f of findings) {
    const fLines = f.lineNumbers ?? [];
    let bestImpact: "direct" | "indirect" | "none" = "none";
    const affected: number[] = [];
    let matchedPath = "";

    for (const ch of changes) {
      const changedLines = changedLineSets.get(ch.path);
      if (!changedLines) continue;
      const overlap = fLines.filter((ln) => changedLines.has(ln));
      if (overlap.length > 0) {
        bestImpact = "direct";
        affected.push(...overlap);
        matchedPath = ch.path;
      } else if (fLines.length > 0 && bestImpact === "none") {
        const nearThreshold = 5;
        const nearby = fLines.some((ln) => {
          for (const cl of changedLines) {
            if (Math.abs(ln - cl) <= nearThreshold) return true;
          }
          return false;
        });
        if (nearby) {
          bestImpact = "indirect";
          matchedPath = ch.path;
        }
      }
    }

    results.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      impactLevel: bestImpact,
      affectedLines: affected,
      filePath: matchedPath,
    });
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingChangeImpact(argv: string[]): void {
  const findingsIdx = argv.indexOf("--findings");
  const findingsPath = findingsIdx >= 0 ? argv[findingsIdx + 1] : "";
  const changesIdx = argv.indexOf("--changes");
  const changesPath = changesIdx >= 0 ? argv[changesIdx + 1] : "";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-change-impact — Assess impact of code changes on findings

Usage:
  judges finding-change-impact --findings <path> --changes <path> [--format table|json]

Options:
  --findings <path>  Path to findings JSON file
  --changes <path>   Path to changes JSON file (array of {path, linesAdded, linesRemoved})
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!findingsPath || !existsSync(findingsPath)) {
    console.error("Provide --findings <path> to a valid findings JSON file.");
    process.exitCode = 1;
    return;
  }

  if (!changesPath || !existsSync(changesPath)) {
    console.error("Provide --changes <path> to a valid changes JSON file.");
    process.exitCode = 1;
    return;
  }

  const findings = JSON.parse(readFileSync(findingsPath, "utf-8")) as Finding[];
  const changes = JSON.parse(readFileSync(changesPath, "utf-8")) as ChangedFile[];
  const results = assessImpact(findings, changes);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nChange Impact Analysis (${results.length} findings)`);
  console.log("═".repeat(80));
  console.log(`  ${"Rule ID".padEnd(25)} ${"Severity".padEnd(12)} ${"Impact".padEnd(12)} Affected Lines`);
  console.log("  " + "─".repeat(75));

  for (const r of results) {
    const lines = r.affectedLines.length > 0 ? r.affectedLines.join(", ") : "—";
    console.log(`  ${r.ruleId.padEnd(25)} ${r.severity.padEnd(12)} ${r.impactLevel.padEnd(12)} ${lines}`);
  }

  const direct = results.filter((r) => r.impactLevel === "direct").length;
  const indirect = results.filter((r) => r.impactLevel === "indirect").length;
  const none = results.filter((r) => r.impactLevel === "none").length;
  console.log(`\n  Direct: ${direct} | Indirect: ${indirect} | None: ${none}`);
  console.log("═".repeat(80));
}

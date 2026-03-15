/**
 * Finding-related-rules — Find rules related to a given rule ID.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RelatedRule {
  ruleId: string;
  title: string;
  severity: string;
  relatedness: "same-judge" | "same-severity" | "co-occurring" | "similar-title";
  score: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const w of ta) {
    if (tb.has(w)) overlap++;
  }
  return overlap / Math.max(ta.size, tb.size);
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function findRelated(verdict: TribunalVerdict, targetRule: string): RelatedRule[] {
  const target = verdict.findings.find((f) => f.ruleId === targetRule);
  if (!target) return [];

  const targetPrefix = targetRule.replace(/-\d+$/, "");
  const judges = defaultRegistry.getJudges();
  const targetJudge = judges.find((j) => targetRule.startsWith(j.rulePrefix));

  const results: RelatedRule[] = [];
  const seen = new Set<string>();

  for (const f of verdict.findings) {
    if (f.ruleId === targetRule || seen.has(f.ruleId)) continue;
    seen.add(f.ruleId);

    const prefix = f.ruleId.replace(/-\d+$/, "");
    const fJudge = judges.find((j) => f.ruleId.startsWith(j.rulePrefix));

    // same judge
    if (targetJudge !== undefined && fJudge !== undefined && targetJudge.id === fJudge.id) {
      results.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
        relatedness: "same-judge",
        score: 0.8,
      });
      continue;
    }

    // same prefix
    if (prefix === targetPrefix) {
      results.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
        relatedness: "same-judge",
        score: 0.9,
      });
      continue;
    }

    // title similarity
    const sim = titleSimilarity(target.title, f.title);
    if (sim >= 0.3) {
      results.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
        relatedness: "similar-title",
        score: sim,
      });
      continue;
    }

    // same severity as co-occurring
    if ((f.severity || "medium").toLowerCase() === (target.severity || "medium").toLowerCase()) {
      results.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
        relatedness: "co-occurring",
        score: 0.3,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRelatedRules(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const ruleIdx = argv.indexOf("--rule");
  const formatIdx = argv.indexOf("--format");
  const limitIdx = argv.indexOf("--limit");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const ruleId = ruleIdx >= 0 ? argv[ruleIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const limit = limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : 20;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-related-rules — Find related rules

Usage:
  judges finding-related-rules --file <verdict.json> --rule <RULE-ID>
                               [--format table|json] [--limit <n>]

Options:
  --file <path>      Path to verdict JSON file (required)
  --rule <id>        Target rule ID (required)
  --format <fmt>     Output format: table (default), json
  --limit <n>        Max results (default: 20)
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath || !ruleId) {
    console.error("Error: --file and --rule required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const results = findRelated(verdict, ruleId).slice(0, limit);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nRelated Rules for ${ruleId} (${results.length} found)`);
  console.log("═".repeat(75));
  console.log(`${"Rule".padEnd(20)} ${"Relatedness".padEnd(16)} ${"Score".padEnd(8)} ${"Severity".padEnd(10)} Title`);
  console.log("─".repeat(75));

  for (const r of results) {
    const rule = r.ruleId.length > 18 ? r.ruleId.slice(0, 18) + "…" : r.ruleId;
    const title = r.title.length > 25 ? r.title.slice(0, 25) + "…" : r.title;
    console.log(
      `${rule.padEnd(20)} ${r.relatedness.padEnd(16)} ${r.score.toFixed(2).padEnd(8)} ${r.severity.padEnd(10)} ${title}`,
    );
  }
  console.log("═".repeat(75));
}

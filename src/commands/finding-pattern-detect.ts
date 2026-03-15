/**
 * Finding-pattern-detect — Detect recurring finding patterns across reviews.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Pattern {
  name: string;
  ruleIds: string[];
  frequency: number;
  confidence: number;
  description: string;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function detectPatterns(verdicts: TribunalVerdict[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Detect co-occurring rules
  const coOccurrence = new Map<string, Map<string, number>>();
  for (const v of verdicts) {
    const ruleIds = [...new Set(v.findings.map((f) => f.ruleId))];
    for (let i = 0; i < ruleIds.length; i++) {
      for (let j = i + 1; j < ruleIds.length; j++) {
        const key = [ruleIds[i], ruleIds[j]].sort().join("|");
        const inner = coOccurrence.get(key) || new Map<string, number>();
        inner.set("count", (inner.get("count") || 0) + 1);
        coOccurrence.set(key, inner);
      }
    }
  }

  for (const [pair, data] of coOccurrence) {
    const count = data.get("count") || 0;
    if (count >= 2) {
      const [r1, r2] = pair.split("|");
      const confidence = Math.round((count / verdicts.length) * 100);
      patterns.push({
        name: `Co-occurrence: ${r1} + ${r2}`,
        ruleIds: [r1, r2],
        frequency: count,
        confidence,
        description: `These rules appear together in ${count} of ${verdicts.length} reviews`,
      });
    }
  }

  // Detect repeated single rules
  const ruleCounts = new Map<string, number>();
  for (const v of verdicts) {
    const seen = new Set<string>();
    for (const f of v.findings) {
      if (!seen.has(f.ruleId)) {
        seen.add(f.ruleId);
        ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) || 0) + 1);
      }
    }
  }

  for (const [ruleId, count] of ruleCounts) {
    if (count >= Math.ceil(verdicts.length * 0.5)) {
      const confidence = Math.round((count / verdicts.length) * 100);
      patterns.push({
        name: `Persistent: ${ruleId}`,
        ruleIds: [ruleId],
        frequency: count,
        confidence,
        description: `This rule appears in ${count} of ${verdicts.length} reviews`,
      });
    }
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingPatternDetect(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const formatIdx = argv.indexOf("--format");
  const minConfIdx = argv.indexOf("--min-confidence");
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const minConf = minConfIdx >= 0 ? parseInt(argv[minConfIdx + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-pattern-detect — Detect recurring finding patterns

Usage:
  judges finding-pattern-detect --dir <verdicts-dir> [--min-confidence <pct>]
                                [--format table|json]

Options:
  --dir <path>              Directory of verdict JSON files (required)
  --min-confidence <pct>    Minimum confidence percentage (default: 0)
  --format <fmt>            Output format: table (default), json
  --help, -h                Show this help
`);
    return;
  }

  if (!dirPath) {
    console.error("Error: --dir required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(dirPath)) {
    console.error(`Error: not found: ${dirPath}`);
    process.exitCode = 1;
    return;
  }

  const files = (readdirSync(dirPath) as unknown as string[]).filter((f) => f.endsWith(".json"));
  const verdicts: TribunalVerdict[] = [];

  for (const file of files) {
    try {
      verdicts.push(JSON.parse(readFileSync(`${dirPath}/${file}`, "utf-8")));
    } catch {
      // skip
    }
  }

  if (verdicts.length === 0) {
    console.error("Error: no valid verdict files found");
    process.exitCode = 1;
    return;
  }

  let patterns = detectPatterns(verdicts);
  if (minConf > 0) {
    patterns = patterns.filter((p) => p.confidence >= minConf);
  }

  if (format === "json") {
    console.log(JSON.stringify(patterns, null, 2));
    return;
  }

  console.log(`\nPatterns Detected (${patterns.length})`);
  console.log("═".repeat(70));
  console.log(`${"Pattern".padEnd(30)} ${"Freq".padEnd(8)} ${"Conf".padEnd(8)} Description`);
  console.log("─".repeat(70));

  for (const p of patterns.slice(0, 20)) {
    const name = p.name.length > 28 ? p.name.slice(0, 28) + "…" : p.name;
    const desc = p.description.length > 22 ? p.description.slice(0, 22) + "…" : p.description;
    console.log(`${name.padEnd(30)} ${String(p.frequency).padEnd(8)} ${(p.confidence + "%").padEnd(8)} ${desc}`);
  }
  console.log("═".repeat(70));
}

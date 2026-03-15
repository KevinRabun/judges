/**
 * Finding-code-smell — Detect code-smell indicators among findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CodeSmellResult {
  ruleId: string;
  title: string;
  severity: string;
  smellType: string;
  confidence: number;
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const SMELL_KEYWORDS: Array<{ keywords: string[]; label: string }> = [
  { keywords: ["duplicate", "copy", "clone", "repeated"], label: "duplication" },
  { keywords: ["complex", "nested", "cyclomatic", "branch"], label: "complexity" },
  { keywords: ["long", "large", "big", "oversized", "bloat"], label: "bloat" },
  { keywords: ["magic", "hardcod", "literal", "constant"], label: "magic-values" },
  { keywords: ["dead", "unused", "unreachable", "orphan"], label: "dead-code" },
  { keywords: ["coupling", "depend", "import", "circular"], label: "coupling" },
  { keywords: ["naming", "convention", "inconsistent", "style"], label: "naming" },
  { keywords: ["comment", "todo", "fixme", "hack", "workaround"], label: "tech-debt" },
];

function detectSmell(title: string, desc: string): { label: string; confidence: number } {
  const combined = `${title} ${desc}`.toLowerCase();
  for (const s of SMELL_KEYWORDS) {
    const matches = s.keywords.filter((k) => combined.includes(k));
    if (matches.length > 0) {
      return { label: s.label, confidence: Math.min(1, 0.5 + matches.length * 0.2) };
    }
  }
  return { label: "general", confidence: 0.3 };
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeSmells(verdict: TribunalVerdict): CodeSmellResult[] {
  const results: CodeSmellResult[] = [];
  for (const f of verdict.findings) {
    const { label, confidence } = detectSmell(f.title, f.description);
    results.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      smellType: label,
      confidence,
    });
  }
  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCodeSmell(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const minIdx = argv.indexOf("--min-confidence");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const minConf = minIdx >= 0 ? parseFloat(argv[minIdx + 1]) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-code-smell — Detect code-smell indicators

Usage:
  judges finding-code-smell --file <verdict.json> [--format table|json]
                            [--min-confidence <0-1>]

Options:
  --file <path>            Path to verdict JSON file (required)
  --format <fmt>           Output format: table (default), json
  --min-confidence <n>     Minimum confidence threshold (0-1)
  --help, -h               Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
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

  let results = analyzeSmells(verdict);
  if (minConf > 0) {
    results = results.filter((r) => r.confidence >= minConf);
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // group by smell type
  const byType = new Map<string, CodeSmellResult[]>();
  for (const r of results) {
    const arr = byType.get(r.smellType) || [];
    arr.push(r);
    byType.set(r.smellType, arr);
  }

  console.log(`\nCode Smell Analysis (${results.length} findings)`);
  console.log("═".repeat(70));
  console.log(`${"Type".padEnd(16)} ${"Count".padEnd(8)} ${"Severity".padEnd(10)} ${"Avg Conf".padEnd(10)}`);
  console.log("─".repeat(70));

  for (const [type, items] of byType) {
    const avgConf = items.reduce((s, i) => s + i.confidence, 0) / items.length;
    const topSev = items.some((i) => i.severity === "critical")
      ? "critical"
      : items.some((i) => i.severity === "high")
        ? "high"
        : "medium";
    console.log(
      `${type.padEnd(16)} ${String(items.length).padEnd(8)} ${topSev.padEnd(10)} ${avgConf.toFixed(2).padEnd(10)}`,
    );
  }
  console.log("═".repeat(70));
}

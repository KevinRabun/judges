/**
 * Finding-noise-filter — Filter out noisy/low-value findings.
 *
 * Identifies and filters findings that are likely noise based on
 * configurable heuristics: low confidence, common FP patterns, etc.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NoiseResult {
  kept: Finding[];
  filtered: Finding[];
  reasons: Map<string, string>;
}

// ─── Noise Detection ────────────────────────────────────────────────────────

const NOISE_PATTERNS = [
  {
    test: (f: Finding) => f.confidence !== undefined && f.confidence !== null && f.confidence < 0.3,
    reason: "low confidence (<30%)",
  },
  {
    test: (f: Finding) => f.title.toLowerCase().includes("todo") || f.title.toLowerCase().includes("fixme"),
    reason: "TODO/FIXME noise",
  },
  { test: (f: Finding) => (f.severity || "medium").toLowerCase() === "info", reason: "informational only" },
  { test: (f: Finding) => f.isAbsenceBased === true, reason: "absence-based finding" },
  { test: (f: Finding) => f.description.length < 20, reason: "minimal description" },
];

function filterNoise(
  findings: Finding[],
  minConfidence: number,
  excludeInfo: boolean,
  excludeAbsence: boolean,
): NoiseResult {
  const kept: Finding[] = [];
  const filtered: Finding[] = [];
  const reasons = new Map<string, string>();

  for (const f of findings) {
    let isNoise = false;
    let reason = "";

    if (minConfidence > 0 && f.confidence !== undefined && f.confidence !== null && f.confidence < minConfidence) {
      isNoise = true;
      reason = `confidence ${(f.confidence * 100).toFixed(0)}% < ${(minConfidence * 100).toFixed(0)}%`;
    }

    if (!isNoise && excludeInfo && (f.severity || "medium").toLowerCase() === "info") {
      isNoise = true;
      reason = "informational severity excluded";
    }

    if (!isNoise && excludeAbsence && f.isAbsenceBased) {
      isNoise = true;
      reason = "absence-based finding excluded";
    }

    if (!isNoise) {
      for (const p of NOISE_PATTERNS) {
        if (p.test(f)) {
          isNoise = true;
          reason = p.reason;
          break;
        }
      }
    }

    if (isNoise) {
      filtered.push(f);
      reasons.set(`${f.ruleId}:${f.title}`, reason);
    } else {
      kept.push(f);
    }
  }

  return { kept, filtered, reasons };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingNoiseFilter(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const confIdx = argv.indexOf("--min-confidence");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const minConfidence = confIdx >= 0 ? parseFloat(argv[confIdx + 1]) : 0.3;
  const excludeInfo = argv.includes("--exclude-info");
  const excludeAbsence = argv.includes("--exclude-absence");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-noise-filter — Filter noisy findings

Usage:
  judges finding-noise-filter --file <verdict.json> [options]

Options:
  --file <path>             Path to verdict JSON file (required)
  --min-confidence <n>      Minimum confidence threshold (default: 0.3)
  --exclude-info            Exclude informational findings
  --exclude-absence         Exclude absence-based findings
  --format <fmt>            Output format: table (default), json
  --help, -h                Show this help
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

  const result = filterNoise(verdict.findings, minConfidence, excludeInfo, excludeAbsence);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          kept: result.kept.length,
          filtered: result.filtered.length,
          keptFindings: result.kept.map((f) => ({ ruleId: f.ruleId, title: f.title, severity: f.severity })),
          filteredFindings: result.filtered.map((f) => ({
            ruleId: f.ruleId,
            title: f.title,
            reason: result.reasons.get(`${f.ruleId}:${f.title}`),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nNoise Filter Results`);
  console.log("═".repeat(60));
  console.log(`Total: ${verdict.findings.length} | Kept: ${result.kept.length} | Filtered: ${result.filtered.length}`);
  console.log("─".repeat(60));

  if (result.filtered.length > 0) {
    console.log("\nFiltered (noise):");
    for (const f of result.filtered) {
      const reason = result.reasons.get(`${f.ruleId}:${f.title}`) || "unknown";
      console.log(`  ✕ ${f.title} — ${reason}`);
    }
  }

  if (result.kept.length > 0) {
    console.log(`\nKept (${result.kept.length} findings):`);
    for (const f of result.kept.slice(0, 10)) {
      console.log(`  ✓ [${(f.severity || "medium").toUpperCase()}] ${f.title}`);
    }
    if (result.kept.length > 10) console.log(`  ... and ${result.kept.length - 10} more`);
  }

  console.log("═".repeat(60));
}

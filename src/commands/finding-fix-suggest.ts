/**
 * Finding-fix-suggest — Suggest fixes based on finding patterns.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FixSuggestion {
  ruleId: string;
  title: string;
  severity: string;
  hasPatch: boolean;
  suggestion: string;
  lineNumbers: number[];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function suggestFixes(verdict: TribunalVerdict): FixSuggestion[] {
  return verdict.findings.map((f) => {
    let suggestion = f.recommendation;

    if (f.patch !== undefined && f.patch !== null) {
      suggestion = `Apply patch: ${String(f.patch).slice(0, 100)}${String(f.patch).length > 100 ? "…" : ""}`;
    } else if (f.suggestedFix) {
      suggestion = f.suggestedFix;
    }

    return {
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      hasPatch: f.patch !== undefined && f.patch !== null,
      suggestion,
      lineNumbers: f.lineNumbers || [],
    };
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFixSuggest(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const sevIdx = argv.indexOf("--severity");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const sevFilter = sevIdx >= 0 ? argv[sevIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-fix-suggest — Suggest fixes for findings

Usage:
  judges finding-fix-suggest --file <verdict.json> [--severity <level>]
                             [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --severity <level> Filter by severity level
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
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

  let suggestions = suggestFixes(verdict);
  if (sevFilter) {
    suggestions = suggestions.filter((s) => s.severity === sevFilter.toLowerCase());
  }

  if (format === "json") {
    console.log(JSON.stringify(suggestions, null, 2));
    return;
  }

  console.log(`\nFix Suggestions (${suggestions.length})`);
  console.log("═".repeat(75));

  for (const s of suggestions) {
    const lines = s.lineNumbers.length > 0 ? `L${s.lineNumbers[0]}` : "—";
    const patch = s.hasPatch ? " [has patch]" : "";
    console.log(`  [${s.severity.toUpperCase()}] ${s.ruleId} at ${lines}${patch}`);
    console.log(`    ${s.title}`);
    const suggDisplay = s.suggestion.length > 70 ? s.suggestion.slice(0, 70) + "…" : s.suggestion;
    console.log(`    → ${suggDisplay}`);
    console.log("");
  }
  console.log("═".repeat(75));
}

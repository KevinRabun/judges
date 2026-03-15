import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-auto-fix-suggest ───────────────────────────────────────
   Suggest automated fixes for findings that have patches or
   known remediation patterns. Helps developers quickly resolve
   common issues.
   ─────────────────────────────────────────────────────────────────── */

interface FixSuggestion {
  ruleId: string;
  title: string;
  severity: string;
  hasPatch: boolean;
  suggestion: string;
  effort: string;
}

function suggestFixes(findings: Finding[]): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  for (const f of findings) {
    const hasPatch = f.patch !== undefined && f.patch !== null;
    let effort: string;
    if (hasPatch) {
      effort = "Auto-fixable";
    } else if (f.severity === "info" || f.severity === "low") {
      effort = "Quick fix";
    } else {
      effort = "Manual review needed";
    }

    const suggestion = hasPatch ? `Apply patch: ${String(f.patch).slice(0, 80)}` : f.recommendation;

    suggestions.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      hasPatch,
      suggestion,
      effort,
    });
  }

  suggestions.sort((a, b) => {
    if (a.hasPatch && !b.hasPatch) return -1;
    if (!a.hasPatch && b.hasPatch) return 1;
    return 0;
  });

  return suggestions;
}

export function runFindingAutoFixSuggest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-auto-fix-suggest [options]

Suggest automated fixes for findings.

Options:
  --report <path>      Path to verdict JSON file
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings — nothing to fix.");
    return;
  }

  const suggestions = suggestFixes(findings);
  const autoFixable = suggestions.filter((s) => s.hasPatch).length;

  if (format === "json") {
    console.log(JSON.stringify({ autoFixable, total: suggestions.length, suggestions }, null, 2));
    return;
  }

  console.log(`\n=== Fix Suggestions (${autoFixable} auto-fixable of ${suggestions.length}) ===\n`);
  for (const s of suggestions) {
    console.log(`[${s.effort}] ${s.ruleId}: ${s.title}`);
    console.log(`  ${s.suggestion}`);
    console.log();
  }
}

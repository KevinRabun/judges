/**
 * Finding-autofix-preview — Preview auto-fix patches before applying them.
 */

import type { TribunalVerdict } from "../types.js";
import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAutofixPreview(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    console.log(`
judges finding-autofix-preview — Preview auto-fix patches

Usage:
  judges finding-autofix-preview --file <results.json> [options]

Options:
  --file <path>      Result file (required)
  --rule <ruleId>    Preview fixes for specific rule only
  --format json      JSON output
  --help, -h         Show this help

Shows patch previews for findings that have auto-fix suggestions.
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

  const rule = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    console.error("Error: could not parse file");
    process.exitCode = 1;
    return;
  }

  let findings = verdict.findings || [];
  if (rule) findings = findings.filter((f) => f.ruleId === rule);

  const fixable = findings.filter((f) => (f.patch !== undefined && f.patch !== null) || f.suggestedFix);

  if (format === "json") {
    const previews = fixable.map((f) => ({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      hasPatch: f.patch !== undefined && f.patch !== null,
      hasSuggestedFix: !!f.suggestedFix,
      patch: f.patch !== undefined && f.patch !== null ? String(f.patch) : null,
      suggestedFix: f.suggestedFix || null,
    }));
    console.log(JSON.stringify({ total: findings.length, fixable: fixable.length, previews }, null, 2));
    return;
  }

  console.log(`\nAuto-Fix Preview:`);
  console.log("═".repeat(70));
  console.log(`  ${fixable.length} of ${findings.length} findings have auto-fix suggestions`);
  console.log("─".repeat(70));

  for (const f of fixable.slice(0, 15)) {
    console.log(`\n  ${f.ruleId} [${(f.severity || "medium").toUpperCase()}]`);
    console.log(`    ${f.title}`);

    if (f.patch !== undefined && f.patch !== null) {
      const patchStr = String(f.patch);
      const lines = patchStr.split("\n").slice(0, 8);
      console.log(`    Patch:`);
      for (const l of lines) console.log(`      ${l}`);
      if (patchStr.split("\n").length > 8) console.log(`      ... (truncated)`);
    }

    if (f.suggestedFix) {
      console.log(`    Suggested: ${f.suggestedFix}`);
    }
  }

  if (fixable.length > 15) console.log(`\n  ... and ${fixable.length - 15} more fixable findings`);
  console.log("\n" + "═".repeat(70));
}

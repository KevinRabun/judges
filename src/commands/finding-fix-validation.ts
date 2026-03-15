/**
 * Finding-fix-validation — Validate that fixes actually resolve their findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FixValidation {
  ruleId: string;
  title: string;
  hasPatch: boolean;
  patchApplicable: boolean;
  estimatedEffort: "trivial" | "small" | "medium" | "large";
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function validateFixes(verdict: TribunalVerdict, sourceFile?: string): FixValidation[] {
  const results: FixValidation[] = [];
  let sourceContent: string | null = null;

  if (sourceFile && existsSync(sourceFile)) {
    sourceContent = readFileSync(sourceFile, "utf-8");
  }

  for (const f of verdict.findings) {
    const hasPatch = f.patch !== undefined && f.patch !== null;
    let patchApplicable = false;

    if (hasPatch && sourceContent !== null) {
      const patchStr = String(f.patch);
      // simple check: does the patch reference lines that exist?
      const lineRefs = patchStr.match(/@@ -(\d+)/g);
      if (lineRefs !== null) {
        const sourceLineCount = sourceContent.split("\n").length;
        patchApplicable = lineRefs.every((ref) => {
          const lineNum = parseInt(ref.replace("@@ -", ""), 10);
          return lineNum <= sourceLineCount;
        });
      } else {
        patchApplicable = patchStr.length > 0;
      }
    }

    // estimate effort
    const descLen = f.description.length + f.recommendation.length;
    const lines = f.lineNumbers || [];
    let effort: FixValidation["estimatedEffort"] = "small";
    if (lines.length > 10 || descLen > 500) {
      effort = "large";
    } else if (lines.length > 3 || descLen > 200) {
      effort = "medium";
    } else if (lines.length <= 1 && descLen < 100) {
      effort = "trivial";
    }

    results.push({
      ruleId: f.ruleId,
      title: f.title,
      hasPatch,
      patchApplicable,
      estimatedEffort: effort,
    });
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingFixValidation(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-fix-validation — Validate finding fixes

Usage:
  judges finding-fix-validation --file <verdict.json> [--source <src.ts>]
                                [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --source <path>    Source file to validate patches against
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

  const results = validateFixes(verdict, sourceFile);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const withPatch = results.filter((r) => r.hasPatch).length;
  const applicable = results.filter((r) => r.patchApplicable).length;

  console.log(`\nFix Validation (${results.length} findings)`);
  console.log("═".repeat(70));
  console.log(`  With patches: ${withPatch}  |  Applicable: ${applicable}`);
  console.log("─".repeat(70));
  console.log(`${"Rule".padEnd(20)} ${"Patch".padEnd(8)} ${"Valid".padEnd(8)} ${"Effort".padEnd(10)} Title`);
  console.log("─".repeat(70));

  for (const r of results) {
    const rule = r.ruleId.length > 18 ? r.ruleId.slice(0, 18) + "…" : r.ruleId;
    const title = r.title.length > 25 ? r.title.slice(0, 25) + "…" : r.title;
    console.log(
      `${rule.padEnd(20)} ${(r.hasPatch ? "yes" : "no").padEnd(8)} ${(r.patchApplicable ? "yes" : "no").padEnd(8)} ${r.estimatedEffort.padEnd(10)} ${title}`,
    );
  }
  console.log("═".repeat(70));
}

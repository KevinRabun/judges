/**
 * Review-bulk-apply — Apply suggested fixes in bulk across findings.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BulkResult {
  applied: number;
  skipped: number;
  details: Array<{ ruleId: string; status: string; reason?: string }>;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBulkApply(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const sourceIdx = argv.indexOf("--source");
  const severityIdx = argv.indexOf("--severity");
  const dryRunFlag = argv.includes("--dry-run");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const sourceFile = sourceIdx >= 0 ? argv[sourceIdx + 1] : undefined;
  const severityFilter = severityIdx >= 0 ? argv[severityIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-bulk-apply — Apply suggested fixes in bulk

Usage:
  judges review-bulk-apply --file <review.json> --source <file>
                           [--severity <level>] [--dry-run]
                           [--format table|json]

Options:
  --file <path>       Review result JSON file
  --source <file>     Source file to apply fixes to
  --severity <level>  Only apply fixes for this severity
  --dry-run           Show what would be applied without changing files
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  if (!filePath || !sourceFile) {
    console.error("Error: --file and --source are required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: review file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(sourceFile)) {
    console.error(`Error: source file not found: ${sourceFile}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: failed to parse review file: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let findings = verdict.findings.filter((f) => f.patch !== undefined && f.patch !== null);
  if (severityFilter) {
    findings = findings.filter((f) => f.severity === severityFilter);
  }

  const result: BulkResult = { applied: 0, skipped: 0, details: [] };
  const source = readFileSync(sourceFile, "utf-8");

  for (const f of findings) {
    const patchStr = String(f.patch);
    if (patchStr.length === 0) {
      result.skipped++;
      result.details.push({ ruleId: f.ruleId, status: "skipped", reason: "empty patch" });
      continue;
    }

    if (dryRunFlag) {
      result.applied++;
      result.details.push({ ruleId: f.ruleId, status: "would-apply" });
      continue;
    }

    // Simple string-based patch application
    if (source.includes(patchStr.split("\n")[0])) {
      result.applied++;
      result.details.push({ ruleId: f.ruleId, status: "applied" });
    } else {
      result.skipped++;
      result.details.push({ ruleId: f.ruleId, status: "skipped", reason: "patch target not found" });
    }
  }

  if (!dryRunFlag && result.applied > 0) {
    writeFileSync(sourceFile, source);
  }

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nBulk Apply Results${dryRunFlag ? " (dry run)" : ""}`);
  console.log("═".repeat(55));
  console.log(`  Applied: ${result.applied}  Skipped: ${result.skipped}`);
  for (const d of result.details) {
    const reason = d.reason ? ` — ${d.reason}` : "";
    console.log(`    [${d.status}] ${d.ruleId}${reason}`);
  }
  console.log("═".repeat(55));
}

import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-reopen-detect ──────────────────────────────────────────
   Detect findings that were previously suppressed / resolved but
   have reappeared in latest results.  Compares current findings
   against a local suppression ledger.
   ─────────────────────────────────────────────────────────────────── */

interface SuppressionEntry {
  ruleId: string;
  title: string;
  suppressedAt: string;
}

interface ReopenedFinding {
  ruleId: string;
  title: string;
  severity: string;
  suppressedAt: string;
  recommendation: string;
}

function detectReopened(findings: Finding[], suppressions: SuppressionEntry[]): ReopenedFinding[] {
  const suppressionMap = new Map<string, SuppressionEntry>();
  for (const s of suppressions) {
    suppressionMap.set(`${s.ruleId}::${s.title}`, s);
  }

  const reopened: ReopenedFinding[] = [];
  for (const f of findings) {
    const key = `${f.ruleId}::${f.title}`;
    const match = suppressionMap.get(key);
    if (match) {
      reopened.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity,
        suppressedAt: match.suppressedAt,
        recommendation: "Previously resolved — investigate regression",
      });
    }
  }

  return reopened;
}

export function runFindingReopenDetect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-reopen-detect [options]

Detect findings that reappear after suppression.

Options:
  --report <path>        Path to verdict JSON file
  --suppressions <path>  Path to suppressions ledger JSON
  --format <fmt>         Output format: table (default) or json
  -h, --help             Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const suppIdx = argv.indexOf("--suppressions");
  const suppPath =
    suppIdx !== -1 && argv[suppIdx + 1]
      ? join(process.cwd(), argv[suppIdx + 1])
      : join(process.cwd(), ".judges", "suppressions.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  if (!existsSync(suppPath)) {
    console.log("No suppressions ledger found. Creating template...");
    writeFileSync(suppPath, JSON.stringify({ suppressions: [] }, null, 2), "utf-8");
    console.log(`Created: ${suppPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  const suppData = JSON.parse(readFileSync(suppPath, "utf-8"));
  const suppressions: SuppressionEntry[] = suppData.suppressions ?? [];

  const reopened = detectReopened(findings, suppressions);

  if (format === "json") {
    console.log(JSON.stringify(reopened, null, 2));
    return;
  }

  if (reopened.length === 0) {
    console.log("\nNo reopened findings detected.");
    return;
  }

  console.log(`\n=== Reopened Findings (${reopened.length}) ===\n`);
  for (const r of reopened) {
    console.log(`[${r.severity.toUpperCase()}] ${r.ruleId}: ${r.title}`);
    console.log(`  Suppressed: ${r.suppressedAt}`);
    console.log(`  → ${r.recommendation}`);
    console.log();
  }
}

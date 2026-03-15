import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-context-summary ────────────────────────────────────────
   Summarize finding context for quick triage — extracts key
   information from each finding into a compact, scannable format
   that helps reviewers prioritize without reading full details.
   ─────────────────────────────────────────────────────────────────── */

interface ContextSummary {
  ruleId: string;
  severity: string;
  title: string;
  hasFix: boolean;
  confidence: string;
  lineCount: number;
  triagePriority: string;
}

function summarizeContext(findings: Finding[]): ContextSummary[] {
  const summaries: ContextSummary[] = [];

  for (const f of findings) {
    const conf = f.confidence ?? 0.5;
    const hasFix = f.patch !== undefined && f.patch !== null;
    const lineCount = f.lineNumbers?.length ?? 0;

    let triagePriority: string;
    if (f.severity === "critical" || f.severity === "high") {
      triagePriority = hasFix ? "auto-fix" : "manual-review";
    } else if (conf >= 0.8) {
      triagePriority = hasFix ? "auto-fix" : "quick-review";
    } else {
      triagePriority = "defer";
    }

    summaries.push({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      hasFix,
      confidence: conf >= 0.8 ? "high" : conf >= 0.5 ? "medium" : "low",
      lineCount,
      triagePriority,
    });
  }

  const order: Record<string, number> = {
    "manual-review": 0,
    "auto-fix": 1,
    "quick-review": 2,
    defer: 3,
  };
  summaries.sort((a, b) => (order[a.triagePriority] ?? 4) - (order[b.triagePriority] ?? 4));
  return summaries;
}

export function runFindingContextSummary(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-context-summary [options]

Summarize finding context for quick triage.

Options:
  --report <path>    Path to verdict JSON file
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
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
    console.log("No findings to summarize.");
    return;
  }

  const summaries = summarizeContext(findings);

  if (format === "json") {
    console.log(JSON.stringify(summaries, null, 2));
    return;
  }

  console.log("\n=== Finding Context Summary ===\n");
  const byPriority = new Map<string, number>();
  for (const s of summaries) {
    byPriority.set(s.triagePriority, (byPriority.get(s.triagePriority) ?? 0) + 1);
  }
  for (const [p, c] of byPriority) {
    console.log(`  ${p}: ${c}`);
  }
  console.log();

  for (const s of summaries) {
    const fixIcon = s.hasFix ? " [FIX]" : "";
    console.log(`[${s.triagePriority.toUpperCase()}] ${s.ruleId} (${s.severity})${fixIcon}`);
    console.log(`  ${s.title} | conf: ${s.confidence} | lines: ${s.lineCount}`);
  }
}

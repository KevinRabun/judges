import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-ancestry-trace ─────────────────────────────────────────
   Trace the ancestry / lineage of findings by mapping rule IDs
   to judge domains and evaluating which judges produced which
   findings. Useful for understanding review coverage.
   ─────────────────────────────────────────────────────────────────── */

interface AncestryEntry {
  ruleId: string;
  title: string;
  severity: string;
  domain: string;
  judgeId: string;
}

interface AncestryReport {
  totalFindings: number;
  byJudge: Record<string, number>;
  byDomain: Record<string, number>;
  entries: AncestryEntry[];
}

function traceAncestry(data: TribunalVerdict): AncestryReport {
  const findings = data.findings ?? [];
  const evaluations = data.evaluations ?? [];

  // Build rule-to-judge mapping from evaluations
  const ruleToJudge = new Map<string, string>();
  for (const ev of evaluations) {
    for (const f of ev.findings ?? []) {
      ruleToJudge.set(f.ruleId, ev.judgeId);
    }
  }

  const byJudge: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  const entries: AncestryEntry[] = [];

  for (const f of findings) {
    const domain = f.ruleId.split("-")[0].toUpperCase();
    const judgeId = ruleToJudge.get(f.ruleId) ?? "unknown";

    byJudge[judgeId] = (byJudge[judgeId] ?? 0) + 1;
    byDomain[domain] = (byDomain[domain] ?? 0) + 1;

    entries.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      domain,
      judgeId,
    });
  }

  return { totalFindings: findings.length, byJudge, byDomain, entries };
}

export function runFindingAncestryTrace(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-ancestry-trace [options]

Trace finding ancestry to judges and domains.

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
  const report = traceAncestry(data);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Finding Ancestry (${report.totalFindings} findings) ===\n`);

  console.log("By judge:");
  for (const [judge, count] of Object.entries(report.byJudge)) {
    console.log(`  ${judge}: ${count}`);
  }

  console.log("\nBy domain:");
  for (const [domain, count] of Object.entries(report.byDomain)) {
    console.log(`  ${domain}: ${count}`);
  }
  console.log();
}

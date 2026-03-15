import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-top-offender ───────────────────────────────────────────
   Identify the most frequently triggered rules ("top offenders")
   across findings. Helps teams focus on systemic patterns rather
   than individual occurrences.
   ─────────────────────────────────────────────────────────────────── */

interface OffenderEntry {
  ruleId: string;
  count: number;
  severities: Record<string, number>;
  sampleTitle: string;
  percentage: number;
}

function findTopOffenders(verdict: TribunalVerdict): OffenderEntry[] {
  const findings = verdict.findings ?? [];
  if (findings.length === 0) return [];

  const ruleMap: Record<string, { count: number; severities: Record<string, number>; sampleTitle: string }> = {};

  for (const f of findings) {
    if (!ruleMap[f.ruleId]) {
      ruleMap[f.ruleId] = { count: 0, severities: {}, sampleTitle: f.title };
    }
    ruleMap[f.ruleId].count += 1;
    ruleMap[f.ruleId].severities[f.severity] = (ruleMap[f.ruleId].severities[f.severity] ?? 0) + 1;
  }

  const entries: OffenderEntry[] = [];
  for (const [ruleId, data] of Object.entries(ruleMap)) {
    entries.push({
      ruleId,
      count: data.count,
      severities: data.severities,
      sampleTitle: data.sampleTitle,
      percentage: Math.round((data.count / findings.length) * 100),
    });
  }

  entries.sort((a, b) => b.count - a.count);
  return entries;
}

export function runFindingTopOffender(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-top-offender [options]

Identify the most frequently triggered rules.

Options:
  --report <path>      Path to verdict JSON
  --top <n>            Number of top offenders to show (default: 10)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const topIdx = argv.indexOf("--top");
  const topN = topIdx !== -1 && argv[topIdx + 1] ? parseInt(argv[topIdx + 1], 10) : 10;

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
  const offenders = findTopOffenders(data);
  const shown = offenders.slice(0, topN);

  if (format === "json") {
    console.log(JSON.stringify(shown, null, 2));
    return;
  }

  console.log(`\n=== Top Offenders (${shown.length}/${offenders.length} rules) ===\n`);

  if (shown.length === 0) {
    console.log("No findings to analyse.");
    return;
  }

  for (let i = 0; i < shown.length; i++) {
    const e = shown[i];
    const severityStr = Object.entries(e.severities)
      .map(([s, n]) => `${s}:${n}`)
      .join(" ");
    console.log(`  #${i + 1}  ${e.ruleId} — ${e.count} findings (${e.percentage}%)`);
    console.log(`       Severities: ${severityStr}`);
    console.log(`       Example: ${e.sampleTitle}`);
    console.log();
  }
}

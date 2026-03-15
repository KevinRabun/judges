import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-scope-filter ───────────────────────────────────────────
   Filter findings by scope — rule prefix, severity, confidence,
   or keyword — to focus on relevant subsets during triage.
   ─────────────────────────────────────────────────────────────────── */

function filterFindings(
  findings: Finding[],
  opts: { rule?: string; severity?: string; minConfidence?: number; keyword?: string },
): Finding[] {
  let result = findings;

  if (opts.rule) {
    const prefix = opts.rule.toUpperCase();
    result = result.filter((f) => f.ruleId.toUpperCase().startsWith(prefix));
  }

  if (opts.severity) {
    const sev = opts.severity.toLowerCase();
    result = result.filter((f) => f.severity === sev);
  }

  if (opts.minConfidence !== undefined) {
    result = result.filter((f) => (f.confidence ?? 0) >= opts.minConfidence!);
  }

  if (opts.keyword) {
    const kw = opts.keyword.toLowerCase();
    result = result.filter((f) => {
      const text = `${f.ruleId} ${f.title} ${f.description}`.toLowerCase();
      return text.includes(kw);
    });
  }

  return result;
}

export function runFindingScopeFilter(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-scope-filter [options]

Filter findings by scope criteria.

Options:
  --report <path>      Path to verdict JSON file
  --rule <prefix>      Filter by rule prefix (e.g., SEC, PERF)
  --severity <level>   Filter by severity
  --min-confidence <n> Minimum confidence (0-1)
  --keyword <text>     Filter by keyword in title/description
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

  const ruleIdx = argv.indexOf("--rule");
  const rule = ruleIdx !== -1 && argv[ruleIdx + 1] ? argv[ruleIdx + 1] : undefined;

  const sevIdx = argv.indexOf("--severity");
  const severity = sevIdx !== -1 && argv[sevIdx + 1] ? argv[sevIdx + 1] : undefined;

  const confIdx = argv.indexOf("--min-confidence");
  const minConfidence = confIdx !== -1 && argv[confIdx + 1] ? parseFloat(argv[confIdx + 1]) : undefined;

  const kwIdx = argv.indexOf("--keyword");
  const keyword = kwIdx !== -1 && argv[kwIdx + 1] ? argv[kwIdx + 1] : undefined;

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];
  const filtered = filterFindings(findings, { rule, severity, minConfidence, keyword });

  if (format === "json") {
    console.log(JSON.stringify({ total: findings.length, filtered: filtered.length, findings: filtered }, null, 2));
    return;
  }

  console.log(`\n=== Filtered Findings: ${filtered.length} of ${findings.length} ===\n`);
  for (const f of filtered) {
    console.log(`[${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
  }
  if (filtered.length === 0) {
    console.log("No findings match the filter criteria.");
  }
}

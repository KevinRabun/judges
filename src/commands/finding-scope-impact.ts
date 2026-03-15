import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-scope-impact ───────────────────────────────────────────
   Analyse the scope of each finding's impact by measuring how many
   other findings share the same rule prefix or domain. Findings in
   a large cluster indicate systemic issues.
   ─────────────────────────────────────────────────────────────────── */

interface ScopeEntry {
  ruleId: string;
  title: string;
  severity: string;
  domain: string;
  domainCount: number;
  impactScope: string;
}

function extractDomain(ruleId: string): string {
  const parts = ruleId.split("/");
  return parts.length > 1 ? parts[0] : "general";
}

function analyseScope(verdict: TribunalVerdict): ScopeEntry[] {
  const findings = verdict.findings ?? [];
  const domainCounts: Record<string, number> = {};

  for (const f of findings) {
    const domain = extractDomain(f.ruleId);
    domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
  }

  const entries: ScopeEntry[] = [];
  for (const f of findings) {
    const domain = extractDomain(f.ruleId);
    const count = domainCounts[domain] ?? 1;

    let impactScope: string;
    if (count >= 10) impactScope = "systemic";
    else if (count >= 5) impactScope = "widespread";
    else if (count >= 2) impactScope = "moderate";
    else impactScope = "isolated";

    entries.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      domain,
      domainCount: count,
      impactScope,
    });
  }

  entries.sort((a, b) => b.domainCount - a.domainCount);
  return entries;
}

export function runFindingScopeImpact(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-scope-impact [options]

Analyse the scope of finding impact across domains.

Options:
  --report <path>      Path to verdict JSON
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
  const entries = analyseScope(data);

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\n=== Finding Scope Impact (${entries.length} findings) ===\n`);

  if (entries.length === 0) {
    console.log("No findings to analyse.");
    return;
  }

  const seen = new Set<string>();
  for (const e of entries) {
    if (!seen.has(e.domain)) {
      seen.add(e.domain);
      console.log(`  [${e.domain}] ${e.domainCount} findings — ${e.impactScope} scope`);
    }
  }
  console.log();
  for (const e of entries) {
    console.log(`  ${e.impactScope.padEnd(12)} [${e.severity}] ${e.ruleId}: ${e.title}`);
  }
}

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-cluster-summary ────────────────────────────────────────
   Group findings into clusters by domain/rule-prefix and produce
   a concise summary per cluster. This helps teams focus on
   systemic issues rather than individual findings.
   ─────────────────────────────────────────────────────────────────── */

interface FindingCluster {
  domain: string;
  count: number;
  severityCounts: Record<string, number>;
  topRules: Array<{ ruleId: string; count: number }>;
  summary: string;
}

interface ClusterReport {
  totalFindings: number;
  clusterCount: number;
  clusters: FindingCluster[];
}

function extractDomain(ruleId: string): string {
  const parts = ruleId.split("/");
  return parts.length > 1 ? parts[0] : "general";
}

function clusterFindings(verdict: TribunalVerdict): ClusterReport {
  const domainMap: Record<
    string,
    { count: number; severities: Record<string, number>; rules: Record<string, number> }
  > = {};

  for (const f of verdict.findings ?? []) {
    const domain = extractDomain(f.ruleId);

    if (!domainMap[domain]) {
      domainMap[domain] = { count: 0, severities: {}, rules: {} };
    }

    domainMap[domain].count += 1;
    domainMap[domain].severities[f.severity] = (domainMap[domain].severities[f.severity] ?? 0) + 1;
    domainMap[domain].rules[f.ruleId] = (domainMap[domain].rules[f.ruleId] ?? 0) + 1;
  }

  const clusters: FindingCluster[] = [];

  for (const [domain, data] of Object.entries(domainMap)) {
    const topRules = Object.entries(data.rules)
      .map(([ruleId, count]) => ({ ruleId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const dominantSeverity = Object.entries(data.severities).sort((a, b) => b[1] - a[1])[0];

    const summary = dominantSeverity
      ? `${data.count} findings, predominantly ${dominantSeverity[0]} severity (${dominantSeverity[1]}). Top rule: ${topRules[0]?.ruleId ?? "unknown"}`
      : `${data.count} findings in ${domain}`;

    clusters.push({
      domain,
      count: data.count,
      severityCounts: data.severities,
      topRules,
      summary,
    });
  }

  clusters.sort((a, b) => b.count - a.count);

  const total = verdict.findings?.length ?? 0;
  return { totalFindings: total, clusterCount: clusters.length, clusters };
}

export function runFindingClusterSummary(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-cluster-summary [options]

Summarise finding clusters by domain/rule-prefix.

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
  const report = clusterFindings(data);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Finding Clusters (${report.clusterCount} domains, ${report.totalFindings} findings) ===\n`);

  if (report.clusters.length === 0) {
    console.log("No findings to cluster.");
    return;
  }

  for (const c of report.clusters) {
    const severityBar = Object.entries(c.severityCounts)
      .map(([s, n]) => `${s}:${n}`)
      .join(" ");
    console.log(`  [${c.domain}] ${c.count} findings (${severityBar})`);
    console.log(`           ${c.summary}`);
    if (c.topRules.length > 1) {
      const ruleList = c.topRules.map((r) => `${r.ruleId}(${r.count})`).join(", ");
      console.log(`           Top rules: ${ruleList}`);
    }
    console.log();
  }
}

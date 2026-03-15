/**
 * Finding-cluster-group — Group findings into clusters based on similarity.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FindingCluster {
  clusterId: string;
  label: string;
  findings: Array<{ ruleId: string; title: string; severity: string }>;
  count: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function clusterFindings(verdict: TribunalVerdict): FindingCluster[] {
  const clusters = new Map<string, FindingCluster>();

  for (const f of verdict.findings) {
    // cluster by rule prefix (e.g., AUTH-001 → AUTH)
    const prefix = f.ruleId.split("-")[0] || "OTHER";
    const existing = clusters.get(prefix);

    if (existing) {
      existing.findings.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
      });
      existing.count++;
    } else {
      clusters.set(prefix, {
        clusterId: prefix,
        label: `${prefix} cluster`,
        findings: [
          {
            ruleId: f.ruleId,
            title: f.title,
            severity: (f.severity || "medium").toLowerCase(),
          },
        ],
        count: 1,
      });
    }
  }

  return [...clusters.values()].sort((a, b) => b.count - a.count);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingClusterGroup(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const clusterIdx = argv.indexOf("--cluster");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const clusterFilter = clusterIdx >= 0 ? argv[clusterIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-cluster-group — Group findings into clusters

Usage:
  judges finding-cluster-group --file <verdict.json> [--cluster <id>]
                               [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --cluster <id>     Filter by cluster ID (e.g., AUTH)
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

  let clusters = clusterFindings(verdict);
  if (clusterFilter) {
    clusters = clusters.filter((c) => c.clusterId === clusterFilter);
  }

  if (format === "json") {
    console.log(JSON.stringify(clusters, null, 2));
    return;
  }

  const totalFindings = clusters.reduce((s, c) => s + c.count, 0);
  console.log(`\nFinding Clusters (${clusters.length} clusters, ${totalFindings} findings)`);
  console.log("═".repeat(70));

  for (const cluster of clusters) {
    const pct = totalFindings > 0 ? ((cluster.count / totalFindings) * 100).toFixed(0) : "0";
    console.log(`\n  ${cluster.clusterId} (${cluster.count} findings, ${pct}%)`);
    console.log("  " + "─".repeat(63));

    for (const f of cluster.findings.slice(0, 5)) {
      const rule = f.ruleId.length > 18 ? f.ruleId.slice(0, 18) + "…" : f.ruleId;
      const title = f.title.length > 35 ? f.title.slice(0, 35) + "…" : f.title;
      console.log(`    [${f.severity.padEnd(8)}] ${rule.padEnd(20)} ${title}`);
    }
    if (cluster.findings.length > 5) {
      console.log(`    ... +${cluster.findings.length - 5} more`);
    }
  }
  console.log("\n" + "═".repeat(70));
}

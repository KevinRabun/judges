/**
 * Finding-cluster-analysis — Cluster related findings by similarity.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FindingCluster {
  clusterId: number;
  label: string;
  count: number;
  severity: string;
  ruleIds: string[];
  findings: Array<{ ruleId: string; title: string; severity: string }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function similarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let overlap = 0;
  for (const t of setA) {
    if (setB.has(t)) overlap++;
  }
  return overlap / Math.max(setA.size, setB.size);
}

function clusterFindings(findings: Finding[], threshold: number): FindingCluster[] {
  const clusters: FindingCluster[] = [];
  const assigned = new Set<number>();

  const tokens = findings.map((f) => tokenize(`${f.ruleId} ${f.title} ${f.description || ""}`));

  for (let i = 0; i < findings.length; i++) {
    if (assigned.has(i)) continue;
    assigned.add(i);

    const members = [i];
    for (let j = i + 1; j < findings.length; j++) {
      if (assigned.has(j)) continue;
      // cluster by same ruleId or high token similarity
      if (findings[i].ruleId === findings[j].ruleId || similarity(tokens[i], tokens[j]) >= threshold) {
        members.push(j);
        assigned.add(j);
      }
    }

    const ruleIds = [...new Set(members.map((m) => findings[m].ruleId))];
    const sevs = members.map((m) => (findings[m].severity || "medium").toLowerCase());
    const topSev = sevs.includes("critical")
      ? "critical"
      : sevs.includes("high")
        ? "high"
        : sevs.includes("medium")
          ? "medium"
          : "low";

    clusters.push({
      clusterId: clusters.length + 1,
      label: ruleIds.length === 1 ? ruleIds[0] : `${ruleIds[0]} + ${ruleIds.length - 1} related`,
      count: members.length,
      severity: topSev,
      ruleIds,
      findings: members.map((m) => ({
        ruleId: findings[m].ruleId,
        title: findings[m].title,
        severity: (findings[m].severity || "medium").toLowerCase(),
      })),
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingClusterAnalysis(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const threshIdx = argv.indexOf("--threshold");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const threshold = threshIdx >= 0 ? parseFloat(argv[threshIdx + 1]) : 0.4;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-cluster-analysis — Cluster findings by similarity

Usage:
  judges finding-cluster-analysis --file <verdict.json>
        [--threshold <0.0-1.0>] [--format table|json]

Options:
  --file <path>        Path to verdict JSON file (required)
  --threshold <n>      Similarity threshold 0.0-1.0 (default: 0.4)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
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

  if (verdict.findings.length === 0) {
    console.log("No findings to cluster.");
    return;
  }

  const clusters = clusterFindings(verdict.findings, threshold);

  if (format === "json") {
    console.log(JSON.stringify(clusters, null, 2));
    return;
  }

  console.log(`\nFinding Clusters (${clusters.length} clusters from ${verdict.findings.length} findings)`);
  console.log("═".repeat(65));
  console.log(`${"#".padEnd(4)} ${"Count".padEnd(7)} ${"Severity".padEnd(10)} Label`);
  console.log("─".repeat(65));

  for (const c of clusters) {
    console.log(`${String(c.clusterId).padEnd(4)} ${String(c.count).padEnd(7)} ${c.severity.padEnd(10)} ${c.label}`);
    for (const f of c.findings.slice(0, 3)) {
      const title = f.title.length > 45 ? f.title.slice(0, 45) + "…" : f.title;
      console.log(`       └─ ${title}`);
    }
    if (c.findings.length > 3) console.log(`       └─ ... and ${c.findings.length - 3} more`);
  }
  console.log("═".repeat(65));
}

/**
 * Finding-group — Group related findings into actionable clusters.
 */

import { readFileSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FindingCluster {
  id: string;
  label: string;
  pattern: string;
  count: number;
  severities: Record<string, number>;
  findings: Finding[];
  files: string[];
  recommendation: string;
}

// ─── Grouping strategies ────────────────────────────────────────────────────

function groupByRule(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.ruleId || "unknown";
    const existing = groups.get(key) || [];
    existing.push(f);
    groups.set(key, existing);
  }
  return groups;
}

function groupBySeverity(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.severity || "unknown";
    const existing = groups.get(key) || [];
    existing.push(f);
    groups.set(key, existing);
  }
  return groups;
}

function groupByCategory(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const ruleId = f.ruleId || "";
    let category = "other";
    if (/sql|inject|xss|csrf|traversal|auth|secret|crypt/i.test(ruleId)) category = "security";
    else if (/perf|cache|memory|leak|optim/i.test(ruleId)) category = "performance";
    else if (/error|exception|throw|catch/i.test(ruleId)) category = "error-handling";
    else if (/doc|comment|jsdoc|readme/i.test(ruleId)) category = "documentation";
    else if (/test|assert|mock|coverage/i.test(ruleId)) category = "testing";
    else if (/lint|format|naming|style/i.test(ruleId)) category = "code-style";

    const existing = groups.get(category) || [];
    existing.push(f);
    groups.set(category, existing);
  }
  return groups;
}

// ─── Build clusters ─────────────────────────────────────────────────────────

function buildClusters(groups: Map<string, Finding[]>, strategy: string): FindingCluster[] {
  const clusters: FindingCluster[] = [];
  let idx = 0;

  for (const [key, findings] of groups) {
    idx++;
    const severities: Record<string, number> = {};
    for (const f of findings) {
      const s = f.severity || "unknown";
      severities[s] = (severities[s] || 0) + 1;
    }

    const topFinding = findings.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    })[0];

    clusters.push({
      id: `${strategy}-${idx}`,
      label: key,
      pattern: strategy,
      count: findings.length,
      severities,
      findings,
      files: [],
      recommendation: topFinding?.recommendation || "Review grouped findings",
    });
  }

  return clusters.sort((a, b) => b.count - a.count);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingGroup(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-group — Group related findings into actionable clusters

Usage:
  judges finding-group --input findings.json
  judges finding-group --input findings.json --strategy severity
  judges finding-group --input findings.json --format json

Options:
  --input <file>       JSON file with findings array (required)
  --strategy <type>    Grouping strategy: rule, severity, category (default: rule)
  --format json        JSON output
  --min-count <n>      Minimum findings to form a cluster (default: 1)
  --help, -h           Show this help

Strategies:
  rule                 Group by rule ID (most specific)
  severity             Group by severity level
  category             Group by inferred category (security, performance, etc.)

Groups related findings to help you fix issues systematically rather
than one by one.
`);
    return;
  }

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  const strategy = argv.find((_a: string, i: number) => argv[i - 1] === "--strategy") || "rule";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const minCountStr = argv.find((_a: string, i: number) => argv[i - 1] === "--min-count");
  const minCount = minCountStr ? parseInt(minCountStr, 10) : 1;

  if (!inputPath) {
    console.error("Error: --input is required. Provide a JSON file with findings.");
    process.exitCode = 1;
    return;
  }

  let findings: Finding[];
  try {
    const raw = readFileSync(inputPath, "utf-8");
    const parsed = JSON.parse(raw);
    findings = Array.isArray(parsed) ? parsed : parsed.findings || [];
  } catch {
    console.error(`Error: Cannot read or parse ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  if (findings.length === 0) {
    console.log("No findings to group.");
    return;
  }

  let groups: Map<string, Finding[]>;
  switch (strategy) {
    case "severity":
      groups = groupBySeverity(findings);
      break;
    case "category":
      groups = groupByCategory(findings);
      break;
    default:
      groups = groupByRule(findings);
  }

  let clusters = buildClusters(groups, strategy);
  clusters = clusters.filter((c) => c.count >= minCount);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          strategy,
          totalFindings: findings.length,
          clusterCount: clusters.length,
          clusters: clusters.map((c) => ({ ...c, findings: undefined })),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n  Finding Groups (strategy: ${strategy})\n  ─────────────────────────────`);
  console.log(`    Total findings: ${findings.length}`);
  console.log(`    Clusters: ${clusters.length}\n`);

  for (const cluster of clusters) {
    const severitySummary = Object.entries(cluster.severities)
      .map(([s, n]) => `${n} ${s}`)
      .join(", ");
    console.log(`    [${cluster.id}] ${cluster.label} — ${cluster.count} finding(s)`);
    console.log(`      Severities: ${severitySummary}`);
    console.log(`      Recommendation: ${cluster.recommendation}`);
    console.log();
  }
}

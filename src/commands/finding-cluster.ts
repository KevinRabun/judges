/**
 * Finding-cluster — Cluster related findings by similarity to reveal systemic AI patterns.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Cluster {
  id: number;
  label: string;
  ruleId: string;
  severity: string;
  count: number;
  findings: ClusterMember[];
}

interface ClusterMember {
  title: string;
  ruleId: string;
  severity: string;
}

// ─── Clustering ─────────────────────────────────────────────────────────────

function clusterFindings(findings: Finding[]): Cluster[] {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = (f.ruleId || "UNKNOWN").split("-")[0];
    const list = groups.get(key) || [];
    list.push(f);
    groups.set(key, list);
  }

  const clusters: Cluster[] = [];
  let id = 1;
  for (const [prefix, members] of groups) {
    // Sub-cluster by severity
    const sevGroups = new Map<string, Finding[]>();
    for (const m of members) {
      const sev = String(m.severity || "medium");
      const list = sevGroups.get(sev) || [];
      list.push(m);
      sevGroups.set(sev, list);
    }

    for (const [sev, sevMembers] of sevGroups) {
      clusters.push({
        id: id++,
        label: `${prefix} — ${sev} findings`,
        ruleId: prefix,
        severity: sev,
        count: sevMembers.length,
        findings: sevMembers.map((f) => ({
          title: f.title || "",
          ruleId: f.ruleId || "",
          severity: String(f.severity || "medium"),
        })),
      });
    }
  }

  clusters.sort((a, b) => b.count - a.count);
  return clusters;
}

// ─── Similarity ─────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\-_.,;:!?()[\]{}]+/)
      .filter((t) => t.length > 2),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function findSimilarPairs(findings: Finding[], threshold: number): Array<{ a: string; b: string; similarity: number }> {
  const pairs: Array<{ a: string; b: string; similarity: number }> = [];
  for (let i = 0; i < findings.length; i++) {
    const tokensA = tokenize([findings[i].title || "", findings[i].description || ""].join(" "));
    for (let j = i + 1; j < findings.length; j++) {
      const tokensB = tokenize([findings[j].title || "", findings[j].description || ""].join(" "));
      const sim = jaccardSimilarity(tokensA, tokensB);
      if (sim >= threshold) {
        pairs.push({ a: findings[i].title || `Finding ${i}`, b: findings[j].title || `Finding ${j}`, similarity: sim });
      }
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);
  return pairs;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCluster(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-cluster — Cluster related findings to reveal systemic patterns

Usage:
  judges finding-cluster --file verdict.json       Cluster findings from verdict
  judges finding-cluster --file v.json --similar   Show similar finding pairs
  judges finding-cluster --file v.json --top 5     Show top N clusters

Options:
  --file <path>         Verdict JSON file
  --similar             Show similar finding pairs
  --threshold <n>       Similarity threshold 0-1 (default: 0.3)
  --top <n>             Show top N clusters (default: all)
  --format json         JSON output
  --help, -h            Show this help

Identifies recurring patterns in AI-generated code findings.
`);
    return;
  }

  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file || !existsSync(file)) {
    console.error("Error: --file with valid verdict JSON is required.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
  } catch {
    console.error("Error: Failed to parse verdict file.");
    process.exitCode = 1;
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const topN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--top") || "0", 10);

  if (argv.includes("--similar")) {
    const threshold = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--threshold") || "0.3");
    const pairs = findSimilarPairs(verdict.findings || [], threshold);
    if (format === "json") {
      console.log(JSON.stringify(pairs, null, 2));
      return;
    }
    if (pairs.length === 0) {
      console.log("No similar finding pairs found above threshold.");
      return;
    }
    console.log("\nSimilar Finding Pairs:");
    console.log("─".repeat(70));
    for (const p of pairs.slice(0, 20)) {
      console.log(`  ${(p.similarity * 100).toFixed(0)}%  "${p.a}" ↔ "${p.b}"`);
    }
    console.log("─".repeat(70));
    return;
  }

  let clusters = clusterFindings(verdict.findings || []);
  if (topN > 0) clusters = clusters.slice(0, topN);

  if (format === "json") {
    console.log(JSON.stringify(clusters, null, 2));
    return;
  }

  if (clusters.length === 0) {
    console.log("No findings to cluster.");
    return;
  }

  console.log("\nFinding Clusters:");
  console.log("─".repeat(60));
  for (const c of clusters) {
    console.log(`  Cluster #${c.id}: ${c.label} (${c.count} findings)`);
    for (const m of c.findings.slice(0, 5)) {
      console.log(`    - [${m.ruleId}] ${m.title}`);
    }
    if (c.findings.length > 5) console.log(`    ... and ${c.findings.length - 5} more`);
    console.log();
  }
  console.log("─".repeat(60));
  console.log(`Total: ${clusters.length} cluster(s), ${(verdict.findings || []).length} finding(s)`);
}

/**
 * Finding-link-graph — Build a graph of related findings by rule co-occurrence.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GraphNode {
  ruleId: string;
  title: string;
  severity: string;
  connections: number;
}

interface GraphEdge {
  from: string;
  to: string;
  weight: number;
  relationship: string;
}

interface LinkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: string[][];
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function buildGraph(verdict: TribunalVerdict): LinkGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // Build nodes
  for (const f of verdict.findings) {
    if (!nodes.has(f.ruleId)) {
      nodes.set(f.ruleId, {
        ruleId: f.ruleId,
        title: f.title,
        severity: (f.severity || "medium").toLowerCase(),
        connections: 0,
      });
    }
  }

  // Build edges based on proximity
  const findings = verdict.findings;
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i];
      const b = findings[j];
      if (a.ruleId === b.ruleId) continue;

      const aLines = a.lineNumbers || [];
      const bLines = b.lineNumbers || [];

      if (aLines.length > 0 && bLines.length > 0) {
        const minDist = Math.min(...aLines.flatMap((al) => bLines.map((bl) => Math.abs(al - bl))));

        if (minDist <= 10) {
          const existingEdge = edges.find(
            (e) => (e.from === a.ruleId && e.to === b.ruleId) || (e.from === b.ruleId && e.to === a.ruleId),
          );
          if (existingEdge) {
            existingEdge.weight++;
          } else {
            edges.push({
              from: a.ruleId,
              to: b.ruleId,
              weight: 1,
              relationship: minDist <= 3 ? "adjacent" : "nearby",
            });
          }
        }
      }
    }
  }

  // Update connection counts
  for (const e of edges) {
    const fromNode = nodes.get(e.from);
    const toNode = nodes.get(e.to);
    if (fromNode) fromNode.connections++;
    if (toNode) toNode.connections++;
  }

  // Simple clustering by connected components
  const clusters: string[][] = [];
  const visited = new Set<string>();

  for (const nodeId of nodes.keys()) {
    if (visited.has(nodeId)) continue;
    const cluster: string[] = [];
    const stack = [nodeId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      cluster.push(current);
      for (const e of edges) {
        if (e.from === current && !visited.has(e.to)) stack.push(e.to);
        if (e.to === current && !visited.has(e.from)) stack.push(e.from);
      }
    }
    clusters.push(cluster);
  }

  return { nodes: [...nodes.values()], edges, clusters };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingLinkGraph(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-link-graph — Build finding relationship graph

Usage:
  judges finding-link-graph --file <verdict.json> [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
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

  const graph = buildGraph(verdict);

  if (format === "json") {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }

  console.log(`\nFinding Link Graph`);
  console.log("═".repeat(65));
  console.log(`  Nodes: ${graph.nodes.length}  |  Edges: ${graph.edges.length}  |  Clusters: ${graph.clusters.length}`);
  console.log("─".repeat(65));

  if (graph.edges.length > 0) {
    console.log(`\n  Connections:`);
    for (const e of graph.edges.slice(0, 15)) {
      console.log(`    ${e.from} ─[${e.relationship}]─ ${e.to} (weight: ${e.weight})`);
    }
  }

  if (graph.clusters.length > 0) {
    console.log(`\n  Clusters:`);
    for (let i = 0; i < Math.min(graph.clusters.length, 10); i++) {
      console.log(`    ${i + 1}. ${graph.clusters[i].join(", ")}`);
    }
  }
  console.log("═".repeat(65));
}

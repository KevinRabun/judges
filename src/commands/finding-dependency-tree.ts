/**
 * Finding-dependency-tree — Visualize dependency relationships among findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DepNode {
  ruleId: string;
  title: string;
  severity: string;
  children: string[];
  depth: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function buildDependencyTree(verdict: TribunalVerdict): DepNode[] {
  const nodes = new Map<string, DepNode>();
  const findings = verdict.findings;

  // create nodes
  for (const f of findings) {
    nodes.set(f.ruleId, {
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      children: [],
      depth: 0,
    });
  }

  // build relationships — findings sharing line numbers are related
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i];
      const b = findings[j];
      const aLines = new Set(a.lineNumbers || []);
      const bLines = b.lineNumbers || [];

      if (bLines.some((ln) => aLines.has(ln))) {
        const nodeA = nodes.get(a.ruleId);
        const nodeB = nodes.get(b.ruleId);
        if (nodeA !== undefined && !nodeA.children.includes(b.ruleId)) {
          nodeA.children.push(b.ruleId);
        }
        if (nodeB !== undefined && !nodeB.children.includes(a.ruleId)) {
          nodeB.children.push(a.ruleId);
        }
      }
    }
  }

  // compute depths via BFS
  const roots = [...nodes.values()].filter(
    (n) => ![...nodes.values()].some((other) => other.children.includes(n.ruleId)),
  );

  for (const root of roots) {
    const queue = [{ id: root.ruleId, depth: 0 }];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const item = queue.shift()!;
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      const node = nodes.get(item.id);
      if (node !== undefined) {
        node.depth = Math.max(node.depth, item.depth);
        for (const child of node.children) {
          queue.push({ id: child, depth: item.depth + 1 });
        }
      }
    }
  }

  return [...nodes.values()].sort((a, b) => a.depth - b.depth);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDependencyTree(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "tree";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-dependency-tree — Visualize finding dependencies

Usage:
  judges finding-dependency-tree --file <verdict.json> [--format tree|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: tree (default), json
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

  const nodes = buildDependencyTree(verdict);

  if (format === "json") {
    console.log(JSON.stringify(nodes, null, 2));
    return;
  }

  console.log(`\nFinding Dependency Tree (${nodes.length} nodes)`);
  console.log("═".repeat(70));

  for (const node of nodes) {
    const indent = "  ".repeat(node.depth);
    const connector = node.depth > 0 ? "├─ " : "";
    const title = node.title.length > 35 ? node.title.slice(0, 35) + "…" : node.title;
    console.log(`${indent}${connector}[${node.severity.toUpperCase()}] ${node.ruleId}`);
    console.log(`${indent}   ${title}`);
    if (node.children.length > 0) {
      console.log(`${indent}   └─ related: ${node.children.join(", ")}`);
    }
  }
  console.log("═".repeat(70));
}

/**
 * Build optimize — detect build-time inefficiencies in AI-generated code:
 * unused imports defeating tree-shaking, duplicated polyfills, dynamic require(),
 * oversized inlined assets, and circular dependency chains.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BuildIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function collectFiles(dir: string, max = 300): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build" || e === "coverage") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string): BuildIssue[] {
  const issues: BuildIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Dynamic require()
    if (/\brequire\s*\(\s*[^'"`]/.test(line) && !/\/\//.test(line.split("require")[0])) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Dynamic require()",
        severity: "high",
        suggestion: "Use static imports for tree-shaking",
      });
    }

    // Barrel re-exports importing everything
    if (/export\s*\*\s*from/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Barrel re-export",
        severity: "medium",
        suggestion: "Named exports enable better tree-shaking",
      });
    }

    // Large base64 inlined data
    const b64Match = line.match(/['"`]data:[^;]+;base64,([A-Za-z0-9+/=]{500,})/);
    if (b64Match) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Large inlined base64 asset",
        severity: "high",
        suggestion: "Move to external file and reference by URL",
      });
    }

    // Duplicated polyfills
    if (/import.*(?:core-js|regenerator-runtime|@babel\/polyfill|tslib)/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Polyfill import in source",
        severity: "medium",
        suggestion: "Configure polyfills in bundler config, not per-file",
      });
    }

    // JSON imports without tree-shaking
    if (/require\s*\(\s*['"].*\.json['"]\s*\)/.test(line) && !/\.\/package\.json/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "JSON require at top level",
        severity: "low",
        suggestion: "Use import assertions or load at runtime if large",
      });
    }
  }

  // Detect unused imports (simple heuristic)
  const importRegex = /import\s+\{([^}]+)\}\s+from/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const names = match[1]
      .split(",")
      .map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)
          .pop()!
          .trim(),
      )
      .filter(Boolean);
    for (const name of names) {
      if (name.startsWith("type ")) continue;
      const cleanName = name.replace(/^type\s+/, "");
      // Count occurrences beyond the import line itself
      const useCount = content.split(cleanName).length - 1;
      if (useCount <= 1) {
        issues.push({
          file: filepath,
          line: 1,
          issue: `Potentially unused import: ${cleanName}`,
          severity: "medium",
          suggestion: "Remove unused imports to reduce bundle size",
        });
      }
    }
  }

  return issues;
}

// ─── Circular Dependency Detection ──────────────────────────────────────────

function buildImportGraph(files: string[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const deps: string[] = [];
    const importPattern = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = importPattern.exec(content)) !== null) {
      if (m[1].startsWith(".")) {
        const resolved = join(f, "..", m[1]).replace(/\\/g, "/");
        deps.push(resolved);
      }
    }
    graph.set(f.replace(/\\/g, "/"), deps);
  }
  return graph;
}

function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    const deps = graph.get(node) || [];
    for (const dep of deps) {
      // Resolve extension-less imports
      const candidates = [dep, `${dep}.ts`, `${dep}.js`, `${dep}/index.ts`, `${dep}/index.js`];
      for (const c of candidates) {
        if (graph.has(c)) {
          dfs(c, [...path, node]);
          break;
        }
      }
    }
    stack.delete(node);
  }

  for (const node of graph.keys()) dfs(node, []);
  return cycles.slice(0, 10); // Cap cycles reported
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runBuildOptimize(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges build-optimize — Detect build-time inefficiencies

Usage:
  judges build-optimize [dir]
  judges build-optimize src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Detects: dynamic require(), barrel re-exports, inlined assets, polyfill imports,
unused imports, circular dependencies.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: BuildIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const graph = buildImportGraph(files);
  const cycles = findCycles(graph);

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 3 - cycles.length * 15);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          cycles,
          score,
          summary: { files: files.length, issues: allIssues.length, circularDeps: cycles.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ OPTIMIZED" : score >= 50 ? "⚠️  NEEDS WORK" : "❌ BLOATED";
    console.log(`\n  Build Optimization: ${badge} (${score}/100)\n  ──────────────────────────────`);

    if (allIssues.length > 0) {
      console.log("\n    Issues:");
      for (const issue of allIssues.slice(0, 30)) {
        const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
        console.log(`      ${icon} ${issue.issue}`);
        console.log(`          ${issue.file}:${issue.line}`);
        console.log(`          → ${issue.suggestion}`);
      }
      if (allIssues.length > 30) console.log(`      ... and ${allIssues.length - 30} more`);
    }

    if (cycles.length > 0) {
      console.log("\n    Circular Dependencies:");
      for (const cycle of cycles) {
        console.log(`      🔄 ${cycle.map((c) => c.split("/").pop()).join(" → ")}`);
      }
    }

    console.log(`\n    Score: ${score}/100 | Issues: ${allIssues.length} | Circular deps: ${cycles.length}\n`);
  }
}

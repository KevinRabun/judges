/**
 * Impact scan — detect ripple effects of AI-generated code across
 * the codebase: broken imports, unused exports, API contract breaks,
 * dependency chain issues.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname, relative, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImpactIssue {
  type: "broken-import" | "unused-export" | "api-contract" | "dependency-chain" | "naming-conflict";
  severity: "high" | "medium" | "low";
  file: string;
  detail: string;
  affectedFiles?: string[];
}

interface ImpactResult {
  targetFile: string;
  issues: ImpactIssue[];
  impactScore: number;
  affectedFileCount: number;
}

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const EXTS = new Set([".ts", ".js", ".py", ".java", ".cs", ".go", ".rb", ".php", ".rs"]);

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        if (EXTS.has(extname(name).toLowerCase())) result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const patterns = [
    /export\s+(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
    /export\s+default\s+(?:function|class)\s+(\w+)/g,
    /export\s*{\s*([^}]+)\s*}/g,
  ];
  for (const pat of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(content)) !== null) {
      if (pat === patterns[2]) {
        exports.push(
          ...m[1]
            .split(",")
            .map((s) =>
              s
                .trim()
                .split(/\s+as\s+/)[0]
                .trim(),
            )
            .filter(Boolean),
        );
      } else {
        exports.push(m[1]);
      }
    }
  }
  return exports;
}

function extractImports(content: string): { names: string[]; sources: string[] } {
  const names: string[] = [];
  const sources: string[] = [];
  const importRe = /import\s+(?:{([^}]+)}|(\w+))\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    sources.push(m[3]);
    if (m[1]) {
      names.push(
        ...m[1]
          .split(",")
          .map((s) =>
            s
              .trim()
              .split(/\s+as\s+/)[0]
              .trim(),
          )
          .filter(Boolean),
      );
    }
    if (m[2]) names.push(m[2]);
  }
  // require
  const reqRe = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = reqRe.exec(content)) !== null) sources.push(m[1]);
  return { names, sources };
}

function analyzeImpact(targetFile: string, allFiles: string[], baseDir: string): ImpactResult {
  const issues: ImpactIssue[] = [];
  const targetContent = readFileSync(targetFile, "utf-8");
  const targetRel = relative(baseDir, targetFile);
  const targetBase = basename(targetFile).replace(/\.\w+$/, "");

  const targetExports = extractExports(targetContent);
  const targetImports = extractImports(targetContent);

  // Build import graph from all other files
  const importers: { file: string; names: string[]; source: string }[] = [];
  const allExportsMap = new Map<string, string[]>();

  for (const f of allFiles) {
    if (f === targetFile) continue;
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const rel = relative(baseDir, f);
    allExportsMap.set(rel, extractExports(content));

    const { names, sources } = extractImports(content);
    for (const src of sources) {
      if (src.includes(targetBase) || src.endsWith("/" + targetBase)) {
        importers.push({ file: rel, names, source: src });
      }
    }
  }

  // 1. Check if target's imports reference valid sources
  for (const src of targetImports.sources) {
    if (src.startsWith(".")) {
      const resolved = allFiles.find((f) => {
        const rel = relative(baseDir, f).replace(/\\/g, "/");
        const srcNorm = src.replace(/^\.\//, "").replace(/\.\w+$/, "");
        return rel.replace(/\.\w+$/, "").endsWith(srcNorm);
      });
      if (!resolved) {
        issues.push({
          type: "broken-import",
          severity: "high",
          file: targetRel,
          detail: `Import "${src}" could not be resolved`,
        });
      }
    }
  }

  // 2. Find exports that nobody imports
  for (const exp of targetExports) {
    const usedAnywhere = allFiles.some((f) => {
      if (f === targetFile) return false;
      try {
        return readFileSync(f, "utf-8").includes(exp);
      } catch {
        return false;
      }
    });
    if (!usedAnywhere) {
      issues.push({
        type: "unused-export",
        severity: "low",
        file: targetRel,
        detail: `Export "${exp}" is not imported by any other file`,
      });
    }
  }

  // 3. Check naming conflicts
  for (const exp of targetExports) {
    const conflicts: string[] = [];
    for (const [file, exports] of allExportsMap) {
      if (exports.includes(exp)) conflicts.push(file);
    }
    if (conflicts.length > 0) {
      issues.push({
        type: "naming-conflict",
        severity: "medium",
        file: targetRel,
        detail: `Export "${exp}" also exported by: ${conflicts.join(", ")}`,
        affectedFiles: conflicts,
      });
    }
  }

  // 4. Check files importing target for potential breaks
  if (importers.length > 0) {
    const importerFiles = importers.map((i) => i.file);
    issues.push({
      type: "dependency-chain",
      severity: "medium",
      file: targetRel,
      detail: `${importers.length} file(s) depend on this module`,
      affectedFiles: importerFiles,
    });
  }

  // 5. API contract — detect exported function signature changes
  const fnSigs = targetContent.match(/export\s+(?:async\s+)?function\s+\w+\s*\([^)]*\)/g) || [];
  const paramCounts = fnSigs.map((sig) => {
    const params = sig.match(/\(([^)]*)\)/)?.[1] || "";
    return params.split(",").filter((p) => p.trim().length > 0).length;
  });
  const _highArity = paramCounts.filter((c) => c > 5).length;
  if (_highArity > 0) {
    issues.push({
      type: "api-contract",
      severity: "medium",
      file: targetRel,
      detail: `${_highArity} exported function(s) with >5 parameters — fragile API contract`,
    });
  }

  const affected = new Set<string>();
  for (const iss of issues) {
    if (iss.affectedFiles) iss.affectedFiles.forEach((f) => affected.add(f));
  }

  const impactScore = Math.max(
    0,
    100 -
      issues.filter((i) => i.severity === "high").length * 25 -
      issues.filter((i) => i.severity === "medium").length * 10 -
      issues.filter((i) => i.severity === "low").length * 3,
  );

  return { targetFile: targetRel, issues, impactScore, affectedFileCount: affected.size };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runImpactScan(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges impact-scan — Detect cross-file ripple effects

Usage:
  judges impact-scan <file>
  judges impact-scan src/api.ts --base-dir src/
  judges impact-scan <dir>       (scan all files)

Options:
  --base-dir <dir>    Base directory for resolution (default: .)
  --format json       JSON output
  --help, -h          Show this help

Checks:
  • Broken imports (unresolved local imports)
  • Unused exports (dead code)
  • Naming conflicts (duplicate export names)
  • Dependency chain (files that depend on this module)
  • API contract (fragile function signatures)
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const baseDir = argv.find((_a: string, i: number) => argv[i - 1] === "--base-dir") || ".";
  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  const allFiles = collectFiles(baseDir);
  let targetFiles: string[];
  try {
    readdirSync(target);
    targetFiles = collectFiles(target);
  } catch {
    targetFiles = [target];
  }

  const results: ImpactResult[] = [];
  for (const f of targetFiles) {
    results.push(analyzeImpact(f, allFiles, baseDir));
  }

  results.sort((a, b) => a.impactScore - b.impactScore);

  if (format === "json") {
    console.log(JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2));
  } else {
    console.log(
      `\n  Impact Scan — ${targetFiles.length} target(s), ${allFiles.length} total files\n  ──────────────────────────`,
    );

    for (const r of results) {
      if (r.issues.length === 0) continue;
      const icon = r.impactScore >= 80 ? "🟢" : r.impactScore >= 50 ? "🟡" : "🔴";
      console.log(
        `\n    ${icon} ${r.targetFile} — impact ${r.impactScore}/100 (${r.affectedFileCount} affected files)`,
      );
      for (const iss of r.issues) {
        const sev = iss.severity === "high" ? "🔴" : iss.severity === "medium" ? "🟠" : "🟡";
        console.log(`        ${sev} [${iss.type}] ${iss.detail}`);
      }
    }

    const clean = results.filter((r) => r.issues.length === 0).length;
    if (clean > 0) console.log(`\n    ✅ ${clean} file(s) have no cross-file impact issues`);
    console.log("");
  }
}

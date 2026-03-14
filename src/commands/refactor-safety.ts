/**
 * Refactor safety — analyze proposed refactorings for breaking changes,
 * incomplete migrations, orphaned references, and behavioral changes.
 *
 * Compares two directory snapshots or a list of changed files against
 * the broader codebase to detect incomplete refactors.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RefactorIssue {
  file: string;
  line: number;
  kind: string;
  message: string;
  severity: "high" | "medium" | "low";
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".java", ".cs", ".go", ".rs"]);

function collectFiles(dir: string, max = 500): string[] {
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
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
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

function extractExports(content: string): string[] {
  const exports: string[] = [];
  const exportRegex = /\bexport\s+(?:function|class|const|let|type|interface|enum)\s+(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = exportRegex.exec(content)) !== null) exports.push(m[1]);
  const defaultExport = /\bexport\s+default\s+(?:function|class)?\s*(\w+)?/g;
  while ((m = defaultExport.exec(content)) !== null) {
    if (m[1]) exports.push(m[1]);
  }
  return exports;
}

function extractImports(content: string): { names: string[]; source: string }[] {
  const imports: { names: string[]; source: string }[] = [];
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRegex.exec(content)) !== null) {
    const names = m[1]
      .split(",")
      .map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      )
      .filter(Boolean);
    imports.push({ names, source: m[2] });
  }
  return imports;
}

function analyzeRefactorSafety(files: string[], dir: string): RefactorIssue[] {
  const issues: RefactorIssue[] = [];

  // Build export map: symbol → file
  const exportMap = new Map<string, string>();
  const fileContents = new Map<string, string>();

  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    fileContents.set(f, content);
    const exports = extractExports(content);
    for (const exp of exports) {
      exportMap.set(exp, f);
    }
  }

  // Check for orphaned imports (importing symbols that no file exports)
  for (const [filePath, content] of fileContents) {
    const imports = extractImports(content);
    const lines = content.split("\n");

    for (const imp of imports) {
      // Only check local imports (starting with . or ..)
      if (!imp.source.startsWith(".")) continue;

      for (const name of imp.names) {
        // Check if any file exports this symbol
        if (!exportMap.has(name)) {
          const lineNum = lines.findIndex((l) => l.includes(name) && l.includes("import")) + 1;
          issues.push({
            file: filePath,
            line: lineNum || 1,
            kind: "orphaned-import",
            message: `Import '${name}' from '${imp.source}' — symbol not found in any scanned file exports`,
            severity: "high",
          });
        }
      }
    }
  }

  // Detect renamed/removed patterns
  for (const [filePath, content] of fileContents) {
    const lines = content.split("\n");

    // Check for TODO/FIXME indicating incomplete refactor
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/\/\/\s*(TODO|FIXME|HACK|XXX)\s*:?\s*(refactor|rename|migrate|move|deprecated)/i.test(line)) {
        issues.push({
          file: filePath,
          line: i + 1,
          kind: "incomplete-refactor-marker",
          message: `Found refactor marker: ${line.trim().substring(0, 80)}`,
          severity: "medium",
        });
      }
    }

    // Detect deprecated usage
    for (let i = 0; i < lines.length; i++) {
      if (/@deprecated/i.test(lines[i])) {
        // Find the symbol being deprecated
        const nextLine = lines[i + 1] || "";
        const symbolMatch = nextLine.match(/\b(function|class|const|let|var)\s+(\w+)/);
        if (symbolMatch) {
          const deprecatedName = symbolMatch[2];
          // Count references across codebase
          let refs = 0;
          for (const [otherFile, otherContent] of fileContents) {
            if (otherFile === filePath) continue;
            const regex = new RegExp(`\\b${deprecatedName}\\b`, "g");
            const matches = otherContent.match(regex);
            if (matches) refs += matches.length;
          }
          if (refs > 0) {
            issues.push({
              file: filePath,
              line: i + 1,
              kind: "deprecated-still-used",
              message: `@deprecated symbol '${deprecatedName}' still referenced ${refs} time(s) across codebase`,
              severity: "high",
            });
          }
        }
      }
    }

    // Detect type assertion overuse (potential behavioral change masking)
    const assertionCount = (content.match(/\bas\s+\w/g) || []).length;
    if (assertionCount > 10) {
      issues.push({
        file: filePath,
        line: 1,
        kind: "excessive-type-assertions",
        message: `${assertionCount} type assertions — may mask type incompatibilities from refactoring`,
        severity: "low",
      });
    }
  }

  // Detect dead files (files with exports but no imports from other files)
  for (const [filePath, content] of fileContents) {
    const exports = extractExports(content);
    if (exports.length === 0) continue;
    // Skip entry points
    const rel = relative(dir, filePath);
    if (rel.includes("index.") || rel.includes("main.") || rel.includes("cli.") || rel.includes("test")) continue;

    let referenced = false;
    for (const [otherFile, otherContent] of fileContents) {
      if (otherFile === filePath) continue;
      if (exports.some((exp) => otherContent.includes(exp))) {
        referenced = true;
        break;
      }
    }

    if (!referenced) {
      issues.push({
        file: filePath,
        line: 1,
        kind: "potentially-dead-file",
        message: `File exports [${exports.slice(0, 3).join(", ")}${exports.length > 3 ? "..." : ""}] but none appear imported elsewhere`,
        severity: "low",
      });
    }
  }

  return issues.sort((a, b) => {
    const sev: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return sev[b.severity] - sev[a.severity];
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRefactorSafety(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges refactor-safety — Analyze refactoring safety

Usage:
  judges refactor-safety [dir]
  judges refactor-safety src/ --severity high
  judges refactor-safety --format json

Options:
  [dir]                 Directory to scan (default: .)
  --severity <level>    Filter by minimum severity (high|medium|low)
  --format json         JSON output
  --help, -h            Show this help

Detects:
  • Orphaned imports (importing symbols that don't exist)
  • Deprecated symbols still in use
  • Incomplete refactor markers (TODO/FIXME with refactor keywords)
  • Excessive type assertions masking type changes
  • Potentially dead files (exported but never imported)
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const severityFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "low";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  if (!existsSync(dir)) {
    console.error(`  Directory not found: ${dir}`);
    return;
  }

  const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const minSev = severityOrder[severityFilter] || 1;

  const files = collectFiles(dir);
  const allIssues = analyzeRefactorSafety(files, dir).filter((x) => severityOrder[x.severity] >= minSev);

  if (format === "json") {
    console.log(
      JSON.stringify({ issues: allIssues, filesScanned: files.length, timestamp: new Date().toISOString() }, null, 2),
    );
  } else {
    console.log(
      `\n  Refactor Safety — ${files.length} files scanned, ${allIssues.length} issue(s)\n  ──────────────────────────`,
    );

    if (allIssues.length === 0) {
      console.log("  ✅ No refactoring safety issues detected");
    } else {
      const byKind = new Map<string, number>();
      for (const issue of allIssues) {
        byKind.set(issue.kind, (byKind.get(issue.kind) || 0) + 1);
      }

      console.log("\n  Summary:");
      for (const [kind, count] of byKind) {
        console.log(`    ${kind}: ${count}`);
      }

      console.log("\n  Details:");
      for (const issue of allIssues.slice(0, 50)) {
        const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "⚪";
        console.log(`    ${icon} [${issue.severity}] ${issue.file}:${issue.line}`);
        console.log(`        ${issue.message}`);
      }

      if (allIssues.length > 50) {
        console.log(`\n    ... and ${allIssues.length - 50} more`);
      }
    }
    console.log("");
  }
}

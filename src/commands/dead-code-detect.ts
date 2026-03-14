/**
 * Dead code detect — identify unreachable code, unused exports, and orphaned functions.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeadCodeIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

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

function analyzeFile(filepath: string, allContents: Map<string, string>): DeadCodeIssue[] {
  const issues: DeadCodeIssue[] = [];
  const content = allContents.get(filepath);
  if (!content) return issues;

  const lines = content.split("\n");

  // Collect exported symbols from this file
  const exports: { name: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const exportMatch = line.match(/export\s+(?:function|const|let|class|enum|type|interface)\s+(\w+)/);
    if (exportMatch) exports.push({ name: exportMatch[1], line: i + 1 });
    const namedExport = line.match(/export\s+\{\s*([^}]+)\s*\}/);
    if (namedExport) {
      for (const name of namedExport[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0])) {
        if (name) exports.push({ name, line: i + 1 });
      }
    }
  }

  // Check if exported symbols are imported anywhere else
  const relPath = relative(".", filepath)
    .replace(/\\/g, "/")
    .replace(/\.\w+$/, "");
  for (const exp of exports) {
    let foundImport = false;
    for (const [otherPath, otherContent] of allContents) {
      if (otherPath === filepath) continue;
      if (otherContent.includes(exp.name) && (otherContent.includes(relPath) || otherContent.includes(exp.name))) {
        const importPattern = new RegExp(`import\\s+.*\\b${exp.name}\\b.*from`);
        if (importPattern.test(otherContent) || new RegExp(`require\\(.*\\).*${exp.name}`).test(otherContent)) {
          foundImport = true;
          break;
        }
      }
    }
    if (!foundImport && !/index\.\w+$/.test(filepath) && !/default|main|cli|app|server/i.test(exp.name)) {
      issues.push({
        file: filepath,
        line: exp.line,
        issue: "Exported symbol never imported",
        severity: "medium",
        detail: `\`${exp.name}\` is exported but not imported by any other file — possible dead export`,
      });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Unreachable code after return/throw/continue/break
    if (/^\s*(?:return\b|throw\b|continue\b|break\b)/.test(line) && !/\/\/|\/\*/.test(line)) {
      const nextLine = lines[i + 1];
      if (
        nextLine &&
        /^\s+\S/.test(nextLine) &&
        !/^\s*\}/.test(nextLine) &&
        !/^\s*case\b/.test(nextLine) &&
        !/^\s*(?:catch|finally|else)/.test(nextLine)
      ) {
        issues.push({
          file: filepath,
          line: i + 2,
          issue: "Unreachable code after return/throw",
          severity: "high",
          detail: "Code after unconditional return/throw/break/continue will never execute",
        });
      }
    }

    // Variables assigned but never read
    if (/(?:const|let|var)\s+(\w+)\s*=/.test(line) && !/export/.test(line)) {
      const varMatch = line.match(/(?:const|let|var)\s+(\w+)\s*=/);
      if (varMatch) {
        const varName = varMatch[1];
        if (varName.length > 1 && !varName.startsWith("_")) {
          const restOfFile = lines.slice(i + 1).join("\n");
          const usagePattern = new RegExp(`\\b${varName}\\b`);
          if (!usagePattern.test(restOfFile)) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "Variable assigned but never used",
              severity: "low",
              detail: `\`${varName}\` is assigned but never referenced afterward — remove or prefix with _`,
            });
          }
        }
      }
    }

    // Dead else after exhaustive conditions
    if (/^\s*else\s*\{/.test(line)) {
      const prevBlock = lines.slice(Math.max(0, i - 5), i).join("\n");
      if (/return\s+(?:true|false);\s*\}\s*$/.test(prevBlock.trim())) {
        // Check if the if condition is exhaustive
        if (/if\s*\(\s*typeof\s+\w+\s*===/.test(prevBlock)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Possibly dead else branch",
            severity: "low",
            detail: "Else branch after exhaustive type check — may be unreachable",
          });
        }
      }
    }

    // Empty function bodies
    if (
      /(?:function|=>)\s*\{?\s*\}/.test(line) &&
      !/interface|type|abstract|declare|override|stub|mock|noop|placeholder/i.test(line)
    ) {
      if (!/test|spec|fixture/i.test(filepath)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Empty function body",
          severity: "low",
          detail: "Function with no implementation — intentional stub or dead code?",
        });
      }
    }

    // Condition that is always true or false
    if (/if\s*\(\s*(?:true|false|1|0)\s*\)/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Constant condition",
        severity: "medium",
        detail: "Condition is always true/false — dead branch or debugging artifact left in code",
      });
    }

    // Unused function parameters (non-callback, non-interface)
    if (/function\s+\w+\s*\(([^)]+)\)/.test(line) && !/interface|type|abstract|declare|override/i.test(line)) {
      const params = line.match(/function\s+\w+\s*\(([^)]+)\)/)?.[1];
      if (params) {
        const paramNames = params
          .split(",")
          .map((p) => p.trim().split(/[=:]/)[0].trim())
          .filter((p) => p && !p.startsWith("_") && !p.startsWith("..."));
        const funcBody = lines.slice(i + 1, Math.min(i + 40, lines.length)).join("\n");
        for (const p of paramNames) {
          if (p.length > 1 && !new RegExp(`\\b${p}\\b`).test(funcBody)) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "Unused function parameter",
              severity: "low",
              detail: `Parameter \`${p}\` is declared but never used in function body — remove or prefix with _`,
            });
          }
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runDeadCodeDetect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges dead-code-detect — Identify unreachable code, unused exports, and orphaned functions

Usage:
  judges dead-code-detect [dir]
  judges dead-code-detect src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: unreachable code after return/throw, unused exports, assigned-but-never-read variables,
dead else branches, empty functions, constant conditions, unused parameters.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allContents = new Map<string, string>();
  for (const f of files) {
    try {
      allContents.set(f, readFileSync(f, "utf-8"));
    } catch {
      /* skip */
    }
  }

  const allIssues: DeadCodeIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f, allContents));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 8 - medCount * 3);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { high: highCount, medium: medCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ CLEAN" : score >= 50 ? "⚠️  CLUTTERED" : "❌ BLOATED";
    console.log(`\n  Dead Code: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No dead code detected.\n");
      return;
    }

    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);

    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}

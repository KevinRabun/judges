/**
 * Spec conform — check code conformance to project conventions and style patterns.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConformIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

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

// ─── Project Convention Detection ───────────────────────────────────────────

interface ProjectConventions {
  useSemicolons: boolean | null;
  quoteStyle: "single" | "double" | null;
  indentStyle: "tabs" | "spaces" | null;
  indentSize: number | null;
  namingStyle: "camelCase" | "snake_case" | "PascalCase" | null;
  hasEslint: boolean;
  hasPrettier: boolean;
  hasEditorConfig: boolean;
  fileNamingPattern: "kebab-case" | "camelCase" | "PascalCase" | "snake_case" | null;
}

function detectConventions(dir: string, files: string[]): ProjectConventions {
  const conv: ProjectConventions = {
    useSemicolons: null,
    quoteStyle: null,
    indentStyle: null,
    indentSize: null,
    namingStyle: null,
    hasEslint: false,
    hasPrettier: false,
    hasEditorConfig: false,
    fileNamingPattern: null,
  };

  // Check for config files
  try {
    const entries = readdirSync(dir) as unknown as string[];
    conv.hasEslint = entries.some((e) => /^\.?eslint/.test(e));
    conv.hasPrettier = entries.some((e) => /^\.?prettier/.test(e));
    conv.hasEditorConfig = entries.includes(".editorconfig");
  } catch {
    /* skip */
  }

  // Analyze existing file conventions from first 20 files
  let semiCount = 0;
  let noSemiCount = 0;
  let singleQuote = 0;
  let doubleQuote = 0;
  let tabIndent = 0;
  let spaceIndent = 0;
  const indentSizes: number[] = [];
  let camelCount = 0;
  let snakeCount = 0;

  const sampleFiles = files.slice(0, 20);
  for (const filepath of sampleFiles) {
    let content: string;
    try {
      content = readFileSync(filepath, "utf-8");
    } catch {
      continue;
    }

    const fileLines = content.split("\n");
    for (const line of fileLines.slice(0, 50)) {
      // Semicolons
      if (/;\s*$/.test(line.trim()) && !/\/\/|\/\*|\*/.test(line.trim().slice(0, 2))) semiCount++;
      if (/[^;{}\s]\s*$/.test(line.trim()) && line.trim().length > 5 && !/\/\/|\/\*|\*|=>/.test(line.trim()))
        noSemiCount++;

      // Quotes
      const singles = (line.match(/'/g) || []).length;
      const doubles = (line.match(/"/g) || []).length;
      singleQuote += singles;
      doubleQuote += doubles;

      // Indentation
      const indent = line.match(/^(\s+)/);
      if (indent) {
        if (indent[1].includes("\t")) tabIndent++;
        else {
          spaceIndent++;
          indentSizes.push(indent[1].length);
        }
      }
    }

    // Variable naming
    const varDecls = content.match(/(?:const|let|var)\s+([a-z]\w+)/g) || [];
    for (const decl of varDecls) {
      const name = decl.split(/\s+/)[1];
      if (name.includes("_")) snakeCount++;
      else camelCount++;
    }
  }

  conv.useSemicolons = semiCount > noSemiCount * 2 ? true : noSemiCount > semiCount * 2 ? false : null;
  conv.quoteStyle = singleQuote > doubleQuote * 1.5 ? "single" : doubleQuote > singleQuote * 1.5 ? "double" : null;
  conv.indentStyle = tabIndent > spaceIndent ? "tabs" : spaceIndent > tabIndent ? "spaces" : null;
  if (indentSizes.length > 0) {
    const mode = indentSizes.sort((a, b) => a - b)[Math.floor(indentSizes.length / 2)];
    conv.indentSize = mode <= 4 ? mode : null;
  }
  conv.namingStyle = camelCount > snakeCount * 2 ? "camelCase" : snakeCount > camelCount * 2 ? "snake_case" : null;

  // File naming pattern
  const fileNames = files.map((f) => basename(f, extname(f)));
  const kebab = fileNames.filter((n) => /^[a-z][a-z0-9-]*$/.test(n)).length;
  const camel = fileNames.filter((n) => /^[a-z][a-zA-Z0-9]*$/.test(n) && /[A-Z]/.test(n)).length;
  const pascal = fileNames.filter((n) => /^[A-Z][a-zA-Z0-9]*$/.test(n)).length;
  const snake = fileNames.filter((n) => /^[a-z][a-z0-9_]*$/.test(n) && n.includes("_")).length;
  const counts = [
    { style: "kebab-case" as const, count: kebab },
    { style: "camelCase" as const, count: camel },
    { style: "PascalCase" as const, count: pascal },
    { style: "snake_case" as const, count: snake },
  ].sort((a, b) => b.count - a.count);
  if (counts[0].count > files.length * 0.5) conv.fileNamingPattern = counts[0].style;

  return conv;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string, conv: ProjectConventions): ConformIssue[] {
  const issues: ConformIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const fname = basename(filepath, extname(filepath));

  // File naming convention
  if (conv.fileNamingPattern === "kebab-case" && !/^[a-z][a-z0-9.-]*$/.test(fname) && !fname.startsWith("_")) {
    issues.push({
      file: filepath,
      line: 1,
      issue: "File name breaks project convention",
      severity: "low",
      detail: `Project uses kebab-case filenames but this file is named \`${fname}\``,
    });
  }
  if (conv.fileNamingPattern === "PascalCase" && !/^[A-Z]/.test(fname)) {
    issues.push({
      file: filepath,
      line: 1,
      issue: "File name breaks project convention",
      severity: "low",
      detail: `Project uses PascalCase filenames but this file is named \`${fname}\``,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Semicolon consistency
    if (conv.useSemicolons === true && /[a-zA-Z0-9)\]'"]\s*$/.test(trimmed) && trimmed.length > 10) {
      if (
        !/^\s*(?:\/\/|\/\*|\*|import|export|if|else|for|while|do|switch|try|catch|finally|class|interface|type|enum|function|=>|\{|\}|\(|\)|,)/.test(
          trimmed,
        )
      ) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Missing semicolon (project uses semicolons)",
          severity: "low",
          detail: "Line ends without semicolon — inconsistent with project style",
        });
      }
    }

    // Quote style consistency
    if (conv.quoteStyle === "single" && /"[^"]*"/.test(trimmed) && !/import\s/.test(trimmed)) {
      if (!trimmed.includes("'") && !trimmed.includes("`") && !/console\.|require|JSON/.test(trimmed)) {
        // Only flag if it's clearly a string, not a JSON key or HTML attribute
        const dqCount = (trimmed.match(/"/g) || []).length;
        if (dqCount === 2) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Double quotes (project uses single)",
            severity: "low",
            detail: "Project convention is single quotes — AI generated double-quoted string",
          });
        }
      }
    }

    // Variable naming convention
    if (conv.namingStyle === "camelCase") {
      const snakeMatch = trimmed.match(/(?:const|let|var)\s+([a-z]+_[a-z_]+)/);
      if (snakeMatch) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "snake_case variable in camelCase project",
          severity: "medium",
          detail: `\`${snakeMatch[1]}\` uses snake_case — project convention is camelCase`,
        });
      }
    }
    if (conv.namingStyle === "snake_case") {
      const camelMatch = trimmed.match(/(?:const|let|var)\s+([a-z]+[A-Z]\w+)/);
      if (camelMatch) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "camelCase variable in snake_case project",
          severity: "medium",
          detail: `\`${camelMatch[1]}\` uses camelCase — project convention is snake_case`,
        });
      }
    }

    // Mixed indentation
    if (conv.indentStyle === "spaces" && /^\t/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Tab indentation in spaces-only project",
        severity: "low",
        detail: "Project uses spaces for indentation — AI generated tab-indented code",
      });
    }
    if (conv.indentStyle === "tabs" && /^ {2,}/.test(line) && !/^\s*\*/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Space indentation in tabs-only project",
        severity: "low",
        detail: "Project uses tabs for indentation — AI generated space-indented code",
      });
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runSpecConform(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges spec-conform — Check code conformance to project conventions

Usage:
  judges spec-conform [dir]
  judges spec-conform src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Auto-detects: semicolon usage, quote style, indentation, variable naming, file naming.
Flags AI-generated code that breaks detected project conventions.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const conv = detectConventions(dir, files);

  const allIssues: ConformIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f, conv));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 4 - allIssues.filter((i) => i.severity === "low").length);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          conventions: conv,
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
    const badge = score >= 80 ? "✅ CONFORMING" : score >= 50 ? "⚠️  DRIFTING" : "❌ NONCONFORMING";
    console.log(`\n  Spec Conform: ${badge} (${score}/100)\n  ─────────────────────────────`);
    console.log(
      `    Detected: semis=${conv.useSemicolons ?? "?"} quotes=${conv.quoteStyle ?? "?"} indent=${conv.indentStyle ?? "?"}(${conv.indentSize ?? "?"}) naming=${conv.namingStyle ?? "?"} files=${conv.fileNamingPattern ?? "?"}`,
    );
    if (allIssues.length === 0) {
      console.log("    No convention violations detected.\n");
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

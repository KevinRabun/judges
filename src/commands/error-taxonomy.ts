/**
 * Error taxonomy — classify and standardize error codes, messages, and
 * hierarchies across a codebase.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ErrorDef {
  file: string;
  line: number;
  code: string;
  message: string;
  kind: "class" | "constant" | "throw" | "status";
}

interface TaxonomyIssue {
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
  examples: string[];
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs"]);

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

// ─── Extraction ─────────────────────────────────────────────────────────────

function extractErrors(filepath: string): ErrorDef[] {
  const errors: ErrorDef[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return errors;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Error class definitions
    const classMatch = line.match(/class\s+(\w*Error\w*)\s+extends/);
    if (classMatch) {
      errors.push({ file: filepath, line: i + 1, code: classMatch[1], message: "", kind: "class" });
    }

    // Error code constants
    const constMatch = line.match(
      /(?:const|export\s+const|static\s+readonly)\s+(\w*(?:ERR|ERROR|CODE)\w*)\s*[:=]\s*['"]([^'"]+)['"]/i,
    );
    if (constMatch) {
      errors.push({ file: filepath, line: i + 1, code: constMatch[1], message: constMatch[2], kind: "constant" });
    }

    // throw new Error
    const throwMatch = line.match(/throw\s+new\s+(\w*Error)\s*\(\s*['"`]([^'"`]{3,}?)['"`]/);
    if (throwMatch) {
      errors.push({ file: filepath, line: i + 1, code: throwMatch[1], message: throwMatch[2], kind: "throw" });
    }

    // HTTP status codes in responses
    const statusMatch = line.match(/(?:status|statusCode|res\.status)\s*[:=(]\s*(\d{3})/);
    if (statusMatch) {
      const msgMatch = line.match(/(?:message|msg|error)\s*[:=]\s*['"`]([^'"`]+)['"`]/);
      errors.push({
        file: filepath,
        line: i + 1,
        code: `HTTP_${statusMatch[1]}`,
        message: msgMatch?.[1] || "",
        kind: "status",
      });
    }
  }

  return errors;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeErrors(allErrors: ErrorDef[]): TaxonomyIssue[] {
  const issues: TaxonomyIssue[] = [];

  // Duplicate error messages
  const msgMap = new Map<string, ErrorDef[]>();
  for (const e of allErrors) {
    if (e.message) {
      const key = e.message.toLowerCase().trim();
      if (!msgMap.has(key)) msgMap.set(key, []);
      msgMap.get(key)!.push(e);
    }
  }
  const dupes = [...msgMap.entries()].filter(([, v]) => v.length > 1);
  if (dupes.length > 0) {
    issues.push({
      issue: `${dupes.length} duplicate error message(s)`,
      severity: "medium",
      detail: "Same message thrown from multiple places — consolidate into error constants",
      examples: dupes.slice(0, 5).map(([msg, defs]) => `"${msg}" in ${defs.length} places`),
    });
  }

  // Inconsistent naming
  const errorClasses = allErrors.filter((e) => e.kind === "class").map((e) => e.code);
  const mixedCase = errorClasses.filter((c) => /Error$/i.test(c) && !/Error$/.test(c));
  if (mixedCase.length > 0) {
    issues.push({
      issue: "Inconsistent error class naming",
      severity: "low",
      detail: "Some error classes don't follow PascalCase + Error suffix convention",
      examples: mixedCase.slice(0, 5),
    });
  }

  // Bare Error throws (no custom class)
  const bareThrows = allErrors.filter((e) => e.kind === "throw" && e.code === "Error");
  if (bareThrows.length > 5) {
    issues.push({
      issue: `${bareThrows.length} bare Error throws`,
      severity: "high",
      detail: "Throwing plain Error makes catch handling harder — use typed error classes",
      examples: bareThrows.slice(0, 5).map((e) => `${e.file}:${e.line} — "${e.message.slice(0, 50)}"`),
    });
  }

  // Missing error codes
  const constants = allErrors.filter((e) => e.kind === "constant");
  const throws = allErrors.filter((e) => e.kind === "throw");
  if (throws.length > 10 && constants.length === 0) {
    issues.push({
      issue: "No error code constants",
      severity: "high",
      detail: "Define error codes for machine-readable error handling (e.g., ERR_AUTH_FAILED)",
      examples: throws.slice(0, 3).map((t) => `${t.file}:${t.line}`),
    });
  }

  // Inconsistent HTTP status usage
  const statusDefs = allErrors.filter((e) => e.kind === "status");
  const statusCodes = new Map<string, number>();
  for (const s of statusDefs) {
    statusCodes.set(s.code, (statusCodes.get(s.code) || 0) + 1);
  }
  const overusedStatuses = [...statusCodes.entries()].filter(([, count]) => count > 10);
  if (overusedStatuses.length > 0) {
    issues.push({
      issue: "HTTP status code overuse",
      severity: "medium",
      detail: "Same status code used extensively — consider more specific error responses",
      examples: overusedStatuses.map(([code, count]) => `${code} used ${count} times`),
    });
  }

  // Generic messages
  const genericMsgs = allErrors.filter(
    (e) => e.message && /^(error|something went wrong|unknown error|internal error|failed)$/i.test(e.message.trim()),
  );
  if (genericMsgs.length > 0) {
    issues.push({
      issue: `${genericMsgs.length} generic error message(s)`,
      severity: "high",
      detail: "Vague error messages impede debugging — include context (what failed, why, and what to try)",
      examples: genericMsgs.slice(0, 5).map((e) => `${e.file}:${e.line} — "${e.message}"`),
    });
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runErrorTaxonomy(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges error-taxonomy — Classify and standardize error codes and messages

Usage:
  judges error-taxonomy [dir]
  judges error-taxonomy src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: duplicate messages, inconsistent naming, bare Error throws, missing error codes,
generic messages, HTTP status overuse.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allErrors: ErrorDef[] = [];
  for (const f of files) allErrors.push(...extractErrors(f));

  const issues = analyzeErrors(allErrors);
  const highCount = issues.filter((i) => i.severity === "high").length;
  const score = Math.max(0, 100 - highCount * 15 - issues.length * 5);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          errors: allErrors.length,
          issues,
          score,
          summary: {
            classes: allErrors.filter((e) => e.kind === "class").length,
            constants: allErrors.filter((e) => e.kind === "constant").length,
            throws: allErrors.filter((e) => e.kind === "throw").length,
            issues: issues.length,
          },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ CONSISTENT" : score >= 50 ? "⚠️  INCONSISTENT" : "❌ CHAOTIC";
    console.log(`\n  Error Taxonomy: ${badge} (${score}/100)\n  ─────────────────────────────`);
    console.log(
      `    Error definitions: ${allErrors.length} | Classes: ${allErrors.filter((e) => e.kind === "class").length} | Constants: ${allErrors.filter((e) => e.kind === "constant").length} | Throws: ${allErrors.filter((e) => e.kind === "throw").length}\n`,
    );

    if (issues.length === 0) {
      console.log("    No taxonomy issues detected.\n");
      return;
    }

    for (const issue of issues) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.detail}`);
      for (const ex of issue.examples) {
        console.log(`        • ${ex}`);
      }
    }

    console.log(`\n    Score: ${score}/100\n`);
  }
}

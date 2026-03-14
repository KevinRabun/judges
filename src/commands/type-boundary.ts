/**
 * Type boundary — check type safety at serialization boundaries.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TypeBoundaryIssue {
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

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string): TypeBoundaryIssue[] {
  const issues: TypeBoundaryIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // JSON.parse without validation
    if (/JSON\.parse\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      // Check for type assertion without validation
      if (/as\s+\w+/.test(line) || /as\s+\w+/.test(lines[i + 1] || "")) {
        if (!/zod|joi|yup|ajv|validate|schema|assert|guard|is\w+\(/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "JSON.parse with unchecked type assertion",
            severity: "high",
            detail: "Type assertion on parsed JSON without runtime validation — external data shape is unverified",
          });
        }
      }
      // JSON.parse returning any without narrowing
      if (!/:\s*\w+\s*=|as\s+\w+|validate|parse|schema/i.test(line) && !/validate|schema|guard/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "JSON.parse result used without validation",
          severity: "medium",
          detail: "Parsed JSON used directly — add runtime type checking for external data",
        });
      }
    }

    // Unchecked 'as' cast on external data sources
    if (/\bas\s+(?!const\b)\w+/.test(line)) {
      if (/(?:response|body|data|result|payload|params|query|req\.|res\.)/.test(line)) {
        const block = lines.slice(Math.max(0, i - 3), Math.min(i + 3, lines.length)).join("\n");
        if (!/validate|schema|guard|assert|instanceof|typeof|zod|joi|ajv/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Type assertion on external data",
            severity: "high",
            detail: "Casting external data with 'as' bypasses type safety — validate at boundary",
          });
        }
      }
    }

    // @ts-ignore or @ts-expect-error suppressing boundary checks
    if (/@ts-ignore|@ts-expect-error/.test(line)) {
      const nextLine = lines[i + 1] || "";
      if (/parse|response|body|fetch|axios|request|query/i.test(nextLine)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Type suppression at data boundary",
          severity: "high",
          detail: "ts-ignore/ts-expect-error hides type errors at external boundary — fix the types instead",
        });
      }
    }

    // any type at API boundary
    if (/:\s*any\b/.test(line)) {
      if (
        /(?:request|response|handler|controller|route|api|endpoint|middleware)/i.test(line) ||
        /(?:req|res|ctx|context|body|params|query)/i.test(line)
      ) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "'any' type at API boundary",
          severity: "medium",
          detail: "Using 'any' at API boundary loses type safety — define explicit request/response types",
        });
      }
    }

    // SQL query results used without type checking
    if (/\.query\s*\(|\.raw\s*\(|\.execute\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (/as\s+\w+/.test(block) && !/validate|schema|guard|rows\.\w+/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "SQL result with unchecked type assertion",
          severity: "medium",
          detail: "Query result cast without validation — column types may differ from TypeScript types",
        });
      }
    }

    // process.env without validation
    if (/process\.env\.\w+/.test(line)) {
      if (!/!\s*$|as\s+string|\?\?|[|][|]|if\s*\(|assert|env.*schema|zod|joi/i.test(line)) {
        // Only flag if used directly without null check
        const block = lines.slice(Math.max(0, i - 2), Math.min(i + 2, lines.length)).join("\n");
        if (!/if\s*\(|[?][?]|\|\||assert|throw|env.*config/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "process.env used without validation",
            severity: "low",
            detail: "Environment variable used without null check — may be undefined at runtime",
          });
        }
      }
    }

    // FormData/URLSearchParams parsed without validation
    if (/FormData|URLSearchParams|formData|searchParams/i.test(line) && /\.get\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
      if (!/validate|schema|typeof|instanceof|zod|joi/i.test(block)) {
        if (/as\s+\w+/.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Form data cast without validation",
            severity: "medium",
            detail: "Form/URL params cast without validation — user input shape is unverified",
          });
        }
      }
    }

    // Protobuf/gRPC decode without validation
    if (/\.decode\s*\(|\.deserialize|\.fromBinary|\.fromJSON/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/validate|verify|check|schema/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Deserialization without validation",
          severity: "medium",
          detail: "Decoded protobuf/binary data not validated — may contain unexpected fields or types",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTypeBoundary(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges type-boundary — Check type safety at serialization boundaries

Usage:
  judges type-boundary [dir]
  judges type-boundary src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: JSON.parse without validation, unchecked 'as' casts on external data,
ts-ignore at boundaries, 'any' at API boundaries, SQL result casting,
unvalidated env vars, form data casting, protobuf decode.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: TypeBoundaryIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

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
    const badge = score >= 80 ? "✅ SAFE" : score >= 50 ? "⚠️  LEAKY" : "❌ UNSAFE";
    console.log(`\n  Type Boundaries: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No type boundary issues detected.\n");
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

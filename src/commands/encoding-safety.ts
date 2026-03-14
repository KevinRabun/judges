/**
 * Encoding safety — detect encoding mismatches, unsafe deserialization, and injection risks.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EncodingIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
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

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string): EncodingIssue[] {
  const issues: EncodingIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // eval() on dynamic input
    if (/\beval\s*\(/.test(line)) {
      if (!/eslint-disable|\/\/\s*safe|test|spec|fixture/i.test(line) && !/test|spec|fixture/i.test(filepath)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "eval() usage",
          severity: "high",
          detail: "eval() executes arbitrary code — use JSON.parse, Function(), or AST-based alternatives",
        });
      }
    }

    // Python pickle.loads / marshal.loads
    if (/pickle\.loads?\s*\(|marshal\.loads?\s*\(|yaml\.load\s*\(/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
      if (!/safe_load|SafeLoader/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Unsafe deserialization",
          severity: "high",
          detail: "pickle/marshal/yaml.load can execute arbitrary code — use safe alternatives",
        });
      }
    }

    // Template literal interpolation into structured formats
    if (/`[^`]*\$\{/.test(line)) {
      if (/SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "SQL interpolation via template literal",
          severity: "high",
          detail: "Variable interpolated into SQL string — use parameterized queries",
        });
      }
      if (/<\w+[^>]*>/.test(line) && /\$\{/.test(line)) {
        if (!/sanitize|escape|encode|DOMPurify|xss/i.test(line)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "HTML interpolation without escaping",
            severity: "high",
            detail: "Variable interpolated into HTML — sanitize to prevent XSS",
          });
        }
      }
    }

    // String concatenation into XML/JSON
    if (/['"]<\?xml|['"]<\w+/.test(line) && /\+\s*\w+/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "String concatenation into XML",
        severity: "medium",
        detail: "Building XML via string concatenation — use a builder/serializer to prevent injection",
      });
    }

    // Base64 decode without validation
    if (/atob\s*\(|Buffer\.from\s*\([^,]+,\s*['"]base64['"]|base64\.b64decode/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/try|catch|validate|verify|check|schema/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Base64 decode without validation",
          severity: "medium",
          detail: "Decoding Base64 without try/catch — malformed input causes runtime errors",
        });
      }
    }

    // Mixed encoding (readFile without specifying encoding)
    if (/readFile(?:Sync)?\s*\(\s*\w+\s*\)/.test(line)) {
      if (!/utf-8|utf8|encoding|binary|buffer/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "File read without encoding specification",
          severity: "low",
          detail: "readFile without encoding returns Buffer — specify 'utf-8' for text processing",
        });
      }
    }

    // URL encoding/decoding asymmetry
    if (/encodeURI\s*\(/.test(line) && !line.includes("encodeURIComponent")) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "encodeURI vs encodeURIComponent",
        severity: "medium",
        detail: "encodeURI doesn't encode /:@!$&'()*+,;= — use encodeURIComponent for query values",
      });
    }

    // JSON.stringify in URL without encoding
    if (/JSON\.stringify/.test(line) && /url|href|src|query|param/i.test(line)) {
      if (!/encodeURI|encodeURIComponent|URLSearchParams/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "JSON in URL without encoding",
          severity: "medium",
          detail: "JSON placed in URL without encoding — special characters will break the URL",
        });
      }
    }

    // innerHTML / dangerouslySetInnerHTML
    if (/\.innerHTML\s*=|dangerouslySetInnerHTML/i.test(line)) {
      const block = lines.slice(Math.max(0, i - 2), Math.min(i + 2, lines.length)).join("\n");
      if (!/sanitize|DOMPurify|escape|encode|trusted|xss/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "innerHTML without sanitization",
          severity: "high",
          detail: "Setting innerHTML without sanitization — XSS vulnerability",
        });
      }
    }

    // document.write
    if (/document\.write\s*\(/.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "document.write usage",
        severity: "medium",
        detail: "document.write can be exploited for DOM-based XSS — use DOM APIs instead",
      });
    }

    // RegExp constructor with unsanitized input
    if (/new\s+RegExp\s*\(\s*\w+/.test(line)) {
      if (!/escape|sanitize|quote|literal/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "RegExp from variable without escaping",
          severity: "medium",
          detail: "Dynamic RegExp without escaping special characters — ReDoS or unexpected matching risk",
        });
      }
    }

    // Deserialization: BinaryFormatter, ObjectInputStream
    if (/BinaryFormatter|ObjectInputStream|Serializable.*readObject|unserialize\s*\(/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Unsafe binary deserialization",
        severity: "high",
        detail: "Binary deserialization of untrusted data can execute arbitrary code",
      });
    }

    // Content-Type mismatch
    if (/setHeader\s*\(\s*['"]Content-Type['"]\s*,/.test(line)) {
      if (/text\/plain/i.test(line)) {
        const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
        if (/JSON\.stringify|\.json\s*\(/.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Content-Type mismatch",
            severity: "medium",
            detail: "Content-Type set to text/plain but sending JSON — clients may misinterpret the response",
          });
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runEncodingSafety(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges encoding-safety — Detect encoding mismatches, injection, and unsafe deserialization

Usage:
  judges encoding-safety [dir]
  judges encoding-safety src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: eval(), unsafe deserialization (pickle, marshal, yaml.load), SQL/HTML/XML interpolation,
Base64 validation, encoding asymmetry, innerHTML XSS, RegExp injection, Content-Type mismatch.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: EncodingIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 4);

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
    const badge = score >= 80 ? "✅ SAFE" : score >= 50 ? "⚠️  RISKY" : "❌ DANGEROUS";
    console.log(`\n  Encoding Safety: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No encoding safety issues detected.\n");
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

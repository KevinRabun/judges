/**
 * Input guard — verify all system entry points have proper input validation.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface InputGuardIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go"]);

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

function analyzeFile(filepath: string): InputGuardIssue[] {
  const issues: InputGuardIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const fullText = content;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Route handler without validation
    if (/(?:router|app)\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]/.test(line)) {
      const handlerBlock = lines.slice(i, Math.min(i + 20, lines.length)).join("\n");
      if (/req\.body|req\.params|req\.query/i.test(handlerBlock)) {
        if (
          !/zod|joi|yup|ajv|class-validator|validate|schema|express-validator|celebrate|superstruct/i.test(handlerBlock)
        ) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Route handler without input validation",
            severity: "high",
            detail:
              "Request body/params/query used without validation library — vulnerable to injection and type confusion",
          });
        }
      }
    }

    // Direct req.body property access without checking
    if (/req\.body\.(\w+)/.test(line) || /request\.body\.(\w+)/.test(line)) {
      const prop = line.match(/(?:req|request)\.body\.(\w+)/)?.[1];
      const block = lines.slice(Math.max(0, i - 3), Math.min(i + 3, lines.length)).join("\n");
      if (!/typeof|instanceof|validate|schema|zod|joi|if\s*\(|assert|guard|check/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Direct request body access without type check",
          severity: "medium",
          detail: `\`req.body.${prop}\` accessed without type validation — may be undefined, wrong type, or malicious`,
        });
      }
    }

    // SQL query with string interpolation
    if (/`[^`]*\$\{.*req\.|`[^`]*\$\{.*params\.|`[^`]*\$\{.*query\./i.test(line)) {
      if (/SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "SQL query with string interpolation from user input",
          severity: "high",
          detail: "User input interpolated into SQL — use parameterized queries to prevent SQL injection",
        });
      }
    }

    // Command injection risk
    if (/exec\s*\(|execSync\s*\(|spawn\s*\(|child_process/i.test(line)) {
      if (/req\.|params\.|query\.|body\.|user.*input|args\[/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "User input in shell command",
          severity: "high",
          detail: "User-supplied data passed to shell execution — command injection risk",
        });
      }
    }

    // Missing Content-Type check on POST/PUT
    if (/(?:app|router)\.\s*(?:post|put|patch)\s*\(/.test(line)) {
      const handlerBlock = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      if (
        /req\.body/i.test(handlerBlock) &&
        !/content-type|bodyParser|express\.json|express\.urlencoded|multer/i.test(fullText)
      ) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "POST handler without body parser",
          severity: "medium",
          detail: "Handler reads req.body but no body parser middleware detected — body may be undefined",
        });
      }
    }

    // GraphQL resolver without input validation
    if (/(?:resolve|resolver)\s*[:(]/.test(line) && /graphql|gql|typeDefs|schema/i.test(fullText)) {
      const block = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      if (/args\.\w+|input\.\w+/i.test(block) && !/validate|schema|zod|joi|check|guard|assert/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "GraphQL resolver without input validation",
          severity: "medium",
          detail: "Resolver uses args/input without validation — GraphQL types alone don't prevent malicious values",
        });
      }
    }

    // File upload without size/type check
    if (/multer|upload|req\.file|req\.files/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");
      if (!/limits|fileSize|maxSize|fileFilter|mimetype|accept/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "File upload without size/type restrictions",
          severity: "high",
          detail: "File upload handler lacks size limits or type filtering — DoS and malicious upload risk",
        });
      }
    }

    // parseInt/Number without bounds check
    if (/parseInt\s*\(\s*(?:req|params|query|body)\.|Number\s*\(\s*(?:req|params|query|body)\./i.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/isNaN|isFinite|Math\.min|Math\.max|clamp|>=|<=|>|</i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Numeric input without bounds check",
          severity: "medium",
          detail: "User input parsed to number without NaN or range check — can cause unexpected behavior",
        });
      }
    }

    // Regex from user input (ReDoS risk)
    if (/new RegExp\s*\(\s*(?:req|params|query|body|input|user)/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Regex from user input",
        severity: "high",
        detail: "User-supplied value used as regex pattern — ReDoS (Regular Expression Denial of Service) risk",
      });
    }

    // URL/redirect without validation
    if (
      /(?:redirect|location)\s*[:=]\s*(?:req|params|query|body)\./i.test(line) ||
      /res\.redirect\s*\(\s*(?:req|params)/i.test(line)
    ) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/whitelist|allowedUrls|allowedDomains|startsWith|URL\(|validateUrl|safeRedirect/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Open redirect from user input",
          severity: "high",
          detail: "Redirect URL from user input without domain validation — open redirect vulnerability",
        });
      }
    }

    // Array length from user input
    if (
      /\.length\s*[<>=].*(?:req|params|query|limit|offset|page)/i.test(line) ||
      /(?:limit|offset|page|size)\s*=.*(?:req|params|query)/i.test(line)
    ) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (!/Math\.min|clamp|MAX_|LIMIT|maxResults|<=\s*\d+/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Unbounded pagination parameter",
          severity: "medium",
          detail: "Pagination parameter from user input without upper bound — can request excessive data",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runInputGuard(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges input-guard — Verify entry points have proper input validation

Usage:
  judges input-guard [dir]
  judges input-guard src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: route handlers without validation, SQL injection, command injection, missing body parsers,
file upload limits, numeric bounds, ReDoS from user regex, open redirects, unbounded pagination.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: InputGuardIssue[] = [];
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
    const badge = score >= 80 ? "✅ GUARDED" : score >= 50 ? "⚠️  POROUS" : "❌ EXPOSED";
    console.log(`\n  Input Safety: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No input validation issues detected.\n");
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

/**
 * Security-theater — detect security-looking code that provides no actual protection.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TheaterIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".cs"]);

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

function analyzeFile(filepath: string): TheaterIssue[] {
  const issues: TheaterIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    // Weak password hashing
    if (
      /(?:createHash|hashlib\.)\s*\(\s*['"](?:md5|sha1)['"]\s*\)/.test(line) &&
      /password|passwd|pwd/i.test(lines.slice(Math.max(0, i - 3), i + 3).join(" "))
    ) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Weak password hashing (MD5/SHA1)",
        severity: "high",
        detail: "MD5/SHA1 are not appropriate for password hashing — use bcrypt, scrypt, or argon2",
      });
    }

    // Hardcoded encryption keys/IVs
    if (
      /(?:key|iv|secret|password)\s*[:=]\s*['"][A-Za-z0-9+/=]{8,}['"]/.test(line) &&
      /(?:cipher|encrypt|decrypt|crypto|aes|des)/i.test(lines.slice(Math.max(0, i - 5), i + 5).join(" "))
    ) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Hardcoded encryption key or IV",
        severity: "high",
        detail: "Encryption keys/IVs must not be hardcoded — use environment variables or key management services",
      });
    }

    // Wildcard CORS with auth
    if (/['"]Access-Control-Allow-Origin['"]\s*[:,]\s*['"]\s*[*]\s*['"]/.test(line)) {
      const nearby = lines.slice(i, Math.min(i + 10, lines.length)).join(" ");
      if (/(?:authorization|cookie|credentials|auth)/i.test(nearby)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "CORS wildcard (*) with authentication",
          severity: "high",
          detail: "Access-Control-Allow-Origin: * combined with authentication bypasses same-origin policy protections",
        });
      } else {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "CORS wildcard (*)",
          severity: "medium",
          detail: "CORS wildcard allows any origin — restrict to trusted domains unless truly public",
        });
      }
    }

    // CSRF token generated but never verified
    if (/csrf[_-]?token|csrfToken|_csrf/i.test(line) && /generate|create|set|assign/i.test(line)) {
      const fileContent = content;
      if (!/csrf.*verif|verify.*csrf|csrf.*valid|csrfProtection|csurf/i.test(fileContent)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "CSRF token generated but never verified",
          severity: "high",
          detail: "CSRF tokens must be verified on the server side — generation alone provides no protection",
        });
      }
    }

    // Rate limiting that is too lenient
    if (/rateLimit|rate[_-]?limit/i.test(line)) {
      const context = lines.slice(i, Math.min(i + 5, lines.length)).join(" ");
      const limitMatch = context.match(/(?:max|limit|windowMs|window)\s*[:=]\s*(\d+)/);
      if (limitMatch) {
        const val = parseInt(limitMatch[1], 10);
        if (/max|limit/i.test(limitMatch[0]) && val >= 10000) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Ineffective rate limiting (limit too high)",
            severity: "medium",
            detail: `Rate limit of ${val} requests is too permissive to be protective`,
          });
        }
      }
    }

    // Validation without authorization
    if (/(?:validate|sanitize|check)\s*\(\s*(?:req|request)/.test(line) || /(?:joi|yup|zod)\s*\./.test(line)) {
      if (/(?:body|params|query)/.test(line)) {
        const nearby = lines.slice(Math.max(0, i - 10), Math.min(i + 10, lines.length)).join(" ");
        if (!/(?:auth|authorize|isAuthenticated|requireAuth|passport|jwt|token|session)/.test(nearby)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Input validation without authorization check",
            severity: "medium",
            detail:
              "Validating input without checking authorization — an unauthenticated user could send valid-looking data",
          });
        }
      }
    }

    // Client-side only validation
    if (
      /(?:disabled|readonly|hidden)\s*[=:]\s*(?:true|['"]true['"])/.test(line) &&
      /(?:submit|form|action)/i.test(lines.slice(Math.max(0, i - 5), i + 5).join(" "))
    ) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Client-side-only form restriction",
        severity: "medium",
        detail: "disabled/readonly/hidden form attributes can be bypassed — enforce restrictions server-side",
      });
    }

    // Base64 used as encryption
    if (/(?:btoa|atob|Buffer\.from\([^)]*,\s*['"]base64['"]|base64[_-]?encode|base64[_-]?decode)/i.test(line)) {
      const nearby = lines.slice(Math.max(0, i - 3), i + 3).join(" ");
      if (/(?:encrypt|secret|password|secure|protect|hide)/i.test(nearby)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Base64 used as encryption",
          severity: "high",
          detail: "Base64 is encoding, not encryption — it provides zero confidentiality",
        });
      }
    }

    // SQL partial parameterization
    if (/(?:query|execute|exec|raw)\s*\(/.test(line)) {
      const context = lines.slice(i, Math.min(i + 3, lines.length)).join(" ");
      if (/\$\{|\+\s*['"]/.test(context) && /[?$]/.test(context)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Partially parameterized SQL query",
          severity: "high",
          detail: "Query mixes parameterized values with string concatenation — fully parameterize all inputs",
        });
      }
    }

    // Commented-out security controls
    if (
      /^\s*\/\/\s*(?:app\.use\s*\(\s*(?:helmet|csrf|cors|rateLimit)|requireAuth|isAuthenticated|authorize)/.test(line)
    ) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Commented-out security middleware",
        severity: "high",
        detail: "Security middleware is commented out — likely left disabled from debugging",
      });
    }

    // JWT with 'none' algorithm
    if (/algorithm[s]?\s*[:=]\s*\[?\s*['"]none['"]/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "JWT 'none' algorithm allowed",
        severity: "high",
        detail: "Allowing 'none' algorithm in JWT verification completely disables signature checking",
      });
    }

    // Overly long JWT expiration
    if (/expiresIn\s*[:=]\s*['"](\d+)([dh])['"]/.test(line)) {
      const match = line.match(/expiresIn\s*[:=]\s*['"](\d+)([dh])['"]/);
      if (match) {
        const val = parseInt(match[1], 10);
        const unit = match[2];
        if ((unit === "d" && val > 30) || (unit === "h" && val > 720)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "JWT expiration too long",
            severity: "medium",
            detail: `Token expiration of ${val}${unit} is excessively long — shorter-lived tokens reduce blast radius of theft`,
          });
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runSecurityTheater(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges security-theater — Detect security-looking code that provides no protection

Usage:
  judges security-theater [dir]
  judges security-theater src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: weak password hashing, hardcoded keys/IVs, wildcard CORS with auth,
unverified CSRF tokens, ineffective rate limiting, validation without auth,
base64-as-encryption, partial SQL parameterization, commented-out security
middleware, JWT 'none' algorithm, overly long JWT expiration.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: TheaterIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(
    0,
    100 - highCount * 15 - medCount * 7 - allIssues.filter((i) => i.severity === "low").length * 3,
  );

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
    const badge = score >= 80 ? "✅ GENUINE SECURITY" : score >= 50 ? "⚠️  THEATER DETECTED" : "❌ SECURITY THEATER";
    console.log(`\n  Security-Theater: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No security theater detected.\n");
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

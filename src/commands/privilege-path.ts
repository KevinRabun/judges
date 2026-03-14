/**
 * Privilege path — model authorization flows to find privilege-escalation paths.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PrivilegeIssue {
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

function analyzeFile(filepath: string): PrivilegeIssue[] {
  const issues: PrivilegeIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const fullText = content;

  // Detect route/endpoint definitions
  const isRouteFile =
    /(?:router|app)\.\s*(?:get|post|put|delete|patch|all)\s*\(|@(?:GET|POST|PUT|DELETE|PATCH|Controller|RequestMapping)/i.test(
      fullText,
    );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Route without auth middleware
    if (/(?:router|app)\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/.test(line)) {
      const routeMatch = line.match(/(?:router|app)\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/);
      if (routeMatch) {
        const route = routeMatch[1];
        const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
        // Skip public routes
        if (!/(?:health|status|ping|public|login|register|signup|webhook|callback)/i.test(route)) {
          if (
            !/auth|authenticate|authorize|requireAuth|isAuthenticated|passport|guard|protect|jwt|token|session/i.test(
              block,
            )
          ) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "Route without authentication middleware",
              severity: "high",
              detail: `${route} — no auth middleware detected; endpoint may be publicly accessible`,
            });
          }
        }
      }
    }

    // IDOR: user ID from request used directly in query
    if (/(?:req\.params|req\.query|req\.body|request\.\w+)\.\s*(?:id|userId|user_id)/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      if (/(?:findById|findOne|where|SELECT|DELETE|UPDATE)\s*\(/i.test(block)) {
        if (!/req\.user|currentUser|session\.user|token\.sub|auth\.user/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Potential IDOR — user ID from request without ownership check",
            severity: "high",
            detail:
              "User-supplied ID used in query without verifying ownership — attacker can access other users' data",
          });
        }
      }
    }

    // Role check using string comparison (fragile)
    if (/role\s*===?\s*['"]admin['"]|role\s*===?\s*['"]superadmin['"]/i.test(line)) {
      if (!/enum|const\s+ROLES|Role\./i.test(fullText)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Role check with magic string",
          severity: "medium",
          detail: "Role comparison uses magic string — use enum/constant to prevent typo-based bypass",
        });
      }
    }

    // Privilege escalation: self-assign role
    if (/role|isAdmin|is_admin|permissions/i.test(line) && /req\.body|request\.body/i.test(line)) {
      issues.push({
        file: filepath,
        line: i + 1,
        issue: "Role/permission from user input",
        severity: "high",
        detail: "Role or permission value taken from request body — user can self-escalate privileges",
      });
    }

    // Missing authorization on destructive operations
    if (/\.(?:delete|destroy|remove|drop|truncate)\s*\(/i.test(line) && isRouteFile) {
      const contextBlock = lines.slice(Math.max(0, i - 10), i + 1).join("\n");
      if (!/authorize|permission|role|isAdmin|canDelete|allowed/i.test(contextBlock)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Destructive operation without authorization check",
          severity: "high",
          detail: "Delete/destroy called without prior authorization — any authenticated user may execute it",
        });
      }
    }

    // JWT token without signature verification
    if (/jwt\.decode\s*\(/.test(line)) {
      if (!/jwt\.verify|jsonwebtoken.*verify/i.test(fullText)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "JWT decoded without verification",
          severity: "high",
          detail: "jwt.decode() does NOT verify signature — use jwt.verify() to prevent token forgery",
        });
      }
    }

    // Hardcoded secrets/tokens in auth logic
    if (/(?:secret|password|token|apiKey|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(line)) {
      if (!/test|spec|mock|fixture|example|sample/i.test(filepath)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Hardcoded credential in auth logic",
          severity: "high",
          detail: "Secret/token hardcoded in source — extract to environment variable or secret manager",
        });
      }
    }

    // Session fixation: session ID not regenerated after login
    if (/login|authenticate|signIn/i.test(line) && /function|=>|async/.test(line)) {
      const funcBlock = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
      if (/session/i.test(funcBlock) && !/regenerate|destroy.*session|req\.session\s*=\s*null/i.test(funcBlock)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Session not regenerated after login",
          severity: "medium",
          detail: "Session ID persists across auth boundary — regenerate to prevent session fixation",
        });
      }
    }

    // CORS: wildcard origin with credentials
    if (/origin\s*:\s*['"]\*['"]|origin\s*:\s*true/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      if (/credentials\s*:\s*true/i.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "CORS wildcard with credentials",
          severity: "high",
          detail: "Wildcard origin with credentials allows any site to make authenticated requests",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runPrivilegePath(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges privilege-path — Model authorization flows to find escalation paths

Usage:
  judges privilege-path [dir]
  judges privilege-path src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: routes without auth, IDOR patterns, magic-string role checks, self-assigned roles,
unprotected destructive ops, JWT decode without verify, hardcoded secrets, session fixation, CORS.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: PrivilegeIssue[] = [];
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
    const badge = score >= 80 ? "✅ SECURE" : score >= 50 ? "⚠️  GAPS" : "❌ EXPOSED";
    console.log(`\n  Privilege Safety: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No privilege escalation paths detected.\n");
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

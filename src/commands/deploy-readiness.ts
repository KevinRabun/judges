/**
 * Deploy readiness — pre-deployment checklist that validates
 * AI-generated code is production-ready.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReadinessCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  category: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".java", ".go", ".rs"]);

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

function allContent(files: string[]): string {
  return files
    .map((f) => {
      try {
        return readFileSync(f, "utf-8");
      } catch {
        return "";
      }
    })
    .join("\n");
}

// ─── Checks ─────────────────────────────────────────────────────────────────

function runChecks(dir: string): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];
  const files = collectFiles(dir);
  const content = allContent(files);

  // Health check endpoint
  const hasHealthCheck = /\/(health|healthz|readyz|livez|status)\b/.test(content);
  checks.push({
    name: "Health check endpoint",
    status: hasHealthCheck ? "pass" : "fail",
    detail: hasHealthCheck ? "Health check endpoint found" : "No /health or /healthz endpoint detected",
    category: "availability",
  });

  // Graceful shutdown
  const hasGraceful = /process\.on\s*\(\s*['"]SIG(TERM|INT)['"]|graceful.?shutdown|server\.close/i.test(content);
  checks.push({
    name: "Graceful shutdown handler",
    status: hasGraceful ? "pass" : "warn",
    detail: hasGraceful ? "SIGTERM/SIGINT handler found" : "No graceful shutdown handler — may lose in-flight requests",
    category: "availability",
  });

  // Environment variable validation
  const envRefs = (content.match(/process\.env\.\w+|os\.environ|System\.getenv/g) || []).length;
  const envValidation = /process\.env\.\w+\s*\|\||required|assert.*env|validateEnv|env\.parse/i.test(content);
  checks.push({
    name: "Environment variable validation",
    status: envRefs > 0 && envValidation ? "pass" : envRefs > 0 ? "warn" : "pass",
    detail:
      envRefs > 0
        ? envValidation
          ? `${envRefs} env vars with validation`
          : `${envRefs} env vars but no validation at startup`
        : "No environment variables detected",
    category: "configuration",
  });

  // Rate limiting
  const hasRateLimit = /rate.?limit|throttle|express-rate-limit|fastify-rate-limit|@nestjs\/throttler/i.test(content);
  checks.push({
    name: "Rate limiting",
    status: hasRateLimit ? "pass" : "warn",
    detail: hasRateLimit ? "Rate limiting configured" : "No rate limiting detected — vulnerable to abuse",
    category: "security",
  });

  // CORS configuration
  const hasCors = /cors\(|Access-Control-Allow-Origin|@CrossOrigin/i.test(content);
  const permissiveCors = /cors\(\s*\)|Allow-Origin.*\*/i.test(content);
  checks.push({
    name: "CORS configuration",
    status: hasCors && !permissiveCors ? "pass" : permissiveCors ? "warn" : hasCors ? "pass" : "pass",
    detail: permissiveCors
      ? "CORS is permissive (allow-all) — restrict origins in production"
      : hasCors
        ? "CORS configured"
        : "No CORS detected (may be OK for backend-only services)",
    category: "security",
  });

  // Error handling
  const hasGlobalErrorHandler = /app\.use\s*\(\s*\(err|@ExceptionHandler|exception_handler|error_handler/i.test(
    content,
  );
  checks.push({
    name: "Global error handler",
    status: hasGlobalErrorHandler ? "pass" : "warn",
    detail: hasGlobalErrorHandler
      ? "Global error handler found"
      : "No global error handler — uncaught errors may leak stack traces",
    category: "reliability",
  });

  // Logging
  const hasStructuredLogging = /winston|pino|bunyan|log4j|logging\.getLogger|slog\.|zerolog/i.test(content);
  const consoleLogCount = (content.match(/console\.(log|debug)\s*\(/g) || []).length;
  checks.push({
    name: "Structured logging",
    status: hasStructuredLogging ? "pass" : consoleLogCount > 10 ? "warn" : "pass",
    detail: hasStructuredLogging
      ? "Structured logging framework detected"
      : `${consoleLogCount} console.log calls — use a logging framework in production`,
    category: "observability",
  });

  // Connection pool limits
  const hasPool = /pool|createPool|connectionLimit|maxConnections|max_connections/i.test(content);
  checks.push({
    name: "Connection pool limits",
    status: hasPool ? "pass" : "pass",
    detail: hasPool ? "Connection pooling configured" : "No explicit connection pool detected (may be OK)",
    category: "performance",
  });

  // Dockerfile / container
  const hasDockerfile = existsSync(join(dir, "Dockerfile")) || existsSync(join(dir, "docker-compose.yml"));
  const hasK8sProbes = /readinessProbe|livenessProbe|startupProbe/i.test(content);
  if (hasDockerfile) {
    checks.push({
      name: "Container probes",
      status: hasK8sProbes ? "pass" : "warn",
      detail: hasK8sProbes ? "K8s readiness/liveness probes configured" : "Dockerfile found but no K8s probes detected",
      category: "deployment",
    });
  }

  // HTTPS
  const hasInsecureHttp = /['"]http:\/\/(?!localhost|127\.0\.0\.1)/i.test(content);
  checks.push({
    name: "HTTPS enforcement",
    status: hasInsecureHttp ? "warn" : "pass",
    detail: hasInsecureHttp ? "Insecure HTTP URLs detected — use HTTPS" : "No insecure HTTP URLs found",
    category: "security",
  });

  // Timeout configuration
  const hasTimeouts = /timeout|connectTimeout|socketTimeout|requestTimeout/i.test(content);
  checks.push({
    name: "Request timeouts",
    status: hasTimeouts ? "pass" : "warn",
    detail: hasTimeouts ? "Timeout configuration found" : "No explicit timeouts — requests may hang indefinitely",
    category: "reliability",
  });

  return checks;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runDeployReadiness(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges deploy-readiness — Pre-deployment production readiness checklist

Usage:
  judges deploy-readiness [dir]
  judges deploy-readiness src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: health endpoints, graceful shutdown, env validation, rate limiting,
CORS, error handling, logging, connection pools, container probes, HTTPS, timeouts
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const checks = runChecks(dir);
  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const score = Math.round((passCount / checks.length) * 100);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          checks,
          score,
          summary: { pass: passCount, warn: warnCount, fail: failCount },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = failCount > 0 ? "❌ NOT READY" : warnCount > 2 ? "⚠️  REVIEW" : "✅ READY";
    console.log(`\n  Deploy Readiness: ${badge} (${score}%)\n  ──────────────────────────`);

    for (const check of checks) {
      const icon = check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌";
      console.log(`    ${icon} ${check.name}`);
      console.log(`        ${check.detail}`);
    }

    console.log(`\n    Score: ${score}% | Pass: ${passCount} | Warn: ${warnCount} | Fail: ${failCount}\n`);
  }
}

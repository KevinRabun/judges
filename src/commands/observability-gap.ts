/**
 * Observability gap — detect missing metrics, traces, and structured logs
 * at critical code paths.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ObservabilityGap {
  file: string;
  line: number;
  gap: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
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

function analyzeFile(filepath: string): ObservabilityGap[] {
  const gaps: ObservabilityGap[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return gaps;
  }

  const lines = content.split("\n");

  // Track context for scoped analysis
  let inCatchBlock = false;
  let catchStart = 0;
  let inRouteHandler = false;
  let routeStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect catch blocks
    if (/\bcatch\s*\(/.test(line)) {
      inCatchBlock = true;
      catchStart = i;
    }
    if (inCatchBlock && i - catchStart > 10) inCatchBlock = false;

    // Catch without logging
    if (inCatchBlock && /\bcatch\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
      if (!/log|logger|console\.(error|warn|log)|logging|slog|zerolog|println|print/i.test(block)) {
        gaps.push({
          file: filepath,
          line: i + 1,
          gap: "Silent catch block",
          severity: "high",
          suggestion: "Log error details with context (request ID, user, operation)",
        });
      }
    }

    // Detect route/endpoint handlers
    if (
      /\.(get|post|put|delete|patch)\s*\(\s*['"]\//.test(line) ||
      /@(Get|Post|Put|Delete|Patch)Mapping/.test(line) ||
      /app\.route|@app\.(get|post|put|delete)/.test(line)
    ) {
      inRouteHandler = true;
      routeStart = i;
    }
    if (inRouteHandler && i - routeStart > 30) inRouteHandler = false;

    // HTTP handler without latency tracking
    if (inRouteHandler && i === routeStart) {
      const block = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
      if (!/histogram|timer|latency|duration|perf_hooks|performance\.now|time\.Since|Stopwatch/i.test(block)) {
        gaps.push({
          file: filepath,
          line: i + 1,
          gap: "Endpoint without latency metrics",
          severity: "medium",
          suggestion: "Add response-time histogram/metric for SLO monitoring",
        });
      }
    }

    // External calls without tracing
    if (/fetch\(|axios\.|http\.request|httpClient|requests\.(get|post)|gorequest|reqwest/i.test(line)) {
      const surrounding = lines.slice(Math.max(0, i - 3), Math.min(i + 3, lines.length)).join("\n");
      if (!/trace|span|opentelemetry|tracing|X-Request-Id|correlation.?id|traceparent/i.test(surrounding)) {
        gaps.push({
          file: filepath,
          line: i + 1,
          gap: "Outbound call without trace propagation",
          severity: "medium",
          suggestion: "Propagate trace context (traceparent header) for distributed tracing",
        });
      }
    }

    // Background/scheduled jobs without heartbeat
    if (/setInterval|cron\.schedule|@Scheduled|BackgroundJob|celery|sidekiq/i.test(line)) {
      const surrounding = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      if (!/heartbeat|health|alive|lastRun|metric|gauge/i.test(surrounding)) {
        gaps.push({
          file: filepath,
          line: i + 1,
          gap: "Background job without heartbeat",
          severity: "high",
          suggestion: "Emit heartbeat metric or last-run timestamp for alerting",
        });
      }
    }

    // Database queries without instrumentation
    if (/\.query\s*\(|\.execute\s*\(|\.raw\s*\(|cursor\.execute|db\.Exec|sqlx/i.test(line)) {
      const surrounding = lines.slice(Math.max(0, i - 2), Math.min(i + 5, lines.length)).join("\n");
      if (!/span|trace|metric|histogram|timer|duration|slow.?query/i.test(surrounding)) {
        gaps.push({
          file: filepath,
          line: i + 1,
          gap: "DB query without instrumentation",
          severity: "low",
          suggestion: "Add query timing to detect slow queries",
        });
      }
    }

    // Queue/message consumers without metrics
    if (/\.consume\s*\(|\.subscribe\s*\(|@RabbitListener|@KafkaListener|on\s*\(\s*['"]message['"]\s*\)/i.test(line)) {
      const surrounding = lines.slice(i, Math.min(i + 15, lines.length)).join("\n");
      if (!/metric|counter|gauge|processed|lag|backlog/i.test(surrounding)) {
        gaps.push({
          file: filepath,
          line: i + 1,
          gap: "Message consumer without processing metrics",
          severity: "medium",
          suggestion: "Track message processing rate, lag, and error counters",
        });
      }
    }
  }

  return gaps;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runObservabilityGap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges observability-gap — Detect missing instrumentation at critical paths

Usage:
  judges observability-gap [dir]
  judges observability-gap src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Detects: silent catch blocks, endpoints without latency metrics, outbound calls
without trace propagation, background jobs without heartbeats, DB queries without
instrumentation, message consumers without processing metrics.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allGaps: ObservabilityGap[] = [];
  for (const f of files) allGaps.push(...analyzeFile(f));

  const highCount = allGaps.filter((g) => g.severity === "high").length;
  const medCount = allGaps.filter((g) => g.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 5);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          gaps: allGaps,
          score,
          summary: { high: highCount, medium: medCount, total: allGaps.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ WELL INSTRUMENTED" : score >= 50 ? "⚠️  GAPS FOUND" : "❌ BLIND SPOTS";
    console.log(`\n  Observability: ${badge} (${score}/100)\n  ──────────────────────────────`);

    if (allGaps.length === 0) {
      console.log("    No observability gaps detected.\n");
      return;
    }

    for (const g of allGaps.slice(0, 25)) {
      const icon = g.severity === "high" ? "🔴" : g.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${g.gap}`);
      console.log(`        ${g.file}:${g.line}`);
      console.log(`        → ${g.suggestion}`);
    }
    if (allGaps.length > 25) console.log(`    ... and ${allGaps.length - 25} more`);

    console.log(`\n    Total: ${allGaps.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}

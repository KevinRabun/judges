/**
 * Cache audit — audit cache invalidation correctness, TTL consistency, and stampede risk.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CacheIssue {
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

function analyzeFile(filepath: string): CacheIssue[] {
  const issues: CacheIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const fullText = content;

  // Detect cache set without TTL
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Redis/Memcached set without expiry
    if (/\.set\s*\(/.test(line) && /cache|redis|memcache/i.test(fullText)) {
      const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
      if (!/ttl|expire|ex\b|px\b|maxAge|max_age|EX|PX/i.test(block) && /cache/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Cache set without TTL",
          severity: "high",
          detail: "Cache entry has no expiration — data will grow unbounded and may serve stale results",
        });
      }
    }

    // Map/Object used as cache without size limit
    if (/new Map\(\)|:\s*Record<|:\s*\{[^}]*\}\s*=\s*\{\}/.test(line) && /cache/i.test(line)) {
      const fileBlock = lines.slice(i, Math.min(i + 20, lines.length)).join("\n");
      if (!/\.delete|\.clear|maxSize|max_size|evict|LRU|lru/i.test(fileBlock)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "In-memory cache without eviction",
          severity: "medium",
          detail: "Cache grows unbounded — add size limit or LRU eviction to prevent memory leaks",
        });
      }
    }

    // Cache read without miss handler (dogpile/stampede risk)
    if (/\.get\s*\(/.test(line) && /cache/i.test(line)) {
      const block = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");
      if (/if\s*\(!?\s*\w+\)|=== null|=== undefined|!result/.test(block)) {
        if (!/lock|mutex|singleflight|coalesce|dedupe/i.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Cache miss without stampede protection",
            severity: "medium",
            detail: "Concurrent cache misses can trigger thundering herd — add lock or singleflight",
          });
        }
      }
    }

    // Mutation without cache invalidation
    if (/\.(?:update|insert|delete|remove|save|create|destroy|put|patch)\s*\(/.test(line)) {
      if (/(?:db|model|repository|store|dao|prisma|sequelize|knex)/i.test(line)) {
        const afterBlock = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
        if (
          /cache/i.test(fullText) &&
          !/cache\.(?:del|delete|invalidate|clear|remove|bust|evict|set)/i.test(afterBlock)
        ) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Data mutation without cache invalidation",
            severity: "high",
            detail: "Write operation not followed by cache invalidation — clients may read stale data",
          });
        }
      }
    }

    // TTL inconsistency (different TTL for same logical data)
    if (/ttl|expire|maxAge|max_age/i.test(line)) {
      const ttlMatch = line.match(/(?:ttl|expire|maxAge|max_age)\s*[:=]\s*(\d+)/i);
      if (ttlMatch) {
        const val = parseInt(ttlMatch[1], 10);
        if (val < 5) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Suspiciously short TTL",
            severity: "low",
            detail: `TTL = ${val} — extremely short TTL negates caching benefit and adds overhead`,
          });
        }
        if (val > 86400000) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Excessively long TTL",
            severity: "medium",
            detail: `TTL = ${Math.round(val / 3600000)}h — very long TTL increases stale-data risk`,
          });
        }
      }
    }

    // Cache key construction without version/namespace
    if (/cacheKey|cache_key/i.test(line)) {
      if (!/version|v\d+|namespace|prefix/i.test(line)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Cache key without versioning",
          severity: "low",
          detail: "Cache key has no version prefix — schema changes may cause deserialization failures",
        });
      }
    }

    // localStorage/sessionStorage without error handling
    if (/localStorage|sessionStorage/.test(line)) {
      const block = lines.slice(Math.max(0, i - 2), Math.min(i + 2, lines.length)).join("\n");
      if (!/try|catch/.test(block)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Web storage access without error handling",
          severity: "medium",
          detail: "localStorage/sessionStorage can throw in private browsing or when storage quota is exceeded",
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCacheAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges cache-audit — Audit cache invalidation, TTL, and stampede risk

Usage:
  judges cache-audit [dir]
  judges cache-audit src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: missing TTL, unbounded in-memory cache, stampede risk, stale-after-write,
suspicious TTL values, unversioned cache keys, web storage error handling.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allIssues: CacheIssue[] = [];
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
    const badge = score >= 80 ? "✅ SOUND" : score >= 50 ? "⚠️  RISKY" : "❌ BROKEN";
    console.log(`\n  Cache Health: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allIssues.length === 0) {
      console.log("    No cache issues detected.\n");
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

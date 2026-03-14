/**
 * Rollback safety — detect changes that are unsafe or impossible to roll back.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RollbackRisk {
  file: string;
  line: number;
  risk: string;
  severity: "critical" | "high" | "medium";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".sql", ".yaml", ".yml"]);

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

const RISK_PATTERNS: { pattern: RegExp; risk: string; severity: "critical" | "high" | "medium"; detail: string }[] = [
  {
    pattern: /DROP\s+TABLE/i,
    risk: "Destructive migration",
    severity: "critical",
    detail: "Drops entire table — data unrecoverable without backup",
  },
  {
    pattern: /DROP\s+COLUMN/i,
    risk: "Column removal",
    severity: "critical",
    detail: "Dropped column data lost — add deprecation period first",
  },
  {
    pattern: /ALTER\s+TABLE.*RENAME/i,
    risk: "Table/column rename",
    severity: "high",
    detail: "Rename breaks old queries — use alias during transition",
  },
  {
    pattern: /TRUNCATE\s+/i,
    risk: "Table truncation",
    severity: "critical",
    detail: "Removes all rows — cannot undo without backup",
  },
  {
    pattern: /DELETE\s+FROM\s+\w+\s*(?:;|$)/im,
    risk: "Mass delete",
    severity: "high",
    detail: "Delete without WHERE — removes all rows",
  },
  {
    pattern: /ALTER\s+TYPE|CHANGE\s+COLUMN.*\bTYPE\b/i,
    risk: "Column type change",
    severity: "high",
    detail: "Type narrowing can lose data silently",
  },
  {
    pattern: /removeField|removeColumn|dropIndex/i,
    risk: "ORM schema removal",
    severity: "high",
    detail: "Field/index removal in ORM migration — deploy new code first",
  },
  {
    pattern: /\.destroy\(\)|\.deleteMany\(\{?\s*\}?\)|\.remove\(\{?\s*\}?\)/i,
    risk: "Bulk data deletion",
    severity: "high",
    detail: "Bulk delete in application code — ensure filters are correct",
  },
  {
    pattern: /(?:api|endpoint|route).*(?:removed|deprecated|deleted)/i,
    risk: "API endpoint removal",
    severity: "high",
    detail: "Removing endpoints breaks consumers — deprecate first",
  },
  {
    pattern: /(?:encryption|crypto).*(?:changed|migrated|switched)/i,
    risk: "Encryption scheme change",
    severity: "critical",
    detail: "Changing encryption makes old data unreadable — migrate gradually",
  },
  {
    pattern: /(?:partition|shard).*(?:key|strategy).*(?:change|update)/i,
    risk: "Partition key change",
    severity: "critical",
    detail: "Partition key change requires full data re-distribution",
  },
  {
    pattern: /irreversible|no.?rollback|one.?way/i,
    risk: "Explicit irreversibility marker",
    severity: "high",
    detail: "Code explicitly marked as irreversible",
  },
];

function analyzeFile(filepath: string): RollbackRisk[] {
  const risks: RollbackRisk[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return risks;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rp of RISK_PATTERNS) {
      if (rp.pattern.test(line)) {
        risks.push({ file: filepath, line: i + 1, risk: rp.risk, severity: rp.severity, detail: rp.detail });
      }
    }
  }
  return risks;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRollbackSafety(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges rollback-safety — Detect changes unsafe or impossible to roll back

Usage:
  judges rollback-safety [dir]
  judges rollback-safety migrations/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Detects: destructive DB migrations, bulk deletes, API removals, encryption changes,
partition key changes, and code explicitly marked irreversible.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const risks: RollbackRisk[] = [];
  for (const f of files) risks.push(...analyzeFile(f));

  risks.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2 };
    return order[a.severity] - order[b.severity];
  });

  const critCount = risks.filter((r) => r.severity === "critical").length;
  const highCount = risks.filter((r) => r.severity === "high").length;
  const score = risks.length === 0 ? 100 : Math.max(0, 100 - critCount * 25 - highCount * 10);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          risks,
          score,
          summary: { critical: critCount, high: highCount, total: risks.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = critCount > 0 ? "🚫 UNSAFE" : highCount > 0 ? "⚠️  CAUTION" : "✅ SAFE";
    console.log(`\n  Rollback Safety: ${badge} (score ${score}/100)\n  ─────────────────────────`);

    if (risks.length === 0) {
      console.log("    No rollback risks detected.\n");
      return;
    }

    for (const r of risks) {
      const icon = r.severity === "critical" ? "🚫" : r.severity === "high" ? "🔴" : "🟡";
      console.log(`    ${icon} [${r.severity.toUpperCase()}] ${r.risk}`);
      console.log(`        ${r.file}:${r.line}`);
      console.log(`        ${r.detail}`);
    }

    console.log(
      `\n    Total: ${risks.length} risks | Critical: ${critCount} | High: ${highCount} | Score: ${score}/100\n`,
    );
  }
}

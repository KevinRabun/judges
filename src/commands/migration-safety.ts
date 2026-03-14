/**
 * Migration safety — validate framework/language migration PRs for
 * compatibility gaps, data-loss risks, and breaking changes.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MigrationRisk {
  file: string;
  line: number;
  risk: string;
  severity: "critical" | "high" | "medium";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".json",
  ".yaml",
  ".yml",
]);

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

const MIGRATION_PATTERNS: {
  pattern: RegExp;
  risk: string;
  severity: "critical" | "high" | "medium";
  detail: string;
}[] = [
  // Framework migrations
  {
    pattern: /(?:from|import)\s+['"]react-router(?:-dom)?['"]/i,
    risk: "React Router migration",
    severity: "high",
    detail: "React Router v5→v6: <Switch> replaced by <Routes>, useHistory→useNavigate",
  },
  {
    pattern: /(?:from|import)\s+['"]@angular\/(?:core|common)['"]/i,
    risk: "Angular version migration",
    severity: "high",
    detail: "Angular major versions change DI, module system, and template syntax",
  },
  {
    pattern: /(?:from|import)\s+['"]vue['"]/i,
    risk: "Vue migration",
    severity: "high",
    detail: "Vue 2→3: Options API defaults change, Composition API, Proxy-based reactivity",
  },
  {
    pattern: /(?:from|import)\s+['"]express['"].*(?:from|import)\s+['"]fastify['"]/is,
    risk: "Express→Fastify migration",
    severity: "high",
    detail: "Middleware model differs — req/res API changes, plugin system replaces middleware chain",
  },

  // TypeScript/JavaScript evolution
  {
    pattern: /require\s*\(.*\).*(?:import|from).*['"]/i,
    risk: "CJS/ESM mixed imports",
    severity: "medium",
    detail: "Mixed require() and import — choose one module system",
  },
  {
    pattern: /"type"\s*:\s*"module"/i,
    risk: "ESM migration",
    severity: "medium",
    detail: "ESM migration: ensure all imports have extensions, __dirname unavailable",
  },

  // Database migrations
  {
    pattern: /(?:ALTER|DROP)\s+(?:TABLE|COLUMN|INDEX)/i,
    risk: "Schema migration",
    severity: "critical",
    detail: "Schema changes may lose data — run on copy first, verify rollback",
  },
  {
    pattern: /(?:mongoose|sequelize|typeorm|prisma).*(?:migrate|migration)/i,
    risk: "ORM migration",
    severity: "high",
    detail: "ORM migrations may have different default behaviors across versions",
  },

  // Config format changes
  {
    pattern: /(?:webpack|rollup|vite|esbuild|parcel).*(?:config|\.config)/i,
    risk: "Bundler migration",
    severity: "medium",
    detail: "Bundler configs are not portable — verify plugin equivalents",
  },

  // API surface changes
  {
    pattern: /deprecated|@deprecated|TODO.*migrate|FIXME.*upgrade/i,
    risk: "Deprecated API usage",
    severity: "medium",
    detail: "Deprecated APIs may be removed in next version — update now",
  },

  // Runtime changes
  {
    pattern: /engines.*node.*['"]\d+/i,
    risk: "Node.js version requirement",
    severity: "high",
    detail: "Node version changes affect API availability, performance, and security",
  },
  {
    pattern: /python_requires.*['"]\s*>=?\s*3\./i,
    risk: "Python version requirement",
    severity: "high",
    detail: "Python version changes affect syntax, stdlib, and type hints",
  },

  // Data serialization changes
  {
    pattern: /(?:protobuf|proto3|avro|thrift).*(?:schema|definition)/i,
    risk: "Serialization schema change",
    severity: "critical",
    detail: "Schema changes can break wire compatibility — ensure backward compat",
  },

  // Authentication changes
  {
    pattern: /(?:passport|auth0|firebase[.-]auth|cognito).*(?:migrate|upgrade|v\d)/i,
    risk: "Auth provider migration",
    severity: "critical",
    detail: "Auth migrations risk locking out users — run parallel during transition",
  },
];

function analyzeFile(filepath: string): MigrationRisk[] {
  const risks: MigrationRisk[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return risks;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const mp of MIGRATION_PATTERNS) {
      if (mp.pattern.test(lines[i])) {
        risks.push({ file: filepath, line: i + 1, risk: mp.risk, severity: mp.severity, detail: mp.detail });
        break; // One finding per line
      }
    }
  }

  return risks;
}

function detectMigrationContext(dir: string): string[] {
  const signals: string[] = [];
  const files = collectFiles(dir, 50);
  const allContent = files
    .map((f) => {
      try {
        return readFileSync(f, "utf-8");
      } catch {
        return "";
      }
    })
    .join("\n");

  if (/codemod|jscodeshift|ast-grep/i.test(allContent))
    signals.push("Codemod tooling detected — automated migration in progress");
  if (/compatibility|compat|shim|polyfill/i.test(allContent)) signals.push("Compatibility layer/shim detected");
  if (/canary|feature.?flag|gradual.?rollout/i.test(allContent)) signals.push("Gradual rollout strategy detected");
  if (/(?:upgrade|migration).?guide|MIGRATION/i.test(allContent)) signals.push("Migration guide referenced");

  return signals;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runMigrationSafety(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges migration-safety — Validate migration PRs for compatibility and data-loss risks

Usage:
  judges migration-safety [dir]
  judges migration-safety src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Detects: framework version breaks, CJS/ESM mixed imports, schema migrations,
bundler config changes, deprecated APIs, runtime version changes, serialization
schema breaks, auth provider migrations.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allRisks: MigrationRisk[] = [];
  for (const f of files) allRisks.push(...analyzeFile(f));

  const signals = detectMigrationContext(dir);

  const critCount = allRisks.filter((r) => r.severity === "critical").length;
  const highCount = allRisks.filter((r) => r.severity === "high").length;
  const score = allRisks.length === 0 ? 100 : Math.max(0, 100 - critCount * 20 - highCount * 8);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          risks: allRisks,
          signals,
          score,
          summary: { critical: critCount, high: highCount, total: allRisks.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = critCount > 0 ? "🚫 HIGH RISK" : highCount > 2 ? "⚠️  CAUTION" : "✅ SAFE";
    console.log(`\n  Migration Safety: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (signals.length > 0) {
      console.log("\n    Context:");
      for (const s of signals) console.log(`      📌 ${s}`);
    }

    if (allRisks.length === 0) {
      console.log("\n    No migration risks detected.\n");
      return;
    }

    console.log("\n    Risks:");
    for (const r of allRisks.slice(0, 25)) {
      const icon = r.severity === "critical" ? "🚫" : r.severity === "high" ? "🔴" : "🟡";
      console.log(`      ${icon} [${r.severity.toUpperCase()}] ${r.risk}`);
      console.log(`          ${r.file}:${r.line}`);
      console.log(`          ${r.detail}`);
    }
    if (allRisks.length > 25) console.log(`      ... and ${allRisks.length - 25} more`);

    console.log(
      `\n    Total: ${allRisks.length} | Critical: ${critCount} | High: ${highCount} | Score: ${score}/100\n`,
    );
  }
}

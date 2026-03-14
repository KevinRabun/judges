/**
 * Finding-budget — manage finding volume per PR to prevent alert fatigue.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BudgetFinding {
  file: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  group: string;
}

interface BudgetResult {
  total: number;
  budget: number;
  overBudget: boolean;
  shown: BudgetFinding[];
  deferred: number;
  groups: Array<{ group: string; count: number }>;
  densityPerFile: number;
  riskTier: "critical" | "high" | "medium" | "low";
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

// ─── Quick scan patterns ────────────────────────────────────────────────────

interface ScanDef {
  regex: RegExp;
  category: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  group: string;
}

const SCAN_PATTERNS: ScanDef[] = [
  { regex: /eval\s*\(/, category: "Security", title: "eval() usage", severity: "critical", group: "injection" },
  {
    regex: /(?:password|secret|api[_-]?key)\s*[:=]\s*['"][^'"]+['"]/,
    category: "Security",
    title: "Hardcoded credential",
    severity: "critical",
    group: "secrets",
  },
  {
    regex: /\.innerHTML\s*=/,
    category: "Security",
    title: "innerHTML assignment",
    severity: "high",
    group: "injection",
  },
  {
    regex: /new\s+Buffer\s*\(/,
    category: "Security",
    title: "Deprecated Buffer()",
    severity: "high",
    group: "deprecated-api",
  },
  {
    regex: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
    category: "Reliability",
    title: "Empty catch block",
    severity: "medium",
    group: "error-handling",
  },
  { regex: /console\.\w+\s*\(/, category: "Quality", title: "Console statement", severity: "low", group: "logging" },
  { regex: /TODO|FIXME|HACK/, category: "Debt", title: "Open TODO/FIXME", severity: "low", group: "tech-debt" },
  {
    regex: /process\.exit\s*\(/,
    category: "Reliability",
    title: "process.exit()",
    severity: "medium",
    group: "error-handling",
  },
  { regex: /debugger\b/, category: "Quality", title: "Debugger statement", severity: "medium", group: "development" },
  {
    regex: /(?:setTimeout|setInterval)\s*\(\s*['"]/,
    category: "Security",
    title: "String timer (implicit eval)",
    severity: "high",
    group: "injection",
  },
  {
    regex: /url\.parse\s*\(/,
    category: "Quality",
    title: "Deprecated url.parse()",
    severity: "medium",
    group: "deprecated-api",
  },
  { regex: /var\s+\w+\s*=/, category: "Quality", title: "var declaration", severity: "low", group: "modernization" },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function scanFile(filepath: string, baseDir: string): BudgetFinding[] {
  const findings: BudgetFinding[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return findings;
  }

  const lines = content.split("\n");
  const rel = relative(baseDir, filepath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    for (const pattern of SCAN_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          file: rel,
          line: i + 1,
          severity: pattern.severity,
          category: pattern.category,
          title: pattern.title,
          group: pattern.group,
        });
      }
    }
  }

  return findings;
}

function applyBudget(allFindings: BudgetFinding[], budget: number): BudgetResult {
  // Sort by severity: critical > high > medium > low
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...allFindings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Group related findings
  const groupMap = new Map<string, number>();
  for (const f of sorted) groupMap.set(f.group, (groupMap.get(f.group) || 0) + 1);
  const groups = [...groupMap.entries()].sort((a, b) => b[1] - a[1]).map(([group, count]) => ({ group, count }));

  // Select top findings within budget
  const shown = sorted.slice(0, budget);
  const deferred = Math.max(0, sorted.length - budget);

  // Compute file count for density
  const uniqueFiles = new Set(allFindings.map((f) => f.file));
  const densityPerFile = uniqueFiles.size > 0 ? Math.round((allFindings.length / uniqueFiles.size) * 10) / 10 : 0;

  // Risk tier
  const critCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const riskTier: "critical" | "high" | "medium" | "low" =
    critCount > 0 ? "critical" : highCount > 3 ? "high" : allFindings.length > budget ? "medium" : "low";

  return {
    total: allFindings.length,
    budget,
    overBudget: allFindings.length > budget,
    shown,
    deferred,
    groups,
    densityPerFile,
    riskTier,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingBudget(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-budget — Manage finding volume to prevent alert fatigue

Usage:
  judges finding-budget [dir]
  judges finding-budget src/ --max 15
  judges finding-budget src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --max <n>             Maximum findings to show (default: 20)
  --format json         JSON output
  --help, -h            Show this help

Features: risk-based prioritization, graduated disclosure, related-finding
grouping, density metrics, "start here" view showing most impactful items
within the budget.

Note: All analysis is local — no data is sent or stored externally.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const maxStr = argv.find((_a: string, i: number) => argv[i - 1] === "--max");
  const budget = maxStr ? parseInt(maxStr, 10) : 20;
  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        argv.indexOf(a) > 0 &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--max",
    ) || ".";

  const files = collectFiles(dir);
  const allFindings: BudgetFinding[] = [];
  for (const f of files) allFindings.push(...scanFile(f, dir));

  const result = applyBudget(allFindings, budget);

  if (format === "json") {
    console.log(JSON.stringify({ result, timestamp: new Date().toISOString() }, null, 2));
  } else {
    const tierIcon =
      result.riskTier === "critical"
        ? "🔴"
        : result.riskTier === "high"
          ? "🟠"
          : result.riskTier === "medium"
            ? "🟡"
            : "🟢";
    console.log(
      `\n  Finding Budget: ${tierIcon} ${result.riskTier.toUpperCase()} RISK\n  ─────────────────────────────`,
    );
    console.log(`    Total findings:  ${result.total}`);
    console.log(`    Budget:          ${result.budget}`);
    console.log(`    Showing:         ${result.shown.length}`);
    if (result.deferred > 0) console.log(`    Deferred:        ${result.deferred} (fix shown items first)`);
    console.log(`    Density:         ${result.densityPerFile} findings/file`);

    if (result.shown.length > 0) {
      console.log(`\n    Start Here:`);
      for (const f of result.shown) {
        const icon =
          f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : "🔵";
        console.log(`      ${icon} [${f.category}] ${f.title}`);
        console.log(`          ${f.file}:${f.line}`);
      }
    }

    if (result.groups.length > 0) {
      console.log(`\n    Finding Groups:`);
      for (const g of result.groups) {
        console.log(`      ${g.group}: ${g.count} finding(s)`);
      }
    }

    if (result.overBudget) {
      console.log(
        `\n    ⚡ ${result.deferred} findings deferred — fix the ${result.shown.length} shown items first, then re-run to see more.`,
      );
    }
    console.log();
  }
}

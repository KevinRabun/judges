/**
 * Review-gate — CI/CD quality gate with configurable pass/fail thresholds.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GateConfig {
  maxCritical: number;
  maxHigh: number;
  maxTotal: number;
  blockOnSecurityFindings: boolean;
}

interface GateFinding {
  pattern: string;
  severity: string;
  file: string;
  line: number;
}

interface GateResult {
  passed: boolean;
  findings: GateFinding[];
  counts: { critical: number; high: number; medium: number; low: number; total: number };
  thresholds: GateConfig;
  failReasons: string[];
}

// ─── Default thresholds ────────────────────────────────────────────────────

function defaultConfig(): GateConfig {
  return {
    maxCritical: 0,
    maxHigh: 5,
    maxTotal: 25,
    blockOnSecurityFindings: true,
  };
}

// ─── Patterns ──────────────────────────────────────────────────────────────

const GATE_PATTERNS: { name: string; severity: string; regex: RegExp; security: boolean }[] = [
  {
    name: "hardcoded-secret",
    severity: "critical",
    regex: /(?:password|secret|api_key|token)\s*[:=]\s*["'][^"']{8,}/i,
    security: true,
  },
  { name: "eval-usage", severity: "critical", regex: /\beval\s*\(/, security: true },
  { name: "sql-injection", severity: "critical", regex: /(?:query|execute)\s*\(\s*["'`].*\+/, security: true },
  { name: "xss-risk", severity: "high", regex: /innerHTML\s*=|\.html\s*\(|document\.write\s*\(/, security: true },
  {
    name: "unsafe-deserialization",
    severity: "critical",
    regex: /JSON\.parse\s*\(\s*(?:req|request|body|params|query)\b/,
    security: true,
  },
  {
    name: "command-injection",
    severity: "critical",
    regex: /exec(?:Sync)?\s*\(\s*(?:`[^`]*\$\{|["'][^"']*\+)/,
    security: true,
  },
  {
    name: "path-traversal",
    severity: "high",
    regex: /(?:readFile|writeFile|createReadStream)\s*\([^)]*(?:req|params|query)/,
    security: true,
  },
  { name: "empty-catch", severity: "medium", regex: /catch\s*\([^)]*\)\s*\{\s*\}/, security: false },
  { name: "any-type", severity: "low", regex: /:\s*any\b/, security: false },
  { name: "console-log", severity: "low", regex: /console\.log\s*\(/, security: false },
  { name: "deprecated-api", severity: "medium", regex: /new\s+Buffer\s*\(|\.substr\s*\(/, security: false },
  { name: "todo-in-code", severity: "low", regex: /\/\/\s*(?:TODO|FIXME|HACK)\b/i, security: false },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectSourceFiles(dir: string): string[] {
  const exts = new Set([".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".go", ".rs", ".cs"]);
  const files: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue;
      const full = join(d, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (exts.has(extname(name))) files.push(full);
      } catch {
        // skip
      }
    }
  }
  walk(dir);
  return files;
}

function runGate(files: string[], config: GateConfig): GateResult {
  const findings: GateFinding[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      for (const pat of GATE_PATTERNS) {
        if (pat.regex.test(lines[i])) {
          findings.push({ pattern: pat.name, severity: pat.severity, file: filePath, line: i + 1 });
        }
      }
    }
  }

  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: findings.length };
  for (const f of findings) {
    if (f.severity === "critical") counts.critical++;
    else if (f.severity === "high") counts.high++;
    else if (f.severity === "medium") counts.medium++;
    else counts.low++;
  }

  const failReasons: string[] = [];
  if (counts.critical > config.maxCritical) {
    failReasons.push(`Critical findings (${counts.critical}) exceed threshold (${config.maxCritical})`);
  }
  if (counts.high > config.maxHigh) {
    failReasons.push(`High findings (${counts.high}) exceed threshold (${config.maxHigh})`);
  }
  if (counts.total > config.maxTotal) {
    failReasons.push(`Total findings (${counts.total}) exceed threshold (${config.maxTotal})`);
  }
  if (config.blockOnSecurityFindings) {
    const securityFindings = findings.filter((f) => GATE_PATTERNS.find((p) => p.name === f.pattern && p.security));
    if (securityFindings.length > 0) {
      failReasons.push(`${securityFindings.length} security-related findings detected`);
    }
  }

  return {
    passed: failReasons.length === 0,
    findings,
    counts,
    thresholds: config,
    failReasons,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewGate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-gate — CI/CD quality gate with configurable thresholds

Usage:
  judges review-gate [dir]                  Run quality gate check
  judges review-gate --max-critical 0       Set critical threshold
  judges review-gate --max-high 3           Set high threshold
  judges review-gate --max-total 20         Set total threshold
  judges review-gate --format json          JSON output

Options:
  [dir]                      Target directory (default: .)
  --max-critical <n>         Max critical findings (default: 0)
  --max-high <n>             Max high findings (default: 5)
  --max-total <n>            Max total findings (default: 25)
  --no-block-security        Don't fail on security findings
  --format json              JSON output
  --help, -h                 Show this help

Exit code 1 if gate fails. Designed for CI/CD pipeline integration.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        a !== "review-gate" &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--max-critical" &&
        argv[argv.indexOf(a) - 1] !== "--max-high" &&
        argv[argv.indexOf(a) - 1] !== "--max-total",
    ) || ".";

  const config = defaultConfig();
  const getNum = (flag: string, fallback: number): number => {
    const val = argv.find((_a: string, i: number) => argv[i - 1] === flag);
    return val ? parseInt(val, 10) : fallback;
  };
  config.maxCritical = getNum("--max-critical", config.maxCritical);
  config.maxHigh = getNum("--max-high", config.maxHigh);
  config.maxTotal = getNum("--max-total", config.maxTotal);
  if (argv.includes("--no-block-security")) config.blockOnSecurityFindings = false;

  const files = collectSourceFiles(dir);
  const result = runGate(files, config);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 1;
    return;
  }

  const icon = result.passed ? "✅" : "❌";
  console.log(`\n  Quality Gate: ${icon} ${result.passed ? "PASSED" : "FAILED"}\n  ─────────────────────────────`);
  console.log(`    Files scanned: ${files.length}`);
  console.log(`    Total findings: ${result.counts.total}`);
  console.log(
    `    Critical: ${result.counts.critical}/${config.maxCritical}  High: ${result.counts.high}/${config.maxHigh}  Total: ${result.counts.total}/${config.maxTotal}`,
  );

  if (result.failReasons.length > 0) {
    console.log("\n    Fail reasons:");
    for (const reason of result.failReasons) console.log(`      ❌ ${reason}`);
  }

  if (result.findings.length > 0 && result.findings.length <= 20) {
    console.log("\n    Findings:");
    for (const f of result.findings) {
      console.log(`      [${f.severity}] ${f.pattern} — ${f.file}:${f.line}`);
    }
  } else if (result.findings.length > 20) {
    console.log(`\n    Showing first 20 of ${result.findings.length} findings:`);
    for (const f of result.findings.slice(0, 20)) {
      console.log(`      [${f.severity}] ${f.pattern} — ${f.file}:${f.line}`);
    }
  }

  console.log();
  if (!result.passed) process.exitCode = 1;
}

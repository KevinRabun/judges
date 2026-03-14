/**
 * Merge-verdict — single authoritative MERGE/HOLD decision with structured rationale.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VerdictFinding {
  file: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  blocking: boolean;
}

interface MergeDecision {
  decision: "MERGE" | "HOLD";
  confidence: number;
  riskScore: number;
  blockingFindings: VerdictFinding[];
  acceptedRisks: VerdictFinding[];
  dimensions: {
    security: number;
    quality: number;
    correctness: number;
    compliance: number;
  };
  rationale: string[];
  summary: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".cs", ".rs"]);

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

// ─── Pattern checks by dimension ───────────────────────────────────────────

interface DimPattern {
  regex: RegExp;
  category: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  dimension: "security" | "quality" | "correctness" | "compliance";
  blocking: boolean;
}

const DIMENSION_PATTERNS: DimPattern[] = [
  // Security (blocking)
  {
    regex: /\beval\s*\(/,
    category: "Security",
    title: "eval() injection",
    severity: "critical",
    dimension: "security",
    blocking: true,
  },
  {
    regex: /(?:password|secret|api[_-]?key)\s*[:=]\s*['"][^'"]{4,}['"]/,
    category: "Security",
    title: "Hardcoded credential",
    severity: "critical",
    dimension: "security",
    blocking: true,
  },
  {
    regex: /\.innerHTML\s*=/,
    category: "Security",
    title: "XSS via innerHTML",
    severity: "high",
    dimension: "security",
    blocking: true,
  },
  {
    regex: /(?:exec|spawn)\s*\([^)]*\+/,
    category: "Security",
    title: "Command injection",
    severity: "critical",
    dimension: "security",
    blocking: true,
  },
  {
    regex: /SELECT.*FROM.*\+\s*(?:req|input|user|param)/,
    category: "Security",
    title: "SQL injection",
    severity: "critical",
    dimension: "security",
    blocking: true,
  },

  // Quality (non-blocking)
  {
    regex: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
    category: "Quality",
    title: "Empty catch block",
    severity: "medium",
    dimension: "quality",
    blocking: false,
  },
  {
    regex: /console\.log\s*\(/,
    category: "Quality",
    title: "Console statement",
    severity: "low",
    dimension: "quality",
    blocking: false,
  },
  {
    regex: /debugger\b/,
    category: "Quality",
    title: "Debugger statement",
    severity: "medium",
    dimension: "quality",
    blocking: false,
  },
  {
    regex: /TODO|FIXME|HACK|XXX/,
    category: "Quality",
    title: "Open TODO",
    severity: "low",
    dimension: "quality",
    blocking: false,
  },

  // Correctness (blocking for critical)
  {
    regex: /new\s+Buffer\s*\(/,
    category: "Correctness",
    title: "Deprecated Buffer()",
    severity: "high",
    dimension: "correctness",
    blocking: false,
  },
  {
    regex: /process\.exit\s*\(\s*\)/,
    category: "Correctness",
    title: "Ungraceful exit",
    severity: "medium",
    dimension: "correctness",
    blocking: false,
  },

  // Compliance
  {
    regex: /\/\/\s*(?:eslint|tslint|prettier)-disable/,
    category: "Compliance",
    title: "Linter suppression",
    severity: "low",
    dimension: "compliance",
    blocking: false,
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string, baseDir: string): VerdictFinding[] {
  const findings: VerdictFinding[] = [];
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

    for (const pattern of DIMENSION_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          file: rel,
          line: i + 1,
          severity: pattern.severity,
          category: pattern.category,
          title: pattern.title,
          blocking: pattern.blocking,
        });
      }
    }
  }

  return findings;
}

function renderDecision(allFindings: VerdictFinding[], threshold: number): MergeDecision {
  const blocking = allFindings.filter((f) => f.blocking);
  const accepted = allFindings.filter((f) => !f.blocking);

  // Dimension scores
  const dimFindings = (dim: string) =>
    allFindings.filter((f) => {
      const p = DIMENSION_PATTERNS.find((dp) => dp.title === f.title);
      return p && p.dimension === dim;
    });

  const dimScore = (dim: string) => {
    const df = dimFindings(dim);
    const crits = df.filter((f) => f.severity === "critical").length;
    const highs = df.filter((f) => f.severity === "high").length;
    return Math.max(
      0,
      100 -
        crits * 25 -
        highs * 12 -
        df.filter((f) => f.severity === "medium").length * 5 -
        df.filter((f) => f.severity === "low").length,
    );
  };

  const dimensions = {
    security: dimScore("security"),
    quality: dimScore("quality"),
    correctness: dimScore("correctness"),
    compliance: dimScore("compliance"),
  };

  const riskScore = Math.round(
    dimensions.security * 0.4 + dimensions.quality * 0.2 + dimensions.correctness * 0.25 + dimensions.compliance * 0.15,
  );

  const decision: "MERGE" | "HOLD" = blocking.length > 0 || riskScore < threshold ? "HOLD" : "MERGE";
  const confidence = blocking.length === 0 ? Math.min(95, riskScore) : Math.max(60, 100 - blocking.length * 10);

  const rationale: string[] = [];
  if (blocking.length > 0) rationale.push(`${blocking.length} blocking finding(s) require resolution before merge`);
  if (dimensions.security < 70) rationale.push(`Security score (${dimensions.security}) is below acceptable threshold`);
  if (dimensions.correctness < 70)
    rationale.push(`Correctness score (${dimensions.correctness}) indicates potential bugs`);
  if (accepted.length > 0) rationale.push(`${accepted.length} non-blocking finding(s) accepted as known risks`);
  if (decision === "MERGE") rationale.push(`Risk score (${riskScore}) meets or exceeds threshold (${threshold})`);

  const summary =
    decision === "MERGE"
      ? `MERGE — Code passes review with ${accepted.length} accepted risk(s). Risk score: ${riskScore}/100.`
      : `HOLD — ${blocking.length} blocking finding(s) and risk score ${riskScore}/100 (threshold: ${threshold}).`;

  return {
    decision,
    confidence,
    riskScore,
    blockingFindings: blocking,
    acceptedRisks: accepted,
    dimensions,
    rationale,
    summary,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runMergeVerdict(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges merge-verdict — Single authoritative MERGE/HOLD decision

Usage:
  judges merge-verdict [dir]
  judges merge-verdict src/ --threshold 75 --format json

Options:
  [dir]                 Directory to scan (default: .)
  --threshold <n>       Minimum risk score for MERGE (default: 70)
  --format json         JSON output (for CI/CD integration)
  --help, -h            Show this help

Synthesizes security, quality, correctness, and compliance dimensions
into one MERGE or HOLD decision with structured rationale.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const threshStr = argv.find((_a: string, i: number) => argv[i - 1] === "--threshold");
  const threshold = threshStr ? parseInt(threshStr, 10) : 70;
  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        argv.indexOf(a) > 0 &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--threshold",
    ) || ".";

  const files = collectFiles(dir);
  const allFindings: VerdictFinding[] = [];
  for (const f of files) allFindings.push(...analyzeFile(f, dir));

  const result = renderDecision(allFindings, threshold);

  if (format === "json") {
    console.log(JSON.stringify({ ...result, timestamp: new Date().toISOString() }, null, 2));
  } else {
    const icon = result.decision === "MERGE" ? "✅" : "❌";
    console.log(`\n  ${icon} ${result.decision} (confidence: ${result.confidence}%)\n  ─────────────────────────────`);
    console.log(`    Risk Score: ${result.riskScore}/100 (threshold: ${threshold})`);
    console.log(`    Security:    ${result.dimensions.security}/100`);
    console.log(`    Quality:     ${result.dimensions.quality}/100`);
    console.log(`    Correctness: ${result.dimensions.correctness}/100`);
    console.log(`    Compliance:  ${result.dimensions.compliance}/100\n`);

    if (result.blockingFindings.length > 0) {
      console.log(`    Blocking (${result.blockingFindings.length}):`);
      for (const f of result.blockingFindings.slice(0, 10)) {
        console.log(`      🔴 [${f.category}] ${f.title} — ${f.file}:${f.line}`);
      }
      console.log();
    }

    if (result.rationale.length > 0) {
      console.log(`    Rationale:`);
      for (const r of result.rationale) console.log(`      → ${r}`);
      console.log();
    }

    console.log(`    ${result.summary}\n`);

    if (result.decision === "HOLD") process.exitCode = 1;
  }
}

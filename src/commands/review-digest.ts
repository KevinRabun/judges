/**
 * Review-digest — generate concise, role-appropriate review summaries.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DigestFinding {
  file: string;
  line: number;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  autoFixable: boolean;
}

interface DigestSummary {
  riskScore: number;
  badge: string;
  totalFindings: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  autoFixable: number;
  topCategories: Array<{ category: string; count: number }>;
  hotFiles: Array<{ file: string; count: number }>;
  actionItems: string[];
  startHere: DigestFinding[];
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".cs", ".rb", ".rs"]);

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

// ─── Pattern-based quick scan ───────────────────────────────────────────────

interface QuickDef {
  regex: RegExp;
  category: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  autoFix: boolean;
}

const QUICK_PATTERNS: QuickDef[] = [
  { regex: /eval\s*\(/, category: "Security", title: "eval() usage", severity: "critical", autoFix: false },
  {
    regex: /(?:password|secret|api[_-]?key)\s*[:=]\s*['"][^'"]+['"]/,
    category: "Security",
    title: "Hardcoded credential",
    severity: "critical",
    autoFix: false,
  },
  { regex: /TODO|FIXME|HACK|XXX/, category: "Debt", title: "Open TODO/FIXME", severity: "low", autoFix: false },
  { regex: /console\.\w+\s*\(/, category: "Quality", title: "Console statement", severity: "low", autoFix: true },
  {
    regex: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
    category: "Reliability",
    title: "Empty catch block",
    severity: "medium",
    autoFix: false,
  },
  {
    regex: /any(?:\s*[;,)\]}]|\s*$)/,
    category: "Types",
    title: "Explicit 'any' type",
    severity: "low",
    autoFix: false,
  },
  {
    regex: /(?:\.innerHTML|\.outerHTML)\s*=/,
    category: "Security",
    title: "innerHTML assignment (XSS risk)",
    severity: "high",
    autoFix: false,
  },
  {
    regex: /new\s+Buffer\s*\(/,
    category: "Security",
    title: "Deprecated new Buffer()",
    severity: "high",
    autoFix: true,
  },
  {
    regex: /process\.exit\s*\(/,
    category: "Reliability",
    title: "process.exit() call",
    severity: "medium",
    autoFix: false,
  },
  {
    regex: /(?:setTimeout|setInterval)\s*\(\s*['"]/,
    category: "Security",
    title: "String passed to timer (implicit eval)",
    severity: "high",
    autoFix: false,
  },
  {
    regex: /\.then\s*\([^)]*\)\s*(?:;|\n)\s*(?!\.catch)/,
    category: "Reliability",
    title: "Unhandled promise rejection",
    severity: "medium",
    autoFix: false,
  },
  { regex: /debugger\b/, category: "Quality", title: "Debugger statement", severity: "medium", autoFix: true },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string, baseDir: string): DigestFinding[] {
  const findings: DigestFinding[] = [];
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

    for (const pattern of QUICK_PATTERNS) {
      if (pattern.regex.test(line)) {
        findings.push({
          file: rel,
          line: i + 1,
          severity: pattern.severity,
          category: pattern.category,
          title: pattern.title,
          autoFixable: pattern.autoFix,
        });
      }
    }
  }

  return findings;
}

function buildDigest(allFindings: DigestFinding[]): DigestSummary {
  const critical = allFindings.filter((f) => f.severity === "critical").length;
  const high = allFindings.filter((f) => f.severity === "high").length;
  const medium = allFindings.filter((f) => f.severity === "medium").length;
  const low = allFindings.filter((f) => f.severity === "low").length;
  const autoFixable = allFindings.filter((f) => f.autoFixable).length;

  const riskScore = Math.max(0, 100 - critical * 20 - high * 10 - medium * 4 - low * 1);

  // Top categories
  const catMap = new Map<string, number>();
  for (const f of allFindings) catMap.set(f.category, (catMap.get(f.category) || 0) + 1);
  const topCategories = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  // Hot files
  const fileMap = new Map<string, number>();
  for (const f of allFindings) fileMap.set(f.file, (fileMap.get(f.file) || 0) + 1);
  const hotFiles = [...fileMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([file, count]) => ({ file, count }));

  // Action items
  const actionItems: string[] = [];
  if (critical > 0) actionItems.push(`Fix ${critical} critical finding(s) immediately`);
  if (high > 0) actionItems.push(`Address ${high} high-severity finding(s) before merge`);
  if (autoFixable > 0) actionItems.push(`${autoFixable} finding(s) can be auto-fixed`);
  if (hotFiles.length > 0) actionItems.push(`Focus on ${hotFiles[0].file} (${hotFiles[0].count} findings)`);

  // Start here — top 5 most impactful
  const startHere = allFindings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 5);

  const badge = riskScore >= 80 ? "LOW RISK" : riskScore >= 50 ? "MODERATE RISK" : "HIGH RISK";

  return {
    riskScore,
    badge,
    totalFindings: allFindings.length,
    critical,
    high,
    medium,
    low,
    autoFixable,
    topCategories,
    hotFiles,
    actionItems,
    startHere,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDigest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-digest — Generate concise, role-appropriate review summaries

Usage:
  judges review-digest [dir]
  judges review-digest src/ --format json
  judges review-digest src/ --out digest.md

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --out <file>          Write digest to file
  --help, -h            Show this help

Generates: risk score, top categories, hot files, action items,
"start here" list of most impactful findings, auto-fix counts.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const outFile = argv.find((_a: string, i: number) => argv[i - 1] === "--out");
  const dir =
    argv.find(
      (a) =>
        !a.startsWith("-") &&
        argv.indexOf(a) > 0 &&
        argv[argv.indexOf(a) - 1] !== "--format" &&
        argv[argv.indexOf(a) - 1] !== "--out",
    ) || ".";

  const files = collectFiles(dir);
  const allFindings: DigestFinding[] = [];
  for (const f of files) allFindings.push(...analyzeFile(f, dir));

  const digest = buildDigest(allFindings);

  if (format === "json") {
    const json = JSON.stringify({ digest, findings: allFindings, timestamp: new Date().toISOString() }, null, 2);
    if (outFile) {
      writeFileSync(outFile, json, "utf-8");
      console.log(`Digest written to ${outFile}`);
    } else console.log(json);
  } else {
    const icon = digest.riskScore >= 80 ? "✅" : digest.riskScore >= 50 ? "⚠️ " : "❌";
    let out = `\n  Review Digest: ${icon} ${digest.badge} (${digest.riskScore}/100)\n  ─────────────────────────────\n`;
    out += `    Findings: ${digest.totalFindings} (${digest.critical} critical, ${digest.high} high, ${digest.medium} medium, ${digest.low} low)\n`;
    out += `    Auto-fixable: ${digest.autoFixable}\n\n`;

    if (digest.actionItems.length > 0) {
      out += `    Action Items:\n`;
      for (const item of digest.actionItems) out += `      → ${item}\n`;
      out += `\n`;
    }

    if (digest.startHere.length > 0) {
      out += `    Start Here (highest impact):\n`;
      for (const f of digest.startHere) {
        const icon2 = f.severity === "critical" ? "🔴" : "🟡";
        out += `      ${icon2} [${f.category}] ${f.title} — ${f.file}:${f.line}\n`;
      }
      out += `\n`;
    }

    if (digest.hotFiles.length > 0) {
      out += `    Hot Files:\n`;
      for (const h of digest.hotFiles) out += `      ${h.file} — ${h.count} finding(s)\n`;
      out += `\n`;
    }

    if (digest.topCategories.length > 0) {
      out += `    Top Categories:\n`;
      for (const c of digest.topCategories) out += `      ${c.category}: ${c.count}\n`;
      out += `\n`;
    }

    if (outFile) {
      writeFileSync(outFile, out, "utf-8");
      console.log(`Digest written to ${outFile}`);
    } else console.log(out);
  }
}

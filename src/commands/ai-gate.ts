/**
 * AI gate — pre-commit/pre-PR guard that blocks AI-generated code
 * below a confidence threshold, routing it to human reviewers.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GateResult {
  file: string;
  confidence: number;
  aiLikelihood: number;
  blocked: boolean;
  reasons: string[];
}

// ─── AI detection heuristics ────────────────────────────────────────────────

interface AiSignal {
  name: string;
  weight: number;
  detect: (content: string, lines: string[]) => boolean;
}

const AI_SIGNALS: AiSignal[] = [
  {
    name: "AI-generated comment",
    weight: 20,
    detect: (c) =>
      /(?:generated\s+(?:by|with)\s+(?:ai|gpt|copilot|claude|chatgpt|llm)|ai[- ]generated|auto[- ]generated)/i.test(c),
  },
  {
    name: "Boilerplate comment structure",
    weight: 10,
    detect: (_c, lines) => lines.filter((l) => /^\s*\*\s+@(?:param|returns|throws|example)\b/.test(l)).length > 5,
  },
  {
    name: "Uniform code style",
    weight: 5,
    detect: (_c, lines) => {
      const indents = lines.filter((l) => l.trim().length > 0).map((l) => l.match(/^(\s*)/)?.[1].length || 0);
      const uniq = new Set(indents.filter((i) => i > 0));
      return uniq.size <= 2 && lines.length > 20;
    },
  },
  {
    name: "Excessive inline comments",
    weight: 10,
    detect: (_c, lines) => {
      const inlineComments = lines.filter((l) => /\S.*\/\/\s*\w/.test(l));
      return inlineComments.length > lines.length * 0.3;
    },
  },
  {
    name: "TODO/placeholder left by AI",
    weight: 15,
    detect: (c) => (c.match(/\/\/\s*TODO|\/\/\s*FIXME|\/\/\s*PLACEHOLDER/gi) || []).length > 2,
  },
  {
    name: "Generic example patterns",
    weight: 10,
    detect: (c) => /\bexample\.com\b|\blorem\s+ipsum\b|\bfoo\b.*\bbar\b/i.test(c),
  },
  {
    name: "Hallucination indicators",
    weight: 15,
    detect: (c) => {
      const emptyFns = (c.match(/\bfunction\s+\w+\s*\([^)]*\)\s*{\s*}/g) || []).length;
      const emptyArrows = (c.match(/=>\s*{\s*}/g) || []).length;
      return emptyFns + emptyArrows > 2;
    },
  },
  {
    name: "Unusually consistent naming",
    weight: 5,
    detect: (c) => {
      const vars = c.match(/(?:const|let|var)\s+(\w+)/g) || [];
      if (vars.length < 5) return false;
      const camel = vars.filter((v) => /[a-z][A-Z]/.test(v)).length;
      return camel / vars.length > 0.9;
    },
  },
];

function assessFile(filePath: string): GateResult {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const triggered: string[] = [];
  let aiScore = 0;

  for (const signal of AI_SIGNALS) {
    if (signal.detect(content, lines)) {
      triggered.push(signal.name);
      aiScore += signal.weight;
    }
  }

  const aiLikelihood = Math.min(100, aiScore);
  const confidence = Math.max(0, 100 - aiLikelihood);

  return { file: filePath, confidence, aiLikelihood, blocked: false, reasons: triggered };
}

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const EXTS = new Set([".ts", ".js", ".py", ".java", ".cs", ".go", ".rb", ".php", ".rs"]);

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        if (EXTS.has(extname(name).toLowerCase())) result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAiGate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges ai-gate — Pre-merge guard for AI-generated code

Usage:
  judges ai-gate <file-or-dir>
  judges ai-gate src/ --threshold 40
  judges ai-gate . --block --format json

Options:
  --threshold <n>   Block files with AI-likelihood above this score (default: 60)
  --block           Exit with code 1 when any file is blocked
  --report <file>   Save gate report to file
  --format json     JSON output
  --help, -h        Show this help

Uses heuristic signals: AI-generated comments, boilerplate patterns,
hallucination indicators, and naming consistency analysis.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const thresholdStr = argv.find((_a: string, i: number) => argv[i - 1] === "--threshold");
  const threshold = thresholdStr ? parseInt(thresholdStr) : 60;
  const shouldBlock = argv.includes("--block");
  const reportFile = argv.find((_a: string, i: number) => argv[i - 1] === "--report");
  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  let files: string[];
  try {
    readdirSync(target);
    files = collectFiles(target);
  } catch {
    files = [target];
  }

  const results: GateResult[] = [];
  for (const f of files) {
    const result = assessFile(f);
    result.blocked = result.aiLikelihood >= threshold;
    results.push(result);
  }

  const blocked = results.filter((r) => r.blocked);
  const passed = results.filter((r) => !r.blocked);

  const report = {
    results,
    summary: {
      total: results.length,
      blocked: blocked.length,
      passed: passed.length,
      threshold,
      gateStatus: blocked.length > 0 ? "FAILED" : "PASSED",
    },
    timestamp: new Date().toISOString(),
  };

  if (reportFile) {
    const dir = join(".", ".judges-ai-gate");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, reportFile), JSON.stringify(report, null, 2));
    console.log(`  Report saved to .judges-ai-gate/${reportFile}`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  AI Gate — ${results.length} files checked (threshold: ${threshold}%)`);
    console.log(`  Status: ${report.summary.gateStatus}`);
    console.log(`  ──────────────────────────`);

    if (blocked.length > 0) {
      console.log(`\n    ❌ BLOCKED (${blocked.length})`);
      for (const r of blocked) {
        console.log(`      ${r.file} — AI likelihood: ${r.aiLikelihood}% | Confidence: ${r.confidence}%`);
        for (const reason of r.reasons) {
          console.log(`        • ${reason}`);
        }
      }
    }

    if (passed.length > 0 && passed.some((r) => r.reasons.length > 0)) {
      console.log(`\n    ⚠️  PASSED WITH WARNINGS (${passed.filter((r) => r.reasons.length > 0).length})`);
      for (const r of passed.filter((r) => r.reasons.length > 0)) {
        console.log(`      ${r.file} — AI likelihood: ${r.aiLikelihood}%`);
      }
    }

    const clean = passed.filter((r) => r.reasons.length === 0);
    if (clean.length > 0) {
      console.log(`\n    ✅ CLEAN (${clean.length} files)`);
    }
    console.log("");
  }

  if (shouldBlock && blocked.length > 0) {
    process.exitCode = 1;
  }
}

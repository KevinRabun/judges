/**
 * AI pattern trend — track how AI-generated code patterns evolve
 * over time in a codebase. Detect drift in hallucination signals,
 * code quality, and AI reliance.
 *
 * All data local (.judges-ai-trend/).
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrendSnapshot {
  timestamp: string;
  metrics: TrendMetrics;
}

interface TrendMetrics {
  totalFiles: number;
  aiIndicatorCount: number;
  avgComplexity: number;
  todoCount: number;
  emptyFunctionCount: number;
  duplicateBlockCount: number;
  commentRatio: number;
  genericNamingCount: number;
  errorHandlingRatio: number;
}

// ─── Metric collection ──────────────────────────────────────────────────────

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

function collectMetrics(dir: string): TrendMetrics {
  const files = collectFiles(dir);
  let totalComplexity = 0;
  let totalTodos = 0;
  let totalEmptyFns = 0;
  let totalDuplicates = 0;
  let totalCommentLines = 0;
  let totalLines = 0;
  let totalGenericNames = 0;
  let totalTryCatch = 0;
  let totalFunctions = 0;
  let aiIndicators = 0;

  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    totalLines += lines.length;

    // Complexity
    let complexity = 1;
    for (const line of lines) {
      if (/\b(?:if|else\s+if|for|while|switch|catch|&&|\|\|)\b/.test(line)) complexity++;
    }
    totalComplexity += complexity;

    // TODOs
    totalTodos += (content.match(/\/\/\s*(?:TODO|FIXME|HACK|PLACEHOLDER)/gi) || []).length;

    // Empty functions
    totalEmptyFns += (content.match(/\bfunction\s+\w+\s*\([^)]*\)\s*{\s*}|=>\s*{\s*}/g) || []).length;

    // Duplicates
    const lineSet = new Map<string, number>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 20) lineSet.set(trimmed, (lineSet.get(trimmed) || 0) + 1);
    }
    for (const [, count] of lineSet) {
      if (count >= 3) totalDuplicates++;
    }

    // Comments
    totalCommentLines += lines.filter((l) => /^\s*(?:\/\/|\/?\*|#)/.test(l)).length;

    // Generic names
    totalGenericNames += (content.match(/(?:const|let|var)\s+(?:data|result|value|item|temp|tmp)\s*[=:]/g) || [])
      .length;

    // Error handling
    totalTryCatch += (content.match(/\btry\s*{/g) || []).length;
    totalFunctions += (content.match(/\bfunction\b|=>/g) || []).length;

    // AI indicators
    if (/generated\s+(?:by|with)\s+(?:ai|gpt|copilot|claude)/i.test(content)) aiIndicators++;
  }

  return {
    totalFiles: files.length,
    aiIndicatorCount: aiIndicators,
    avgComplexity: files.length > 0 ? Math.round(totalComplexity / files.length) : 0,
    todoCount: totalTodos,
    emptyFunctionCount: totalEmptyFns,
    duplicateBlockCount: totalDuplicates,
    commentRatio: totalLines > 0 ? Math.round((totalCommentLines / totalLines) * 100) : 0,
    genericNamingCount: totalGenericNames,
    errorHandlingRatio: totalFunctions > 0 ? Math.round((totalTryCatch / totalFunctions) * 100) : 0,
  };
}

// ─── Storage ────────────────────────────────────────────────────────────────

const TREND_DIR = join(".", ".judges-ai-trend");

function loadHistory(): TrendSnapshot[] {
  const histFile = join(TREND_DIR, "history.json");
  if (!existsSync(histFile)) return [];
  try {
    return JSON.parse(readFileSync(histFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveHistory(history: TrendSnapshot[]): void {
  if (!existsSync(TREND_DIR)) mkdirSync(TREND_DIR, { recursive: true });
  writeFileSync(join(TREND_DIR, "history.json"), JSON.stringify(history, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAiPatternTrend(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges ai-pattern-trend — Track AI-generated code pattern evolution

Usage:
  judges ai-pattern-trend [dir]            Capture snapshot and show trend
  judges ai-pattern-trend --capture        Capture current metrics only
  judges ai-pattern-trend --show           Show historical trend
  judges ai-pattern-trend --reset          Clear trend history

Options:
  --capture       Capture a new snapshot without showing history
  --show          Show trend without capturing
  --reset         Clear all trend data
  --last <n>      Show last N snapshots (default: 10)
  --format json   JSON output
  --help, -h      Show this help

Tracks: AI indicators, complexity, TODOs, empty functions,
duplicates, comment ratio, generic naming, error handling.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (argv.includes("--reset")) {
    saveHistory([]);
    console.log("  Trend history cleared.");
    return;
  }

  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";
  const showOnly = argv.includes("--show");
  const captureOnly = argv.includes("--capture");
  const lastN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--last") || "10");

  const history = loadHistory();

  // Capture snapshot
  if (!showOnly) {
    if (!existsSync(target)) {
      console.error(`  Path not found: ${target}`);
      return;
    }
    const metrics = collectMetrics(target);
    const snapshot: TrendSnapshot = { timestamp: new Date().toISOString(), metrics };
    history.push(snapshot);
    saveHistory(history);

    if (captureOnly) {
      console.log(`  ✅ Snapshot captured (${metrics.totalFiles} files)`);
      return;
    }
  }

  // Show trend
  const recent = history.slice(-lastN);

  if (format === "json") {
    console.log(
      JSON.stringify(
        { snapshots: recent, totalSnapshots: history.length, timestamp: new Date().toISOString() },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\n  AI Pattern Trend — ${history.length} snapshots\n  ──────────────────────────`);

  if (recent.length === 0) {
    console.log(`    No data yet. Run: judges ai-pattern-trend <dir>\n`);
    return;
  }

  // Metric headers
  const metricKeys: Array<{ key: keyof TrendMetrics; label: string; higherIsWorse: boolean }> = [
    { key: "totalFiles", label: "Files", higherIsWorse: false },
    { key: "aiIndicatorCount", label: "AI Markers", higherIsWorse: true },
    { key: "avgComplexity", label: "Avg Complex", higherIsWorse: true },
    { key: "todoCount", label: "TODOs", higherIsWorse: true },
    { key: "emptyFunctionCount", label: "Empty Fns", higherIsWorse: true },
    { key: "genericNamingCount", label: "Gen Names", higherIsWorse: true },
    { key: "commentRatio", label: "Comment %", higherIsWorse: false },
    { key: "errorHandlingRatio", label: "ErrHandl %", higherIsWorse: false },
  ];

  console.log(`\n    ${"Date".padEnd(12)} ${metricKeys.map((m) => m.label.padEnd(12)).join("")}`);
  console.log(`    ${"─".repeat(12 + metricKeys.length * 12)}`);

  for (const snap of recent) {
    const date = new Date(snap.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const vals = metricKeys.map((m) => String(snap.metrics[m.key]).padEnd(12)).join("");
    console.log(`    ${date.padEnd(12)} ${vals}`);
  }

  // Trend arrows
  if (recent.length >= 2) {
    const first = recent[0].metrics;
    const last = recent[recent.length - 1].metrics;
    console.log(`\n    Trends:`);
    for (const m of metricKeys) {
      const delta = (last[m.key] as number) - (first[m.key] as number);
      if (delta === 0) continue;
      const direction = delta > 0 ? "↑" : "↓";
      const good = delta > 0 !== m.higherIsWorse;
      const icon = good ? "✅" : "⚠️";
      console.log(`      ${icon} ${m.label}: ${direction} ${Math.abs(delta)} (${first[m.key]} → ${last[m.key]})`);
    }
  }

  console.log("");
}

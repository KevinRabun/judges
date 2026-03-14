/**
 * Watch judge — continuously monitor files and auto-evaluate on change.
 * Triggers tribunal review on AI-flagged patterns with live feedback.
 *
 * All data stored locally.
 */

import { existsSync, readFileSync, readdirSync, statSync, watchFile, unwatchFile } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WatchEvent {
  file: string;
  timestamp: string;
  findings: number;
  score: number;
}

// ─── Lightweight eval ───────────────────────────────────────────────────────

function quickEval(content: string): { score: number; findings: string[] } {
  const findings: string[] = [];
  const lines = content.split("\n");

  // AI-generated indicators
  if (/\/\/\s*(?:generated|auto-generated|copilot|chatgpt|claude)/i.test(content))
    findings.push("AI-generated marker detected");
  if ((content.match(/TODO|FIXME|HACK/g) || []).length > 3) findings.push(`Excessive TODO/FIXME/HACK markers`);
  if ((content.match(/catch\s*\(\s*\w*\s*\)\s*{\s*}/g) || []).length > 0) findings.push("Empty catch blocks");
  if (lines.some((l) => l.length > 200)) findings.push("Extremely long lines (>200 chars)");

  const importCount = lines.filter((l) => /^\s*import\s/.test(l)).length;
  if (importCount > 20) findings.push(`High import count (${importCount})`);

  const dupeBlocks = new Set<string>();
  for (let i = 0; i < lines.length - 2; i++) {
    const block = lines
      .slice(i, i + 3)
      .join("\n")
      .trim();
    if (block.length > 30 && dupeBlocks.has(block)) findings.push("Duplicate code block detected");
    dupeBlocks.add(block);
  }

  const score = Math.max(0, 100 - findings.length * 15);
  return { score, findings };
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

export function runWatchJudge(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges watch-judge — Continuously monitor files and auto-evaluate

Usage:
  judges watch-judge <dir>
  judges watch-judge src/ --interval 2000

Options:
  --interval <ms>   Polling interval in milliseconds (default: 3000)
  --min-score <n>   Only alert on files scoring below this (default: 70)
  --once            Run a single pass then exit
  --format json     JSON output
  --help, -h        Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const interval = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--interval") || "3000");
  const minScore = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--min-score") || "70");
  const once = argv.includes("--once");
  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  const files = collectFiles(target);
  if (files.length === 0) {
    console.log("  No source files found.");
    return;
  }

  // Single pass mode
  if (once) {
    const events: WatchEvent[] = [];
    for (const f of files) {
      let content: string;
      try {
        content = readFileSync(f, "utf-8");
      } catch {
        continue;
      }
      const { score, findings } = quickEval(content);
      if (score < minScore) {
        const rel = relative(target, f) || f;
        events.push({ file: rel, timestamp: new Date().toISOString(), findings: findings.length, score });
        if (format !== "json") {
          const icon = score < 40 ? "🔴" : score < 70 ? "🟠" : "🟡";
          console.log(`    ${icon} ${rel} — ${score}/100`);
          for (const finding of findings) console.log(`        → ${finding}`);
        }
      }
    }
    if (format === "json") {
      console.log(JSON.stringify({ events, scannedFiles: files.length, timestamp: new Date().toISOString() }, null, 2));
    } else if (events.length === 0) {
      console.log(`    ✅ All ${files.length} files score above ${minScore}`);
    }
    return;
  }

  // Watch mode
  console.log(`\n  👁 Watching ${files.length} files (interval: ${interval}ms, min-score: ${minScore})`);
  console.log(`  Press Ctrl+C to stop\n`);

  const mtimes = new Map<string, number>();
  for (const f of files) {
    try {
      mtimes.set(f, statSync(f).mtimeMs);
    } catch {
      /* skip */
    }
  }

  const checkFile = (f: string): void => {
    try {
      const stat = statSync(f);
      const prev = mtimes.get(f) || 0;
      if (stat.mtimeMs <= prev) return;
      mtimes.set(f, stat.mtimeMs);

      const content = readFileSync(f, "utf-8");
      const { score, findings } = quickEval(content);
      const rel = relative(target, f) || f;
      const ts = new Date().toLocaleTimeString();

      if (score < minScore) {
        const icon = score < 40 ? "🔴" : score < 70 ? "🟠" : "🟡";
        console.log(`  [${ts}] ${icon} ${rel} — ${score}/100`);
        for (const finding of findings) console.log(`        → ${finding}`);
      } else {
        console.log(`  [${ts}] 🟢 ${rel} — ${score}/100`);
      }
    } catch {
      /* file gone or inaccessible */
    }
  };

  for (const f of files) {
    watchFile(f, { interval }, () => checkFile(f));
  }

  process.on("SIGINT", () => {
    for (const f of files) unwatchFile(f);
    console.log("\n  Stopped watching.\n");
    process.exit(0);
  });
}

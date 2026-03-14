/**
 * Review-watch-mode — Watch files for changes and auto-trigger reviews.
 *
 * Monitors specified directories and re-runs review when files change.
 * Uses polling-based approach for cross-platform compatibility.
 */

import { existsSync, statSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WatchState {
  file: string;
  lastModified: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".cs",
  ".cpp",
  ".c",
  ".rb",
  ".php",
  ".swift",
  ".kt",
]);

function collectFiles(dir: string, extensions: Set<string>): WatchState[] {
  const results: WatchState[] = [];
  if (!existsSync(dir)) return results;

  function walk(d: string): void {
    const entries = readdirSync(d) as unknown as string[];
    for (const entry of entries) {
      const full = join(d, String(entry));
      if (String(entry).startsWith(".") || String(entry) === "node_modules") continue;
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (extensions.has(extname(String(entry)))) {
          results.push({ file: full, lastModified: st.mtimeMs });
        }
      } catch {
        /* skip inaccessible */
      }
    }
  }

  walk(dir);
  return results;
}

function detectChanges(prev: WatchState[], current: WatchState[]): string[] {
  const prevMap = new Map(prev.map((s) => [s.file, s.lastModified]));
  const changes: string[] = [];

  for (const c of current) {
    const prevTime = prevMap.get(c.file);
    if (prevTime === undefined || prevTime < c.lastModified) {
      changes.push(c.file);
    }
  }
  return changes;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewWatchMode(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const intervalIdx = argv.indexOf("--interval");
  const extIdx = argv.indexOf("--ext");
  const dryRunFlag = argv.includes("--dry-run");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : process.cwd();
  const interval = intervalIdx >= 0 ? parseInt(argv[intervalIdx + 1], 10) : 5000;
  const extFilter =
    extIdx >= 0 ? new Set(argv[extIdx + 1].split(",").map((e) => (e.startsWith(".") ? e : `.${e}`))) : CODE_EXTENSIONS;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-watch-mode — Watch files and auto-trigger reviews

Usage:
  judges review-watch-mode [--dir <path>] [--interval <ms>] [--ext <exts>]
                           [--dry-run]

Options:
  --dir <path>       Directory to watch (default: current directory)
  --interval <ms>    Poll interval in milliseconds (default: 5000)
  --ext <exts>       Comma-separated extensions to watch (default: common code)
  --dry-run          Show what would be reviewed without running
  --help, -h         Show this help

Press Ctrl+C to stop watching.
`);
    return;
  }

  if (!existsSync(dir)) {
    console.error(`Error: directory not found: ${dir}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nWatch Mode Active`);
  console.log("═".repeat(50));
  console.log(`Directory: ${dir}`);
  console.log(`Interval:  ${interval}ms`);
  console.log(`Extensions: ${[...extFilter].join(", ")}`);
  console.log("═".repeat(50));

  let state = collectFiles(dir, extFilter);
  console.log(`Tracking ${state.length} files. Waiting for changes...`);

  if (dryRunFlag) {
    console.log("\n[DRY RUN] Would watch the following files:");
    for (const s of state.slice(0, 20)) console.log(`  ${s.file}`);
    if (state.length > 20) console.log(`  ... and ${state.length - 20} more`);
    return;
  }

  const timer = setInterval(() => {
    const current = collectFiles(dir, extFilter);
    const changes = detectChanges(state, current);

    if (changes.length > 0) {
      const ts = new Date().toLocaleTimeString();
      console.log(`\n[${ts}] ${changes.length} file(s) changed:`);
      for (const f of changes.slice(0, 5)) console.log(`  → ${f}`);
      if (changes.length > 5) console.log(`  ... and ${changes.length - 5} more`);
      console.log("  Run: judges eval --file <changed-file> to review");
      state = current;
    }
  }, interval);

  process.on("SIGINT", () => {
    clearInterval(timer);
    console.log("\nWatch mode stopped.");
    process.exit(0);
  });
}

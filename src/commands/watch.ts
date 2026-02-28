/**
 * `judges watch` — Watch files for changes and re-evaluate.
 *
 * Usage:
 *   judges watch src/                     # Watch directory
 *   judges watch src/app.ts               # Watch single file
 *   judges watch src/ --judge cyber       # Single judge only
 *   judges watch src/ --fail-on-findings  # Exit 1 on first failure
 */

import { existsSync, readFileSync, statSync, watch as fsWatch } from "fs";
import { resolve, extname, join, relative } from "path";

import { evaluateWithTribunal, evaluateWithJudge } from "../evaluators/index.js";
import { getJudge } from "../judges/index.js";
import type { Finding } from "../types.js";

// ─── Language Detection ─────────────────────────────────────────────────────

const WATCH_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".cs",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
]);

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".h": "c",
  ".hpp": "cpp",
};

function detectLanguage(filePath: string): string {
  const ext = extname(filePath.toLowerCase());
  return EXT_TO_LANG[ext] || "typescript";
}

// ─── Watch Arguments ────────────────────────────────────────────────────────

interface WatchArgs {
  path: string;
  judge: string | undefined;
  failOnFindings: boolean;
}

export function parseWatchArgs(argv: string[]): WatchArgs {
  const args: WatchArgs = {
    path: ".",
    judge: undefined,
    failOnFindings: false,
  };

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--judge":
      case "-j":
        args.judge = argv[++i];
        break;
      case "--fail-on-findings":
        args.failOnFindings = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          args.path = arg;
        }
        break;
    }
  }
  return args;
}

// ─── Evaluate a Single File ────────────────────────────────────────────────

function evaluateFile(filePath: string, language: string, judgeId?: string): void {
  const code = readFileSync(filePath, "utf-8");
  const rel = relative(process.cwd(), filePath);

  let findings: Finding[];
  let score: number;
  let verdict: string;

  if (judgeId) {
    const judge = getJudge(judgeId);
    if (!judge) {
      console.error(`  Unknown judge: ${judgeId}`);
      return;
    }
    const evaluation = evaluateWithJudge(judge, code, language);
    findings = evaluation.findings;
    score = evaluation.score;
    verdict = evaluation.verdict;
  } else {
    const result = evaluateWithTribunal(code, language);
    findings = result.evaluations.flatMap((e) => e.findings);
    score = result.overallScore;
    verdict = result.overallVerdict;
  }

  const critical = findings.filter((f) => f.severity === "critical").length;
  const high = findings.filter((f) => f.severity === "high").length;

  const icon = verdict === "pass" ? "✅" : verdict === "warning" ? "⚠️ " : "❌";
  const time = new Date().toLocaleTimeString();

  console.log(`  ${icon} [${time}] ${rel}  ${score}/100  ${findings.length} findings (${critical}C ${high}H)`);

  // Show top 3 critical/high findings inline
  const topFindings = findings.filter((f) => f.severity === "critical" || f.severity === "high").slice(0, 3);
  for (const f of topFindings) {
    const line = f.lineNumbers?.[0] ? `:${f.lineNumbers[0]}` : "";
    console.log(`     ${f.ruleId}${line}: ${f.title}`);
  }
}

// ─── Debounce Helper ────────────────────────────────────────────────────────

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

// ─── Main Watch Command ────────────────────────────────────────────────────

export function runWatch(argv: string[]): void {
  const args = parseWatchArgs(argv);
  const target = resolve(args.path);

  if (!existsSync(target)) {
    console.error(`Error: Path not found: ${target}`);
    process.exit(1);
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              Judges Panel — Watch Mode                      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Watching: ${args.path}`);
  if (args.judge) console.log(`  Judge   : ${args.judge}`);
  console.log("  Press Ctrl+C to stop.\n");

  const isDir = statSync(target).isDirectory();

  if (isDir) {
    // Watch directory recursively
    const watcher = fsWatch(target, { recursive: true });

    watcher.on("change", (_event, filename) => {
      if (!filename) return;
      const fname = filename.toString();
      const ext = extname(fname).toLowerCase();
      if (!WATCH_EXTENSIONS.has(ext)) return;

      const fullPath = join(target, fname);
      if (!existsSync(fullPath)) return;

      const debouncedEval = debounce(() => {
        try {
          evaluateFile(fullPath, detectLanguage(fname), args.judge);
        } catch (err) {
          console.error(`  Error evaluating ${fname}:`, err);
        }
      }, 300);
      debouncedEval();
    });
  } else {
    // Watch single file
    const debouncedEval = debounce(() => {
      try {
        evaluateFile(target, detectLanguage(target), args.judge);
      } catch (err) {
        console.error(`  Error evaluating ${args.path}:`, err);
      }
    }, 300);

    const watcher = fsWatch(target);
    watcher.on("change", () => debouncedEval());

    // Run initial evaluation
    evaluateFile(target, detectLanguage(target), args.judge);
  }
}

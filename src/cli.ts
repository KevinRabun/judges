#!/usr/bin/env node

/**
 * Judges Panel — CLI Evaluator
 *
 * Evaluate code directly from the command line without MCP setup.
 *
 * Usage:
 *   judges eval --file src/app.ts                         # evaluate a file
 *   judges eval --file src/app.ts --language python       # explicit language
 *   judges eval --file src/app.ts --format sarif          # SARIF output
 *   judges eval --file src/app.ts --format html           # HTML report
 *   judges eval --file src/app.ts --judge cybersecurity   # single judge
 *   judges eval --fail-on-findings src/app.ts             # exit 1 on fail
 *   cat src/app.ts | judges eval --language typescript    # stdin pipe
 *   judges init                                           # interactive setup
 *   judges fix src/app.ts --apply                         # auto-fix findings
 *   judges watch src/                                     # watch mode
 *   judges report .                                       # project report
 *   judges hook install                                   # install pre-commit
 *   judges eval --help                                    # show help
 */

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "fs";
import { resolve, extname, dirname, relative, join } from "path";
import { fileURLToPath } from "url";

import {
  evaluateWithTribunal,
  evaluateWithJudge,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "./evaluators/index.js";
import { getJudge, getJudgeSummaries } from "./judges/index.js";
import { verdictToSarif } from "./formatters/sarif.js";
import { verdictToHtml } from "./formatters/html.js";
import { verdictToJUnit } from "./formatters/junit.js";
import { verdictToCodeClimate } from "./formatters/codeclimate.js";
import { runReport } from "./commands/report.js";
import { runHook } from "./commands/hook.js";
import { runDiff } from "./commands/diff.js";
import { runDeps } from "./commands/deps.js";
import { runBaseline } from "./commands/baseline.js";
import { runCompletions } from "./commands/completions.js";
import { runDocs } from "./commands/docs.js";
import { generateGitLabCi, generateAzurePipelines, generateBitbucketPipelines } from "./commands/ci-templates.js";
import { getPreset, listPresets, composePresets } from "./presets.js";
import { parseConfig } from "./config.js";
import type { JudgesConfig } from "./types.js";
import { applyPatches, type PatchCandidate } from "./commands/fix.js";
import { runFeedback } from "./commands/feedback.js";
import { runBenchmark } from "./commands/benchmark.js";
import { runRule } from "./commands/rule.js";
import { runPack } from "./commands/language-packs.js";
import { runConfig } from "./commands/config-share.js";
import { formatComparisonReport, formatFullComparisonMatrix, TOOL_PROFILES } from "./comparison.js";

// ─── Language Detection from Extension ──────────────────────────────────────

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
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".tf": "terraform",
  ".hcl": "terraform",
  ".dockerfile": "dockerfile",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".psm1": "powershell",
};

function detectLanguage(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  const base = filePath.toLowerCase();
  if (base.endsWith("dockerfile") || base.includes("dockerfile.")) return "dockerfile";
  const ext = extname(base);
  return EXT_TO_LANG[ext];
}

// ─── Argument Parsing ───────────────────────────────────────────────────────

interface CliArgs {
  command: string | undefined;
  file: string | undefined;
  language: string | undefined;
  format: "text" | "json" | "sarif" | "markdown" | "html" | "junit" | "codeclimate";
  judge: string | undefined;
  help: boolean;
  failOnFindings: boolean;
  baseline: string | undefined;
  summary: boolean;
  config: string | undefined;
  preset: string | undefined;
  minScore: number | undefined;
  noColor: boolean;
  verbose: boolean;
  quiet: boolean;
  fix: boolean;
  exclude: string[];
  include: string[];
  maxFiles: number | undefined;
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: undefined,
    file: undefined,
    language: undefined,
    format: "text",
    judge: undefined,
    help: false,
    failOnFindings: false,
    baseline: undefined,
    summary: false,
    config: undefined,
    preset: undefined,
    minScore: undefined,
    noColor: false,
    verbose: false,
    quiet: false,
    fix: false,
    exclude: [],
    include: [],
    maxFiles: undefined,
  };

  // First non-flag arg is the command
  let i = 2; // skip node + script
  if (i < argv.length && !argv[i].startsWith("-")) {
    args.command = argv[i];
    i++;
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
      case "-f":
        args.file = argv[++i];
        break;
      case "--language":
      case "-l":
        args.language = argv[++i];
        break;
      case "--format":
      case "-o":
        args.format = argv[++i] as CliArgs["format"];
        break;
      case "--judge":
      case "-j":
        args.judge = argv[++i];
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--fail-on-findings":
        args.failOnFindings = true;
        break;
      case "--baseline":
      case "-b":
        args.baseline = argv[++i];
        break;
      case "--summary":
        args.summary = true;
        break;
      case "--config":
      case "-c":
        args.config = argv[++i];
        break;
      case "--preset":
      case "-p":
        args.preset = argv[++i];
        break;
      case "--min-score":
        args.minScore = parseInt(argv[++i], 10);
        break;
      case "--no-color":
        args.noColor = true;
        break;
      case "--verbose":
        args.verbose = true;
        break;
      case "--quiet":
        args.quiet = true;
        break;
      case "--fix":
        args.fix = true;
        break;
      case "--exclude":
      case "-x":
        args.exclude.push(argv[++i]);
        break;
      case "--include":
      case "-i":
        args.include.push(argv[++i]);
        break;
      case "--max-files":
        args.maxFiles = parseInt(argv[++i], 10);
        break;
      default:
        // If it looks like a file path (not a flag), treat as --file
        if (!arg.startsWith("-") && !args.file) {
          args.file = arg;
        }
        break;
    }
  }

  return args;
}

// ─── Help Text ──────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
Judges Panel — CLI Code Evaluator

USAGE:
  judges eval [options] [file]        Evaluate code with the full tribunal
  judges eval --judge <id> [file]     Evaluate with a single judge
  judges init                         Interactive project setup wizard
  judges fix <file> [--apply]         Preview / apply auto-fixes
  judges watch <path>                 Watch files and re-evaluate on save
  judges report <dir>                 Generate project-level report
  judges hook install                 Install pre-commit git hook
  judges diff                         Evaluate only changed lines from a diff
  judges deps [dir]                   Analyze dependencies for supply-chain risks
  judges baseline create <file>       Create a findings baseline
  judges ci-templates <provider>      Generate CI pipeline template
  judges completions <shell>          Generate shell completions
  judges docs                         Generate rule documentation
  judges feedback                     Track finding feedback (false positives)
  judges benchmark                    Run detection accuracy benchmarks
  judges rule                         Create and manage custom rules
  judges pack                         Manage language-specific rule packs
  judges config                       Export/import shared team configs
  judges compare                      Compare judges vs other tools
  judges list                         List all available judges
  judges version                      Show version information
  judges --help                       Show this help

EVAL OPTIONS:
  --file, -f <path>          File to evaluate (or pass as positional arg)
  --language, -l <lang>      Language override (auto-detected from extension)
  --format, -o <fmt>         Output: text, json, sarif, markdown, html, junit, codeclimate
  --judge, -j <id>           Run a single judge instead of the full tribunal
  --fail-on-findings         Exit with code 1 when verdict is fail
  --baseline, -b <path>      Suppress findings already in baseline file
  --summary                  Show one-line summary instead of full output
  --config, -c <path>        Path to .judgesrc config file
  --preset, -p <name>        Use a named preset (strict, lenient, security-only, startup, compliance, performance)
                             Compose presets with commas: --preset security-only,performance
  --min-score <n>            Fail if score drops below threshold (0-100)
  --exclude, -x <glob>       Exclude files matching glob pattern (repeatable)
  --include, -i <glob>       Only include files matching glob pattern (repeatable)
  --max-files <n>            Maximum number of files to analyze in directory mode
  --no-color                 Disable colored output
  --verbose                  Show detailed evaluation information
  --quiet                    Suppress non-essential output
  --fix                      Auto-fix findings after evaluation (applies patches in-place)
  --help, -h                 Show this help

FIX OPTIONS:
  --apply, -a                Apply patches in-place (default is dry-run)
  --judge, -j <id>           Only apply fixes from a specific judge

WATCH OPTIONS:
  --judge, -j <id>           Only evaluate with a specific judge
  --fail-on-findings         Exit on first failure

DIFF OPTIONS:
  --file, -f <path>          Read diff from file (or pipe via stdin)
  --language, -l <lang>      Language override for all files in diff

DEPS OPTIONS:
  --file, -f <path>          Specific manifest to analyze
  --format, -o <fmt>         Output: text, json

CI-TEMPLATES:
  judges ci-templates github  GitHub Actions workflow
  judges ci-templates gitlab  GitLab CI pipeline
  judges ci-templates azure   Azure Pipelines
  judges ci-templates bitbucket  Bitbucket Pipelines

COMPLETIONS:
  judges completions bash        Bash completions
  judges completions zsh         Zsh completions
  judges completions fish        Fish completions
  judges completions powershell  PowerShell completions

STDIN:
  cat file.ts | judges eval --language typescript
  git diff | judges diff --language typescript

EXAMPLES:
  judges eval src/app.ts
  judges eval --file api.py --format sarif
  judges eval --judge cybersecurity server.ts
  judges eval --format junit --fail-on-findings src/
  judges eval --baseline .judges-baseline.json src/app.ts
  judges eval --preset security-only src/app.ts
  judges eval --config .judgesrc src/app.ts
  judges eval --min-score 80 src/app.ts
  judges eval src/ --exclude "**/*.test.ts" --exclude "**/__mocks__/**"
  judges eval src/ --include "**/*.py" --include "**/*.ts"
  judges eval src/ --max-files 50
  judges init
  judges fix src/app.ts --apply
  judges watch src/
  judges report .
  judges hook install
  judges diff --file changes.patch
  judges deps .
  judges baseline create --file src/app.ts
  judges ci-templates github
  judges docs --output docs/rules/
  judges completions bash >> ~/.bashrc
  judges list

SUPPORTED LANGUAGES:
  typescript, javascript, python, rust, go, java, csharp,
  ruby, php, swift, kotlin, scala, c, cpp, yaml, json,
  terraform, dockerfile, bash
`);
}

// ─── Read Code Input ────────────────────────────────────────────────────────

function readCode(filePath: string | undefined): { code: string; resolvedPath: string | undefined } {
  if (filePath) {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) {
      console.error(`Error: File not found: ${resolved}`);
      process.exit(1);
    }
    return { code: readFileSync(resolved, "utf-8"), resolvedPath: resolved };
  }

  // Try reading from stdin
  if (!process.stdin.isTTY) {
    try {
      const code = readFileSync(0, "utf-8"); // fd 0 = stdin
      return { code, resolvedPath: undefined };
    } catch {
      console.error("Error: Could not read from stdin");
      process.exit(1);
    }
  }

  console.error("Error: No file specified and no stdin input detected.");
  console.error("Usage: judges eval --file <path> or cat file | judges eval --language <lang>");
  process.exit(1);
}

// ─── Glob Matching ──────────────────────────────────────────────────────────

/**
 * Simple glob pattern matching (supports *, **, and ?).
 * Matches against relative file paths using forward slashes.
 */
export function globToRegex(pattern: string): RegExp {
  // Normalize to forward slashes
  let p = pattern.replace(/\\/g, "/");
  // Escape regex chars except * and ?
  p = p.replace(/[.+^${}()|[\]]/g, "\\$&");
  // ** matches any path segment(s)
  p = p.replace(/\*\*/g, "{{GLOBSTAR}}");
  // * matches anything except /
  p = p.replace(/\*/g, "[^/]*");
  // ? matches any single char except /
  p = p.replace(/\?/g, "[^/]");
  // Restore globstar
  p = p.replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${p}$`, "i");
}

export function matchesGlob(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((pat) => {
    const re = globToRegex(pat);
    // Match against full path or just the filename
    return re.test(normalized) || re.test(normalized.split("/").pop() || "");
  });
}

// ─── Glob / Multi-File Resolution ───────────────────────────────────────────

const SUPPORTED_EXTENSIONS = new Set(Object.keys(EXT_TO_LANG));

const DEFAULT_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "__pycache__",
  "target",
  "vendor",
]);

interface CollectOptions {
  exclude?: string[];
  include?: string[];
  maxFiles?: number;
}

export function collectFiles(target: string, options: CollectOptions = {}): string[] {
  const resolved = resolve(target);
  if (!existsSync(resolved)) return [];

  const stat = statSync(resolved);
  if (stat.isFile()) return [resolved];

  if (stat.isDirectory()) {
    const files: string[] = [];
    walkDir(resolved, resolved, files, options);
    if (options.maxFiles && files.length > options.maxFiles) {
      return files.slice(0, options.maxFiles);
    }
    return files;
  }

  return [];
}

function walkDir(dir: string, root: string, results: string[], options: CollectOptions): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(root, fullPath);

    // Skip common non-source directories
    if (entry.isDirectory()) {
      if (DEFAULT_SKIP_DIRS.has(entry.name)) continue;
      // Check if directory matches an exclude pattern
      if (options.exclude && matchesGlob(relPath + "/", options.exclude)) continue;
      walkDir(fullPath, root, results, options);
    } else if (entry.isFile()) {
      // Apply exclude patterns
      if (options.exclude && matchesGlob(relPath, options.exclude)) continue;

      // Apply include patterns — if include patterns are specified, ONLY include matching files
      if (options.include && options.include.length > 0) {
        if (!matchesGlob(relPath, options.include)) continue;
      } else {
        // Default: only include files with supported extensions
        const ext = extname(entry.name);
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      }

      results.push(fullPath);
      // Early exit if we've hit maxFiles
      if (options.maxFiles && results.length >= options.maxFiles) return;
    }
  }
}

function isDirectory(filePath: string): boolean {
  try {
    return statSync(resolve(filePath)).isDirectory();
  } catch {
    return false;
  }
}

// ─── Format Output ──────────────────────────────────────────────────────────

function formatTribunalOutput(
  verdict: ReturnType<typeof evaluateWithTribunal>,
  format: CliArgs["format"],
  filePath?: string,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(verdict, null, 2);
    case "sarif":
      return JSON.stringify(verdictToSarif(verdict, filePath), null, 2);
    case "markdown":
      return formatVerdictAsMarkdown(verdict);
    case "html":
      // HTML is handled separately in runCli (needs async import)
      return formatTextOutput(verdict);
    case "text":
    default:
      return formatTextOutput(verdict);
  }
}

function formatTextOutput(verdict: ReturnType<typeof evaluateWithTribunal>): string {
  const lines: string[] = [];
  const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║              Judges Panel — Evaluation Result               ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Verdict  : ${verdict.overallVerdict.toUpperCase()}`);
  lines.push(`  Score    : ${verdict.overallScore}/100`);
  lines.push(`  Critical : ${verdict.criticalCount}`);
  lines.push(`  High     : ${verdict.highCount}`);
  lines.push(`  Findings : ${totalFindings}`);
  lines.push(`  Judges   : ${verdict.evaluations.length}`);
  lines.push("");

  // Per-judge table
  lines.push("  Per-Judge Breakdown:");
  lines.push("  " + "─".repeat(60));
  for (const evaluation of verdict.evaluations) {
    const icon = evaluation.verdict === "pass" ? "✅" : evaluation.verdict === "warning" ? "⚠️ " : "❌";
    const name = evaluation.judgeName.padEnd(28);
    const score = String(evaluation.score).padStart(3);
    const findings = String(evaluation.findings.length).padStart(2);
    lines.push(`  ${icon} ${name} ${score}/100   ${findings} finding(s)`);
  }
  lines.push("");

  // Top findings
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);
  const critical = allFindings.filter((f) => f.severity === "critical" || f.severity === "high");
  if (critical.length > 0) {
    lines.push("  Critical & High Findings:");
    lines.push("  " + "─".repeat(60));
    for (const f of critical.slice(0, 20)) {
      lines.push(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}`);
      if (f.lineNumbers && f.lineNumbers.length > 0) {
        lines.push(`             Line ${f.lineNumbers[0]}: ${f.description.slice(0, 100)}`);
      }
    }
    if (critical.length > 20) {
      lines.push(`  ... and ${critical.length - 20} more critical/high findings`);
    }
    lines.push("");
  }

  // Exit guidance
  if (verdict.overallVerdict === "fail") {
    lines.push("  ⛔ FAIL — This code has issues that should be addressed before shipping.");
  } else if (verdict.overallVerdict === "warning") {
    lines.push("  ⚠️  WARNING — Review findings above before proceeding.");
  } else {
    lines.push("  ✅ PASS — No critical issues detected.");
  }
  lines.push("");

  return lines.join("\n");
}

function formatSingleJudgeTextOutput(evaluation: ReturnType<typeof evaluateWithJudge>): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push(`║  Judge: ${evaluation.judgeName.padEnd(49)}║`);
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Verdict  : ${evaluation.verdict.toUpperCase()}`);
  lines.push(`  Score    : ${evaluation.score}/100`);
  lines.push(`  Findings : ${evaluation.findings.length}`);
  lines.push("");

  for (const f of evaluation.findings) {
    lines.push(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}`);
    if (f.lineNumbers && f.lineNumbers.length > 0) {
      lines.push(`             Line ${f.lineNumbers[0]}: ${f.description.slice(0, 120)}`);
    }
    if (f.suggestedFix) {
      lines.push(`             Fix: ${f.suggestedFix.slice(0, 120)}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

// ─── List Judges ────────────────────────────────────────────────────────────

function listJudges(): void {
  const judges = getJudgeSummaries();
  console.log("");
  console.log("  Available Judges:");
  console.log("  " + "─".repeat(60));
  for (const j of judges) {
    console.log(`  ${j.id.padEnd(30)} ${j.name}`);
  }
  console.log("");
  console.log(`  Total: ${judges.length} judges`);
  console.log("");
}

// ─── Version ────────────────────────────────────────────────────────────────

function getPackageVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const pkgPath = resolve(__dirname, "..", "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      return pkg.version || "unknown";
    }
  } catch {
    // fallback
  }
  return "unknown";
}

function printVersion(): void {
  const version = getPackageVersion();
  console.log(`@kevinrabun/judges v${version}`);
  console.log(`Node.js ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
}

// ─── Main CLI Entry Point ───────────────────────────────────────────────────

export async function runCli(argv: string[]): Promise<void> {
  const args = parseCliArgs(argv);

  // ─── Version Command ─────────────────────────────────────────────────
  if (args.command === "version" || args.command === "--version" || argv.includes("--version") || argv.includes("-V")) {
    printVersion();
    return;
  }

  if (args.help || (!args.command && !args.file)) {
    printHelp();
    process.exit(0);
  }

  // ─── Init Command ──────────────────────────────────────────────────────
  if (args.command === "init") {
    const { runInit } = await import("./commands/init.js");
    await runInit(args.file || ".");
    process.exit(0);
  }

  // ─── Fix Command ──────────────────────────────────────────────────────
  if (args.command === "fix") {
    const { runFix } = await import("./commands/fix.js");
    runFix(argv);
    return; // runFix calls process.exit internally
  }

  // ─── Watch Command ────────────────────────────────────────────────────
  if (args.command === "watch") {
    const { runWatch } = await import("./commands/watch.js");
    runWatch(argv);
    return; // Watch runs indefinitely
  }

  // ─── Report Command ───────────────────────────────────────────────────
  if (args.command === "report") {
    runReport(argv);
    return;
  }

  // ─── Hook Command ────────────────────────────────────────────────────
  if (args.command === "hook") {
    runHook(argv);
    return;
  }

  // ─── Diff Command ────────────────────────────────────────────────────
  if (args.command === "diff") {
    runDiff(argv);
    return;
  }

  // ─── Deps Command ────────────────────────────────────────────────────
  if (args.command === "deps") {
    runDeps(argv);
    return;
  }

  // ─── Baseline Command ────────────────────────────────────────────────
  if (args.command === "baseline") {
    runBaseline(argv);
    return;
  }

  // ─── CI Templates Command ────────────────────────────────────────────
  if (args.command === "ci-templates") {
    runCiTemplates(argv);
    return;
  }

  // ─── Completions Command ─────────────────────────────────────────────
  if (args.command === "completions") {
    runCompletions(argv);
    return;
  }

  // ─── Docs Command ────────────────────────────────────────────────────
  if (args.command === "docs") {
    runDocs(argv);
    return;
  }

  // ─── Feedback Command ─────────────────────────────────────────────────
  if (args.command === "feedback") {
    runFeedback(argv);
    return;
  }

  // ─── Benchmark Command ────────────────────────────────────────────────
  if (args.command === "benchmark") {
    runBenchmark(argv);
    return;
  }

  // ─── Rule Command ─────────────────────────────────────────────────────
  if (args.command === "rule") {
    runRule(argv);
    return;
  }

  // ─── Pack Command ─────────────────────────────────────────────────────
  if (args.command === "pack") {
    runPack(argv);
    return;
  }

  // ─── Config Command ───────────────────────────────────────────────────
  if (args.command === "config") {
    runConfig(argv);
    return;
  }

  // ─── Compare Command ─────────────────────────────────────────────────
  if (args.command === "compare") {
    const toolName = argv[3];
    if (!toolName || toolName === "--help" || toolName === "-h" || toolName === "all") {
      console.log(formatFullComparisonMatrix());
    } else {
      const profile = TOOL_PROFILES.find((t) => t.name.toLowerCase() === toolName.toLowerCase());
      if (!profile) {
        console.error(`Unknown tool: ${toolName}`);
        console.error(`Available: ${TOOL_PROFILES.map((t) => t.name).join(", ")}, all`);
        process.exit(1);
      }
      console.log(formatComparisonReport(toolName));
    }
    process.exit(0);
  }

  // ─── List Command ────────────────────────────────────────────────────
  if (args.command === "list") {
    listJudges();
    process.exit(0);
  }

  // ─── Eval Command ────────────────────────────────────────────────────
  if (args.command === "eval" || args.file) {
    const startTime = Date.now();

    // Load config from file or preset
    const evalConfig = loadEvalConfig(args);

    // Load baseline if specified (from CLI flag — config doesn't carry baseline)
    let baselineFindings: Set<string> | undefined;
    if (args.baseline) {
      baselineFindings = loadBaseline(args.baseline);
    }

    // Build evaluation options from config
    const evalOptions = evalConfig ? { config: evalConfig } : undefined;

    // ── Multi-file / directory mode ──────────────────────────────────────
    const target = args.file;
    if (target && isDirectory(target)) {
      // Merge exclude/include from config if not overridden by CLI
      const excludePatterns = args.exclude.length > 0 ? args.exclude : (evalConfig?.exclude ?? []);
      const includePatterns = args.include.length > 0 ? args.include : (evalConfig?.include ?? []);
      const maxFilesLimit = args.maxFiles ?? evalConfig?.maxFiles;

      const files = collectFiles(target, {
        exclude: excludePatterns,
        include: includePatterns,
        maxFiles: maxFilesLimit,
      });
      if (files.length === 0) {
        console.error(`No supported source files found in: ${target}`);
        process.exit(1);
      }

      if (!args.quiet) {
        console.log(`\n  Scanning ${files.length} file(s) in ${target}…\n`);
      }

      let totalFindings = 0;
      let totalCritical = 0;
      let totalHigh = 0;
      let failCount = 0;
      let totalFixed = 0;

      for (let idx = 0; idx < files.length; idx++) {
        const filePath = files[idx];
        const relPath = relative(resolve("."), filePath);

        if (!args.quiet) {
          process.stderr.write(`  [${idx + 1}/${files.length}] ${relPath}…`);
        }

        const fileCode = readFileSync(filePath, "utf-8");
        const fileLang = args.language || detectLanguage(filePath) || "typescript";

        const verdict = evaluateWithTribunal(fileCode, fileLang, undefined, evalOptions);

        // Apply baseline suppression
        if (baselineFindings) {
          for (const evaluation of verdict.evaluations) {
            evaluation.findings = evaluation.findings.filter((f) => !baselineFindings!.has(baselineKey(f)));
          }
          verdict.findings = verdict.findings.filter((f) => !baselineFindings!.has(baselineKey(f)));
        }

        const fileFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
        totalFindings += fileFindings;
        totalCritical += verdict.criticalCount;
        totalHigh += verdict.highCount;
        if (verdict.overallVerdict === "fail") failCount++;

        if (!args.quiet) {
          const icon = verdict.overallVerdict === "pass" ? "✅" : verdict.overallVerdict === "warning" ? "⚠️" : "❌";
          process.stderr.write(` ${icon} ${verdict.overallScore}/100 (${fileFindings} findings)\n`);
        }

        // Auto-fix in multi-file mode
        if (args.fix) {
          const allFileFindings = verdict.evaluations.flatMap((e) => e.findings);
          const fixable: PatchCandidate[] = allFileFindings
            .filter((f) => f.patch)
            .map((f) => ({
              ruleId: f.ruleId,
              title: f.title,
              severity: f.severity,
              patch: f.patch!,
              lineNumbers: f.lineNumbers,
            }));
          if (fixable.length > 0) {
            const patchResult = applyPatches(fileCode, fixable);
            writeFileSync(filePath, patchResult.result, "utf-8");
            totalFixed += patchResult.applied;
          }
        }
      }

      const elapsed = Date.now() - startTime;

      // Summary
      console.log("");
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║           Judges Panel — Multi-File Summary                 ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("");
      console.log(`  Files    : ${files.length}`);
      console.log(`  Findings : ${totalFindings}`);
      console.log(`  Critical : ${totalCritical}`);
      console.log(`  High     : ${totalHigh}`);
      console.log(`  Failed   : ${failCount} file(s)`);
      if (args.fix && totalFixed > 0) {
        console.log(`  Fixed    : ${totalFixed} patch(es) applied`);
      }
      console.log(`  Time     : ${elapsed}ms`);
      console.log("");

      if (args.failOnFindings && failCount > 0) process.exit(1);
      process.exit(0);
    }

    // ── Single-file mode ─────────────────────────────────────────────────
    const { code, resolvedPath } = readCode(args.file);
    const language = args.language || detectLanguage(args.file || resolvedPath) || "typescript";

    if (args.judge) {
      // Single judge mode
      const judge = getJudge(args.judge);
      if (!judge) {
        console.error(`Error: Unknown judge "${args.judge}"`);
        console.error("Run 'judges list' to see available judges.");
        process.exit(1);
      }

      const evaluation = evaluateWithJudge(judge, code, language);

      // Apply baseline suppression
      if (baselineFindings) {
        evaluation.findings = evaluation.findings.filter((f) => !baselineFindings!.has(baselineKey(f)));
      }

      // Apply min-severity filter from config
      if (evalConfig?.minSeverity) {
        evaluation.findings = filterBySeverity(evaluation.findings, evalConfig.minSeverity);
      }

      const elapsed = Date.now() - startTime;

      if (args.summary) {
        printSummaryLine(evaluation.verdict, evaluation.score, evaluation.findings.length);
      } else if (args.format === "json") {
        console.log(JSON.stringify(evaluation, null, 2));
      } else if (args.format === "markdown") {
        console.log(formatEvaluationAsMarkdown(evaluation));
      } else if (args.format === "html") {
        // Wrap single evaluation as a tribunal-like verdict for HTML
        const wrappedVerdict = {
          overallVerdict: evaluation.verdict,
          overallScore: evaluation.score,
          summary: evaluation.summary,
          evaluations: [evaluation],
          findings: evaluation.findings,
          criticalCount: evaluation.findings.filter((f) => f.severity === "critical").length,
          highCount: evaluation.findings.filter((f) => f.severity === "high").length,
          timestamp: new Date().toISOString(),
        };
        console.log(verdictToHtml(wrappedVerdict, resolvedPath || args.file));
      } else {
        console.log(formatSingleJudgeTextOutput(evaluation));
      }

      if (args.verbose) {
        console.log(`  ⏱  Evaluated in ${elapsed}ms`);
      }

      // Exit code — fail-on-findings or min-score
      if (args.failOnFindings && evaluation.verdict === "fail") process.exit(1);
      if (args.minScore !== undefined && evaluation.score < args.minScore) {
        console.error(`Score ${evaluation.score} is below minimum threshold ${args.minScore}`);
        process.exit(1);
      }

      // Auto-fix if --fix flag is set (single judge mode)
      if (args.fix && resolvedPath) {
        const fixable: PatchCandidate[] = evaluation.findings
          .filter((f) => f.patch)
          .map((f) => ({
            ruleId: f.ruleId,
            title: f.title,
            severity: f.severity,
            patch: f.patch!,
            lineNumbers: f.lineNumbers,
          }));

        if (fixable.length > 0) {
          const { result, applied, skipped } = applyPatches(code, fixable);
          writeFileSync(resolvedPath, result, "utf-8");
          console.log(`\n  ✅ Applied ${applied} fix(es) to ${args.file || resolvedPath}`);
          if (skipped > 0) {
            console.log(`  ⏭  Skipped ${skipped} fix(es) (source text changed)`);
          }
        } else if (!args.quiet) {
          console.log("\n  No auto-fixable findings.");
        }
      }
    } else {
      // Full tribunal mode
      const verdict = evaluateWithTribunal(code, language, undefined, evalOptions);

      // Apply baseline suppression
      if (baselineFindings) {
        for (const evaluation of verdict.evaluations) {
          evaluation.findings = evaluation.findings.filter((f) => !baselineFindings!.has(baselineKey(f)));
        }
        verdict.findings = verdict.findings.filter((f) => !baselineFindings!.has(baselineKey(f)));
      }

      // Apply min-severity filter from config
      if (evalConfig?.minSeverity) {
        for (const evaluation of verdict.evaluations) {
          evaluation.findings = filterBySeverity(evaluation.findings, evalConfig.minSeverity!);
        }
        verdict.findings = filterBySeverity(verdict.findings, evalConfig.minSeverity);
      }

      const elapsed = Date.now() - startTime;

      if (args.summary) {
        const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
        printSummaryLine(verdict.overallVerdict, verdict.overallScore, totalFindings);
      } else if (args.format === "html") {
        console.log(verdictToHtml(verdict, resolvedPath || args.file));
      } else if (args.format === "junit") {
        console.log(verdictToJUnit(verdict, resolvedPath || args.file));
      } else if (args.format === "codeclimate") {
        console.log(JSON.stringify(verdictToCodeClimate(verdict, resolvedPath || args.file), null, 2));
      } else {
        console.log(formatTribunalOutput(verdict, args.format, resolvedPath || args.file));
      }

      if (args.verbose) {
        console.log(`  ⏱  Evaluated in ${elapsed}ms`);
        console.log(`  📊 ${verdict.evaluations.length} judges, ${verdict.findings.length} total findings`);
      }

      // Exit code — fail-on-findings or min-score
      if (args.failOnFindings && verdict.overallVerdict === "fail") process.exit(1);
      if (args.minScore !== undefined && verdict.overallScore < args.minScore) {
        console.error(`Score ${verdict.overallScore} is below minimum threshold ${args.minScore}`);
        process.exit(1);
      }

      // Auto-fix if --fix flag is set
      if (args.fix && resolvedPath) {
        const allFindings = verdict.evaluations.flatMap((e) => e.findings);
        const fixable: PatchCandidate[] = allFindings
          .filter((f) => f.patch)
          .map((f) => ({
            ruleId: f.ruleId,
            title: f.title,
            severity: f.severity,
            patch: f.patch!,
            lineNumbers: f.lineNumbers,
          }));

        if (fixable.length > 0) {
          const { result, applied, skipped } = applyPatches(code, fixable);
          writeFileSync(resolvedPath, result, "utf-8");
          console.log(`\n  ✅ Applied ${applied} fix(es) to ${args.file || resolvedPath}`);
          if (skipped > 0) {
            console.log(`  ⏭  Skipped ${skipped} fix(es) (source text changed)`);
          }
        } else if (!args.quiet) {
          console.log("\n  No auto-fixable findings.");
        }
      }
    }

    process.exit(0);
  }

  // Unknown command
  console.error(`Unknown command: ${args.command}`);
  printHelp();
  process.exit(1);
}

// ─── Baseline Support ───────────────────────────────────────────────────────

function baselineKey(f: { ruleId: string; title: string; lineNumbers?: number[] }): string {
  const line = f.lineNumbers?.[0] ?? 0;
  return `${f.ruleId}::${line}::${f.title}`;
}

function loadBaseline(baselinePath: string): Set<string> {
  const abs = resolve(baselinePath);
  if (!existsSync(abs)) {
    return new Set();
  }
  try {
    const data = JSON.parse(readFileSync(abs, "utf-8"));
    const keys = new Set<string>();
    if (Array.isArray(data.findings)) {
      for (const f of data.findings) {
        keys.add(baselineKey(f));
      }
    }
    return keys;
  } catch {
    console.error(`Warning: Could not parse baseline file: ${baselinePath}`);
    return new Set();
  }
}

// ─── Summary Line Output ───────────────────────────────────────────────────

function printSummaryLine(verdict: string, score: number, findings: number): void {
  const icon = verdict === "pass" ? "✅" : verdict === "warning" ? "⚠️" : "❌";
  console.log(`${icon} ${verdict.toUpperCase()} ${score}/100 (${findings} findings)`);
}

// ─── Config / Preset Loader ────────────────────────────────────────────────

function loadEvalConfig(args: CliArgs): JudgesConfig | undefined {
  let config: JudgesConfig | undefined;

  // 1. Load from preset (supports comma-separated composition: "security-only,performance")
  if (args.preset) {
    const presetNames = args.preset.split(",").map((n) => n.trim());
    if (presetNames.length === 1) {
      const preset = getPreset(presetNames[0]);
      if (!preset) {
        console.error(`Unknown preset: ${presetNames[0]}`);
        console.error(
          `Available: ${listPresets()
            .map((p) => p.name)
            .join(", ")}`,
        );
        process.exit(1);
      }
      config = { ...preset.config };
    } else {
      // Multi-preset composition
      const composed = composePresets(presetNames);
      if (!composed) {
        console.error(`No valid presets found in: ${args.preset}`);
        console.error(
          `Available: ${listPresets()
            .map((p) => p.name)
            .join(", ")}`,
        );
        process.exit(1);
      }
      config = { ...composed.config };
    }
  }

  // 2. Load from --config file (overrides preset)
  if (args.config) {
    const configPath = resolve(args.config);
    if (!existsSync(configPath)) {
      console.error(`Config file not found: ${configPath}`);
      process.exit(1);
    }
    const fileConfig = parseConfig(readFileSync(configPath, "utf-8"));
    config = config ? { ...config, ...fileConfig } : fileConfig;
  }

  // 3. Auto-discover .judgesrc or .judgesrc.json if no explicit config
  if (!config && !args.config) {
    for (const name of [".judgesrc", ".judgesrc.json"]) {
      const p = resolve(name);
      if (existsSync(p)) {
        try {
          config = parseConfig(readFileSync(p, "utf-8"));
        } catch {
          // Silently skip invalid auto-discovered configs
        }
        break;
      }
    }
  }

  return config;
}

// ─── Severity Filter ────────────────────────────────────────────────────────

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

function filterBySeverity<T extends { severity: string }>(findings: T[], minSeverity: string): T[] {
  const minIndex = SEVERITY_ORDER.indexOf(minSeverity);
  if (minIndex < 0) return findings;
  return findings.filter((f) => {
    const idx = SEVERITY_ORDER.indexOf(f.severity);
    return idx >= 0 && idx <= minIndex;
  });
}

// ─── CI Templates CLI ──────────────────────────────────────────────────────

function runCiTemplates(argv: string[]): void {
  const provider = argv[3];

  if (!provider || provider === "--help" || provider === "-h") {
    console.log(`
Judges Panel — CI Template Generator

USAGE:
  judges ci-templates github      GitHub Actions workflow
  judges ci-templates gitlab      GitLab CI pipeline
  judges ci-templates azure       Azure Pipelines
  judges ci-templates bitbucket   Bitbucket Pipelines
`);
    process.exit(0);
  }

  switch (provider) {
    case "github":
      console.log(generateGitHubActions());
      break;
    case "gitlab":
      console.log(generateGitLabCi());
      break;
    case "azure":
      console.log(generateAzurePipelines());
      break;
    case "bitbucket":
      console.log(generateBitbucketPipelines());
      break;
    default:
      console.error(`Unknown provider: ${provider}`);
      console.error("Supported: github, gitlab, azure, bitbucket");
      process.exit(1);
  }

  process.exit(0);
}

function generateGitHubActions(): string {
  return `# .github/workflows/judges.yml
name: Judges Panel Code Review

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  judges:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install Judges
        run: npm install -g @kevinrabun/judges

      - name: Run Judges Evaluation
        run: |
          for file in $(git diff --name-only HEAD~1 -- '*.ts' '*.js' '*.py' '*.go' '*.rs' '*.java' '*.cs'); do
            judges eval --file "$file" --format sarif --fail-on-findings >> results.sarif || true
          done

      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
`;
}

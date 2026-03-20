#!/usr/bin/env node

// NOTE: keep logic in pure helpers to allow coverage
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

import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from "fs";
import { resolve, extname, dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { matchesGlob } from "./cli-helpers.js";
// Re-export helpers for tests/backward compatibility
export { globToRegex, matchesGlob } from "./cli-helpers.js";

import {
  evaluateWithTribunal,
  evaluateWithJudge,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "./evaluators/index.js";
import { runSkill } from "./skill-loader.js";
import { getJudge, getJudgeSummaries } from "./judges/index.js";
import { verdictToHtml } from "./formatters/html.js";
import { verdictToJUnit } from "./formatters/junit.js";
import { verdictToPdfHtml } from "./formatters/pdf.js";
import { verdictToCodeClimate } from "./formatters/codeclimate.js";
import { loadBaselineData, isBaselined, type LoadedBaseline } from "./commands/baseline.js";
import { getPreset, listPresets, composePresets } from "./presets.js";
import { parseConfig } from "./config.js";
import type { Finding, JudgesConfig, TribunalVerdict } from "./types.js";
import { applyPatches, type PatchCandidate } from "./commands/fix.js";
import { DiskCache } from "./disk-cache.js";
import { contentHash } from "./cache.js";
import { formatComparisonReport, formatFullComparisonMatrix, TOOL_PROFILES } from "./comparison.js";
import { loadOverrideStore, applyOverrides } from "./commands/override.js";
import { runGit } from "./tools/command-safety.js";
import { detectLanguageFromPath, SUPPORTED_EXTENSIONS } from "./ext-to-lang.js";
import {
  formatTribunalOutput,
  writeOutputIfSpecified,
  formatTextOutput,
  formatSingleJudgeTextOutput,
  type OutputFormat,
} from "./cli-formatters.js";
import { COMMAND_TABLE } from "./cli-dispatch.js";

// ─── Language Detection ─────────────────────────────────────────────────────

function detectLanguage(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  return detectLanguageFromPath(filePath);
}

// ─── Argument Parsing ───────────────────────────────────────────────────────

interface CliArgs {
  command: string | undefined;
  file: string | undefined;
  language: string | undefined;
  format: "text" | "json" | "sarif" | "markdown" | "html" | "pdf" | "junit" | "codeclimate" | "github-actions";
  judge: string | undefined;
  help: boolean;
  failOnFindings: boolean;
  baseline: string | undefined;
  summary: boolean;
  config: string | undefined;
  preset: string | undefined;
  minScore: number | undefined;
  minSeverity?: string;
  noColor: boolean;
  verbose: boolean;
  quiet: boolean;
  fix: boolean;
  exclude: string[];
  include: string[];
  maxFiles: number | undefined;
  changedOnly: boolean;
  stagedOnly: boolean;
  explain: boolean;
  sample: boolean;
  trace: boolean;
  incremental: boolean;
  noCache: boolean;
  output?: string;
  skill?: string;
  skillsDir?: string;
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
    minSeverity: undefined,
    noColor: false,
    verbose: false,
    quiet: false,
    fix: false,
    exclude: [],
    include: [],
    maxFiles: undefined,
    changedOnly: false,
    stagedOnly: false,
    explain: false,
    sample: false,
    trace: false,
    incremental: false,
    noCache: false,
    output: undefined,
    skill: undefined,
    skillsDir: undefined,
  };

  // First non-flag arg is the command
  let i = 2; // skip node + script
  if (i < argv.length && !argv[i].startsWith("-")) {
    args.command = argv[i];
    i++;
  }

  for (; i < argv.length; i++) {
    let arg = argv[i];
    // Support --flag=value syntax
    let inlineValue: string | undefined;
    if (arg.startsWith("--") && arg.includes("=")) {
      const parts = arg.split(/=(.*)/s);
      arg = parts[0];
      inlineValue = parts[1];
    }
    const nextValue = () => (inlineValue !== undefined ? inlineValue : argv[++i]);
    switch (arg) {
      case "--file":
      case "-f":
        args.file = nextValue();
        break;
      case "--language":
      case "-l":
        args.language = nextValue();
        break;
      case "--format":
      case "-F":
        args.format = nextValue() as CliArgs["format"];
        break;
      case "--output":
      case "-o":
        args.output = nextValue();
        break;
      case "--judge":
      case "-j":
        args.judge = argv[++i];
        break;
      case "--skill":
      case "-S":
        args.skill = argv[++i];
        if (!args.command) args.command = "skill";
        break;
      case "--skills-dir":
        args.skillsDir = argv[++i];
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
        args.minScore = parseInt(nextValue(), 10);
        break;
      case "--min-severity":
        args.minSeverity = nextValue();
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
      case "--changed-only":
        args.changedOnly = true;
        break;
      case "--staged-only":
        args.stagedOnly = true;
        break;
      case "--explain":
        args.explain = true;
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
      case "--sample":
        args.sample = true;
        break;
      case "--trace":
        args.trace = true;
        break;
      case "--incremental":
        args.incremental = true;
        break;
      case "--no-cache":
        args.noCache = true;
        break;
      default:
        // Positional skill id support: `judges skill ai-code-review --file src/app.ts`
        if (args.command === "skill" && !arg.startsWith("-") && !args.skill) {
          args.skill = arg;
          break;
        }
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
  const showExperimental = process.env.JUDGES_SHOW_EXPERIMENTAL === "1";
  /**
   * Only show GA/implemented commands by default. Experimental/placeholder
   * commands can be revealed via JUDGES_SHOW_EXPERIMENTAL=1 to avoid
   * over-promising features that aren't wired yet.
   */
  const coreCommands: Array<[string, string]> = [
    ["judges eval [options] [file]", "Evaluate code with the full tribunal"],
    ["judges eval --judge <id> [file]", "Evaluate with a single judge"],
    ["judges init", "Interactive project setup wizard"],
    ["judges fix <file> [--apply]", "Preview / apply auto-fixes"],
    ["judges fix-pr <path>", "Create a PR with auto-fix patches"],
    ["judges watch <path>", "Watch files and re-evaluate on save"],
    ["judges lsp", "Start LSP server for editor integration"],
    ["judges report <dir>", "Generate project-level report"],
    ["judges skill <skill-id> [--file <path>]", "Run an agentic skill workflow"],
    ["judges skills", "List available skills"],
    ["judges hook install", "Install pre-commit git hook"],
    ["judges diff", "Evaluate only changed lines from a diff"],
    ["judges deps [dir]", "Analyze dependencies for supply-chain risks"],
    ["judges license-scan", "Dependency license compliance scan"],
    ["judges doctor", "Run diagnostic healthcheck"],
    ["judges baseline create <file>", "Create a findings baseline"],
    ["judges ci-templates <provider>", "Generate CI pipeline template"],
    ["judges completions <shell>", "Generate shell completions"],
    ["judges docs", "Generate rule documentation"],
    ["judges feedback", "Track finding feedback (false positives)"],
    ["judges override", "Manage per-path rule overrides"],
    ["judges benchmark", "Run detection accuracy benchmarks"],
    ["judges config", "Export/import shared team configs"],
    ["judges review", "Post inline review comments on a GitHub PR"],
    ["judges app serve", "Start GitHub App webhook server"],
    ["judges tune", "Auto-tune presets and config"],
  ];

  console.log("\nJudges Panel — CLI Code Evaluator\n");
  console.log("USAGE:\n  judges <command> [options]\n");
  console.log("Core commands:");
  for (const [cmd, desc] of coreCommands) {
    console.log(`  ${cmd.padEnd(32)} ${desc}`);
  }
  console.log("\nTIP: set JUDGES_SHOW_EXPERIMENTAL=1 to print the full experimental command matrix.\n");

  if (!showExperimental) return;

  console.log("Experimental / roadmap commands (may be stubbed):\n");
  const experimentalCommands = [
    ["judges quality-gate", "Evaluate composite quality gate policies"],
    ["judges auto-calibrate", "Auto-tune thresholds from feedback history"],
    ["judges dep-audit", "Correlate dependency vulnerabilities with code findings"],
    ["judges monorepo", "Discover and evaluate monorepo packages"],
    ["judges config-migrate", "Migrate .judgesrc to current schema"],
    ["judges deprecated", "List deprecated rules with migration guidance"],
    ["judges dedup-report", "Cross-run finding deduplication report"],
    ["judges upload", "Upload SARIF results to GitHub Code Scanning"],
    ["judges smart-select", "Show which judges are relevant for a file"],
    ["judges pr-summary", "Post a PR summary comment with verdict"],
    ["judges profile", "Performance profiling for judge evaluations"],
    ["judges group", "Group findings by category, severity, or file"],
    ["judges diff-only", "Evaluate only changed lines in a PR diff"],
    ["judges auto-triage", "Auto-suppress low-confidence findings"],
    ["judges validate-config", "Validate .judgesrc configuration"],
    ["judges coverage-map", "Show which rules apply to which languages"],
    ["judges warm-cache", "Pre-populate eval cache for faster CI"],
    ["judges policy-audit", "Compliance audit trail with policy snapshots"],
    ["judges remediation <rule-id>", "Step-by-step fix guide for a finding"],
    ["judges hook-install", "Install git pre-commit/pre-push hooks"],
    ["judges false-negatives", "Track and report false-negative feedback"],
    ["judges assign", "Assign findings to team members"],
    ["judges ticket-sync", "Create tickets from findings (Jira/Linear/GitHub)"],
    ["judges sla-track", "SLA tracking and violation detection"],
    ["judges regression-alert", "Detect quality regressions between scans"],
    ["judges suppress", "Batch false-positive suppression"],
    ["judges rule-owner", "Map rules to team owners"],
    ["judges noise-advisor", "Analyze rule performance and recommend tuning"],
    ["judges review-queue", "Human review queue for low-confidence findings"],
    ["judges report-template", "Generate reports from templates"],
    ["judges burndown", "Track finding resolution progress"],
    ["judges kb", "Team knowledge base for rule decisions"],
    ["judges recommend", "Analyze project and recommend judges"],
    ["judges vote", "Consensus voting on findings"],
    ["judges query", "Advanced finding search and filter"],
    ["judges judge-reputation", "Per-judge accuracy and FP tracking"],
    ["judges correlate", "Finding correlation and root-cause analysis"],
    ["judges digest", "Periodic finding digest and trend reports"],
    ["judges rule-share", "Export/import custom rule configurations"],
    ["judges explain-finding", "Detailed finding explanation with context"],
    ["judges compare-runs", "Compare evaluation runs side by side"],
    ["judges audit-bundle", "Assemble auditor-ready evidence package"],
    ["judges dev-score", "Developer security growth score"],
    ["judges model-risk", "AI model vulnerability risk profiles"],
    ["judges retro", "Security incident retrospective analysis"],
    ["judges config-drift", "Detect config divergence from baseline"],
    ["judges reg-watch", "Regulatory standard coverage monitor"],
    ["judges learn", "Personalized developer learning paths"],
    ["judges generate", "Secure code template generator"],
    ["judges ai-model-trust", "AI model confidence scoring"],
    ["judges team-rules-sync", "Fast team onboarding with shared rules"],
    ["judges cost-forecast", "Security debt cost projections"],
    ["judges team-leaderboard", "Gamified security review engagement"],
    ["judges code-owner-suggest", "Auto-recommend CODEOWNERS entries"],
    ["judges pr-quality-gate", "Automated PR pass/fail quality gate"],
    ["judges ai-prompt-audit", "Scan for prompt injection risks"],
    ["judges adoption-report", "Team adoption metrics dashboard"],
    ["judges auto-fix", "Automated fix suggestions for findings"],
  ];
  for (const [cmd, desc] of experimentalCommands) {
    console.log(`  ${cmd.padEnd(32)} ${desc}`);
  }
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

// Glob helpers moved to cli-helpers.ts for testability

// ─── Glob / Multi-File Resolution ───────────────────────────────────────────

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
  sample?: boolean;
}

// collectFiles moved to cli-helpers for testability; keep export for backward compat
export function collectFiles(target: string, options: CollectOptions = {}): string[] {
  const resolved = resolve(target);
  if (!existsSync(resolved)) return [];

  const stat = statSync(resolved);
  if (stat.isFile()) return [resolved];

  if (stat.isDirectory()) {
    const files: string[] = [];
    walkDir(resolved, resolved, files, { ...options, maxFiles: options.sample ? undefined : options.maxFiles });
    if (options.maxFiles && files.length > options.maxFiles) {
      if (options.sample) {
        // Fisher-Yates shuffle then take first N
        for (let i = files.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [files[i], files[j]] = [files[j], files[i]];
        }
      }
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

// ─── Git Changed Files (for --changed-only) ─────────────────────────────────

/**
 * Get files changed since the last commit using git diff.
 * Includes staged, unstaged, and untracked files.
 */
function getGitChangedFiles(cwd: string): string[] {
  try {
    const resolvedCwd = resolve(cwd);
    // Changed files (staged + unstaged) relative to HEAD
    const diffOutput = runGit(["diff", "--name-only", "HEAD"], { cwd: resolvedCwd });

    // Untracked files
    const untrackedOutput = runGit(["ls-files", "--others", "--exclude-standard"], { cwd: resolvedCwd });

    const files = new Set<string>();
    for (const f of diffOutput.split("\n").filter(Boolean)) {
      files.add(resolve(resolvedCwd, f));
    }
    for (const f of untrackedOutput.split("\n").filter(Boolean)) {
      files.add(resolve(resolvedCwd, f));
    }
    return [...files];
  } catch {
    // Not a git repo or git not available — return empty (evaluate nothing)
    return [];
  }
}

function getStagedFiles(cwd: string): string[] {
  try {
    const resolvedCwd = resolve(cwd);
    const output = runGit(["diff", "--cached", "--name-only", "--diff-filter=ACM"], { cwd: resolvedCwd });
    return output
      .split("\n")
      .filter(Boolean)
      .map((f) => resolve(resolvedCwd, f));
  } catch {
    return [];
  }
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

  // ─── Skill Command ─────────────────────────────────────────────────────
  if (args.command === "skills" || args.command === "skills:list") {
    const { listSkills } = await import("./skill-loader.js");
    const skillsDir = args.skillsDir || resolve(fileURLToPath(import.meta.url), "..", "..", "skills");
    const skills = listSkills(skillsDir);
    // Pretty print
    const rows = skills.map((s) => ({
      id: s.id,
      name: s.name,
      tags: (s.tags || []).join(", "),
      agents: s.agents.join(", "),
      description: s.description,
    }));
    console.table(rows);
    return;
  }

  if (args.command === "skill") {
    const skillId = args.skill || args.judge; // allow --skill or --judge alias
    if (!skillId) {
      console.error("Missing skill id. Usage: judges skill <skill-id> --file <path>");
      process.exit(1);
    }

    const code = args.file ? readFileSync(args.file, "utf-8") : readFileSync(0, "utf-8");

    const language = args.language || detectLanguage(args.file);
    if (!language) {
      console.error("Unable to detect language. Provide --language.");
      process.exit(1);
    }

    const verdict = await runSkill(skillId, code, language, { skillsDir: args.skillsDir });
    if (args.format === "json") {
      console.log(JSON.stringify(verdict, null, 2));
    } else {
      const markdown = formatVerdictAsMarkdown(verdict);
      console.log(markdown);
    }
    return;
  }

  // ─── Init Command ──────────────────────────────────────────────────────
  if (args.command === "init") {
    const { runInit } = await import("./commands/init.js");
    await runInit(args.file || ".");
    process.exit(0);
  }

  // ─── Watch Command ────────────────────────────────────────────────────
  if (args.command === "watch") {
    const { runWatch } = await import("./commands/watch.js");
    // Allow tests to run without hanging
    if (process.env.JUDGES_TEST_DRY_RUN) return;
    runWatch(argv);
    return; // Watch runs indefinitely
  }

  // ─── LSP Command ─────────────────────────────────────────────────────
  if (args.command === "lsp") {
    const { runLsp } = await import("./commands/lsp.js");
    if (process.env.JUDGES_TEST_DRY_RUN) return;
    runLsp(argv);
    return; // LSP server runs indefinitely
  }

  // ─── CI Templates Command ────────────────────────────────────────────
  if (args.command === "ci-templates") {
    await runCiTemplates(argv);
    return;
  }

  // ─── Compliance-Report Command ────────────────────────────────────────
  if (args.command === "compliance-report") {
    const { buildComplianceReport, formatComplianceReportText } = await import("./commands/compliance-report.js");
    const target = args.file || ".";
    const code = args.file ? (await import("fs")).readFileSync(args.file, "utf-8") : "";
    let findings: Finding[] = [];
    if (code) {
      const lang = detectLanguage(args.file) || "typescript";
      const result = evaluateWithTribunal(code, lang);
      findings = result.findings;
    }
    const framework = argv.find((a, i) => argv[i - 1] === "--framework") || undefined;
    const report = buildComplianceReport(target, findings, framework);
    if (argv.includes("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatComplianceReportText(report));
    }
    return;
  }

  // ─── App Command (GitHub App) ─────────────────────────────────────
  if (args.command === "app") {
    const { runAppCommand } = await import("./github-app.js");
    runAppCommand(argv.slice(3));
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

  // ─── Trend Command ───────────────────────────────────────────────────
  if (args.command === "trend") {
    const {
      loadSnapshotStore,
      computeTrend,
      formatTrendReport,
      formatTrendReportHtml,
      detectRegressions,
      formatRegressionAlerts,
    } = await import("./commands/snapshot.js");
    const snapshotFile =
      argv.find((a, i) => i >= 3 && !a.startsWith("-") && !["html", "json", "text"].includes(a)) ||
      ".judges-snapshots.json";
    const formatArg = argv.includes("--format") ? argv[argv.indexOf("--format") + 1] : "text";
    const outputArg = argv.includes("--output") ? argv[argv.indexOf("--output") + 1] : undefined;
    const store = loadSnapshotStore(snapshotFile);
    if (store.snapshots.length === 0) {
      console.log("No snapshot data found. Run evaluations with --snapshot to collect trend data.");
      console.log(`  Expected file: ${snapshotFile}`);
    } else {
      const report = computeTrend(store);
      let output: string;
      if (formatArg === "html") {
        output = formatTrendReportHtml(report);
      } else if (formatArg === "json") {
        output = JSON.stringify(report, null, 2);
      } else {
        output = formatTrendReport(report);
      }
      if (outputArg) {
        writeFileSync(outputArg, output, "utf-8");
        console.log(`  ✅ Trend report written to ${outputArg}`);
      } else {
        console.log(output);
      }

      // Regression alerts
      const regressions = detectRegressions(store);
      if (regressions.length > 0) {
        console.log(formatRegressionAlerts(regressions));
        if (args.failOnFindings && regressions.some((r) => r.severity === "error")) {
          process.exit(1);
        }
      }
    }
    process.exit(0);
  }

  // ─── Command Table Dispatch ─────────────────────────────────────────────────
  const tableEntry = args.command ? COMMAND_TABLE[args.command] : undefined;
  if (tableEntry) {
    const [modulePath, fnName] = tableEntry;
    const mod = await import(modulePath);
    await mod[fnName](argv);
    return;
  }

  // ─── List Command ────────────────────────────────────────────────────
  if (args.command === "list") {
    listJudges();
    process.exit(0);
  }

  // ─── Eval Command ────────────────────────────────────────────────────
  if (args.command === "eval" || args.file) {
    const startTime = Date.now();

    // Resolve output file if provided
    const outputPath = args.output ? resolve(args.output) : undefined;

    // Load config from file or preset
    let evalConfig = loadEvalConfig(args);
    // CLI flag override for min-severity (fallback if not provided via config)
    if (args.minSeverity) {
      evalConfig = evalConfig || ({} as any);
      (evalConfig as any).minSeverity = args.minSeverity;
    }

    // Load baseline if specified (from CLI flag — config doesn't carry baseline)
    let loadedBaseline: LoadedBaseline | undefined;
    if (args.baseline) {
      loadedBaseline = loadBaselineData(args.baseline);
    }

    // Build evaluation options from config
    const evalOptions = evalConfig ? { config: evalConfig } : undefined;

    // ── Multi-file / directory mode ──────────────────────────────────────
    const target = args.file || ".";
    if (target && isDirectory(target)) {
      // Merge exclude/include from config if not overridden by CLI
      const excludePatterns = args.exclude.length > 0 ? args.exclude : (evalConfig?.exclude ?? []);
      const includePatterns = args.include.length > 0 ? args.include : (evalConfig?.include ?? []);
      const maxFilesLimit = args.maxFiles ?? evalConfig?.maxFiles;

      let files = collectFiles(target, {
        exclude: excludePatterns,
        include: includePatterns,
        maxFiles: maxFilesLimit,
        sample: args.sample,
      });

      // ── --changed-only: scope to git-changed files ──
      if (args.changedOnly) {
        const changedFiles = getGitChangedFiles(target);
        const changedSet = new Set(changedFiles.map((f) => resolve(f)));
        files = files.filter((f) => changedSet.has(resolve(f)));
      }

      // ── --staged-only: scope to git-staged files ──
      if (args.stagedOnly) {
        const stagedFiles = getStagedFiles(target);
        const stagedSet = new Set(stagedFiles.map((f) => resolve(f)));
        files = files.filter((f) => stagedSet.has(resolve(f)));
      }

      if (files.length === 0) {
        console.error(`No supported source files found in: ${target}${args.changedOnly ? " (changed-only)" : ""}`);
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
      let totalFixable = 0;
      let cacheHits = 0;
      const fileVerdicts: Array<{ filePath: string; verdict: TribunalVerdict }> = [];

      // Incremental evaluation: use disk cache to skip unchanged files
      const diskCache = args.noCache ? undefined : new DiskCache<TribunalVerdict>();

      for (let idx = 0; idx < files.length; idx++) {
        const filePath = files[idx];
        const relPath = relative(resolve("."), filePath);

        if (!args.quiet) {
          process.stderr.write(`  [${idx + 1}/${files.length}] ${relPath}…`);
        }

        const fileCode = readFileSync(filePath, "utf-8");
        const fileLang = args.language || detectLanguage(filePath) || "typescript";

        // Check disk cache for incremental mode (always when cache available)
        const hash = contentHash(fileCode, fileLang);
        let verdict: TribunalVerdict | undefined;
        if (diskCache) {
          verdict = diskCache.get(hash);
        }
        if (verdict) {
          cacheHits++;
        } else {
          verdict = evaluateWithTribunal(fileCode, fileLang, undefined, evalOptions);
          if (diskCache) {
            diskCache.set(hash, verdict, relPath);
          }
        }

        // Apply baseline suppression
        if (loadedBaseline) {
          for (const evaluation of verdict.evaluations) {
            evaluation.findings = evaluation.findings.filter(
              (f) => !isBaselined(f, loadedBaseline!, fileCode, relPath),
            );
          }
          verdict.findings = verdict.findings.filter((f) => !isBaselined(f, loadedBaseline!, fileCode, relPath));
        }

        // Apply override suppressions for multi-file mode
        {
          const overrideStore = loadOverrideStore();
          if (overrideStore.overrides.length > 0) {
            for (const evaluation of verdict.evaluations) {
              const result = applyOverrides(evaluation.findings, overrideStore, relPath);
              evaluation.findings = result.active;
            }
            const topResult = applyOverrides(verdict.findings, overrideStore, relPath);
            verdict.findings = topResult.active;
          }
        }

        const fileFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
        const fileFixable = verdict.evaluations.reduce((s, e) => s + e.findings.filter((f) => f.patch).length, 0);
        totalFindings += fileFindings;
        totalFixable += fileFixable;
        totalCritical += verdict.criticalCount;
        totalHigh += verdict.highCount;
        if (verdict.overallVerdict === "fail") failCount++;

        if (!args.quiet) {
          const icon = verdict.overallVerdict === "pass" ? "✅" : verdict.overallVerdict === "warning" ? "⚠️" : "❌";
          const fixSuffix = fileFixable > 0 ? `, ${fileFixable} fixable` : "";
          process.stderr.write(` ${icon} ${verdict.overallScore}/100 (${fileFindings} findings${fixSuffix})\n`);
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

        // Collect for merged output
        fileVerdicts.push({ filePath: relPath, verdict });
      }

      const elapsed = Date.now() - startTime;

      // Summary
      console.log("");
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║           Judges Panel — Multi-File Summary                 ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("");
      console.log(`  Files    : ${files.length}`);
      console.log(`  Findings : ${totalFindings}${totalFixable > 0 ? ` (${totalFixable} auto-fixable)` : ""}`);
      console.log(`  Critical : ${totalCritical}`);
      console.log(`  High     : ${totalHigh}`);
      console.log(`  Failed   : ${failCount} file(s)`);
      if (args.fix && totalFixed > 0) {
        console.log(`  Fixed    : ${totalFixed} patch(es) applied`);
      }
      if (cacheHits > 0) {
        console.log(`  Cached   : ${cacheHits} file(s) unchanged (skipped re-evaluation)`);
      }
      console.log(`  Time     : ${elapsed}ms`);
      console.log("");

      // Write merged output when --output is specified
      if (outputPath && fileVerdicts.length > 0) {
        // Merge all per-file verdicts into a single combined verdict
        const allFindings = fileVerdicts.flatMap(({ verdict: v }) => v.findings);
        const allEvaluations = fileVerdicts.flatMap(({ verdict: v }) => v.evaluations);
        const mergedVerdict: TribunalVerdict = {
          overallVerdict: failCount > 0 ? "fail" : totalFindings > 0 ? "warning" : "pass",
          overallScore:
            fileVerdicts.length > 0
              ? Math.round(fileVerdicts.reduce((s, { verdict: v }) => s + v.overallScore, 0) / fileVerdicts.length)
              : 100,
          summary: `Multi-file scan: ${files.length} files, ${totalFindings} findings`,
          evaluations: allEvaluations,
          findings: allFindings,
          criticalCount: totalCritical,
          highCount: totalHigh,
          timestamp: new Date().toISOString(),
        };
        const out = formatTribunalOutput(mergedVerdict, args.format, target);
        writeOutputIfSpecified(outputPath, out);
        if (!args.quiet) console.log(`  ✅ Report written to ${args.output}`);
      }

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
      if (loadedBaseline) {
        evaluation.findings = evaluation.findings.filter((f) => !isBaselined(f, loadedBaseline!, code));
      }

      // Apply min-severity filter from config
      if (evalConfig?.minSeverity) {
        evaluation.findings = filterBySeverity(evaluation.findings, evalConfig.minSeverity);
      }

      // Enrich with learning context when --explain is set
      if (args.explain) {
        evaluation.findings = enrichWithExplanations(evaluation.findings);
      }

      const elapsed = Date.now() - startTime;

      if (args.summary) {
        printSummaryLine(
          evaluation.verdict,
          evaluation.score,
          evaluation.findings.length,
          evaluation.findings.filter((f) => f.patch).length,
        );
      } else if (args.format === "json") {
        const json = JSON.stringify(evaluation, null, 2);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, json);
          if (!args.quiet) console.log(`  ✅ JSON report written to ${args.output}`);
        } else {
          console.log(json);
        }
      } else if (args.format === "markdown") {
        const md = formatEvaluationAsMarkdown(evaluation);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, md);
          if (!args.quiet) console.log(`  ✅ Markdown report written to ${args.output}`);
        } else {
          console.log(md);
        }
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
        const html = verdictToHtml(wrappedVerdict, resolvedPath || args.file);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, html);
          if (!args.quiet) console.log(`  ✅ HTML report written to ${args.output}`);
        } else {
          console.log(html);
        }
      } else if (args.format === "pdf") {
        const wrappedForPdf = {
          overallVerdict: evaluation.verdict,
          overallScore: evaluation.score,
          summary: evaluation.summary,
          evaluations: [evaluation],
          findings: evaluation.findings,
          criticalCount: evaluation.findings.filter((f) => f.severity === "critical").length,
          highCount: evaluation.findings.filter((f) => f.severity === "high").length,
          timestamp: new Date().toISOString(),
        };
        const pdf = verdictToPdfHtml(wrappedForPdf, resolvedPath || args.file);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, pdf);
          if (!args.quiet) console.log(`  ✅ PDF (HTML) report written to ${args.output}`);
        } else {
          console.log(pdf);
        }
      } else {
        const out = formatSingleJudgeTextOutput(evaluation);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, out);
          if (!args.quiet) console.log(`  ✅ Report written to ${args.output}`);
        } else {
          console.log(out);
        }
      }

      if (args.verbose) {
        console.log(`  ⏱  Evaluated in ${elapsed}ms`);
      }

      // Trace output — show pipeline decision trace
      if (args.trace) {
        const { buildEvaluationTrace, formatTraceText } = await import("./commands/trace.js");
        const wrappedForTrace = {
          overallVerdict: evaluation.verdict,
          overallScore: evaluation.score,
          summary: evaluation.summary,
          evaluations: [evaluation],
          findings: evaluation.findings,
          criticalCount: evaluation.findings.filter((f: Finding) => f.severity === "critical").length,
          highCount: evaluation.findings.filter((f: Finding) => f.severity === "high").length,
          timestamp: new Date().toISOString(),
        };
        const trace = buildEvaluationTrace(wrappedForTrace, resolvedPath || args.file, language);
        if (args.format === "json") {
          console.log(JSON.stringify(trace, null, 2));
        } else {
          console.log(formatTraceText(trace));
        }
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
      if (loadedBaseline) {
        for (const evaluation of verdict.evaluations) {
          evaluation.findings = evaluation.findings.filter((f) => !isBaselined(f, loadedBaseline!, code));
        }
        verdict.findings = verdict.findings.filter((f) => !isBaselined(f, loadedBaseline!, code));
      }

      // Apply min-severity filter from config
      if (evalConfig?.minSeverity) {
        for (const evaluation of verdict.evaluations) {
          evaluation.findings = filterBySeverity(evaluation.findings, evalConfig.minSeverity!);
        }
        verdict.findings = filterBySeverity(verdict.findings, evalConfig.minSeverity);
      }

      // Apply override suppressions
      {
        const overrideStore = loadOverrideStore();
        if (overrideStore.overrides.length > 0) {
          const fileSrc = resolvedPath || args.file;
          for (const evaluation of verdict.evaluations) {
            const result = applyOverrides(evaluation.findings, overrideStore, fileSrc);
            evaluation.findings = result.active;
          }
          const topResult = applyOverrides(verdict.findings, overrideStore, fileSrc);
          verdict.findings = topResult.active;
          if (topResult.overridden.length > 0 && !args.quiet) {
            console.log(`  ℹ️  ${topResult.overridden.length} finding(s) suppressed by overrides`);
          }
        }
      }

      // Enrich with learning context when --explain is set
      if (args.explain) {
        for (const evaluation of verdict.evaluations) {
          evaluation.findings = enrichWithExplanations(evaluation.findings);
        }
        verdict.findings = enrichWithExplanations(verdict.findings);
      }

      const elapsed = Date.now() - startTime;

      if (args.summary) {
        const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
        const totalFixable = verdict.evaluations.reduce((s, e) => s + e.findings.filter((f) => f.patch).length, 0);
        printSummaryLine(verdict.overallVerdict, verdict.overallScore, totalFindings, totalFixable);
      } else if (args.format === "html") {
        const html = verdictToHtml(verdict, resolvedPath || args.file);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, html);
          if (!args.quiet) console.log(`  ✅ HTML report written to ${args.output}`);
        } else {
          console.log(html);
        }
      } else if (args.format === "pdf") {
        const pdf = verdictToPdfHtml(verdict, resolvedPath || args.file);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, pdf);
          if (!args.quiet) console.log(`  ✅ PDF (HTML) report written to ${args.output}`);
        } else {
          console.log(pdf);
        }
      } else if (args.format === "junit") {
        const junit = verdictToJUnit(verdict, resolvedPath || args.file);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, junit);
          if (!args.quiet) console.log(`  ✅ JUnit report written to ${args.output}`);
        } else {
          console.log(junit);
        }
      } else if (args.format === "codeclimate") {
        const cc = JSON.stringify(verdictToCodeClimate(verdict, resolvedPath || args.file), null, 2);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, cc);
          if (!args.quiet) console.log(`  ✅ CodeClimate report written to ${args.output}`);
        } else {
          console.log(cc);
        }
      } else {
        const out = formatTribunalOutput(verdict, args.format, resolvedPath || args.file);
        if (outputPath) {
          writeOutputIfSpecified(outputPath, out);
          if (!args.quiet) console.log(`  ✅ Report written to ${args.output}`);
        } else {
          console.log(out);
        }
      }

      if (args.verbose) {
        console.log(`  ⏱  Evaluated in ${elapsed}ms`);
        console.log(`  📊 ${verdict.evaluations.length} judges, ${verdict.findings.length} total findings`);
      }

      // Trace output — show pipeline decision trace
      if (args.trace) {
        const { buildEvaluationTrace, formatTraceText } = await import("./commands/trace.js");
        const trace = buildEvaluationTrace(verdict, resolvedPath || args.file, language);
        if (args.format === "json") {
          console.log(JSON.stringify(trace, null, 2));
        } else {
          console.log(formatTraceText(trace));
        }
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
// Baseline loading and matching is now handled by src/commands/baseline.ts
// Exports: loadBaselineData, isBaselined, LoadedBaseline

// ─── Summary Line Output ───────────────────────────────────────────────────

function printSummaryLine(verdict: string, score: number, findings: number, fixable = 0): void {
  const icon = verdict === "pass" ? "✅" : verdict === "warning" ? "⚠️" : "❌";
  const fixSuffix = fixable > 0 ? `, ${fixable} auto-fixable` : "";
  console.log(`${icon} ${verdict.toUpperCase()} ${score}/100 (${findings} findings${fixSuffix})`);
}

// ─── Config / Preset Loader ────────────────────────────────────────────────

function loadEvalConfig(args: CliArgs): JudgesConfig | undefined {
  let config: JudgesConfig | undefined;

  // 1. Load from CLI --preset (supports comma-separated composition: "security-only,performance")
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

  // 3b. No config found anywhere — apply onboarding preset for first-time users
  if (!config && !args.config && !args.preset) {
    const onboarding = getPreset("onboarding");
    if (onboarding) {
      config = { ...onboarding.config };
      console.error(
        "ℹ No .judgesrc found — using onboarding preset (high-severity only). Run 'judges init' for full control.",
      );
    }
  }

  // 4. Apply config.preset if no CLI --preset was given
  if (config?.preset && !args.preset) {
    const presetNames = config.preset.split(",").map((n) => n.trim());
    let presetConfig: JudgesConfig | undefined;
    if (presetNames.length === 1) {
      const preset = getPreset(presetNames[0]);
      if (preset) presetConfig = { ...preset.config };
    } else {
      const composed = composePresets(presetNames);
      if (composed) presetConfig = { ...composed.config };
    }
    if (presetConfig) {
      // Preset is the base; config file properties override it
      const { preset: _p, ...rest } = config;
      config = { ...presetConfig, ...rest };
    }
  }

  // 5. Apply config-based defaults to CLI args (CLI flags always win)
  if (config) {
    if (config.failOnFindings && !args.failOnFindings) {
      args.failOnFindings = true;
    }
    if (config.baseline && !args.baseline) {
      args.baseline = config.baseline;
    }
    if (config.format && args.format === "text") {
      // Only apply config format if CLI didn't explicitly set one
      args.format = config.format;
    }
    if (config.failOnScoreBelow !== undefined && args.minScore === undefined) {
      // Config uses 0-10 scale; CLI --min-score uses 0-100 (matches overallScore)
      args.minScore = config.failOnScoreBelow * 10;
    }
  }

  return config;
}

// ─── Explain Mode — Learning Context Enrichment ─────────────────────────────

const RULE_PREFIX_CONTEXT: Record<string, { owasp?: string; cwe?: string; learn: string }> = {
  SEC: {
    owasp: "A03:2021 Injection",
    cwe: "CWE-79/CWE-89",
    learn: "Input validation prevents injection attacks where untrusted data is sent to an interpreter.",
  },
  AUTH: {
    owasp: "A07:2021 Identification and Authentication Failures",
    cwe: "CWE-287",
    learn: "Authentication flaws let attackers compromise passwords, keys, or session tokens.",
  },
  CRYPTO: {
    owasp: "A02:2021 Cryptographic Failures",
    cwe: "CWE-327/CWE-328",
    learn: "Weak or missing cryptography exposes sensitive data to interception and tampering.",
  },
  DATA: {
    owasp: "A02:2021 Cryptographic Failures",
    cwe: "CWE-200/CWE-312",
    learn: "Sensitive data exposure occurs when applications do not adequately protect data at rest or in transit.",
  },
  CYBER: {
    owasp: "A01:2021 Broken Access Control",
    cwe: "CWE-284",
    learn: "Access control enforces policy so users cannot act outside their intended permissions.",
  },
  INJ: {
    owasp: "A03:2021 Injection",
    cwe: "CWE-89/CWE-78",
    learn: "Injection flaws occur when hostile data is sent to an interpreter as part of a command or query.",
  },
  XSS: {
    owasp: "A03:2021 Injection",
    cwe: "CWE-79",
    learn: "Cross-site scripting (XSS) lets attackers inject scripts into web pages viewed by other users.",
  },
  SSRF: {
    owasp: "A10:2021 Server-Side Request Forgery",
    cwe: "CWE-918",
    learn:
      "SSRF lets attackers make the server send requests to unintended locations, potentially accessing internal services.",
  },
  PERF: { learn: "Performance issues cause slow response times, high resource usage, or scalability bottlenecks." },
  A11Y: {
    learn: "Accessibility ensures applications are usable by people with disabilities, per WCAG 2.1 guidelines.",
  },
  DOC: { learn: "Good documentation improves maintainability, onboarding, and reduces defect rates." },
  TEST: { learn: "Adequate test coverage catches regressions, validates behaviour, and enables safe refactoring." },
  AICS: {
    owasp: "OWASP AI Security",
    learn: "AI code safety rules detect prompt injection, model poisoning, and unsafe AI integration patterns.",
  },
  IAC: {
    learn:
      "Infrastructure as Code security ensures cloud resources are provisioned with least-privilege, encryption, and audit logging.",
  },
  SOV: {
    learn:
      "Data sovereignty rules verify data residency, jurisdictional compliance, and cross-border transfer controls.",
  },
  COMP: { learn: "Compliance rules enforce regulatory requirements like GDPR, HIPAA, PCI-DSS, and SOC 2." },
  INTENT: {
    learn: "Intent alignment detects mismatches between declared purpose (names, comments) and actual implementation.",
  },
  DSEC: {
    learn: "Dependency security rules flag known-vulnerable packages, outdated dependencies, and supply-chain risks.",
  },
  MFPR: {
    learn:
      "Model fingerprint detection identifies stylistic patterns characteristic of specific AI generators (GPT, Claude, Copilot, Gemini).",
  },
  API: {
    learn:
      "API contract rules enforce input validation, proper status codes, content-type, rate limiting, and versioning on REST endpoints.",
  },
  COH: {
    learn:
      "Coherence rules detect contradictory assignments, dead code, duplicate definitions, and other self-inconsistent patterns.",
  },
  HALLU: {
    learn:
      "Hallucination detection catches fabricated APIs, non-existent imports, and phantom methods commonly generated by AI models.",
  },
};

function enrichWithExplanations<
  T extends {
    ruleId: string;
    description: string;
    reference?: string;
    confidence?: number;
    provenance?: string;
    evidenceBasis?: string;
    evidenceChain?: { steps: Array<{ observation: string; source: string; line?: number }>; impactStatement: string };
  },
>(findings: T[]): T[] {
  return findings.map((f) => {
    const prefix = f.ruleId.replace(/-\d+$/, "");
    const ctx = RULE_PREFIX_CONTEXT[prefix];
    const parts: string[] = [f.description];

    // Layer 2: evidence-based explanation
    if (f.confidence !== undefined) {
      parts.push(`\n🎯 Confidence: ${Math.round(f.confidence * 100)}%`);
    }
    if (f.provenance) {
      parts.push(`🔍 Detection: ${f.provenance}`);
    }
    if (f.evidenceBasis) {
      parts.push(`📊 Evidence: ${f.evidenceBasis}`);
    }
    if (f.evidenceChain && f.evidenceChain.steps.length > 0) {
      parts.push(`\n⚡ Why this matters: ${f.evidenceChain.impactStatement}`);
      parts.push("   Evidence chain:");
      for (const step of f.evidenceChain.steps.slice(0, 5)) {
        const loc = step.line ? ` (L${step.line})` : "";
        parts.push(`   → [${step.source}]${loc} ${step.observation}`);
      }
    }

    // Layer 1: OWASP/CWE reference context
    if (ctx) {
      if (ctx.owasp) parts.push(`\n📚 OWASP: ${ctx.owasp}`);
      if (ctx.cwe) parts.push(`CWE: ${ctx.cwe}`);
      parts.push(`💡 ${ctx.learn}`);
    }

    return {
      ...f,
      description: parts.join("  "),
      reference: f.reference || (ctx ? [ctx.owasp, ctx.cwe].filter(Boolean).join(" / ") : undefined) || f.reference,
    };
  });
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

async function runCiTemplates(argv: string[]): Promise<void> {
  const provider = argv[3];

  if (!provider || provider === "--help" || provider === "-h") {
    console.log(`
Judges Panel — CI Template Generator

USAGE:
`);
    process.exit(0);
  }

  switch (provider) {
    case "github":
      console.log(generateGitHubActions());
      break;
    case "gitlab":
      console.log((await import("./commands/ci-templates.js")).generateGitLabCi());
      break;
    case "azure":
      console.log((await import("./commands/ci-templates.js")).generateAzurePipelines());
      break;
    case "bitbucket":
      console.log((await import("./commands/ci-templates.js")).generateBitbucketPipelines());
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
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install Judges
        run: npm install -g @kevinrabun/judges-cli

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

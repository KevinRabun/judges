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

import { readFileSync, existsSync, writeFileSync, readdirSync, statSync, mkdirSync } from "fs";
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
import { verdictToSarif } from "./formatters/sarif.js";
import { verdictToHtml } from "./formatters/html.js";
import { verdictToJUnit } from "./formatters/junit.js";
import { verdictToPdfHtml } from "./formatters/pdf.js";
import { verdictToCodeClimate } from "./formatters/codeclimate.js";
import { verdictToGitHubActions } from "./formatters/github-actions.js";
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
  ".dart": "dart",
  ".sql": "sql",
  ".bicep": "bicep",
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

// ─── Format Output ──────────────────────────────────────────────────────────

function formatTribunalOutput(
  verdict: ReturnType<typeof evaluateWithTribunal>,
  format: CliArgs["format"],
  filePath?: string,
): string {
  switch (format) {
    case "json":
      return JSON.stringify(verdict, null, 2);
    case "sarif": {
      // If filePath is not provided, sarif formatter will still produce a valid log
      const sarif = verdictToSarif(verdict, filePath);
      return JSON.stringify(sarif, null, 2);
    }
    case "markdown":
      return formatVerdictAsMarkdown(verdict);
    case "html":
      // HTML is handled separately in runCli (needs async import)
      return formatTextOutput(verdict);
    case "github-actions":
      return verdictToGitHubActions(verdict, filePath);
    case "text":
    default:
      return formatTextOutput(verdict);
  }
}

function writeOutputIfSpecified(outputPath: string | undefined, contents: string): void {
  if (!outputPath) return;
  const dir = dirname(outputPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // directory may already exist
  }
  writeFileSync(outputPath, contents, "utf-8");
}

function formatTextOutput(verdict: ReturnType<typeof evaluateWithTribunal>): string {
  const lines: string[] = [];
  const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
  const fixableCount = verdict.evaluations.reduce((s, e) => s + e.findings.filter((f) => f.patch).length, 0);

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║              Judges Panel — Evaluation Result               ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Verdict  : ${verdict.overallVerdict.toUpperCase()}`);
  lines.push(`  Score    : ${verdict.overallScore}/100`);
  lines.push(`  Critical : ${verdict.criticalCount}`);
  lines.push(`  High     : ${verdict.highCount}`);
  lines.push(`  Findings : ${totalFindings}${fixableCount > 0 ? ` (${fixableCount} auto-fixable)` : ""}`);
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
    const timing = evaluation.durationMs !== undefined ? `  ${evaluation.durationMs}ms` : "";
    lines.push(`  ${icon} ${name} ${score}/100   ${findings} finding(s)${timing}`);
  }
  lines.push("");

  // Timing summary
  if (verdict.timing) {
    lines.push(`  Total evaluation time: ${verdict.timing.totalMs}ms`);
    const sorted = [...verdict.timing.perJudge].sort((a, b) => b.durationMs - a.durationMs);
    const slowest = sorted.slice(0, 5);
    if (slowest.length > 0) {
      lines.push("  Slowest judges:");
      for (const j of slowest) {
        lines.push(`    ${j.judgeName.padEnd(28)} ${j.durationMs}ms`);
      }
    }
    lines.push("");
  }

  // Suppression metrics
  if (verdict.suppressions && verdict.suppressions.length > 0) {
    const supps = verdict.suppressions;
    const byKind = { line: 0, "next-line": 0, block: 0, file: 0 };
    const byRule = new Map<string, number>();
    for (const s of supps) {
      byKind[s.kind] = (byKind[s.kind] || 0) + 1;
      byRule.set(s.ruleId, (byRule.get(s.ruleId) ?? 0) + 1);
    }
    lines.push(`  Suppressed Findings: ${supps.length}`);
    const kinds = Object.entries(byKind)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}: ${v}`);
    lines.push(`    By type: ${kinds.join(", ")}`);
    const topRules = [...byRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topRules.length > 0) {
      lines.push(`    Top suppressed rules: ${topRules.map(([r, c]) => `${r} (${c})`).join(", ")}`);
    }
    lines.push("");
  }

  // Top findings
  const allFindings = verdict.evaluations.flatMap((e) => e.findings);
  const critical = allFindings.filter((f) => f.severity === "critical" || f.severity === "high");
  if (critical.length > 0) {
    lines.push("  Critical & High Findings:");
    lines.push("  " + "─".repeat(60));
    for (const f of critical.slice(0, 20)) {
      const fixTag = f.patch ? " 🔧" : "";
      const confTag = f.confidence !== undefined ? ` (${Math.round(f.confidence * 100)}% confidence)` : "";
      lines.push(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}${fixTag}${confTag}`);
      if (f.lineNumbers && f.lineNumbers.length > 0) {
        lines.push(`             Line ${f.lineNumbers[0]}: ${f.description.slice(0, 100)}`);
      }
      if (f.provenance) {
        lines.push(`             Evidence: ${f.provenance}`);
      }
      if (f.evidenceBasis) {
        lines.push(`             Basis: ${f.evidenceBasis}`);
      }
      if (f.evidenceChain && f.evidenceChain.steps.length > 0) {
        lines.push(`             Impact: ${f.evidenceChain.impactStatement}`);
        for (const step of f.evidenceChain.steps.slice(0, 3)) {
          const loc = step.line ? ` (L${step.line})` : "";
          lines.push(`               → [${step.source}]${loc} ${step.observation}`);
        }
      }
      if (f.cweIds && f.cweIds.length > 0) {
        lines.push(`             CWE: ${f.cweIds.join(", ")}`);
      }
      if (f.owaspLlmTop10) {
        lines.push(`             OWASP LLM: ${f.owaspLlmTop10}`);
      }
      if (f.learnMoreUrl) {
        lines.push(`             📖 Learn more: ${f.learnMoreUrl}`);
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

  if (fixableCount > 0) {
    lines.push(`  🔧 ${fixableCount} finding(s) can be auto-fixed. Run: judges eval <file> --fix`);
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
    const confTag = f.confidence !== undefined ? ` (${Math.round(f.confidence * 100)}%)` : "";
    lines.push(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}${confTag}`);
    if (f.lineNumbers && f.lineNumbers.length > 0) {
      lines.push(`             Line ${f.lineNumbers[0]}: ${f.description.slice(0, 120)}`);
    }
    if (f.provenance) {
      lines.push(`             Evidence: ${f.provenance}`);
    }
    if (f.evidenceChain && f.evidenceChain.steps.length > 0) {
      lines.push(`             Impact: ${f.evidenceChain.impactStatement}`);
    }
    if (f.suggestedFix) {
      lines.push(`             Fix: ${f.suggestedFix.slice(0, 120)}`);
    }
    if (f.learnMoreUrl) {
      lines.push(`             📖 ${f.learnMoreUrl}`);
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

  // ─── Fix Command ──────────────────────────────────────────────────────
  if (args.command === "fix") {
    const { runFix } = await import("./commands/fix.js");
    runFix(argv);
    return; // runFix calls process.exit internally
  }

  // ─── Fix-PR Command ──────────────────────────────────────────────────
  if (args.command === "fix-pr") {
    const { runFixPr } = await import("./commands/fix-pr.js");
    await runFixPr(argv);
    return;
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

  // ─── Report Command ───────────────────────────────────────────────────
  if (args.command === "report") {
    const { runReport } = await import("./commands/report.js");
    runReport(argv);
    return;
  }

  // ─── Hook Command ────────────────────────────────────────────────────
  if (args.command === "hook") {
    const { runHook } = await import("./commands/hook.js");
    runHook(argv);
    return;
  }

  // ─── Diff Command ────────────────────────────────────────────────────
  if (args.command === "diff") {
    const { runDiff } = await import("./commands/diff.js");
    runDiff(argv);
    return;
  }

  // ─── Deps Command ────────────────────────────────────────────────────
  if (args.command === "deps") {
    const { runDeps } = await import("./commands/deps.js");
    runDeps(argv);
    return;
  }

  // ─── Doctor Command ──────────────────────────────────────────────────
  if (args.command === "doctor") {
    const { runDoctor } = await import("./commands/doctor.js");
    runDoctor(argv);
    return;
  }

  // ─── Baseline Command ────────────────────────────────────────────────
  if (args.command === "baseline") {
    const { runBaseline } = await import("./commands/baseline.js");
    runBaseline(argv);
    return;
  }

  // ─── CI Templates Command ────────────────────────────────────────────
  if (args.command === "ci-templates") {
    await runCiTemplates(argv);
    return;
  }

  // ─── Completions Command ─────────────────────────────────────────────
  if (args.command === "completions") {
    const { runCompletions } = await import("./commands/completions.js");
    runCompletions(argv);
    return;
  }

  // ─── Docs Command ────────────────────────────────────────────────────
  if (args.command === "docs") {
    const { runDocs } = await import("./commands/docs.js");
    runDocs(argv);
    return;
  }

  // ─── Feedback Command ─────────────────────────────────────────────────
  if (args.command === "feedback") {
    const { runFeedback } = await import("./commands/feedback.js");
    runFeedback(argv);
    return;
  }

  // ─── Override Command ─────────────────────────────────────────────────
  if (args.command === "override") {
    const { runOverride } = await import("./commands/override.js");
    runOverride(argv);
    return;
  }

  // ─── Feedback-Rules Command ───────────────────────────────────────────
  if (args.command === "feedback-rules") {
    const { runFeedbackRules } = await import("./commands/feedback-rules.js");
    runFeedbackRules(argv);
    return;
  }

  // ─── Governance Command ───────────────────────────────────────────────
  if (args.command === "governance") {
    const { runGovernance } = await import("./commands/governance.js");
    runGovernance(argv);
    return;
  }

  // ─── Parity Command ──────────────────────────────────────────────────
  if (args.command === "parity") {
    const { runParity } = await import("./commands/parity.js");
    runParity(argv);
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

  // ─── Triage Command ───────────────────────────────────────────────────
  if (args.command === "triage") {
    const { runTriage } = await import("./commands/triage.js");
    runTriage(argv);
    return;
  }

  // ─── Quality-Gate Command ─────────────────────────────────────────────
  if (args.command === "quality-gate") {
    const { runQualityGate } = await import("./commands/quality-gate.js");
    runQualityGate(argv);
    return;
  }

  // ─── Notify Command ─────────────────────────────────────────────────
  if (args.command === "notify") {
    const { runNotify } = await import("./commands/notify.js");
    await runNotify(argv);
    return;
  }

  // ─── Benchmark Command ────────────────────────────────────────────────
  if (args.command === "benchmark") {
    const { runBenchmark } = await import("./commands/benchmark.js");
    runBenchmark(argv);
    return;
  }

  // ─── Rule Command ─────────────────────────────────────────────────────
  if (args.command === "rule") {
    const { runRule } = await import("./commands/rule.js");
    runRule(argv);
    return;
  }

  // ─── Pack Command ─────────────────────────────────────────────────────
  if (args.command === "pack") {
    const { runPack } = await import("./commands/language-packs.js");
    runPack(argv);
    return;
  }

  // ─── Config Command ───────────────────────────────────────────────────
  if (args.command === "config") {
    const { runConfig } = await import("./commands/config-share.js");
    runConfig(argv);
    return;
  }

  // ─── Review Command ────────────────────────────────────────────────
  if (args.command === "review") {
    const { runReview } = await import("./commands/review.js");
    await runReview(argv);
    return;
  }

  // ─── App Command (GitHub App) ─────────────────────────────────────
  if (args.command === "app") {
    const { runAppCommand } = await import("./github-app.js");
    runAppCommand(argv.slice(3));
    return;
  }

  // ─── Auto-Calibrate Command ────────────────────────────────────────
  if (args.command === "auto-calibrate") {
    const { runAutoCalibrate } = await import("./commands/auto-calibrate.js");
    runAutoCalibrate(argv);
    return;
  }

  // ─── Dep-Audit Command ─────────────────────────────────────────────
  if (args.command === "dep-audit") {
    const { runDepAuditCommand } = await import("./commands/dep-audit.js");
    runDepAuditCommand(argv);
    return;
  }

  // ─── Monorepo Command ─────────────────────────────────────────────
  if (args.command === "monorepo") {
    const { runMonorepoCommand } = await import("./commands/monorepo.js");
    runMonorepoCommand(argv);
    return;
  }

  // ─── Config-Migrate Command ───────────────────────────────────────
  if (args.command === "config-migrate") {
    const { runConfigMigrate } = await import("./commands/config-migrate.js");
    runConfigMigrate(argv);
    return;
  }

  // ─── Deprecated Rules Command ─────────────────────────────────────
  if (args.command === "deprecated") {
    const { runDeprecatedCommand } = await import("./commands/deprecated.js");
    runDeprecatedCommand(argv);
    return;
  }

  // ─── Dedup Report Command ─────────────────────────────────────────
  if (args.command === "dedup-report") {
    const { runDedupReport } = await import("./commands/dedup-report.js");
    runDedupReport(argv);
    return;
  }

  // ─── Upload Command ───────────────────────────────────────────────
  if (args.command === "upload") {
    const { runUpload } = await import("./commands/upload.js");
    await runUpload(argv);
    return;
  }

  // ─── Smart Select Command ─────────────────────────────────────────
  if (args.command === "smart-select") {
    const { runSmartSelect } = await import("./commands/smart-select.js");
    runSmartSelect(argv);
    return;
  }

  // ─── PR Summary Command ──────────────────────────────────────────
  if (args.command === "pr-summary") {
    const { runPrSummary } = await import("./commands/pr-summary.js");
    await runPrSummary(argv);
    return;
  }

  // ─── Profile Command ─────────────────────────────────────────────
  if (args.command === "profile") {
    const { runProfile } = await import("./commands/profile.js");
    runProfile(argv);
    return;
  }

  // ─── Group Findings Command ───────────────────────────────────────
  if (args.command === "group") {
    const { runGroupFindings } = await import("./commands/group-findings.js");
    runGroupFindings(argv);
    return;
  }

  // ─── Diff-Only Command ───────────────────────────────────────────
  if (args.command === "diff-only") {
    const { runDiffOnly } = await import("./commands/diff-only.js");
    await runDiffOnly(argv);
    return;
  }

  // ─── Auto-Triage Command ─────────────────────────────────────────
  if (args.command === "auto-triage") {
    const { runAutoTriage } = await import("./commands/auto-triage.js");
    runAutoTriage(argv);
    return;
  }

  // ─── Validate Config Command ─────────────────────────────────────
  if (args.command === "validate-config") {
    const { runValidateConfig } = await import("./commands/validate-config.js");
    runValidateConfig(argv);
    return;
  }

  // ─── Coverage Map Command ────────────────────────────────────────
  if (args.command === "coverage-map") {
    const { runCoverageMap } = await import("./commands/coverage-map.js");
    runCoverageMap(argv);
    return;
  }

  // ─── Warm Cache Command ──────────────────────────────────────────
  if (args.command === "warm-cache") {
    const { runWarmCache } = await import("./commands/warm-cache.js");
    await runWarmCache(argv);
    return;
  }

  // ─── Policy Audit Command ──────────────────────────────────────────
  if (args.command === "policy-audit") {
    const { runPolicyAudit } = await import("./commands/policy-audit.js");
    await runPolicyAudit(argv);
    return;
  }

  // ─── Remediation Command ───────────────────────────────────────────
  if (args.command === "remediation") {
    const { runRemediationGuide } = await import("./commands/remediation.js");
    runRemediationGuide(argv);
    return;
  }

  // ─── Hook Install Command ─────────────────────────────────────────
  if (args.command === "hook-install") {
    const { runHookInstall } = await import("./commands/hook-install.js");
    await runHookInstall(argv);
    return;
  }

  // ─── False Negatives Command ──────────────────────────────────────
  if (args.command === "false-negatives") {
    const { runFalseNegativeReport } = await import("./commands/false-negatives.js");
    await runFalseNegativeReport(argv);
    return;
  }

  // ─── Assign Findings Command ──────────────────────────────────────
  if (args.command === "assign") {
    const { runAssignFindings } = await import("./commands/assign-findings.js");
    await runAssignFindings(argv);
    return;
  }

  // ─── Ticket Sync Command ─────────────────────────────────────────
  if (args.command === "ticket-sync") {
    const { runTicketSync } = await import("./commands/ticket-sync.js");
    await runTicketSync(argv);
    return;
  }

  // ─── SLA Track Command ───────────────────────────────────────────
  if (args.command === "sla-track") {
    const { runSlaTrack } = await import("./commands/sla-track.js");
    await runSlaTrack(argv);
    return;
  }

  // ─── Regression Alert Command ─────────────────────────────────────
  if (args.command === "regression-alert") {
    const { runRegressionAlert } = await import("./commands/regression-alert.js");
    await runRegressionAlert(argv);
    return;
  }

  // ─── Suppress Command ────────────────────────────────────────────
  if (args.command === "suppress") {
    const { runSuppress } = await import("./commands/suppress.js");
    runSuppress(argv);
    return;
  }

  // ─── Rule Owner Command ──────────────────────────────────────────
  if (args.command === "rule-owner") {
    const { runRuleOwner } = await import("./commands/rule-owner.js");
    runRuleOwner(argv);
    return;
  }

  // ─── Noise Advisor Command ───────────────────────────────────────
  if (args.command === "noise-advisor") {
    const { runNoiseAdvisor } = await import("./commands/noise-advisor.js");
    runNoiseAdvisor(argv);
    return;
  }

  // ─── Review Queue Command ────────────────────────────────────────
  if (args.command === "review-queue") {
    const { runReviewQueue } = await import("./commands/review-queue.js");
    await runReviewQueue(argv);
    return;
  }

  // ─── Report Template Command ─────────────────────────────────────
  if (args.command === "report-template") {
    const { runReportTemplate } = await import("./commands/report-template.js");
    runReportTemplate(argv);
    return;
  }

  // ─── Burndown Command ────────────────────────────────────────────
  if (args.command === "burndown") {
    const { runBurndown } = await import("./commands/burndown.js");
    await runBurndown(argv);
    return;
  }

  // ─── Knowledge Base Command ──────────────────────────────────────
  if (args.command === "kb") {
    const { runKnowledgeBase } = await import("./commands/kb.js");
    runKnowledgeBase(argv);
    return;
  }

  // ─── Recommend Command ───────────────────────────────────────────
  if (args.command === "recommend") {
    const { runRecommend } = await import("./commands/recommend.js");
    runRecommend(argv);
    return;
  }

  // ─── Vote Command ────────────────────────────────────────────────
  if (args.command === "vote") {
    const { runVote } = await import("./commands/vote.js");
    runVote(argv);
    return;
  }

  // ─── Query Command ──────────────────────────────────────────────
  if (args.command === "query") {
    const { runQuery } = await import("./commands/query.js");
    runQuery(argv);
    return;
  }

  // ─── Judge Reputation Command ────────────────────────────────────
  if (args.command === "judge-reputation") {
    const { runJudgeReputation } = await import("./commands/judge-reputation.js");
    runJudgeReputation(argv);
    return;
  }

  // ─── Correlate Command ──────────────────────────────────────────
  if (args.command === "correlate") {
    const { runCorrelate } = await import("./commands/correlate.js");
    runCorrelate(argv);
    return;
  }

  // ─── Digest Command ─────────────────────────────────────────────
  if (args.command === "digest") {
    const { runDigest } = await import("./commands/digest.js");
    runDigest(argv);
    return;
  }

  // ─── Rule Share Command ─────────────────────────────────────────
  if (args.command === "rule-share") {
    const { runRuleShare } = await import("./commands/rule-share.js");
    runRuleShare(argv);
    return;
  }

  // ─── Explain Finding Command ────────────────────────────────────
  if (args.command === "explain-finding") {
    const { runExplainFinding } = await import("./commands/explain-finding.js");
    runExplainFinding(argv);
    return;
  }

  // ─── Compare Runs Command ──────────────────────────────────────
  if (args.command === "compare-runs") {
    const { runCompareRuns } = await import("./commands/compare-runs.js");
    runCompareRuns(argv);
    return;
  }

  // ─── Audit Bundle Command ─────────────────────────────────────
  if (args.command === "audit-bundle") {
    const { runAuditBundle } = await import("./commands/audit-bundle.js");
    runAuditBundle(argv);
    return;
  }

  // ─── Dev Score Command ────────────────────────────────────────
  if (args.command === "dev-score") {
    const { runDevScore } = await import("./commands/dev-score.js");
    runDevScore(argv);
    return;
  }

  // ─── Model Risk Command ──────────────────────────────────────
  if (args.command === "model-risk") {
    const { runModelRisk } = await import("./commands/model-risk.js");
    runModelRisk(argv);
    return;
  }

  // ─── Retro Command ───────────────────────────────────────────
  if (args.command === "retro") {
    const { runRetro } = await import("./commands/retro.js");
    runRetro(argv);
    return;
  }

  // ─── Config Drift Command ────────────────────────────────────
  if (args.command === "config-drift") {
    const { runConfigDrift } = await import("./commands/config-drift.js");
    runConfigDrift(argv);
    return;
  }

  // ─── Reg Watch Command ───────────────────────────────────────
  if (args.command === "reg-watch") {
    const { runRegWatch } = await import("./commands/reg-watch.js");
    runRegWatch(argv);
    return;
  }

  // ─── Learn Command ───────────────────────────────────────────
  if (args.command === "learn") {
    const { runLearn } = await import("./commands/learn.js");
    runLearn(argv);
    return;
  }

  // ─── Generate Command ────────────────────────────────────────
  if (args.command === "generate") {
    const { runGenerate } = await import("./commands/generate.js");
    runGenerate(argv);
    return;
  }

  // ─── AI Model Trust Command ──────────────────────────────────
  if (args.command === "ai-model-trust") {
    const { runAiModelTrust } = await import("./commands/ai-model-trust.js");
    runAiModelTrust(argv);
    return;
  }

  // ─── Team Rules Sync Command ─────────────────────────────────
  if (args.command === "team-rules-sync") {
    const { runTeamRulesSync } = await import("./commands/team-rules-sync.js");
    runTeamRulesSync(argv);
    return;
  }

  // ─── Cost Forecast Command ───────────────────────────────────
  if (args.command === "cost-forecast") {
    const { runCostForecast } = await import("./commands/cost-forecast.js");
    runCostForecast(argv);
    return;
  }

  // ─── Team Leaderboard Command ────────────────────────────────
  if (args.command === "team-leaderboard") {
    const { runTeamLeaderboard } = await import("./commands/team-leaderboard.js");
    runTeamLeaderboard(argv);
    return;
  }

  // ─── Code Owner Suggest Command ──────────────────────────────
  if (args.command === "code-owner-suggest") {
    const { runCodeOwnerSuggest } = await import("./commands/code-owner-suggest.js");
    runCodeOwnerSuggest(argv);
    return;
  }

  // ─── PR Quality Gate Command ─────────────────────────────────
  if (args.command === "pr-quality-gate") {
    const { runPrQualityGate } = await import("./commands/pr-quality-gate.js");
    runPrQualityGate(argv);
    return;
  }

  // ─── AI Prompt Audit Command ─────────────────────────────────
  if (args.command === "ai-prompt-audit") {
    const { runAiPromptAudit } = await import("./commands/ai-prompt-audit.js");
    runAiPromptAudit(argv);
    return;
  }

  // ─── Adoption Report Command ─────────────────────────────────
  if (args.command === "adoption-report") {
    const { runAdoptionReport } = await import("./commands/adoption-report.js");
    runAdoptionReport(argv);
    return;
  }

  // ─── Auto-Fix Command ────────────────────────────────────────
  if (args.command === "auto-fix") {
    const { runAutoFix } = await import("./commands/auto-fix.js");
    runAutoFix(argv);
    return;
  }

  // ─── Audit Trail Command ─────────────────────────────────────
  if (args.command === "audit-trail") {
    const { runAuditTrail } = await import("./commands/audit-trail.js");
    runAuditTrail(argv);
    return;
  }

  // ─── Pattern Registry Command ────────────────────────────────
  if (args.command === "pattern-registry") {
    const { runPatternRegistry } = await import("./commands/pattern-registry.js");
    runPatternRegistry(argv);
    return;
  }

  // ─── Security Maturity Command ───────────────────────────────
  if (args.command === "security-maturity") {
    const { runSecurityMaturity } = await import("./commands/security-maturity.js");
    runSecurityMaturity(argv);
    return;
  }

  // ─── Perf Hotspot Command ────────────────────────────────────
  if (args.command === "perf-hotspot") {
    const { runPerfHotspot } = await import("./commands/perf-hotspot.js");
    runPerfHotspot(argv);
    return;
  }

  // ─── Doc Gen Command ─────────────────────────────────────────
  if (args.command === "doc-gen") {
    const { runDocGen } = await import("./commands/doc-gen.js");
    runDocGen(argv);
    return;
  }

  // ─── Dep Correlate Command ───────────────────────────────────
  if (args.command === "dep-correlate") {
    const { runDepCorrelate } = await import("./commands/dep-correlate.js");
    runDepCorrelate(argv);
    return;
  }

  // ─── Judge Author Command ────────────────────────────────────
  if (args.command === "judge-author") {
    const { runJudgeAuthor } = await import("./commands/judge-author.js");
    runJudgeAuthor(argv);
    return;
  }

  // ─── SBOM Export Command ─────────────────────────────────────
  if (args.command === "sbom-export") {
    const { runSbomExport } = await import("./commands/sbom-export.js");
    runSbomExport(argv);
    return;
  }

  // ─── License Scan Command ───────────────────────────────────
  if (args.command === "license-scan") {
    const { runLicenseScan } = await import("./commands/license-scan.js");
    runLicenseScan(argv);
    return;
  }

  // ─── Test Correlate Command ──────────────────────────────────
  if (args.command === "test-correlate") {
    const { runTestCorrelate } = await import("./commands/test-correlate.js");
    runTestCorrelate(argv);
    return;
  }

  // ─── Predict Command ────────────────────────────────────────
  if (args.command === "predict") {
    const { runPredict } = await import("./commands/predict.js");
    runPredict(argv);
    return;
  }

  // ─── Org Policy Command ─────────────────────────────────────
  if (args.command === "org-policy") {
    const { runOrgPolicy } = await import("./commands/org-policy.js");
    runOrgPolicy(argv);
    return;
  }

  // ─── Incident Response Command ──────────────────────────────
  if (args.command === "incident-response") {
    const { runIncidentResponse } = await import("./commands/incident-response.js");
    runIncidentResponse(argv);
    return;
  }

  // ─── Risk Heatmap Command ───────────────────────────────────
  if (args.command === "risk-heatmap") {
    const { runRiskHeatmap } = await import("./commands/risk-heatmap.js");
    runRiskHeatmap(argv);
    return;
  }

  // ─── Learning Path Command ──────────────────────────────────
  if (args.command === "learning-path") {
    const { runLearningPath } = await import("./commands/learning-path.js");
    runLearningPath(argv);
    return;
  }

  // ─── Secret Scan Command ────────────────────────────────────────
  if (args.command === "secret-scan") {
    const { runSecretScan } = await import("./commands/secret-scan.js");
    runSecretScan(argv);
    return;
  }

  // ─── IaC Lint Command ──────────────────────────────────────────
  if (args.command === "iac-lint") {
    const { runIacLint } = await import("./commands/iac-lint.js");
    runIacLint(argv);
    return;
  }

  // ─── PII Scan Command ─────────────────────────────────────────
  if (args.command === "pii-scan") {
    const { runPiiScan } = await import("./commands/pii-scan.js");
    runPiiScan(argv);
    return;
  }

  // ─── API Audit Command ────────────────────────────────────────
  if (args.command === "api-audit") {
    const { runApiAudit } = await import("./commands/api-audit.js");
    runApiAudit(argv);
    return;
  }

  // ─── Compliance Map Command ───────────────────────────────────
  if (args.command === "compliance-map") {
    const { runComplianceMap } = await import("./commands/compliance-map.js");
    runComplianceMap(argv);
    return;
  }

  // ─── Perf Compare Command ─────────────────────────────────────
  if (args.command === "perf-compare") {
    const { runPerfCompare } = await import("./commands/perf-compare.js");
    runPerfCompare(argv);
    return;
  }

  // ─── Guided Tour Command ──────────────────────────────────────
  if (args.command === "guided-tour") {
    const { runGuidedTour } = await import("./commands/guided-tour.js");
    runGuidedTour(argv);
    return;
  }

  // ─── Exec Report Command ──────────────────────────────────────
  if (args.command === "exec-report") {
    const { runExecReport } = await import("./commands/exec-report.js");
    runExecReport(argv);
    return;
  }

  // ─── AI Output Compare Command ───────────────────────────────
  if (args.command === "ai-output-compare") {
    const { runAiOutputCompare } = await import("./commands/ai-output-compare.js");
    runAiOutputCompare(argv);
    return;
  }

  // ─── Hallucination Score Command ─────────────────────────────
  if (args.command === "hallucination-score") {
    const { runHallucinationScore } = await import("./commands/hallucination-score.js");
    runHallucinationScore(argv);
    return;
  }

  // ─── AI Gate Command ─────────────────────────────────────────
  if (args.command === "ai-gate") {
    const { runAiGate } = await import("./commands/ai-gate.js");
    runAiGate(argv);
    return;
  }

  // ─── AI Pattern Trend Command ────────────────────────────────
  if (args.command === "ai-pattern-trend") {
    const { runAiPatternTrend } = await import("./commands/ai-pattern-trend.js");
    runAiPatternTrend(argv);
    return;
  }

  // ─── Test Suggest Command ────────────────────────────────────
  if (args.command === "test-suggest") {
    const { runTestSuggest } = await import("./commands/test-suggest.js");
    runTestSuggest(argv);
    return;
  }

  // ─── Vendor Lock Detect Command ──────────────────────────────
  if (args.command === "vendor-lock-detect") {
    const { runVendorLockDetect } = await import("./commands/vendor-lock-detect.js");
    runVendorLockDetect(argv);
    return;
  }

  // ─── Clarity Score Command ───────────────────────────────────
  if (args.command === "clarity-score") {
    const { runClarityScore } = await import("./commands/clarity-score.js");
    runClarityScore(argv);
    return;
  }

  // ─── Arch Audit Command ──────────────────────────────────────
  if (args.command === "arch-audit") {
    const { runArchAudit } = await import("./commands/arch-audit.js");
    runArchAudit(argv);
    return;
  }

  // ─── Watch Judge Command ─────────────────────────────────────
  if (args.command === "watch-judge") {
    const { runWatchJudge } = await import("./commands/watch-judge.js");
    runWatchJudge(argv);
    return;
  }

  // ─── Impact Scan Command ─────────────────────────────────────
  if (args.command === "impact-scan") {
    const { runImpactScan } = await import("./commands/impact-scan.js");
    runImpactScan(argv);
    return;
  }

  // ─── Model Report Command ───────────────────────────────────
  if (args.command === "model-report") {
    const { runModelReport } = await import("./commands/model-report.js");
    runModelReport(argv);
    return;
  }

  // ─── Trust Adaptive Command ──────────────────────────────────
  if (args.command === "trust-adaptive") {
    const { runTrustAdaptive } = await import("./commands/trust-adaptive.js");
    runTrustAdaptive(argv);
    return;
  }

  // ─── Judge Learn Command ─────────────────────────────────────
  if (args.command === "judge-learn") {
    const { runJudgeLearn } = await import("./commands/judge-learn.js");
    runJudgeLearn(argv);
    return;
  }

  // ─── Chat Notify Command ─────────────────────────────────────
  if (args.command === "chat-notify") {
    const { runChatNotify } = await import("./commands/chat-notify.js");
    runChatNotify(argv);
    return;
  }

  // ─── Design Audit Command ───────────────────────────────────
  if (args.command === "design-audit") {
    const { runDesignAudit } = await import("./commands/design-audit.js");
    runDesignAudit(argv);
    return;
  }

  // ─── Remediation Lib Command ─────────────────────────────────
  if (args.command === "remediation-lib") {
    const { runRemediationLib } = await import("./commands/remediation-lib.js");
    runRemediationLib(argv);
    return;
  }

  // ─── Doc Drift Command ───────────────────────────────────────
  if (args.command === "doc-drift") {
    const { runDocDrift } = await import("./commands/doc-drift.js");
    runDocDrift(argv);
    return;
  }

  // ─── Cross-PR Regression Command ─────────────────────────────
  if (args.command === "cross-pr-regression") {
    const { runCrossPrRegression } = await import("./commands/cross-pr-regression.js");
    runCrossPrRegression(argv);
    return;
  }

  // ─── Code Similarity Command ─────────────────────────────────
  if (args.command === "code-similarity") {
    const { runCodeSimilarity } = await import("./commands/code-similarity.js");
    runCodeSimilarity(argv);
    return;
  }

  // ─── Team Trust Command ──────────────────────────────────────
  if (args.command === "team-trust") {
    const { runTeamTrust } = await import("./commands/team-trust.js");
    runTeamTrust(argv);
    return;
  }

  // ─── Exception Consistency Command ───────────────────────────
  if (args.command === "exception-consistency") {
    const { runExceptionConsistency } = await import("./commands/exception-consistency.js");
    runExceptionConsistency(argv);
    return;
  }

  // ─── Resource Cleanup Command ────────────────────────────────
  if (args.command === "resource-cleanup") {
    const { runResourceCleanup } = await import("./commands/resource-cleanup.js");
    runResourceCleanup(argv);
    return;
  }

  // ─── Refactor Safety Command ─────────────────────────────────
  if (args.command === "refactor-safety") {
    const { runRefactorSafety } = await import("./commands/refactor-safety.js");
    runRefactorSafety(argv);
    return;
  }

  // ─── Compliance Weight Command ───────────────────────────────
  if (args.command === "compliance-weight") {
    const { runComplianceWeight } = await import("./commands/compliance-weight.js");
    runComplianceWeight(argv);
    return;
  }

  // ─── Prompt Replay Command ──────────────────────────────────
  if (args.command === "prompt-replay") {
    const { runPromptReplay } = await import("./commands/prompt-replay.js");
    runPromptReplay(argv);
    return;
  }

  // ─── Review Replay Command ──────────────────────────────────
  if (args.command === "review-replay") {
    const { runReviewReplay } = await import("./commands/review-replay.js");
    runReviewReplay(argv);
    return;
  }

  // ─── Context Inject Command ─────────────────────────────────
  if (args.command === "context-inject") {
    const { runContextInject } = await import("./commands/context-inject.js");
    runContextInject(argv);
    return;
  }

  // ─── Habit Tracker Command ──────────────────────────────────
  if (args.command === "habit-tracker") {
    const { runHabitTracker } = await import("./commands/habit-tracker.js");
    runHabitTracker(argv);
    return;
  }

  // ─── Finding Contest Command ────────────────────────────────
  if (args.command === "finding-contest") {
    const { runFindingContest } = await import("./commands/finding-contest.js");
    runFindingContest(argv);
    return;
  }

  // ─── Approve Chain Command ──────────────────────────────────
  if (args.command === "approve-chain") {
    const { runApproveChain } = await import("./commands/approve-chain.js");
    runApproveChain(argv);
    return;
  }

  // ─── Snippet Eval Command ──────────────────────────────────
  if (args.command === "snippet-eval") {
    const { runSnippetEval } = await import("./commands/snippet-eval.js");
    runSnippetEval(argv);
    return;
  }

  // ─── Coach Mode Command ────────────────────────────────────
  if (args.command === "coach-mode") {
    const { runCoachMode } = await import("./commands/coach-mode.js");
    runCoachMode(argv);
    return;
  }

  // ─── Commit Hygiene Command ─────────────────────────────────────
  if (args.command === "commit-hygiene") {
    const { runCommitHygiene } = await import("./commands/commit-hygiene.js");
    runCommitHygiene(argv);
    return;
  }

  // ─── Deploy Readiness Command ──────────────────────────────────
  if (args.command === "deploy-readiness") {
    const { runDeployReadiness } = await import("./commands/deploy-readiness.js");
    runDeployReadiness(argv);
    return;
  }

  // ─── Rollback Safety Command ───────────────────────────────────
  if (args.command === "rollback-safety") {
    const { runRollbackSafety } = await import("./commands/rollback-safety.js");
    runRollbackSafety(argv);
    return;
  }

  // ─── Test Quality Command ─────────────────────────────────────
  if (args.command === "test-quality") {
    const { runTestQuality } = await import("./commands/test-quality.js");
    runTestQuality(argv);
    return;
  }

  // ─── Build Optimize Command ───────────────────────────────────
  if (args.command === "build-optimize") {
    const { runBuildOptimize } = await import("./commands/build-optimize.js");
    runBuildOptimize(argv);
    return;
  }

  // ─── Secret Age Command ───────────────────────────────────────
  if (args.command === "secret-age") {
    const { runSecretAge } = await import("./commands/secret-age.js");
    runSecretAge(argv);
    return;
  }

  // ─── Observability Gap Command ────────────────────────────────
  if (args.command === "observability-gap") {
    const { runObservabilityGap } = await import("./commands/observability-gap.js");
    runObservabilityGap(argv);
    return;
  }

  // ─── Migration Safety Command ─────────────────────────────────
  if (args.command === "migration-safety") {
    const { runMigrationSafety } = await import("./commands/migration-safety.js");
    runMigrationSafety(argv);
    return;
  }

  // ─── API Versioning Audit Command ────────────────────────────────
  if (args.command === "api-versioning-audit") {
    const { runApiVersioningAudit } = await import("./commands/api-versioning-audit.js");
    runApiVersioningAudit(argv);
    return;
  }

  // ─── Ownership Map Command ───────────────────────────────────────
  if (args.command === "ownership-map") {
    const { runOwnershipMap } = await import("./commands/ownership-map.js");
    runOwnershipMap(argv);
    return;
  }

  // ─── Retry Pattern Audit Command ─────────────────────────────────
  if (args.command === "retry-pattern-audit") {
    const { runRetryPatternAudit } = await import("./commands/retry-pattern-audit.js");
    runRetryPatternAudit(argv);
    return;
  }

  // ─── Error Taxonomy Command ──────────────────────────────────────
  if (args.command === "error-taxonomy") {
    const { runErrorTaxonomy } = await import("./commands/error-taxonomy.js");
    runErrorTaxonomy(argv);
    return;
  }

  // ─── Boundary Enforce Command ────────────────────────────────────
  if (args.command === "boundary-enforce") {
    const { runBoundaryEnforce } = await import("./commands/boundary-enforce.js");
    runBoundaryEnforce(argv);
    return;
  }

  // ─── Log Quality Command ─────────────────────────────────────────
  if (args.command === "log-quality") {
    const { runLogQuality } = await import("./commands/log-quality.js");
    runLogQuality(argv);
    return;
  }

  // ─── Null Safety Audit Command ───────────────────────────────────
  if (args.command === "null-safety-audit") {
    const { runNullSafetyAudit } = await import("./commands/null-safety-audit.js");
    runNullSafetyAudit(argv);
    return;
  }

  // ─── Test Isolation Command ──────────────────────────────────────
  if (args.command === "test-isolation") {
    const { runTestIsolation } = await import("./commands/test-isolation.js");
    runTestIsolation(argv);
    return;
  }

  // ─── Comment Drift Command ───────────────────────────────────────
  if (args.command === "comment-drift") {
    const { runCommentDrift } = await import("./commands/comment-drift.js");
    runCommentDrift(argv);
    return;
  }

  // ─── Timeout Audit Command ──────────────────────────────────────
  if (args.command === "timeout-audit") {
    const { runTimeoutAudit } = await import("./commands/timeout-audit.js");
    runTimeoutAudit(argv);
    return;
  }

  // ─── Cache Audit Command ────────────────────────────────────────
  if (args.command === "cache-audit") {
    const { runCacheAudit } = await import("./commands/cache-audit.js");
    runCacheAudit(argv);
    return;
  }

  // ─── Idempotency Audit Command ──────────────────────────────────
  if (args.command === "idempotency-audit") {
    const { runIdempotencyAudit } = await import("./commands/idempotency-audit.js");
    runIdempotencyAudit(argv);
    return;
  }

  // ─── Type Boundary Command ──────────────────────────────────────
  if (args.command === "type-boundary") {
    const { runTypeBoundary } = await import("./commands/type-boundary.js");
    runTypeBoundary(argv);
    return;
  }

  // ─── Event Leak Command ─────────────────────────────────────────
  if (args.command === "event-leak") {
    const { runEventLeak } = await import("./commands/event-leak.js");
    runEventLeak(argv);
    return;
  }

  // ─── Privilege Path Command ─────────────────────────────────────
  if (args.command === "privilege-path") {
    const { runPrivilegePath } = await import("./commands/privilege-path.js");
    runPrivilegePath(argv);
    return;
  }

  // ─── Error UX Command ───────────────────────────────────────────
  if (args.command === "error-ux") {
    const { runErrorUx } = await import("./commands/error-ux.js");
    runErrorUx(argv);
    return;
  }

  // ─── Dead Code Detect Command ─────────────────────────────────────
  if (args.command === "dead-code-detect") {
    const { runDeadCodeDetect } = await import("./commands/dead-code-detect.js");
    runDeadCodeDetect(argv);
    return;
  }

  // ─── Async Safety Command ────────────────────────────────────────
  if (args.command === "async-safety") {
    const { runAsyncSafety } = await import("./commands/async-safety.js");
    runAsyncSafety(argv);
    return;
  }

  // ─── Input Guard Command ─────────────────────────────────────────
  if (args.command === "input-guard") {
    const { runInputGuard } = await import("./commands/input-guard.js");
    runInputGuard(argv);
    return;
  }

  // ─── Clone Detect Command ────────────────────────────────────────
  if (args.command === "clone-detect") {
    const { runCloneDetect } = await import("./commands/clone-detect.js");
    runCloneDetect(argv);
    return;
  }

  // ─── Contract Verify Command ─────────────────────────────────────
  if (args.command === "contract-verify") {
    const { runContractVerify } = await import("./commands/contract-verify.js");
    runContractVerify(argv);
    return;
  }

  // ─── Encoding Safety Command ─────────────────────────────────────
  if (args.command === "encoding-safety") {
    const { runEncodingSafety } = await import("./commands/encoding-safety.js");
    runEncodingSafety(argv);
    return;
  }

  // ─── Assertion Density Command ────────────────────────────────────
  if (args.command === "assertion-density") {
    const { runAssertionDensity } = await import("./commands/assertion-density.js");
    runAssertionDensity(argv);
    return;
  }

  // ─── State Integrity Command ──────────────────────────────────────
  if (args.command === "state-integrity") {
    const { runStateIntegrity } = await import("./commands/state-integrity.js");
    runStateIntegrity(argv);
    return;
  }

  // ─── Logic Lint Command ───────────────────────────────────────────
  if (args.command === "logic-lint") {
    const { runLogicLint } = await import("./commands/logic-lint.js");
    runLogicLint(argv);
    return;
  }

  // ─── Phantom Import Command ───────────────────────────────────────
  if (args.command === "phantom-import") {
    const { runPhantomImport } = await import("./commands/phantom-import.js");
    runPhantomImport(argv);
    return;
  }

  // ─── Example Leak Command ────────────────────────────────────────
  if (args.command === "example-leak") {
    const { runExampleLeak } = await import("./commands/example-leak.js");
    runExampleLeak(argv);
    return;
  }

  // ─── Completion Audit Command ─────────────────────────────────────
  if (args.command === "completion-audit") {
    const { runCompletionAudit } = await import("./commands/completion-audit.js");
    runCompletionAudit(argv);
    return;
  }

  // ─── Spec Conform Command ────────────────────────────────────────
  if (args.command === "spec-conform") {
    const { runSpecConform } = await import("./commands/spec-conform.js");
    runSpecConform(argv);
    return;
  }

  // ─── Cross-File Consistency Command ───────────────────────────────
  if (args.command === "cross-file-consistency") {
    const { runCrossFileConsistency } = await import("./commands/cross-file-consistency.js");
    runCrossFileConsistency(argv);
    return;
  }

  // ─── API Misuse Command ──────────────────────────────────────────
  if (args.command === "api-misuse") {
    const { runApiMisuse } = await import("./commands/api-misuse.js");
    runApiMisuse(argv);
    return;
  }

  // ─── Review Focus Command ────────────────────────────────────────
  if (args.command === "review-focus") {
    const { runReviewFocus } = await import("./commands/review-focus.js");
    runReviewFocus(argv);
    return;
  }

  // ─── Hallucination Detect Command ────────────────────────────────
  if (args.command === "hallucination-detect") {
    const { runHallucinationDetect } = await import("./commands/hallucination-detect.js");
    runHallucinationDetect(argv);
    return;
  }

  // ─── Context Blind Command ───────────────────────────────────────
  if (args.command === "context-blind") {
    const { runContextBlind } = await import("./commands/context-blind.js");
    runContextBlind(argv);
    return;
  }

  // ─── Over Abstraction Command ────────────────────────────────────
  if (args.command === "over-abstraction") {
    const { runOverAbstraction } = await import("./commands/over-abstraction.js");
    runOverAbstraction(argv);
    return;
  }

  // ─── Stale Pattern Command ───────────────────────────────────────
  if (args.command === "stale-pattern") {
    const { runStalePattern } = await import("./commands/stale-pattern.js");
    runStalePattern(argv);
    return;
  }

  // ─── Security Theater Command ────────────────────────────────────
  if (args.command === "security-theater") {
    const { runSecurityTheater } = await import("./commands/security-theater.js");
    runSecurityTheater(argv);
    return;
  }

  // ─── Review Digest Command ───────────────────────────────────────
  if (args.command === "review-digest") {
    const { runReviewDigest } = await import("./commands/review-digest.js");
    runReviewDigest(argv);
    return;
  }

  // ─── Adoption Track Command ──────────────────────────────────────
  if (args.command === "adoption-track") {
    const { runAdoptionTrack } = await import("./commands/adoption-track.js");
    runAdoptionTrack(argv);
    return;
  }

  // ─── Finding Budget Command ──────────────────────────────────────
  if (args.command === "finding-budget") {
    const { runFindingBudget } = await import("./commands/finding-budget.js");
    runFindingBudget(argv);
    return;
  }

  // ─── Quick Check Command ─────────────────────────────────────────
  if (args.command === "quick-check") {
    const { runQuickCheck } = await import("./commands/quick-check.js");
    runQuickCheck(argv);
    return;
  }

  // ─── Merge Verdict Command ──────────────────────────────────────
  if (args.command === "merge-verdict") {
    const { runMergeVerdict } = await import("./commands/merge-verdict.js");
    runMergeVerdict(argv);
    return;
  }

  // ─── Review Handoff Command ─────────────────────────────────────
  if (args.command === "review-handoff") {
    const { runReviewHandoff } = await import("./commands/review-handoff.js");
    runReviewHandoff(argv);
    return;
  }

  // ─── Evidence Chain Command ─────────────────────────────────────
  if (args.command === "evidence-chain") {
    const { runEvidenceChain } = await import("./commands/evidence-chain.js");
    runEvidenceChain(argv);
    return;
  }

  // ─── AI Provenance Command ──────────────────────────────────────
  if (args.command === "ai-provenance") {
    const { runAiProvenance } = await import("./commands/ai-provenance.js");
    runAiProvenance(argv);
    return;
  }

  // ─── Review Receipt Command ─────────────────────────────────────
  if (args.command === "review-receipt") {
    const { runReviewReceipt } = await import("./commands/review-receipt.js");
    runReviewReceipt(argv);
    return;
  }

  // ─── Review Contract Command ────────────────────────────────────
  if (args.command === "review-contract") {
    const { runReviewContract } = await import("./commands/review-contract.js");
    runReviewContract(argv);
    return;
  }

  // ─── Blame Review Command ──────────────────────────────────────
  if (args.command === "blame-review") {
    const { runBlameReview } = await import("./commands/blame-review.js");
    runBlameReview(argv);
    return;
  }

  // ─── Review Gate Command ─────────────────────────────────────────
  if (args.command === "review-gate") {
    const { runReviewGate } = await import("./commands/review-gate.js");
    runReviewGate(argv);
    return;
  }

  // ─── Diff Review Command ─────────────────────────────────────────
  if (args.command === "diff-review") {
    const { runDiffReview } = await import("./commands/diff-review.js");
    runDiffReview(argv);
    return;
  }

  // ─── Batch Review Command ───────────────────────────────────────
  if (args.command === "batch-review") {
    const { runBatchReview } = await import("./commands/batch-review.js");
    runBatchReview(argv);
    return;
  }

  // ─── Custom Rule Command ────────────────────────────────────────
  if (args.command === "custom-rule") {
    const { runCustomRule } = await import("./commands/custom-rule.js");
    runCustomRule(argv);
    return;
  }

  // ─── Review Compare Command ─────────────────────────────────────
  if (args.command === "review-compare") {
    const { runReviewCompare } = await import("./commands/review-compare.js");
    runReviewCompare(argv);
    return;
  }

  // ─── Severity Tune Command ──────────────────────────────────────
  if (args.command === "severity-tune") {
    const { runSeverityTune } = await import("./commands/severity-tune.js");
    runSeverityTune(argv);
    return;
  }

  // ─── Review Explain Command ─────────────────────────────────────
  if (args.command === "review-explain") {
    const { runReviewExplain } = await import("./commands/review-explain.js");
    runReviewExplain(argv);
    return;
  }

  // ─── Focus Area Command ─────────────────────────────────────────
  if (args.command === "focus-area") {
    const { runFocusArea } = await import("./commands/focus-area.js");
    runFocusArea(argv);
    return;
  }

  // ─── Review Cache Command ──────────────────────────────────────
  if (args.command === "review-cache") {
    const { runReviewCache } = await import("./commands/review-cache.js");
    runReviewCache(argv);
    return;
  }

  // ─── Ignore List Command ──────────────────────────────────────
  if (args.command === "ignore-list") {
    const { runIgnoreList } = await import("./commands/ignore-list.js");
    runIgnoreList(argv);
    return;
  }

  // ─── Review Log Command ───────────────────────────────────────
  if (args.command === "review-log") {
    const { runReviewLog } = await import("./commands/review-log.js");
    runReviewLog(argv);
    return;
  }

  // ─── Team Config Command ──────────────────────────────────────
  if (args.command === "team-config") {
    const { runTeamConfig } = await import("./commands/team-config.js");
    runTeamConfig(argv);
    return;
  }

  // ─── Finding Group Command ────────────────────────────────────
  if (args.command === "finding-group") {
    const { runFindingGroup } = await import("./commands/finding-group.js");
    runFindingGroup(argv);
    return;
  }

  // ─── Review Summary Command ───────────────────────────────────
  if (args.command === "review-summary") {
    const { runReviewSummary } = await import("./commands/review-summary.js");
    runReviewSummary(argv);
    return;
  }

  // ─── Rule Test Command ────────────────────────────────────────
  if (args.command === "rule-test") {
    const { runRuleTest } = await import("./commands/rule-test.js");
    runRuleTest(argv);
    return;
  }

  // ─── Incremental Review Command ───────────────────────────────
  if (args.command === "incremental-review") {
    const { runIncrementalReview } = await import("./commands/incremental-review.js");
    runIncrementalReview(argv);
    return;
  }

  // ─── Review Profile Command ───────────────────────────────────
  if (args.command === "review-profile") {
    const { runReviewProfile } = await import("./commands/review-profile.js");
    runReviewProfile(argv);
    return;
  }

  // ─── Review Template Command ──────────────────────────────────
  if (args.command === "review-template") {
    const { runReviewTemplate } = await import("./commands/review-template.js");
    runReviewTemplate(argv);
    return;
  }

  // ─── Auto Approve Command ────────────────────────────────────
  if (args.command === "auto-approve") {
    const { runAutoApprove } = await import("./commands/auto-approve.js");
    runAutoApprove(argv);
    return;
  }

  // ─── Diff Explain Command ────────────────────────────────────
  if (args.command === "diff-explain") {
    const { runDiffExplain } = await import("./commands/diff-explain.js");
    runDiffExplain(argv);
    return;
  }

  // ─── Review Stats Command ────────────────────────────────────
  if (args.command === "review-stats") {
    const { runReviewStats } = await import("./commands/review-stats.js");
    runReviewStats(argv);
    return;
  }

  // ─── Fix Suggest Command ─────────────────────────────────────
  if (args.command === "fix-suggest") {
    const { runFixSuggest } = await import("./commands/fix-suggest.js");
    runFixSuggest(argv);
    return;
  }

  // ─── Review Priority Command ─────────────────────────────────
  if (args.command === "review-priority") {
    const { runReviewPriority } = await import("./commands/review-priority.js");
    runReviewPriority(argv);
    return;
  }

  // ─── Multi-Lang Review Command ────────────────────────────────
  if (args.command === "multi-lang-review") {
    const { runMultiLangReview } = await import("./commands/multi-lang-review.js");
    runMultiLangReview(argv);
    return;
  }

  // ─── Review Webhook Command ───────────────────────────────────
  if (args.command === "review-webhook") {
    const { runReviewWebhook } = await import("./commands/review-webhook.js");
    runReviewWebhook(argv);
    return;
  }

  // ─── Finding Suppress Command ─────────────────────────────────
  if (args.command === "finding-suppress") {
    const { runFindingSuppress } = await import("./commands/finding-suppress.js");
    runFindingSuppress(argv);
    return;
  }

  // ─── Review Annotate Command ──────────────────────────────────
  if (args.command === "review-annotate") {
    const { runReviewAnnotate } = await import("./commands/review-annotate.js");
    runReviewAnnotate(argv);
    return;
  }

  // ─── Judge Config Command ─────────────────────────────────────
  if (args.command === "judge-config") {
    const { runJudgeConfig } = await import("./commands/judge-config.js");
    runJudgeConfig(argv);
    return;
  }

  // ─── Review Checkpoint Command ────────────────────────────────
  if (args.command === "review-checkpoint") {
    const { runReviewCheckpoint } = await import("./commands/review-checkpoint.js");
    runReviewCheckpoint(argv);
    return;
  }

  // ─── Review Merge Command ─────────────────────────────────────
  if (args.command === "review-merge") {
    const { runReviewMerge } = await import("./commands/review-merge.js");
    runReviewMerge(argv);
    return;
  }

  // ─── Review Filter Command ────────────────────────────────────
  if (args.command === "review-filter") {
    const { runReviewFilter } = await import("./commands/review-filter.js");
    runReviewFilter(argv);
    return;
  }

  // ─── Code Health Command ──────────────────────────────────────
  if (args.command === "code-health") {
    const { runCodeHealth } = await import("./commands/code-health.js");
    runCodeHealth(argv);
    return;
  }

  // ─── Fix Verify Command ───────────────────────────────────────
  if (args.command === "fix-verify") {
    const { runFixVerify } = await import("./commands/fix-verify.js");
    runFixVerify(argv);
    return;
  }

  // ─── Review Comment Command ───────────────────────────────────
  if (args.command === "review-comment") {
    const { runReviewComment } = await import("./commands/review-comment.js");
    runReviewComment(argv);
    return;
  }

  // ─── Finding Timeline Command ─────────────────────────────────
  if (args.command === "finding-timeline") {
    const { runFindingTimeline } = await import("./commands/finding-timeline.js");
    runFindingTimeline(argv);
    return;
  }

  // ─── Rule Catalog Command ─────────────────────────────────────
  if (args.command === "rule-catalog") {
    const { runRuleCatalog } = await import("./commands/rule-catalog.js");
    runRuleCatalog(argv);
    return;
  }

  // ─── Review Scope Command ─────────────────────────────────────
  if (args.command === "review-scope") {
    const { runReviewScope } = await import("./commands/review-scope.js");
    runReviewScope(argv);
    return;
  }

  // ─── Review Schedule Command ──────────────────────────────────
  if (args.command === "review-schedule") {
    const { runReviewSchedule } = await import("./commands/review-schedule.js");
    runReviewSchedule(argv);
    return;
  }

  // ─── Review Export Command ────────────────────────────────────
  if (args.command === "review-export") {
    const { runReviewExport } = await import("./commands/review-export.js");
    runReviewExport(argv);
    return;
  }

  // ─── Setup Wizard Command ─────────────────────────────────────
  if (args.command === "setup-wizard") {
    const { runSetupWizard } = await import("./commands/setup-wizard.js");
    runSetupWizard(argv);
    return;
  }

  // ─── Finding Age Command ──────────────────────────────────────────
  if (args.command === "finding-age") {
    const { runFindingAge } = await import("./commands/finding-age.js");
    await runFindingAge(argv);
    return;
  }

  // ─── Review Dashboard Command ────────────────────────────────────
  if (args.command === "review-dashboard") {
    const { runReviewDashboard } = await import("./commands/review-dashboard.js");
    await runReviewDashboard(argv);
    return;
  }

  // ─── Config Lint Command ─────────────────────────────────────────
  if (args.command === "config-lint") {
    const { runConfigLint } = await import("./commands/config-lint.js");
    await runConfigLint(argv);
    return;
  }

  // ─── Review Quota Command ────────────────────────────────────────
  if (args.command === "review-quota") {
    const { runReviewQuota } = await import("./commands/review-quota.js");
    await runReviewQuota(argv);
    return;
  }

  // ─── Review Offline Command ──────────────────────────────────────
  if (args.command === "review-offline") {
    const { runReviewOffline } = await import("./commands/review-offline.js");
    await runReviewOffline(argv);
    return;
  }

  // ─── Finding Rank Command ────────────────────────────────────────
  if (args.command === "finding-rank") {
    const { runFindingRank } = await import("./commands/finding-rank.js");
    await runFindingRank(argv);
    return;
  }

  // ─── Review Diff Summary Command ─────────────────────────────────
  if (args.command === "review-diff-summary") {
    const { runReviewDiffSummary } = await import("./commands/review-diff-summary.js");
    await runReviewDiffSummary(argv);
    return;
  }

  // ─── Review Notify Command ───────────────────────────────────────
  if (args.command === "review-notify") {
    const { runReviewNotify } = await import("./commands/review-notify.js");
    await runReviewNotify(argv);
    return;
  }

  // ─── Review Streak Command ───────────────────────────────────────
  if (args.command === "review-streak") {
    const { runReviewStreak } = await import("./commands/review-streak.js");
    await runReviewStreak(argv);
    return;
  }

  // ─── Finding Cluster Command ─────────────────────────────────────
  if (args.command === "finding-cluster") {
    const { runFindingCluster } = await import("./commands/finding-cluster.js");
    await runFindingCluster(argv);
    return;
  }

  // ─── Review Badge Command ────────────────────────────────────────
  if (args.command === "review-badge") {
    const { runReviewBadge } = await import("./commands/review-badge.js");
    await runReviewBadge(argv);
    return;
  }

  // ─── Review Audit Log Command ────────────────────────────────────
  if (args.command === "review-audit-log") {
    const { runReviewAuditLog } = await import("./commands/review-audit-log.js");
    await runReviewAuditLog(argv);
    return;
  }

  // ─── Review Sandbox Command ──────────────────────────────────────
  if (args.command === "review-sandbox") {
    const { runReviewSandbox } = await import("./commands/review-sandbox.js");
    await runReviewSandbox(argv);
    return;
  }

  // ─── Finding Hotspot Command ─────────────────────────────────────
  if (args.command === "finding-hotspot") {
    const { runFindingHotspot } = await import("./commands/finding-hotspot.js");
    await runFindingHotspot(argv);
    return;
  }

  // ─── Review AB Test Command ──────────────────────────────────────
  if (args.command === "review-ab-test") {
    const { runReviewAbTest } = await import("./commands/review-ab-test.js");
    await runReviewAbTest(argv);
    return;
  }

  // ─── Review Integration Command ──────────────────────────────────
  if (args.command === "review-integration") {
    const { runReviewIntegration } = await import("./commands/review-integration.js");
    await runReviewIntegration(argv);
    return;
  }

  // ─── Review Standup Command ──────────────────────────────────────
  if (args.command === "review-standup") {
    const { runReviewStandup } = await import("./commands/review-standup.js");
    await runReviewStandup(argv);
    return;
  }

  // ─── Finding Fix Rate Command ────────────────────────────────────
  if (args.command === "finding-fix-rate") {
    const { runFindingFixRate } = await import("./commands/finding-fix-rate.js");
    await runFindingFixRate(argv);
    return;
  }

  // ─── Review Milestone Command ────────────────────────────────────
  if (args.command === "review-milestone") {
    const { runReviewMilestone } = await import("./commands/review-milestone.js");
    await runReviewMilestone(argv);
    return;
  }

  // ─── Review Risk Score Command ───────────────────────────────────
  if (args.command === "review-risk-score") {
    const { runReviewRiskScore } = await import("./commands/review-risk-score.js");
    await runReviewRiskScore(argv);
    return;
  }

  // ─── Review Changelog Gen Command ────────────────────────────────
  if (args.command === "review-changelog-gen") {
    const { runReviewChangelogGen } = await import("./commands/review-changelog-gen.js");
    await runReviewChangelogGen(argv);
    return;
  }

  // ─── Finding Recurrence Command ──────────────────────────────────
  if (args.command === "finding-recurrence") {
    const { runFindingRecurrence } = await import("./commands/finding-recurrence.js");
    await runFindingRecurrence(argv);
    return;
  }

  // ─── Review Benchmark Self Command ───────────────────────────────
  if (args.command === "review-benchmark-self") {
    const { runReviewBenchmarkSelf } = await import("./commands/review-benchmark-self.js");
    await runReviewBenchmarkSelf(argv);
    return;
  }

  // ─── Review Report PDF Command ───────────────────────────────────
  if (args.command === "review-report-pdf") {
    const { runReviewReportPdf } = await import("./commands/review-report-pdf.js");
    await runReviewReportPdf(argv);
    return;
  }

  // ─── Review Tag Command ─────────────────────────────────────────────
  if (args.command === "review-tag") {
    const { runReviewTag } = await import("./commands/review-tag.js");
    runReviewTag(argv);
    return;
  }

  // ─── Finding Impact Command ─────────────────────────────────────────
  if (args.command === "finding-impact") {
    const { runFindingImpact } = await import("./commands/finding-impact.js");
    runFindingImpact(argv);
    return;
  }

  // ─── Review Archive Command ─────────────────────────────────────────
  if (args.command === "review-archive") {
    const { runReviewArchive } = await import("./commands/review-archive.js");
    runReviewArchive(argv);
    return;
  }

  // ─── Review Whitelist Command ───────────────────────────────────────
  if (args.command === "review-whitelist") {
    const { runReviewWhitelist } = await import("./commands/review-whitelist.js");
    runReviewWhitelist(argv);
    return;
  }

  // ─── Review Custom Prompt Command ───────────────────────────────────
  if (args.command === "review-custom-prompt") {
    const { runReviewCustomPrompt } = await import("./commands/review-custom-prompt.js");
    runReviewCustomPrompt(argv);
    return;
  }

  // ─── Review Diff Context Command ───────────────────────────────────
  if (args.command === "review-diff-context") {
    const { runReviewDiffContext } = await import("./commands/review-diff-context.js");
    runReviewDiffContext(argv);
    return;
  }

  // ─── Review CI Status Command ──────────────────────────────────────
  if (args.command === "review-ci-status") {
    const { runReviewCiStatus } = await import("./commands/review-ci-status.js");
    runReviewCiStatus(argv);
    return;
  }

  // ─── Review Team Summary Command ───────────────────────────────────
  if (args.command === "review-team-summary") {
    const { runReviewTeamSummary } = await import("./commands/review-team-summary.js");
    runReviewTeamSummary(argv);
    return;
  }

  // ─── Finding Auto Fix Command ─────────────────────────────────────
  if (args.command === "finding-auto-fix") {
    const { runFindingAutoFix } = await import("./commands/finding-auto-fix.js");
    runFindingAutoFix(argv);
    return;
  }

  // ─── Review History Search Command ────────────────────────────────
  if (args.command === "review-history-search") {
    const { runReviewHistorySearch } = await import("./commands/review-history-search.js");
    runReviewHistorySearch(argv);
    return;
  }

  // ─── Review Language Stats Command ────────────────────────────────
  if (args.command === "review-language-stats") {
    const { runReviewLanguageStats } = await import("./commands/review-language-stats.js");
    runReviewLanguageStats(argv);
    return;
  }

  // ─── Review Coverage Map Command ──────────────────────────────────
  if (args.command === "review-coverage-map") {
    const { runReviewCoverageMap } = await import("./commands/review-coverage-map.js");
    runReviewCoverageMap(argv);
    return;
  }

  // ─── Review Rollback Command ──────────────────────────────────────
  if (args.command === "review-rollback") {
    const { runReviewRollback } = await import("./commands/review-rollback.js");
    runReviewRollback(argv);
    return;
  }

  // ─── Review Onboard Command ───────────────────────────────────────
  if (args.command === "review-onboard") {
    const { runReviewOnboard } = await import("./commands/review-onboard.js");
    runReviewOnboard(argv);
    return;
  }

  // ─── Review Parallel Command ──────────────────────────────────────
  if (args.command === "review-parallel") {
    const { runReviewParallel } = await import("./commands/review-parallel.js");
    runReviewParallel(argv);
    return;
  }

  // ─── Finding Context Command ──────────────────────────────────────
  if (args.command === "finding-context") {
    const { runFindingContext } = await import("./commands/finding-context.js");
    runFindingContext(argv);
    return;
  }

  // ─── Review Approval Command ──────────────────────────────────────
  if (args.command === "review-approval") {
    const { runReviewApproval } = await import("./commands/review-approval.js");
    runReviewApproval(argv);
    return;
  }

  // ─── Finding Severity Override Command ────────────────────────────
  if (args.command === "finding-severity-override") {
    const { runFindingSeverityOverride } = await import("./commands/finding-severity-override.js");
    runFindingSeverityOverride(argv);
    return;
  }

  // ─── Review Config Export Command ─────────────────────────────────
  if (args.command === "review-config-export") {
    const { runReviewConfigExport } = await import("./commands/review-config-export.js");
    runReviewConfigExport(argv);
    return;
  }

  // ─── Review PR Comment Command ────────────────────────────────────
  if (args.command === "review-pr-comment") {
    const { runReviewPrComment } = await import("./commands/review-pr-comment.js");
    runReviewPrComment(argv);
    return;
  }

  // ─── Review Ignore Path Command ───────────────────────────────────
  if (args.command === "review-ignore-path") {
    const { runReviewIgnorePath } = await import("./commands/review-ignore-path.js");
    runReviewIgnorePath(argv);
    return;
  }

  // ─── Finding Deduplicate Command ──────────────────────────────────
  if (args.command === "finding-deduplicate") {
    const { runFindingDeduplicate } = await import("./commands/finding-deduplicate.js");
    runFindingDeduplicate(argv);
    return;
  }

  // ─── Review Score History Command ─────────────────────────────────
  if (args.command === "review-score-history") {
    const { runReviewScoreHistory } = await import("./commands/review-score-history.js");
    runReviewScoreHistory(argv);
    return;
  }

  // ─── Review Feedback Command ──────────────────────────────────────
  if (args.command === "review-feedback") {
    const { runReviewFeedback } = await import("./commands/review-feedback.js");
    runReviewFeedback(argv);
    return;
  }

  // ─── Finding False Positive Command ───────────────────────────────
  if (args.command === "finding-false-positive") {
    const { runFindingFalsePositive } = await import("./commands/finding-false-positive.js");
    runFindingFalsePositive(argv);
    return;
  }

  // ─── Review Session Command ───────────────────────────────────────
  if (args.command === "review-session") {
    const { runReviewSession } = await import("./commands/review-session.js");
    runReviewSession(argv);
    return;
  }

  // ─── Review Bulk Action Command ───────────────────────────────────
  if (args.command === "review-bulk-action") {
    const { runReviewBulkAction } = await import("./commands/review-bulk-action.js");
    runReviewBulkAction(argv);
    return;
  }

  // ─── Review Retry Command ─────────────────────────────────────────
  if (args.command === "review-retry") {
    const { runReviewRetry } = await import("./commands/review-retry.js");
    runReviewRetry(argv);
    return;
  }

  // ─── Review Depth Command ─────────────────────────────────────────
  if (args.command === "review-depth") {
    const { runReviewDepth } = await import("./commands/review-depth.js");
    runReviewDepth(argv);
    return;
  }

  // ─── Finding Link Command ─────────────────────────────────────────
  if (args.command === "finding-link") {
    const { runFindingLink } = await import("./commands/finding-link.js");
    runFindingLink(argv);
    return;
  }

  // ─── Review Compare Version Command ───────────────────────────────
  if (args.command === "review-compare-version") {
    const { runReviewCompareVersion } = await import("./commands/review-compare-version.js");
    runReviewCompareVersion(argv);
    return;
  }

  // ─── Review Summary Email Command ─────────────────────────────────
  if (args.command === "review-summary-email") {
    const { runReviewSummaryEmail } = await import("./commands/review-summary-email.js");
    runReviewSummaryEmail(argv);
    return;
  }

  // ─── Finding Confidence Filter Command ────────────────────────────
  if (args.command === "finding-confidence-filter") {
    const { runFindingConfidenceFilter } = await import("./commands/finding-confidence-filter.js");
    runFindingConfidenceFilter(argv);
    return;
  }

  // ─── Review Skip Rule Command ─────────────────────────────────────
  if (args.command === "review-skip-rule") {
    const { runReviewSkipRule } = await import("./commands/review-skip-rule.js");
    runReviewSkipRule(argv);
    return;
  }

  // ─── Review Note Command ──────────────────────────────────────────
  if (args.command === "review-note") {
    const { runReviewNote } = await import("./commands/review-note.js");
    runReviewNote(argv);
    return;
  }

  // ─── Finding Export CSV Command ───────────────────────────────────
  if (args.command === "finding-export-csv") {
    const { runFindingExportCsv } = await import("./commands/finding-export-csv.js");
    runFindingExportCsv(argv);
    return;
  }

  // ─── Review Timeline Command ──────────────────────────────────────
  if (args.command === "review-timeline") {
    const { runReviewTimeline } = await import("./commands/review-timeline.js");
    runReviewTimeline(argv);
    return;
  }

  // ─── Review Snapshot Diff Command ─────────────────────────────────
  if (args.command === "review-snapshot-diff") {
    const { runReviewSnapshotDiff } = await import("./commands/review-snapshot-diff.js");
    runReviewSnapshotDiff(argv);
    return;
  }

  // ─── Finding Resolution Command ───────────────────────────────────
  if (args.command === "finding-resolution") {
    const { runFindingResolution } = await import("./commands/finding-resolution.js");
    runFindingResolution(argv);
    return;
  }

  // ─── Review Owner Command ─────────────────────────────────────────
  if (args.command === "review-owner") {
    const { runReviewOwner } = await import("./commands/review-owner.js");
    runReviewOwner(argv);
    return;
  }

  // ─── Review Checklist Command ─────────────────────────────────────
  if (args.command === "review-checklist") {
    const { runReviewChecklist } = await import("./commands/review-checklist.js");
    runReviewChecklist(argv);
    return;
  }

  // ─── Finding Category Command ─────────────────────────────────────
  if (args.command === "finding-category") {
    const { runFindingCategory } = await import("./commands/finding-category.js");
    runFindingCategory(argv);
    return;
  }

  // ─── Review Lock Command ────────────────────────────────────────
  if (args.command === "review-lock") {
    const { runReviewLock } = await import("./commands/review-lock.js");
    runReviewLock(argv);
    return;
  }

  // ─── Finding Priority Queue Command ─────────────────────────────
  if (args.command === "finding-priority-queue") {
    const { runFindingPriorityQueue } = await import("./commands/finding-priority-queue.js");
    runFindingPriorityQueue(argv);
    return;
  }

  // ─── Review Diff Annotate Command ───────────────────────────────
  if (args.command === "review-diff-annotate") {
    const { runReviewDiffAnnotate } = await import("./commands/review-diff-annotate.js");
    runReviewDiffAnnotate(argv);
    return;
  }

  // ─── Finding Remediation Plan Command ───────────────────────────
  if (args.command === "finding-remediation-plan") {
    const { runFindingRemediationPlan } = await import("./commands/finding-remediation-plan.js");
    runFindingRemediationPlan(argv);
    return;
  }

  // ─── Review Config Validate Command ─────────────────────────────
  if (args.command === "review-config-validate") {
    const { runReviewConfigValidate } = await import("./commands/review-config-validate.js");
    runReviewConfigValidate(argv);
    return;
  }

  // ─── Review Rate Limit Command ──────────────────────────────────
  if (args.command === "review-rate-limit") {
    const { runReviewRateLimit } = await import("./commands/review-rate-limit.js");
    runReviewRateLimit(argv);
    return;
  }

  // ─── Finding Trend Command ────────────────────────────────────────
  if (args.command === "finding-trend") {
    const { runFindingTrend } = await import("./commands/finding-trend.js");
    runFindingTrend(argv);
    return;
  }

  // ─── Finding Snippet Command ──────────────────────────────────────
  if (args.command === "finding-snippet") {
    const { runFindingSnippet } = await import("./commands/finding-snippet.js");
    runFindingSnippet(argv);
    return;
  }

  // ─── Review Env Check Command ─────────────────────────────────────
  if (args.command === "review-env-check") {
    const { runReviewEnvCheck } = await import("./commands/review-env-check.js");
    runReviewEnvCheck(argv);
    return;
  }

  // ─── Finding Batch Resolve Command ────────────────────────────────
  if (args.command === "finding-batch-resolve") {
    const { runFindingBatchResolve } = await import("./commands/finding-batch-resolve.js");
    runFindingBatchResolve(argv);
    return;
  }

  // ─── Review Integration Test Command ──────────────────────────────
  if (args.command === "review-integration-test") {
    const { runReviewIntegrationTest } = await import("./commands/review-integration-test.js");
    runReviewIntegrationTest(argv);
    return;
  }

  // ─── Review Health Check Command ──────────────────────────────────
  if (args.command === "review-health-check") {
    const { runReviewHealthCheck } = await import("./commands/review-health-check.js");
    runReviewHealthCheck(argv);
    return;
  }

  // ─── Finding Age Report Command ───────────────────────────────────
  if (args.command === "finding-age-report") {
    const { runFindingAgeReport } = await import("./commands/finding-age-report.js");
    runFindingAgeReport(argv);
    return;
  }

  // ─── Review Rule Stats Command ────────────────────────────────────
  if (args.command === "review-rule-stats") {
    const { runReviewRuleStats } = await import("./commands/review-rule-stats.js");
    runReviewRuleStats(argv);
    return;
  }

  // ─── Review Parallel Diff Command ─────────────────────────────────
  if (args.command === "review-parallel-diff") {
    const { runReviewParallelDiff } = await import("./commands/review-parallel-diff.js");
    runReviewParallelDiff(argv);
    return;
  }

  // ─── Review Auto Merge Command ────────────────────────────────────
  if (args.command === "review-auto-merge") {
    const { runReviewAutoMerge } = await import("./commands/review-auto-merge.js");
    runReviewAutoMerge(argv);
    return;
  }

  // ─── Finding Correlate Command ────────────────────────────────────
  if (args.command === "finding-correlate") {
    const { runFindingCorrelate } = await import("./commands/finding-correlate.js");
    runFindingCorrelate(argv);
    return;
  }

  // ─── Review Dry Run Command ───────────────────────────────────────
  if (args.command === "review-dry-run") {
    const { runReviewDryRun } = await import("./commands/review-dry-run.js");
    runReviewDryRun(argv);
    return;
  }

  // ─── Finding Suppress Pattern Command ─────────────────────────────
  if (args.command === "finding-suppress-pattern") {
    const { runFindingSuppressPattern } = await import("./commands/finding-suppress-pattern.js");
    runFindingSuppressPattern(argv);
    return;
  }

  // ─── Review Cache Clear Command ───────────────────────────────────
  if (args.command === "review-cache-clear") {
    const { runReviewCacheClear } = await import("./commands/review-cache-clear.js");
    runReviewCacheClear(argv);
    return;
  }

  // ─── Finding Impact Score Command ─────────────────────────────────
  if (args.command === "finding-impact-score") {
    const { runFindingImpactScore } = await import("./commands/finding-impact-score.js");
    runFindingImpactScore(argv);
    return;
  }

  // ─── Review Compliance Check Command ──────────────────────────────
  if (args.command === "review-compliance-check") {
    const { runReviewComplianceCheck } = await import("./commands/review-compliance-check.js");
    runReviewComplianceCheck(argv);
    return;
  }

  // ─── Finding Root Cause Command ───────────────────────────────────
  if (args.command === "finding-root-cause") {
    const { runFindingRootCause } = await import("./commands/finding-root-cause.js");
    runFindingRootCause(argv);
    return;
  }

  // ─── Review File Filter Command ──────────────────────────────────
  if (args.command === "review-file-filter") {
    const { runReviewFileFilter } = await import("./commands/review-file-filter.js");
    runReviewFileFilter(argv);
    return;
  }

  // ─── Finding Dependency Check Command ────────────────────────────
  if (args.command === "finding-dependency-check") {
    const { runFindingDependencyCheck } = await import("./commands/finding-dependency-check.js");
    runFindingDependencyCheck(argv);
    return;
  }

  // ─── Review Incremental Command ──────────────────────────────────
  if (args.command === "review-incremental") {
    const { runReviewIncremental } = await import("./commands/review-incremental.js");
    runReviewIncremental(argv);
    return;
  }

  // ─── Finding Severity Histogram Command ──────────────────────────
  if (args.command === "finding-severity-histogram") {
    const { runFindingSeverityHistogram } = await import("./commands/finding-severity-histogram.js");
    runFindingSeverityHistogram(argv);
    return;
  }

  // ─── Review Plugin Manage Command ────────────────────────────────
  if (args.command === "review-plugin-manage") {
    const { runReviewPluginManage } = await import("./commands/review-plugin-manage.js");
    runReviewPluginManage(argv);
    return;
  }

  // ─── Finding Dedup Cross File Command ────────────────────────────
  if (args.command === "finding-dedup-cross-file") {
    const { runFindingDedupCrossFile } = await import("./commands/finding-dedup-cross-file.js");
    runFindingDedupCrossFile(argv);
    return;
  }

  // ─── Review Progress Bar Command ─────────────────────────────────
  if (args.command === "review-progress-bar") {
    const { runReviewProgressBar } = await import("./commands/review-progress-bar.js");
    runReviewProgressBar(argv);
    return;
  }

  // ─── Finding Auto Label Command ──────────────────────────────────
  if (args.command === "finding-auto-label") {
    const { runFindingAutoLabel } = await import("./commands/finding-auto-label.js");
    runFindingAutoLabel(argv);
    return;
  }

  // ─── Finding Group By Command ────────────────────────────────────
  if (args.command === "finding-group-by") {
    const { runFindingGroupBy } = await import("./commands/finding-group-by.js");
    runFindingGroupBy(argv);
    return;
  }

  // ─── Finding Diff Highlight Command ──────────────────────────────
  if (args.command === "finding-diff-highlight") {
    const { runFindingDiffHighlight } = await import("./commands/finding-diff-highlight.js");
    runFindingDiffHighlight(argv);
    return;
  }

  // ─── Finding Fix Verify Command ──────────────────────────────────
  if (args.command === "finding-fix-verify") {
    const { runFindingFixVerify } = await import("./commands/finding-fix-verify.js");
    runFindingFixVerify(argv);
    return;
  }

  // ─── Review Custom Judge Command ─────────────────────────────────
  if (args.command === "review-custom-judge") {
    const { runReviewCustomJudge } = await import("./commands/review-custom-judge.js");
    runReviewCustomJudge(argv);
    return;
  }

  // ─── Finding Prioritize Command ──────────────────────────────────
  if (args.command === "finding-prioritize") {
    const { runFindingPrioritize } = await import("./commands/finding-prioritize.js");
    runFindingPrioritize(argv);
    return;
  }

  // ─── Review Annotation Command ───────────────────────────────────
  if (args.command === "review-annotation") {
    const { runReviewAnnotation } = await import("./commands/review-annotation.js");
    runReviewAnnotation(argv);
    return;
  }

  // ─── Review Multi Repo Command ───────────────────────────────────
  if (args.command === "review-multi-repo") {
    const { runReviewMultiRepo } = await import("./commands/review-multi-repo.js");
    runReviewMultiRepo(argv);
    return;
  }

  // ─── Finding Trace Command ───────────────────────────────────────
  if (args.command === "finding-trace") {
    const { runFindingTrace } = await import("./commands/finding-trace.js");
    runFindingTrace(argv);
    return;
  }

  // ─── Review Preset Save Command ──────────────────────────────────
  if (args.command === "review-preset-save") {
    const { runReviewPresetSave } = await import("./commands/review-preset-save.js");
    runReviewPresetSave(argv);
    return;
  }

  // ─── Review Blame Map Command ────────────────────────────────────
  if (args.command === "review-blame-map") {
    const { runReviewBlameMap } = await import("./commands/review-blame-map.js");
    runReviewBlameMap(argv);
    return;
  }

  // ─── Finding Autofix Preview Command ─────────────────────────────
  if (args.command === "finding-autofix-preview") {
    const { runFindingAutofixPreview } = await import("./commands/finding-autofix-preview.js");
    runFindingAutofixPreview(argv);
    return;
  }

  // ─── Review Config Diff Command ──────────────────────────────────
  if (args.command === "review-config-diff") {
    const { runReviewConfigDiff } = await import("./commands/review-config-diff.js");
    runReviewConfigDiff(argv);
    return;
  }

  // ─── Finding Severity Trend Command ──────────────────────────────
  if (args.command === "finding-severity-trend") {
    const { runFindingSeverityTrend } = await import("./commands/finding-severity-trend.js");
    runFindingSeverityTrend(argv);
    return;
  }

  // ─── Review Batch Files Command ──────────────────────────────────
  if (args.command === "review-batch-files") {
    const { runReviewBatchFiles } = await import("./commands/review-batch-files.js");
    runReviewBatchFiles(argv);
    return;
  }

  // ─── Finding Context Expand Command ──────────────────────────────
  if (args.command === "finding-context-expand") {
    const { runFindingContextExpand } = await import("./commands/finding-context-expand.js");
    runFindingContextExpand(argv);
    return;
  }

  // ─── Review Output Format Command ────────────────────────────────
  if (args.command === "review-output-format") {
    const { runReviewOutputFormat } = await import("./commands/review-output-format.js");
    runReviewOutputFormat(argv);
    return;
  }

  // ─── Finding Merge Results Command ───────────────────────────────
  if (args.command === "finding-merge-results") {
    const { runFindingMergeResults } = await import("./commands/finding-merge-results.js");
    runFindingMergeResults(argv);
    return;
  }

  // ─── Review Dependency Graph Command ─────────────────────────────
  if (args.command === "review-dependency-graph") {
    const { runReviewDependencyGraph } = await import("./commands/review-dependency-graph.js");
    runReviewDependencyGraph(argv);
    return;
  }

  // ─── Finding Pattern Match Command ───────────────────────────────
  if (args.command === "finding-pattern-match") {
    const { runFindingPatternMatch } = await import("./commands/finding-pattern-match.js");
    runFindingPatternMatch(argv);
    return;
  }

  // ─── Review Diff Stats Command ───────────────────────────────────
  if (args.command === "review-diff-stats") {
    const { runReviewDiffStats } = await import("./commands/review-diff-stats.js");
    runReviewDiffStats(argv);
    return;
  }

  // ─── Finding CWE Map Command ─────────────────────────────────────
  if (args.command === "finding-cwe-map") {
    const { runFindingCweMap } = await import("./commands/finding-cwe-map.js");
    runFindingCweMap(argv);
    return;
  }

  // ─── Review Exclude Vendor Command ───────────────────────────────
  if (args.command === "review-exclude-vendor") {
    const { runReviewExcludeVendor } = await import("./commands/review-exclude-vendor.js");
    runReviewExcludeVendor(argv);
    return;
  }

  // ─── Finding Risk Matrix Command ─────────────────────────────────
  if (args.command === "finding-risk-matrix") {
    const { runFindingRiskMatrix } = await import("./commands/finding-risk-matrix.js");
    runFindingRiskMatrix(argv);
    return;
  }

  // ─── Review File Stats Command ───────────────────────────────────
  if (args.command === "review-file-stats") {
    const { runReviewFileStats } = await import("./commands/review-file-stats.js");
    runReviewFileStats(argv);
    return;
  }

  // ─── Finding False Neg Check Command ─────────────────────────────
  if (args.command === "finding-false-neg-check") {
    const { runFindingFalseNegCheck } = await import("./commands/finding-false-neg-check.js");
    runFindingFalseNegCheck(argv);
    return;
  }

  // ─── Review Rule Filter Command ──────────────────────────────────
  if (args.command === "review-rule-filter") {
    const { runReviewRuleFilter } = await import("./commands/review-rule-filter.js");
    runReviewRuleFilter(argv);
    return;
  }

  // ─── Review Scope Lock Command ──────────────────────────────────
  if (args.command === "review-scope-lock") {
    const { runReviewScopeLock } = await import("./commands/review-scope-lock.js");
    runReviewScopeLock(argv);
    return;
  }

  // ─── Finding Duplicate Rule Command ─────────────────────────────
  if (args.command === "finding-duplicate-rule") {
    const { runFindingDuplicateRule } = await import("./commands/finding-duplicate-rule.js");
    runFindingDuplicateRule(argv);
    return;
  }

  // ─── Review Watch Mode Command ──────────────────────────────────
  if (args.command === "review-watch-mode") {
    const { runReviewWatchMode } = await import("./commands/review-watch-mode.js");
    runReviewWatchMode(argv);
    return;
  }

  // ─── Review Export PDF Command ──────────────────────────────────
  if (args.command === "review-export-pdf") {
    const { runReviewExportPdf } = await import("./commands/review-export-pdf.js");
    runReviewExportPdf(argv);
    return;
  }

  // ─── Finding Line Blame Command ─────────────────────────────────
  if (args.command === "finding-line-blame") {
    const { runFindingLineBlame } = await import("./commands/finding-line-blame.js");
    runFindingLineBlame(argv);
    return;
  }

  // ─── Finding Age Tracker Command ────────────────────────────────
  if (args.command === "finding-age-tracker") {
    const { runFindingAgeTracker } = await import("./commands/finding-age-tracker.js");
    runFindingAgeTracker(argv);
    return;
  }

  // ─── Review Parallel Files Command ──────────────────────────────
  if (args.command === "review-parallel-files") {
    const { runReviewParallelFiles } = await import("./commands/review-parallel-files.js");
    runReviewParallelFiles(argv);
    return;
  }

  // ─── Finding Summary Digest Command ─────────────────────────────
  if (args.command === "finding-summary-digest") {
    const { runFindingSummaryDigest } = await import("./commands/finding-summary-digest.js");
    runFindingSummaryDigest(argv);
    return;
  }

  // ─── Review Code Owner Command ──────────────────────────────────
  if (args.command === "review-code-owner") {
    const { runReviewCodeOwner } = await import("./commands/review-code-owner.js");
    runReviewCodeOwner(argv);
    return;
  }

  // ─── Review Finding Link Command ────────────────────────────────
  if (args.command === "review-finding-link") {
    const { runReviewFindingLink } = await import("./commands/review-finding-link.js");
    runReviewFindingLink(argv);
    return;
  }

  // ─── Review Team Assign Command ─────────────────────────────────
  if (args.command === "review-team-assign") {
    const { runReviewTeamAssign } = await import("./commands/review-team-assign.js");
    runReviewTeamAssign(argv);
    return;
  }

  // ─── Finding Compare Runs Command ───────────────────────────────
  if (args.command === "finding-compare-runs") {
    const { runFindingCompareRuns } = await import("./commands/finding-compare-runs.js");
    runFindingCompareRuns(argv);
    return;
  }

  // ─── Review Skip List Command ───────────────────────────────────
  if (args.command === "review-skip-list") {
    const { runReviewSkipList } = await import("./commands/review-skip-list.js");
    runReviewSkipList(argv);
    return;
  }

  // ─── Finding Hotfix Suggest Command ─────────────────────────────
  if (args.command === "finding-hotfix-suggest") {
    const { runFindingHotfixSuggest } = await import("./commands/finding-hotfix-suggest.js");
    runFindingHotfixSuggest(argv);
    return;
  }

  // ─── Review Approval Gate Command ───────────────────────────────
  if (args.command === "review-approval-gate") {
    const { runReviewApprovalGate } = await import("./commands/review-approval-gate.js");
    runReviewApprovalGate(argv);
    return;
  }

  // ─── Review Changelog Entry Command ─────────────────────────────
  if (args.command === "review-changelog-entry") {
    const { runReviewChangelogEntry } = await import("./commands/review-changelog-entry.js");
    runReviewChangelogEntry(argv);
    return;
  }

  // ─── Review Branch Compare Command ──────────────────────────────
  if (args.command === "review-branch-compare") {
    const { runReviewBranchCompare } = await import("./commands/review-branch-compare.js");
    runReviewBranchCompare(argv);
    return;
  }

  // ─── Finding Category Stats Command ─────────────────────────────
  if (args.command === "finding-category-stats") {
    const { runFindingCategoryStats } = await import("./commands/finding-category-stats.js");
    runFindingCategoryStats(argv);
    return;
  }

  // ─── Finding Trend Report Command ─────────────────────────────────
  if (args.command === "finding-trend-report") {
    const { runFindingTrendReport } = await import("./commands/finding-trend-report.js");
    runFindingTrendReport(argv);
    return;
  }

  // ─── Review Commit Hook Command ───────────────────────────────────
  if (args.command === "review-commit-hook") {
    const { runReviewCommitHook } = await import("./commands/review-commit-hook.js");
    runReviewCommitHook(argv);
    return;
  }

  // ─── Finding Noise Filter Command ─────────────────────────────────
  if (args.command === "finding-noise-filter") {
    const { runFindingNoiseFilter } = await import("./commands/finding-noise-filter.js");
    runFindingNoiseFilter(argv);
    return;
  }

  // ─── Finding Fix Priority Command ─────────────────────────────────
  if (args.command === "finding-fix-priority") {
    const { runFindingFixPriority } = await import("./commands/finding-fix-priority.js");
    runFindingFixPriority(argv);
    return;
  }

  // ─── Review Quota Check Command ───────────────────────────────────
  if (args.command === "review-quota-check") {
    const { runReviewQuotaCheck } = await import("./commands/review-quota-check.js");
    runReviewQuotaCheck(argv);
    return;
  }

  // ─── Finding Cluster Analysis Command ─────────────────────────────
  if (args.command === "finding-cluster-analysis") {
    const { runFindingClusterAnalysis } = await import("./commands/finding-cluster-analysis.js");
    runFindingClusterAnalysis(argv);
    return;
  }

  // ─── Review Session Save Command ──────────────────────────────────
  if (args.command === "review-session-save") {
    const { runReviewSessionSave } = await import("./commands/review-session-save.js");
    runReviewSessionSave(argv);
    return;
  }

  // ─── Finding Evidence Chain Command ───────────────────────────────
  if (args.command === "finding-evidence-chain") {
    const { runFindingEvidenceChain } = await import("./commands/finding-evidence-chain.js");
    runFindingEvidenceChain(argv);
    return;
  }

  // ─── Review File Complexity Command ───────────────────────────────
  if (args.command === "review-file-complexity") {
    const { runReviewFileComplexity } = await import("./commands/review-file-complexity.js");
    runReviewFileComplexity(argv);
    return;
  }

  // ─── Finding Dependency Risk Command ──────────────────────────────
  if (args.command === "finding-dependency-risk") {
    const { runFindingDependencyRisk } = await import("./commands/finding-dependency-risk.js");
    runFindingDependencyRisk(argv);
    return;
  }

  // ─── Review PR Template Command ───────────────────────────────────
  if (args.command === "review-pr-template") {
    const { runReviewPrTemplate } = await import("./commands/review-pr-template.js");
    runReviewPrTemplate(argv);
    return;
  }

  // ─── Finding Security Hotspot Command ─────────────────────────────
  if (args.command === "finding-security-hotspot") {
    const { runFindingSecurityHotspot } = await import("./commands/finding-security-hotspot.js");
    runFindingSecurityHotspot(argv);
    return;
  }

  // ─── Finding Suppression Log Command ──────────────────────────────
  if (args.command === "finding-suppression-log") {
    const { runFindingSuppressionLog } = await import("./commands/finding-suppression-log.js");
    runFindingSuppressionLog(argv);
    return;
  }

  // ─── Review Diff Highlight Command ────────────────────────────────
  if (args.command === "review-diff-highlight") {
    const { runReviewDiffHighlight } = await import("./commands/review-diff-highlight.js");
    runReviewDiffHighlight(argv);
    return;
  }

  // ─── Finding CVE Lookup Command ───────────────────────────────────
  if (args.command === "finding-cve-lookup") {
    const { runFindingCveLookup } = await import("./commands/finding-cve-lookup.js");
    runFindingCveLookup(argv);
    return;
  }

  // ─── Review Batch Run Command ─────────────────────────────────────
  if (args.command === "review-batch-run") {
    const { runReviewBatchRun } = await import("./commands/review-batch-run.js");
    runReviewBatchRun(argv);
    return;
  }

  // ─── Review Output Filter Command ────────────────────────────────
  if (args.command === "review-output-filter") {
    const { runReviewOutputFilter } = await import("./commands/review-output-filter.js");
    runReviewOutputFilter(argv);
    return;
  }

  // ─── Finding Timeline View Command ───────────────────────────────
  if (args.command === "finding-timeline-view") {
    const { runFindingTimelineView } = await import("./commands/finding-timeline-view.js");
    runFindingTimelineView(argv);
    return;
  }

  // ─── Review Ignore Pattern Command ────────────────────────────────
  if (args.command === "review-ignore-pattern") {
    const { runReviewIgnorePattern } = await import("./commands/review-ignore-pattern.js");
    runReviewIgnorePattern(argv);
    return;
  }

  // ─── Finding Quality Gate Command ─────────────────────────────────
  if (args.command === "finding-quality-gate") {
    const { runFindingQualityGate } = await import("./commands/finding-quality-gate.js");
    runFindingQualityGate(argv);
    return;
  }

  // ─── Finding Reachability Command ─────────────────────────────────
  if (args.command === "finding-reachability") {
    const { runFindingReachability } = await import("./commands/finding-reachability.js");
    runFindingReachability(argv);
    return;
  }

  // ─── Review Merge Check Command ───────────────────────────────────
  if (args.command === "review-merge-check") {
    const { runReviewMergeCheck } = await import("./commands/review-merge-check.js");
    runReviewMergeCheck(argv);
    return;
  }

  // ─── Review Workspace Scan Command ────────────────────────────────
  if (args.command === "review-workspace-scan") {
    const { runReviewWorkspaceScan } = await import("./commands/review-workspace-scan.js");
    runReviewWorkspaceScan(argv);
    return;
  }

  // ─── Finding Context Window Command ───────────────────────────────
  if (args.command === "finding-context-window") {
    const { runFindingContextWindow } = await import("./commands/finding-context-window.js");
    runFindingContextWindow(argv);
    return;
  }

  // ─── Finding Severity Dist Command ────────────────────────────────
  if (args.command === "finding-severity-dist") {
    const { runFindingSeverityDist } = await import("./commands/finding-severity-dist.js");
    runFindingSeverityDist(argv);
    return;
  }

  // ─── Review Report Merge Command ──────────────────────────────────
  if (args.command === "review-report-merge") {
    const { runReviewReportMerge } = await import("./commands/review-report-merge.js");
    runReviewReportMerge(argv);
    return;
  }

  // ─── Review Plugin Config Command ─────────────────────────────────
  if (args.command === "review-plugin-config") {
    const { runReviewPluginConfig } = await import("./commands/review-plugin-config.js");
    runReviewPluginConfig(argv);
    return;
  }

  // ─── Finding Code Smell Command ───────────────────────────────────
  if (args.command === "finding-code-smell") {
    const { runFindingCodeSmell } = await import("./commands/finding-code-smell.js");
    runFindingCodeSmell(argv);
    return;
  }

  // ─── Finding Related Rules Command ────────────────────────────────
  if (args.command === "finding-related-rules") {
    const { runFindingRelatedRules } = await import("./commands/finding-related-rules.js");
    runFindingRelatedRules(argv);
    return;
  }

  // ─── Review Token Budget Command ──────────────────────────────────
  if (args.command === "review-token-budget") {
    const { runReviewTokenBudget } = await import("./commands/review-token-budget.js");
    runReviewTokenBudget(argv);
    return;
  }

  // ─── Review Plugin List Command ───────────────────────────────────
  if (args.command === "review-plugin-list") {
    const { runReviewPluginList } = await import("./commands/review-plugin-list.js");
    runReviewPluginList(argv);
    return;
  }

  // ─── Finding Owner Assign Command ─────────────────────────────────
  if (args.command === "finding-owner-assign") {
    const { runFindingOwnerAssign } = await import("./commands/finding-owner-assign.js");
    runFindingOwnerAssign(argv);
    return;
  }

  // ─── Review Lock File Command ─────────────────────────────────────
  if (args.command === "review-lock-file") {
    const { runReviewLockFile } = await import("./commands/review-lock-file.js");
    runReviewLockFile(argv);
    return;
  }

  // ─── Finding Pattern Library Command ──────────────────────────────
  if (args.command === "finding-pattern-library") {
    const { runFindingPatternLibrary } = await import("./commands/finding-pattern-library.js");
    runFindingPatternLibrary(argv);
    return;
  }

  // ─── Review Status Badge Command ──────────────────────────────────
  if (args.command === "review-status-badge") {
    const { runReviewStatusBadge } = await import("./commands/review-status-badge.js");
    runReviewStatusBadge(argv);
    return;
  }

  // ─── Finding Rule Explain Command ─────────────────────────────────
  if (args.command === "finding-rule-explain") {
    const { runFindingRuleExplain } = await import("./commands/finding-rule-explain.js");
    runFindingRuleExplain(argv);
    return;
  }

  // ─── Finding Dependency Tree Command ──────────────────────────────
  if (args.command === "finding-dependency-tree") {
    const { runFindingDependencyTree } = await import("./commands/finding-dependency-tree.js");
    runFindingDependencyTree(argv);
    return;
  }

  // ─── Review CI Integration Command ────────────────────────────────
  if (args.command === "review-ci-integration") {
    const { runReviewCiIntegration } = await import("./commands/review-ci-integration.js");
    runReviewCiIntegration(argv);
    return;
  }

  // ─── Review Comparative Command ───────────────────────────────────
  if (args.command === "review-comparative") {
    const { runReviewComparative } = await import("./commands/review-comparative.js");
    runReviewComparative(argv);
    return;
  }

  // ─── Finding Suppression Audit Command ────────────────────────────
  if (args.command === "finding-suppression-audit") {
    const { runFindingSuppressionAudit } = await import("./commands/finding-suppression-audit.js");
    runFindingSuppressionAudit(argv);
    return;
  }

  // ─── Review Custom Rule Command ───────────────────────────────────
  if (args.command === "review-custom-rule") {
    const { runReviewCustomRule } = await import("./commands/review-custom-rule.js");
    runReviewCustomRule(argv);
    return;
  }

  // ─── Review Notification Command ──────────────────────────────────
  if (args.command === "review-notification") {
    const { runReviewNotification } = await import("./commands/review-notification.js");
    runReviewNotification(argv);
    return;
  }

  // ─── Finding Age Analysis Command ─────────────────────────────────
  if (args.command === "finding-age-analysis") {
    const { runFindingAgeAnalysis } = await import("./commands/finding-age-analysis.js");
    runFindingAgeAnalysis(argv);
    return;
  }

  // ─── Review Template Export Command ───────────────────────────────
  if (args.command === "review-template-export") {
    const { runReviewTemplateExport } = await import("./commands/review-template-export.js");
    runReviewTemplateExport(argv);
    return;
  }

  // ─── Finding Correlation Command ──────────────────────────────────
  if (args.command === "finding-correlation") {
    const { runFindingCorrelation } = await import("./commands/finding-correlation.js");
    runFindingCorrelation(argv);
    return;
  }

  // ─── Review Scope Limit Command ───────────────────────────────────
  if (args.command === "review-scope-limit") {
    const { runReviewScopeLimit } = await import("./commands/review-scope-limit.js");
    runReviewScopeLimit(argv);
    return;
  }

  // ─── Finding Regression Check Command ─────────────────────────────
  if (args.command === "finding-regression-check") {
    const { runFindingRegressionCheck } = await import("./commands/finding-regression-check.js");
    runFindingRegressionCheck(argv);
    return;
  }

  // ─── Finding Fix Validation Command ───────────────────────────────
  if (args.command === "finding-fix-validation") {
    const { runFindingFixValidation } = await import("./commands/finding-fix-validation.js");
    runFindingFixValidation(argv);
    return;
  }

  // ─── Review Dashboard Data Command ────────────────────────────────
  if (args.command === "review-dashboard-data") {
    const { runReviewDashboardData } = await import("./commands/review-dashboard-data.js");
    runReviewDashboardData(argv);
    return;
  }

  // ─── Finding Category Map Command ────────────────────────────────
  if (args.command === "finding-category-map") {
    const { runFindingCategoryMap } = await import("./commands/finding-category-map.js");
    runFindingCategoryMap(argv);
    return;
  }

  // ─── Finding Dedup Report Command ─────────────────────────────────
  if (args.command === "finding-dedup-report") {
    const { runFindingDedupReport } = await import("./commands/finding-dedup-report.js");
    runFindingDedupReport(argv);
    return;
  }

  // ─── Review Perf Profile Command ──────────────────────────────────
  if (args.command === "review-perf-profile") {
    const { runReviewPerfProfile } = await import("./commands/review-perf-profile.js");
    runReviewPerfProfile(argv);
    return;
  }

  // ─── Finding False Positive Log Command ───────────────────────────
  if (args.command === "finding-false-positive-log") {
    const { runFindingFalsePositiveLog } = await import("./commands/finding-false-positive-log.js");
    runFindingFalsePositiveLog(argv);
    return;
  }

  // ─── Review Guardrail Command ─────────────────────────────────────
  if (args.command === "review-guardrail") {
    const { runReviewGuardrail } = await import("./commands/review-guardrail.js");
    runReviewGuardrail(argv);
    return;
  }

  // ─── Review Batch Mode Command ────────────────────────────────────
  if (args.command === "review-batch-mode") {
    const { runReviewBatchMode } = await import("./commands/review-batch-mode.js");
    runReviewBatchMode(argv);
    return;
  }

  // ─── Finding Trend Analysis Command ──────────────────────────────
  if (args.command === "finding-trend-analysis") {
    const { runFindingTrendAnalysis } = await import("./commands/finding-trend-analysis.js");
    runFindingTrendAnalysis(argv);
    return;
  }

  // ─── Finding Auto Tag Command ─────────────────────────────────────
  if (args.command === "finding-auto-tag") {
    const { runFindingAutoTag } = await import("./commands/finding-auto-tag.js");
    runFindingAutoTag(argv);
    return;
  }

  // ─── Review Webhook Notify Command ────────────────────────────────
  if (args.command === "review-webhook-notify") {
    const { runReviewWebhookNotify } = await import("./commands/review-webhook-notify.js");
    runReviewWebhookNotify(argv);
    return;
  }

  // ─── Finding Evidence Collect Command ─────────────────────────────
  if (args.command === "finding-evidence-collect") {
    const { runFindingEvidenceCollect } = await import("./commands/finding-evidence-collect.js");
    runFindingEvidenceCollect(argv);
    return;
  }

  // ─── Review Compliance Gate Command ───────────────────────────────
  if (args.command === "review-compliance-gate") {
    const { runReviewComplianceGate } = await import("./commands/review-compliance-gate.js");
    runReviewComplianceGate(argv);
    return;
  }

  // ─── Finding Resolution Tracker Command ───────────────────────────
  if (args.command === "finding-resolution-tracker") {
    const { runFindingResolutionTracker } = await import("./commands/finding-resolution-tracker.js");
    runFindingResolutionTracker(argv);
    return;
  }

  // ─── Review Threshold Tune Command ────────────────────────────────
  if (args.command === "review-threshold-tune") {
    const { runReviewThresholdTune } = await import("./commands/review-threshold-tune.js");
    runReviewThresholdTune(argv);
    return;
  }

  // ─── Finding Cluster Group Command ────────────────────────────────
  if (args.command === "finding-cluster-group") {
    const { runFindingClusterGroup } = await import("./commands/finding-cluster-group.js");
    runFindingClusterGroup(argv);
    return;
  }

  // ─── Review Merge Config Command ──────────────────────────────────
  if (args.command === "review-merge-config") {
    const { runReviewMergeConfig } = await import("./commands/review-merge-config.js");
    runReviewMergeConfig(argv);
    return;
  }

  // ─── Finding Hotspot Map Command ──────────────────────────────────
  if (args.command === "finding-hotspot-map") {
    const { runFindingHotspotMap } = await import("./commands/finding-hotspot-map.js");
    runFindingHotspotMap(argv);
    return;
  }

  // ─── Review Parallel Run Command ──────────────────────────────────
  if (args.command === "review-parallel-run") {
    const { runReviewParallelRun } = await import("./commands/review-parallel-run.js");
    runReviewParallelRun(argv);
    return;
  }

  // ─── Review Annotation Export Command ─────────────────────────────
  if (args.command === "review-annotation-export") {
    const { runReviewAnnotationExport } = await import("./commands/review-annotation-export.js");
    runReviewAnnotationExport(argv);
    return;
  }

  // ─── Finding Blast Radius Command ─────────────────────────────────
  if (args.command === "finding-blast-radius") {
    const { runFindingBlastRadius } = await import("./commands/finding-blast-radius.js");
    runFindingBlastRadius(argv);
    return;
  }

  // ─── Review Quality Score Command ─────────────────────────────────
  if (args.command === "review-quality-score") {
    const { runReviewQualityScore } = await import("./commands/review-quality-score.js");
    runReviewQualityScore(argv);
    return;
  }

  // ─── Review Onboard Wizard Command ────────────────────────────────
  if (args.command === "review-onboard-wizard") {
    const { runReviewOnboardWizard } = await import("./commands/review-onboard-wizard.js");
    runReviewOnboardWizard(argv);
    return;
  }

  // ─── Review Cache Warm Command ────────────────────────────────────
  if (args.command === "review-cache-warm") {
    const { runReviewCacheWarm } = await import("./commands/review-cache-warm.js");
    runReviewCacheWarm(argv);
    return;
  }

  // ─── Finding Metadata Enrich Command ──────────────────────────────
  if (args.command === "finding-metadata-enrich") {
    const { runFindingMetadataEnrich } = await import("./commands/finding-metadata-enrich.js");
    runFindingMetadataEnrich(argv);
    return;
  }

  // ─── Finding Auto Group Command ──────────────────────────────────
  if (args.command === "finding-auto-group") {
    const { runFindingAutoGroup } = await import("./commands/finding-auto-group.js");
    runFindingAutoGroup(argv);
    return;
  }

  // ─── Finding Suppression List Command ─────────────────────────────
  if (args.command === "finding-suppression-list") {
    const { runFindingSuppressionList } = await import("./commands/finding-suppression-list.js");
    runFindingSuppressionList(argv);
    return;
  }

  // ─── Review Plugin Status Command ─────────────────────────────────
  if (args.command === "review-plugin-status") {
    const { runReviewPluginStatus } = await import("./commands/review-plugin-status.js");
    runReviewPluginStatus(argv);
    return;
  }

  // ─── Finding Cross Ref Command ────────────────────────────────────
  if (args.command === "finding-cross-ref") {
    const { runFindingCrossRef } = await import("./commands/finding-cross-ref.js");
    runFindingCrossRef(argv);
    return;
  }

  // ─── Review CI Gate Command ───────────────────────────────────────
  if (args.command === "review-ci-gate") {
    const { runReviewCiGate } = await import("./commands/review-ci-gate.js");
    runReviewCiGate(argv);
    return;
  }

  // ─── Review Team Stats Command ────────────────────────────────────
  if (args.command === "review-team-stats") {
    const { runReviewTeamStats } = await import("./commands/review-team-stats.js");
    runReviewTeamStats(argv);
    return;
  }

  // ─── Finding Pattern Detect Command ───────────────────────────────
  if (args.command === "finding-pattern-detect") {
    const { runFindingPatternDetect } = await import("./commands/finding-pattern-detect.js");
    runFindingPatternDetect(argv);
    return;
  }

  // ─── Review Coverage Gap Command ──────────────────────────────────
  if (args.command === "review-coverage-gap") {
    const { runReviewCoverageGap } = await import("./commands/review-coverage-gap.js");
    runReviewCoverageGap(argv);
    return;
  }

  // ─── Review Feedback Loop Command ─────────────────────────────────
  if (args.command === "review-feedback-loop") {
    const { runReviewFeedbackLoop } = await import("./commands/review-feedback-loop.js");
    runReviewFeedbackLoop(argv);
    return;
  }

  // ─── Review Slack Format Command ──────────────────────────────────
  if (args.command === "review-slack-format") {
    const { runReviewSlackFormat } = await import("./commands/review-slack-format.js");
    runReviewSlackFormat(argv);
    return;
  }

  // ─── Review Config Template Command ───────────────────────────────
  if (args.command === "review-config-template") {
    const { runReviewConfigTemplate } = await import("./commands/review-config-template.js");
    runReviewConfigTemplate(argv);
    return;
  }

  // ─── Finding Fix Suggest Command ──────────────────────────────────
  if (args.command === "finding-fix-suggest") {
    const { runFindingFixSuggest } = await import("./commands/finding-fix-suggest.js");
    runFindingFixSuggest(argv);
    return;
  }

  // ─── Review Progress Track Command ────────────────────────────────
  if (args.command === "review-progress-track") {
    const { runReviewProgressTrack } = await import("./commands/review-progress-track.js");
    runReviewProgressTrack(argv);
    return;
  }

  // ─── Finding Ownership Map Command ────────────────────────────────
  if (args.command === "finding-ownership-map") {
    const { runFindingOwnershipMap } = await import("./commands/finding-ownership-map.js");
    runFindingOwnershipMap(argv);
    return;
  }

  // ─── Review Report Schedule Command ───────────────────────────────
  if (args.command === "review-report-schedule") {
    const { runReviewReportSchedule } = await import("./commands/review-report-schedule.js");
    runReviewReportSchedule(argv);
    return;
  }

  // ─── Finding Link Graph Command ───────────────────────────────────
  if (args.command === "finding-link-graph") {
    const { runFindingLinkGraph } = await import("./commands/finding-link-graph.js");
    runFindingLinkGraph(argv);
    return;
  }

  // ─── Review Audit Trail Command ───────────────────────────────────
  if (args.command === "review-audit-trail") {
    const { runReviewAuditTrail } = await import("./commands/review-audit-trail.js");
    runReviewAuditTrail(argv);
    return;
  }

  // ─── Review Compliance Report Command ─────────────────────────────
  if (args.command === "review-compliance-report") {
    const { runReviewComplianceReport } = await import("./commands/review-compliance-report.js");
    runReviewComplianceReport(argv);
    return;
  }

  // ─── Review Quickstart Command ────────────────────────────────────
  if (args.command === "review-quickstart") {
    const { runReviewQuickstart } = await import("./commands/review-quickstart.js");
    runReviewQuickstart(argv);
    return;
  }

  // ─── Review Interactive Command ───────────────────────────────────
  if (args.command === "review-interactive") {
    const { runReviewInteractive } = await import("./commands/review-interactive.js");
    runReviewInteractive(argv);
    return;
  }

  // ─── Finding Explain Command ──────────────────────────────────────
  if (args.command === "finding-explain") {
    const { runFindingExplain } = await import("./commands/finding-explain.js");
    runFindingExplain(argv);
    return;
  }

  // ─── Review IDE Sync Command ──────────────────────────────────────
  if (args.command === "review-ide-sync") {
    const { runReviewIdeSync } = await import("./commands/review-ide-sync.js");
    runReviewIdeSync(argv);
    return;
  }

  // ─── Finding Filter View Command ──────────────────────────────────
  if (args.command === "finding-filter-view") {
    const { runFindingFilterView } = await import("./commands/finding-filter-view.js");
    runFindingFilterView(argv);
    return;
  }

  // ─── Review Tenant Config Command ─────────────────────────────────
  if (args.command === "review-tenant-config") {
    const { runReviewTenantConfig } = await import("./commands/review-tenant-config.js");
    runReviewTenantConfig(argv);
    return;
  }

  // ─── Finding Code Context Command ─────────────────────────────────
  if (args.command === "finding-code-context") {
    const { runFindingCodeContext } = await import("./commands/finding-code-context.js");
    runFindingCodeContext(argv);
    return;
  }

  // ─── Finding Resolution Track Command ─────────────────────────────
  if (args.command === "finding-resolution-track") {
    const { runFindingResolutionTrack } = await import("./commands/finding-resolution-track.js");
    runFindingResolutionTrack(argv);
    return;
  }

  // ─── Review Onboard Checklist Command ─────────────────────────────
  if (args.command === "review-onboard-checklist") {
    const { runReviewOnboardChecklist } = await import("./commands/review-onboard-checklist.js");
    runReviewOnboardChecklist(argv);
    return;
  }

  // ─── Review Summary Dashboard Command ─────────────────────────────
  if (args.command === "review-summary-dashboard") {
    const { runReviewSummaryDashboard } = await import("./commands/review-summary-dashboard.js");
    runReviewSummaryDashboard(argv);
    return;
  }

  // ─── Review Merge Request Command ─────────────────────────────────
  if (args.command === "review-merge-request") {
    const { runReviewMergeRequest } = await import("./commands/review-merge-request.js");
    runReviewMergeRequest(argv);
    return;
  }

  // ─── Finding Groupby File Command ─────────────────────────────────
  if (args.command === "finding-groupby-file") {
    const { runFindingGroupbyFile } = await import("./commands/finding-groupby-file.js");
    runFindingGroupbyFile(argv);
    return;
  }

  // ─── Finding Dedup Cross Command ──────────────────────────────────
  if (args.command === "finding-dedup-cross") {
    const { runFindingDedupCross } = await import("./commands/finding-dedup-cross.js");
    runFindingDedupCross(argv);
    return;
  }

  // ─── Review Scope Select Command ──────────────────────────────────
  if (args.command === "review-scope-select") {
    const { runReviewScopeSelect } = await import("./commands/review-scope-select.js");
    runReviewScopeSelect(argv);
    return;
  }

  // ─── Review API Export Command ────────────────────────────────────
  if (args.command === "review-api-export") {
    const { runReviewApiExport } = await import("./commands/review-api-export.js");
    runReviewApiExport(argv);
    return;
  }

  // ─── Finding Correlation Map Command ──────────────────────────────
  if (args.command === "finding-correlation-map") {
    const { runFindingCorrelationMap } = await import("./commands/finding-correlation-map.js");
    runFindingCorrelationMap(argv);
    return;
  }

  // ─── Review Template Library Command ──────────────────────────────
  if (args.command === "review-template-library") {
    const { runReviewTemplateLibrary } = await import("./commands/review-template-library.js");
    runReviewTemplateLibrary(argv);
    return;
  }

  // ─── Review Notification Config Command ───────────────────────────
  if (args.command === "review-notification-config") {
    const { runReviewNotificationConfig } = await import("./commands/review-notification-config.js");
    runReviewNotificationConfig(argv);
    return;
  }

  // ─── Review Bulk Apply Command ────────────────────────────────────
  if (args.command === "review-bulk-apply") {
    const { runReviewBulkApply } = await import("./commands/review-bulk-apply.js");
    runReviewBulkApply(argv);
    return;
  }

  // ─── Finding Severity Heatmap Command ─────────────────────────────
  if (args.command === "finding-severity-heatmap") {
    const { runFindingSeverityHeatmap } = await import("./commands/finding-severity-heatmap.js");
    runFindingSeverityHeatmap(argv);
    return;
  }

  // ─── Review Config Migrate Command ────────────────────────────────
  if (args.command === "review-config-migrate") {
    const { runReviewConfigMigrate } = await import("./commands/review-config-migrate.js");
    runReviewConfigMigrate(argv);
    return;
  }

  // ─── Review History Compare Command ───────────────────────────────
  if (args.command === "review-history-compare") {
    const { runReviewHistoryCompare } = await import("./commands/review-history-compare.js");
    runReviewHistoryCompare(argv);
    return;
  }

  // ─── Review Team Dashboard Command ────────────────────────────────
  if (args.command === "review-team-dashboard") {
    const { runReviewTeamDashboard } = await import("./commands/review-team-dashboard.js");
    runReviewTeamDashboard(argv);
    return;
  }

  // ─── Finding Confidence Calibrate Command ─────────────────────────
  if (args.command === "finding-confidence-calibrate") {
    const { runFindingConfidenceCalibrate } = await import("./commands/finding-confidence-calibrate.js");
    runFindingConfidenceCalibrate(argv);
    return;
  }

  // ─── Review Output Transform Command ──────────────────────────────
  if (args.command === "review-output-transform") {
    const { runReviewOutputTransform } = await import("./commands/review-output-transform.js");
    runReviewOutputTransform(argv);
    return;
  }

  // ─── Review Adoption Metrics Command ──────────────────────────────
  if (args.command === "review-adoption-metrics") {
    const { runReviewAdoptionMetrics } = await import("./commands/review-adoption-metrics.js");
    runReviewAdoptionMetrics(argv);
    return;
  }

  // ─── Review Workspace Init Command ────────────────────────────────
  if (args.command === "review-workspace-init") {
    const { runReviewWorkspaceInit } = await import("./commands/review-workspace-init.js");
    runReviewWorkspaceInit(argv);
    return;
  }

  // ─── Review Policy Engine Command ────────────────────────────────
  if (args.command === "review-policy-engine") {
    const { runReviewPolicyEngine } = await import("./commands/review-policy-engine.js");
    runReviewPolicyEngine(argv);
    return;
  }

  // ─── Review Webhook Dispatch Command ─────────────────────────────
  if (args.command === "review-webhook-dispatch") {
    const { runReviewWebhookDispatch } = await import("./commands/review-webhook-dispatch.js");
    runReviewWebhookDispatch(argv);
    return;
  }

  // ─── Finding Risk Score Command ──────────────────────────────────
  if (args.command === "finding-risk-score") {
    const { runFindingRiskScore } = await import("./commands/finding-risk-score.js");
    runFindingRiskScore(argv);
    return;
  }

  // ─── Review Compliance Map Command ───────────────────────────────
  if (args.command === "review-compliance-map") {
    const { runReviewComplianceMap } = await import("./commands/review-compliance-map.js");
    runReviewComplianceMap(argv);
    return;
  }

  // ─── Finding Trend Forecast Command ──────────────────────────────
  if (args.command === "finding-trend-forecast") {
    const { runFindingTrendForecast } = await import("./commands/finding-trend-forecast.js");
    runFindingTrendForecast(argv);
    return;
  }

  // ─── Finding Impact Rank Command ─────────────────────────────────
  if (args.command === "finding-impact-rank") {
    const { runFindingImpactRank } = await import("./commands/finding-impact-rank.js");
    runFindingImpactRank(argv);
    return;
  }

  // ─── Review Rollout Plan Command ─────────────────────────────────
  if (args.command === "review-rollout-plan") {
    const { runReviewRolloutPlan } = await import("./commands/review-rollout-plan.js");
    runReviewRolloutPlan(argv);
    return;
  }

  // ─── Finding Annotation Layer Command ────────────────────────────
  if (args.command === "finding-annotation-layer") {
    const { runFindingAnnotationLayer } = await import("./commands/finding-annotation-layer.js");
    runFindingAnnotationLayer(argv);
    return;
  }

  // ─── Review Gate Config Command ──────────────────────────────────
  if (args.command === "review-gate-config") {
    const { runReviewGateConfig } = await import("./commands/review-gate-config.js");
    runReviewGateConfig(argv);
    return;
  }

  // ─── Review Language Profile Command ─────────────────────────────
  if (args.command === "review-language-profile") {
    const { runReviewLanguageProfile } = await import("./commands/review-language-profile.js");
    runReviewLanguageProfile(argv);
    return;
  }

  // ─── Finding CWE Lookup Command ─────────────────────────────────
  if (args.command === "finding-cwe-lookup") {
    const { runFindingCweLookup } = await import("./commands/finding-cwe-lookup.js");
    runFindingCweLookup(argv);
    return;
  }

  // ─── Review CICD Integrate Command ──────────────────────────────
  if (args.command === "review-cicd-integrate") {
    const { runReviewCicdIntegrate } = await import("./commands/review-cicd-integrate.js");
    runReviewCicdIntegrate(argv);
    return;
  }

  // ─── Finding Patch Preview Command ──────────────────────────────
  if (args.command === "finding-patch-preview") {
    const { runFindingPatchPreview } = await import("./commands/finding-patch-preview.js");
    runFindingPatchPreview(argv);
    return;
  }

  // ─── Review Org Dashboard Command ───────────────────────────────
  if (args.command === "review-org-dashboard") {
    const { runReviewOrgDashboard } = await import("./commands/review-org-dashboard.js");
    runReviewOrgDashboard(argv);
    return;
  }

  // ─── Finding Duplicate Detect Command ───────────────────────────
  if (args.command === "finding-duplicate-detect") {
    const { runFindingDuplicateDetect } = await import("./commands/finding-duplicate-detect.js");
    runFindingDuplicateDetect(argv);
    return;
  }

  // ─── Finding Priority Matrix Command ────────────────────────────
  if (args.command === "finding-priority-matrix") {
    const { runFindingPriorityMatrix } = await import("./commands/finding-priority-matrix.js");
    runFindingPriorityMatrix(argv);
    return;
  }

  // ─── Review SLA Config Command ──────────────────────────────────
  if (args.command === "review-sla-config") {
    const { runReviewSlaConfig } = await import("./commands/review-sla-config.js");
    runReviewSlaConfig(argv);
    return;
  }

  // ─── Review Report Archive Command ──────────────────────────────
  if (args.command === "review-report-archive") {
    const { runReviewReportArchive } = await import("./commands/review-report-archive.js");
    runReviewReportArchive(argv);
    return;
  }

  // ─── Finding Auto Suppress Command ─────────────────────────────────
  if (args.command === "finding-auto-suppress") {
    const { runFindingAutoSuppress } = await import("./commands/finding-auto-suppress.js");
    runFindingAutoSuppress(argv);
    return;
  }

  // ─── Review Review Comments Command ─────────────────────────────────
  if (args.command === "review-review-comments") {
    const { runReviewReviewComments } = await import("./commands/review-review-comments.js");
    runReviewReviewComments(argv);
    return;
  }

  // ─── Review Permission Model Command ─────────────────────────────────
  if (args.command === "review-permission-model") {
    const { runReviewPermissionModel } = await import("./commands/review-permission-model.js");
    runReviewPermissionModel(argv);
    return;
  }

  // ─── Review Repo Onboard Command ─────────────────────────────────
  if (args.command === "review-repo-onboard") {
    const { runReviewRepoOnboard } = await import("./commands/review-repo-onboard.js");
    runReviewRepoOnboard(argv);
    return;
  }

  // ─── Finding Dismiss Workflow Command ─────────────────────────────────
  if (args.command === "finding-dismiss-workflow") {
    const { runFindingDismissWorkflow } = await import("./commands/finding-dismiss-workflow.js");
    runFindingDismissWorkflow(argv);
    return;
  }

  // ─── Review Data Retention Command ─────────────────────────────────
  if (args.command === "review-data-retention") {
    const { runReviewDataRetention } = await import("./commands/review-data-retention.js");
    runReviewDataRetention(argv);
    return;
  }

  // ─── Finding Reachability Check Command ─────────────────────────────────
  if (args.command === "finding-reachability-check") {
    const { runFindingReachabilityCheck } = await import("./commands/finding-reachability-check.js");
    runFindingReachabilityCheck(argv);
    return;
  }

  // ─── Review Audit Export Command ─────────────────────────────────
  if (args.command === "review-audit-export") {
    const { runReviewAuditExport } = await import("./commands/review-audit-export.js");
    runReviewAuditExport(argv);
    return;
  }

  // ─── Review Pipeline Status Command ─────────────────────────────────
  if (args.command === "review-pipeline-status") {
    const { runReviewPipelineStatus } = await import("./commands/review-pipeline-status.js");
    runReviewPipelineStatus(argv);
    return;
  }

  // ─── Finding Auto Triage Command ────────────────────────────────────
  if (args.command === "finding-auto-triage") {
    const { runFindingAutoTriage } = await import("./commands/finding-auto-triage.js");
    runFindingAutoTriage(argv);
    return;
  }

  // ─── Review Stakeholder Report Command ──────────────────────────────
  if (args.command === "review-stakeholder-report") {
    const { runReviewStakeholderReport } = await import("./commands/review-stakeholder-report.js");
    runReviewStakeholderReport(argv);
    return;
  }

  // ─── Finding Change Impact Command ──────────────────────────────────
  if (args.command === "finding-change-impact") {
    const { runFindingChangeImpact } = await import("./commands/finding-change-impact.js");
    runFindingChangeImpact(argv);
    return;
  }

  // ─── Review Deployment Gate Command ─────────────────────────────────
  if (args.command === "review-deployment-gate") {
    const { runReviewDeploymentGate } = await import("./commands/review-deployment-gate.js");
    runReviewDeploymentGate(argv);
    return;
  }

  // ─── Review Environment Config Command ──────────────────────────────
  if (args.command === "review-environment-config") {
    const { runReviewEnvironmentConfig } = await import("./commands/review-environment-config.js");
    runReviewEnvironmentConfig(argv);
    return;
  }

  // ─── Finding False Positive Learn Command ───────────────────────────
  if (args.command === "finding-false-positive-learn") {
    const { runFindingFalsePositiveLearn } = await import("./commands/finding-false-positive-learn.js");
    runFindingFalsePositiveLearn(argv);
    return;
  }

  // ─── Review Multi Repo Sync Command ─────────────────────────────────
  if (args.command === "review-multi-repo-sync") {
    const { runReviewMultiRepoSync } = await import("./commands/review-multi-repo-sync.js");
    runReviewMultiRepoSync(argv);
    return;
  }

  // ─── Review Session Replay Command ──────────────────────────────────
  if (args.command === "review-session-replay") {
    const { runReviewSessionReplay } = await import("./commands/review-session-replay.js");
    runReviewSessionReplay(argv);
    return;
  }

  // ─── Finding Context Enrich Command ─────────────────────────────────
  if (args.command === "finding-context-enrich") {
    const { runFindingContextEnrich } = await import("./commands/finding-context-enrich.js");
    runFindingContextEnrich(argv);
    return;
  }

  // ─── Review Custom Judge Config Command ─────────────────────────────
  if (args.command === "review-custom-judge-config") {
    const { runReviewCustomJudgeConfig } = await import("./commands/review-custom-judge-config.js");
    runReviewCustomJudgeConfig(argv);
    return;
  }

  // ─── Review Branch Policy Command ───────────────────────────────────
  if (args.command === "review-branch-policy") {
    const { runReviewBranchPolicy } = await import("./commands/review-branch-policy.js");
    runReviewBranchPolicy(argv);
    return;
  }

  // ─── Finding Recurrence Detect Command ──────────────────────────────
  if (args.command === "finding-recurrence-detect") {
    const { runFindingRecurrenceDetect } = await import("./commands/finding-recurrence-detect.js");
    runFindingRecurrenceDetect(argv);
    return;
  }

  // ─── Review Integration Health Command ──────────────────────────────
  if (args.command === "review-integration-health") {
    const { runReviewIntegrationHealth } = await import("./commands/review-integration-health.js");
    runReviewIntegrationHealth(argv);
    return;
  }

  // ─── Review Metric Export Command ───────────────────────────────────
  if (args.command === "review-metric-export") {
    const { runReviewMetricExport } = await import("./commands/review-metric-export.js");
    runReviewMetricExport(argv);
    return;
  }

  // ─── Finding Ownership Assign Command ───────────────────────────────
  if (args.command === "finding-ownership-assign") {
    const { runFindingOwnershipAssign } = await import("./commands/finding-ownership-assign.js");
    runFindingOwnershipAssign(argv);
    return;
  }

  // ─── Review Notification Digest Command ─────────────────────────────
  if (args.command === "review-notification-digest") {
    const { runReviewNotificationDigest } = await import("./commands/review-notification-digest.js");
    runReviewNotificationDigest(argv);
    return;
  }

  // ─── Review Access Log Command ─────────────────────────────────────
  if (args.command === "review-access-log") {
    const { runReviewAccessLog } = await import("./commands/review-access-log.js");
    runReviewAccessLog(argv);
    return;
  }

  // ─── Review Tag Manager Command ────────────────────────────────────
  if (args.command === "review-tag-manager") {
    const { runReviewTagManager } = await import("./commands/review-tag-manager.js");
    runReviewTagManager(argv);
    return;
  }

  // ─── Review Quality Trend Command ───────────────────────────────────
  if (args.command === "review-quality-trend") {
    const { runReviewQualityTrend } = await import("./commands/review-quality-trend.js");
    runReviewQualityTrend(argv);
    return;
  }

  // ─── Finding Batch Suppress Command ─────────────────────────────────
  if (args.command === "finding-batch-suppress") {
    const { runFindingBatchSuppress } = await import("./commands/finding-batch-suppress.js");
    runFindingBatchSuppress(argv);
    return;
  }

  // ─── Finding Severity Drift Command ─────────────────────────────────
  if (args.command === "finding-severity-drift") {
    const { runFindingSeverityDrift } = await import("./commands/finding-severity-drift.js");
    runFindingSeverityDrift(argv);
    return;
  }

  // ─── Review PR Comment Gen Command ──────────────────────────────────
  if (args.command === "review-pr-comment-gen") {
    const { runReviewPrCommentGen } = await import("./commands/review-pr-comment-gen.js");
    runReviewPrCommentGen(argv);
    return;
  }

  // ─── Finding Dependency Link Command ────────────────────────────────
  if (args.command === "finding-dependency-link") {
    const { runFindingDependencyLink } = await import("./commands/finding-dependency-link.js");
    runFindingDependencyLink(argv);
    return;
  }

  // ─── Review Role Assignment Command ─────────────────────────────────
  if (args.command === "review-role-assignment") {
    const { runReviewRoleAssignment } = await import("./commands/review-role-assignment.js");
    runReviewRoleAssignment(argv);
    return;
  }

  // ─── Review Archive Search Command ──────────────────────────────────
  if (args.command === "review-archive-search") {
    const { runReviewArchiveSearch } = await import("./commands/review-archive-search.js");
    runReviewArchiveSearch(argv);
    return;
  }

  // ─── Review Incident Link Command ───────────────────────────────────
  if (args.command === "review-incident-link") {
    const { runReviewIncidentLink } = await import("./commands/review-incident-link.js");
    runReviewIncidentLink(argv);
    return;
  }

  // ─── Finding Search Index Command ───────────────────────────────────
  if (args.command === "finding-search-index") {
    const { runFindingSearchIndex } = await import("./commands/finding-search-index.js");
    runFindingSearchIndex(argv);
    return;
  }

  // ─── Review Confidence Explain Command ────────────────────────────
  if (args.command === "review-confidence-explain") {
    const { runReviewConfidenceExplain } = await import("./commands/review-confidence-explain.js");
    runReviewConfidenceExplain(argv);
    return;
  }

  // ─── Finding Merge Strategy Command ───────────────────────────────
  if (args.command === "finding-merge-strategy") {
    const { runFindingMergeStrategy } = await import("./commands/finding-merge-strategy.js");
    runFindingMergeStrategy(argv);
    return;
  }

  // ─── Review Scope Suggest Command ─────────────────────────────────
  if (args.command === "review-scope-suggest") {
    const { runReviewScopeSuggest } = await import("./commands/review-scope-suggest.js");
    runReviewScopeSuggest(argv);
    return;
  }

  // ─── Review AI Feedback Loop Command ──────────────────────────────
  if (args.command === "review-ai-feedback-loop") {
    const { runReviewAiFeedbackLoop } = await import("./commands/review-ai-feedback-loop.js");
    runReviewAiFeedbackLoop(argv);
    return;
  }

  // ─── Finding Trend Alert Command ──────────────────────────────────
  if (args.command === "finding-trend-alert") {
    const { runFindingTrendAlert } = await import("./commands/finding-trend-alert.js");
    runFindingTrendAlert(argv);
    return;
  }

  // ─── Review Workload Balance Command ──────────────────────────────
  if (args.command === "review-workload-balance") {
    const { runReviewWorkloadBalance } = await import("./commands/review-workload-balance.js");
    runReviewWorkloadBalance(argv);
    return;
  }

  // ─── Finding Dedup Smart Command ──────────────────────────────────
  if (args.command === "finding-dedup-smart") {
    const { runFindingDedupSmart } = await import("./commands/finding-dedup-smart.js");
    runFindingDedupSmart(argv);
    return;
  }

  // ─── Finding Annotation Export Command ────────────────────────────
  if (args.command === "finding-annotation-export") {
    const { runFindingAnnotationExport } = await import("./commands/finding-annotation-export.js");
    runFindingAnnotationExport(argv);
    return;
  }

  // ─── Review CI Insight Command ────────────────────────────────────
  if (args.command === "review-ci-insight") {
    const { runReviewCiInsight } = await import("./commands/review-ci-insight.js");
    runReviewCiInsight(argv);
    return;
  }

  // ─── Review Template Suggest Command ──────────────────────────────
  if (args.command === "review-template-suggest") {
    const { runReviewTemplateSuggest } = await import("./commands/review-template-suggest.js");
    runReviewTemplateSuggest(argv);
    return;
  }

  // ─── Finding Hotspot Detect Command ───────────────────────────────
  if (args.command === "finding-hotspot-detect") {
    const { runFindingHotspotDetect } = await import("./commands/finding-hotspot-detect.js");
    runFindingHotspotDetect(argv);
    return;
  }

  // ─── Review Code Health Score Command ─────────────────────────────
  if (args.command === "review-code-health-score") {
    const { runReviewCodeHealthScore } = await import("./commands/review-code-health-score.js");
    runReviewCodeHealthScore(argv);
    return;
  }

  // ─── Review Velocity Track Command ────────────────────────────────
  if (args.command === "review-velocity-track") {
    const { runReviewVelocityTrack } = await import("./commands/review-velocity-track.js");
    runReviewVelocityTrack(argv);
    return;
  }

  // ─── Finding Cross File Link Command ───────────────────────────────
  if (args.command === "finding-cross-file-link") {
    const { runFindingCrossFileLink } = await import("./commands/finding-cross-file-link.js");
    runFindingCrossFileLink(argv);
    return;
  }

  // ─── Review PR Size Check Command ─────────────────────────────────
  if (args.command === "review-pr-size-check") {
    const { runReviewPrSizeCheck } = await import("./commands/review-pr-size-check.js");
    runReviewPrSizeCheck(argv);
    return;
  }

  // ─── Review Focus Area Command ────────────────────────────────────
  if (args.command === "review-focus-area") {
    const { runReviewFocusArea } = await import("./commands/review-focus-area.js");
    runReviewFocusArea(argv);
    return;
  }

  // ─── Review Team Analytics Command ────────────────────────────────
  if (args.command === "review-team-analytics") {
    const { runReviewTeamAnalytics } = await import("./commands/review-team-analytics.js");
    runReviewTeamAnalytics(argv);
    return;
  }

  // ─── Finding Similar Match Command ─────────────────────────────────
  if (args.command === "finding-similar-match") {
    const { runFindingSimilarMatch } = await import("./commands/finding-similar-match.js");
    runFindingSimilarMatch(argv);
    return;
  }

  // ─── Review Risk Matrix Command ───────────────────────────────────
  if (args.command === "review-risk-matrix") {
    const { runReviewRiskMatrix } = await import("./commands/review-risk-matrix.js");
    runReviewRiskMatrix(argv);
    return;
  }

  // ─── Review Approval Criteria Command ─────────────────────────────
  if (args.command === "review-approval-criteria") {
    const { runReviewApprovalCriteria } = await import("./commands/review-approval-criteria.js");
    runReviewApprovalCriteria(argv);
    return;
  }

  // ─── Finding Context Summary Command ──────────────────────────────
  if (args.command === "finding-context-summary") {
    const { runFindingContextSummary } = await import("./commands/finding-context-summary.js");
    runFindingContextSummary(argv);
    return;
  }

  // ─── Review Changelog Impact Command ──────────────────────────────
  if (args.command === "review-changelog-impact") {
    const { runReviewChangelogImpact } = await import("./commands/review-changelog-impact.js");
    runReviewChangelogImpact(argv);
    return;
  }

  // ─── Review Commit Quality Command ────────────────────────────────
  if (args.command === "review-commit-quality") {
    const { runReviewCommitQuality } = await import("./commands/review-commit-quality.js");
    runReviewCommitQuality(argv);
    return;
  }

  // ─── Finding Auto-Categorize Command ──────────────────────────────
  if (args.command === "finding-auto-categorize") {
    const { runFindingAutoCategorize } = await import("./commands/finding-auto-categorize.js");
    runFindingAutoCategorize(argv);
    return;
  }

  // ─── Review Stale Finding Clean Command ───────────────────────────
  if (args.command === "review-stale-finding-clean") {
    const { runReviewStaleFindingClean } = await import("./commands/review-stale-finding-clean.js");
    runReviewStaleFindingClean(argv);
    return;
  }

  // ─── Finding Impact Radius Command ────────────────────────────────
  if (args.command === "finding-impact-radius") {
    const { runFindingImpactRadius } = await import("./commands/finding-impact-radius.js");
    runFindingImpactRadius(argv);
    return;
  }

  // ─── Review Reviewer Match Command ────────────────────────────────
  if (args.command === "review-reviewer-match") {
    const { runReviewReviewerMatch } = await import("./commands/review-reviewer-match.js");
    runReviewReviewerMatch(argv);
    return;
  }

  // ─── Review Quality Gate Command ──────────────────────────────────
  if (args.command === "review-quality-gate") {
    const { runReviewQualityGate } = await import("./commands/review-quality-gate.js");
    runReviewQualityGate(argv);
    return;
  }

  // ─── Finding Reopen Detect Command ────────────────────────────────
  if (args.command === "finding-reopen-detect") {
    const { runFindingReopenDetect } = await import("./commands/finding-reopen-detect.js");
    runFindingReopenDetect(argv);
    return;
  }

  // ─── Finding Priority Rank Command ────────────────────────────────
  if (args.command === "finding-priority-rank") {
    const { runFindingPriorityRank } = await import("./commands/finding-priority-rank.js");
    runFindingPriorityRank(argv);
    return;
  }

  // ─── Review Dependency Review Command ─────────────────────────────
  if (args.command === "review-dependency-review") {
    const { runReviewDependencyReview } = await import("./commands/review-dependency-review.js");
    runReviewDependencyReview(argv);
    return;
  }

  // ─── Review Merge Readiness Command ───────────────────────────────
  if (args.command === "review-merge-readiness") {
    const { runReviewMergeReadiness } = await import("./commands/review-merge-readiness.js");
    runReviewMergeReadiness(argv);
    return;
  }

  // ─── Review Security Posture Command ──────────────────────────────
  if (args.command === "review-security-posture") {
    const { runReviewSecurityPosture } = await import("./commands/review-security-posture.js");
    runReviewSecurityPosture(argv);
    return;
  }

  // ─── Review Knowledge Capture Command ─────────────────────────────
  if (args.command === "review-knowledge-capture") {
    const { runReviewKnowledgeCapture } = await import("./commands/review-knowledge-capture.js");
    runReviewKnowledgeCapture(argv);
    return;
  }

  // ─── Review Onboarding Check Command ──────────────────────────────
  if (args.command === "review-onboarding-check") {
    const { runReviewOnboardingCheck } = await import("./commands/review-onboarding-check.js");
    runReviewOnboardingCheck(argv);
    return;
  }

  // ─── Finding Regression Detect Command ────────────────────────────
  if (args.command === "finding-regression-detect") {
    const { runFindingRegressionDetect } = await import("./commands/finding-regression-detect.js");
    runFindingRegressionDetect(argv);
    return;
  }

  // ─── Finding Auto-Fix Suggest Command ─────────────────────────────
  if (args.command === "finding-auto-fix-suggest") {
    const { runFindingAutoFixSuggest } = await import("./commands/finding-auto-fix-suggest.js");
    runFindingAutoFixSuggest(argv);
    return;
  }

  // ─── Finding Scope Filter Command ────────────────────────────────
  if (args.command === "finding-scope-filter") {
    const { runFindingScopeFilter } = await import("./commands/finding-scope-filter.js");
    runFindingScopeFilter(argv);
    return;
  }

  // ─── Finding Noise Reduce Command ────────────────────────────────
  if (args.command === "finding-noise-reduce") {
    const { runFindingNoiseReduce } = await import("./commands/finding-noise-reduce.js");
    runFindingNoiseReduce(argv);
    return;
  }

  // ─── Review Release Gate Command ─────────────────────────────────
  if (args.command === "review-release-gate") {
    const { runReviewReleaseGate } = await import("./commands/review-release-gate.js");
    runReviewReleaseGate(argv);
    return;
  }

  // ─── Review Code Ownership Command ───────────────────────────────
  if (args.command === "review-code-ownership") {
    const { runReviewCodeOwnership } = await import("./commands/review-code-ownership.js");
    runReviewCodeOwnership(argv);
    return;
  }

  // ─── Finding Batch Triage Command ────────────────────────────────
  if (args.command === "finding-batch-triage") {
    const { runFindingBatchTriage } = await import("./commands/finding-batch-triage.js");
    runFindingBatchTriage(argv);
    return;
  }

  // ─── Review PR Label Suggest Command ─────────────────────────────
  if (args.command === "review-pr-label-suggest") {
    const { runReviewPrLabelSuggest } = await import("./commands/review-pr-label-suggest.js");
    runReviewPrLabelSuggest(argv);
    return;
  }

  // ─── Finding Confidence Boost Command ─────────────────────────────
  if (args.command === "finding-confidence-boost") {
    const { runFindingConfidenceBoost } = await import("./commands/finding-confidence-boost.js");
    runFindingConfidenceBoost(argv);
    return;
  }

  // ─── Review Review Cadence Command ───────────────────────────────
  if (args.command === "review-review-cadence") {
    const { runReviewReviewCadence } = await import("./commands/review-review-cadence.js");
    runReviewReviewCadence(argv);
    return;
  }

  // ─── Review Action Item Gen Command ──────────────────────────────
  if (args.command === "review-action-item-gen") {
    const { runReviewActionItemGen } = await import("./commands/review-action-item-gen.js");
    runReviewActionItemGen(argv);
    return;
  }

  // ─── Review Policy Enforce Command ───────────────────────────────
  if (args.command === "review-policy-enforce") {
    const { runReviewPolicyEnforce } = await import("./commands/review-policy-enforce.js");
    runReviewPolicyEnforce(argv);
    return;
  }

  // ─── Finding Time-to-Fix Command ─────────────────────────────────
  if (args.command === "finding-time-to-fix") {
    const { runFindingTimeToFix } = await import("./commands/finding-time-to-fix.js");
    runFindingTimeToFix(argv);
    return;
  }

  // ─── Review Sprint Plan Command ──────────────────────────────────
  if (args.command === "review-sprint-plan") {
    const { runReviewSprintPlan } = await import("./commands/review-sprint-plan.js");
    runReviewSprintPlan(argv);
    return;
  }

  // ─── Finding Ancestry Trace Command ──────────────────────────────
  if (args.command === "finding-ancestry-trace") {
    const { runFindingAncestryTrace } = await import("./commands/finding-ancestry-trace.js");
    runFindingAncestryTrace(argv);
    return;
  }

  // ─── Review Escalation Path Command ──────────────────────────────
  if (args.command === "review-escalation-path") {
    const { runReviewEscalationPath } = await import("./commands/review-escalation-path.js");
    runReviewEscalationPath(argv);
    return;
  }

  // ─── Finding Remediation Cost Command ────────────────────────────
  if (args.command === "finding-remediation-cost") {
    const { runFindingRemediationCost } = await import("./commands/finding-remediation-cost.js");
    runFindingRemediationCost(argv);
    return;
  }

  // ─── Review Digest Gen Command ───────────────────────────────────
  if (args.command === "review-digest-gen") {
    const { runReviewDigestGen } = await import("./commands/review-digest-gen.js");
    runReviewDigestGen(argv);
    return;
  }

  // ─── Finding Recurrence Check Command ────────────────────────────
  if (args.command === "finding-recurrence-check") {
    const { runFindingRecurrenceCheck } = await import("./commands/finding-recurrence-check.js");
    runFindingRecurrenceCheck(argv);
    return;
  }

  // ─── Finding Compliance Tag Command ──────────────────────────────
  if (args.command === "finding-compliance-tag") {
    const { runFindingComplianceTag } = await import("./commands/finding-compliance-tag.js");
    runFindingComplianceTag(argv);
    return;
  }

  // ─── Review Team Coverage Command ────────────────────────────────
  if (args.command === "review-team-coverage") {
    const { runReviewTeamCoverage } = await import("./commands/review-team-coverage.js");
    runReviewTeamCoverage(argv);
    return;
  }

  // ─── Finding Severity Rebalance Command ──────────────────────────
  if (args.command === "finding-severity-rebalance") {
    const { runFindingSeverityRebalance } = await import("./commands/finding-severity-rebalance.js");
    runFindingSeverityRebalance(argv);
    return;
  }

  // ─── Review Stakeholder Notify Command ───────────────────────────
  if (args.command === "review-stakeholder-notify") {
    const { runReviewStakeholderNotify } = await import("./commands/review-stakeholder-notify.js");
    runReviewStakeholderNotify(argv);
    return;
  }

  // ─── Finding Fix Playbook Command ────────────────────────────────
  if (args.command === "finding-fix-playbook") {
    const { runFindingFixPlaybook } = await import("./commands/finding-fix-playbook.js");
    runFindingFixPlaybook(argv);
    return;
  }

  // ─── Review Adoption Score Command ───────────────────────────────
  if (args.command === "review-adoption-score") {
    const { runReviewAdoptionScore } = await import("./commands/review-adoption-score.js");
    runReviewAdoptionScore(argv);
    return;
  }

  // ─── Finding Dedup Merge Command ─────────────────────────────────
  if (args.command === "finding-dedup-merge") {
    const { runFindingDedupMerge } = await import("./commands/finding-dedup-merge.js");
    runFindingDedupMerge(argv);
    return;
  }

  // ─── Review Team Rotation Command ────────────────────────────────
  if (args.command === "review-team-rotation") {
    const { runReviewTeamRotation } = await import("./commands/review-team-rotation.js");
    runReviewTeamRotation(argv);
    return;
  }

  // ─── Review Goal Track Command ───────────────────────────────────
  if (args.command === "review-goal-track") {
    const { runReviewGoalTrack } = await import("./commands/review-goal-track.js");
    runReviewGoalTrack(argv);
    return;
  }

  // ─── Finding Risk Label Command ──────────────────────────────────
  if (args.command === "finding-risk-label") {
    const { runFindingRiskLabel } = await import("./commands/finding-risk-label.js");
    runFindingRiskLabel(argv);
    return;
  }

  // ─── Review Feedback Summary Command ─────────────────────────────
  if (args.command === "review-feedback-summary") {
    const { runReviewFeedbackSummary } = await import("./commands/review-feedback-summary.js");
    runReviewFeedbackSummary(argv);
    return;
  }

  // ─── Finding Fix Chain Command ───────────────────────────────────
  if (args.command === "finding-fix-chain") {
    const { runFindingFixChain } = await import("./commands/finding-fix-chain.js");
    runFindingFixChain(argv);
    return;
  }

  // ─── Review Config Health Command ────────────────────────────────
  if (args.command === "review-config-health") {
    const { runReviewConfigHealth } = await import("./commands/review-config-health.js");
    runReviewConfigHealth(argv);
    return;
  }

  // ─── Finding Owner Notify Command ────────────────────────────────
  if (args.command === "finding-owner-notify") {
    const { runFindingOwnerNotify } = await import("./commands/finding-owner-notify.js");
    runFindingOwnerNotify(argv);
    return;
  }

  // ─── Review Progress Report Command ──────────────────────────────
  if (args.command === "review-progress-report") {
    const { runReviewProgressReport } = await import("./commands/review-progress-report.js");
    runReviewProgressReport(argv);
    return;
  }

  // ─── Finding Patch Chain Command ─────────────────────────────────
  if (args.command === "finding-patch-chain") {
    const { runFindingPatchChain } = await import("./commands/finding-patch-chain.js");
    runFindingPatchChain(argv);
    return;
  }

  // ─── Review Engagement Score Command ─────────────────────────────
  if (args.command === "review-engagement-score") {
    const { runReviewEngagementScore } = await import("./commands/review-engagement-score.js");
    runReviewEngagementScore(argv);
    return;
  }

  // ─── Finding Effort Rank Command ─────────────────────────────────
  if (args.command === "finding-effort-rank") {
    const { runFindingEffortRank } = await import("./commands/finding-effort-rank.js");
    runFindingEffortRank(argv);
    return;
  }

  // ─── Finding Resolution Workflow Command ─────────────────────────
  if (args.command === "finding-resolution-workflow") {
    const { runFindingResolutionWorkflow } = await import("./commands/finding-resolution-workflow.js");
    runFindingResolutionWorkflow(argv);
    return;
  }

  // ─── Review Quality Baseline Command ─────────────────────────────
  if (args.command === "review-quality-baseline") {
    const { runReviewQualityBaseline } = await import("./commands/review-quality-baseline.js");
    runReviewQualityBaseline(argv);
    return;
  }

  // ─── Finding Context Link Command ────────────────────────────────
  if (args.command === "finding-context-link") {
    const { runFindingContextLink } = await import("./commands/finding-context-link.js");
    runFindingContextLink(argv);
    return;
  }

  // ─── Review Team Velocity Command ────────────────────────────────
  if (args.command === "review-team-velocity") {
    const { runReviewTeamVelocity } = await import("./commands/review-team-velocity.js");
    runReviewTeamVelocity(argv);
    return;
  }

  // ─── Finding Auto Priority Command ───────────────────────────────
  if (args.command === "finding-auto-priority") {
    const { runFindingAutoPriority } = await import("./commands/finding-auto-priority.js");
    runFindingAutoPriority(argv);
    return;
  }

  // ─── Review Retrospective Command ────────────────────────────────
  if (args.command === "review-retrospective") {
    const { runReviewRetrospective } = await import("./commands/review-retrospective.js");
    runReviewRetrospective(argv);
    return;
  }

  // ─── Finding Dependency Impact Command ───────────────────────────
  if (args.command === "finding-dependency-impact") {
    const { runFindingDependencyImpact } = await import("./commands/finding-dependency-impact.js");
    runFindingDependencyImpact(argv);
    return;
  }

  // ─── Review Mentor Suggest Command ───────────────────────────────
  if (args.command === "review-mentor-suggest") {
    const { runReviewMentorSuggest } = await import("./commands/review-mentor-suggest.js");
    runReviewMentorSuggest(argv);
    return;
  }

  // ─── Finding Cluster Summary Command ─────────────────────────────
  if (args.command === "finding-cluster-summary") {
    const { runFindingClusterSummary } = await import("./commands/finding-cluster-summary.js");
    runFindingClusterSummary(argv);
    return;
  }

  // ─── Finding Scope Impact Command ────────────────────────────────
  if (args.command === "finding-scope-impact") {
    const { runFindingScopeImpact } = await import("./commands/finding-scope-impact.js");
    runFindingScopeImpact(argv);
    return;
  }

  // ─── Review Health Trend Command ─────────────────────────────────
  if (args.command === "review-health-trend") {
    const { runReviewHealthTrend } = await import("./commands/review-health-trend.js");
    runReviewHealthTrend(argv);
    return;
  }

  // ─── Finding Fix Estimate Command ────────────────────────────────
  if (args.command === "finding-fix-estimate") {
    const { runFindingFixEstimate } = await import("./commands/finding-fix-estimate.js");
    runFindingFixEstimate(argv);
    return;
  }

  // ─── Review Readiness Check Command ──────────────────────────────
  if (args.command === "review-readiness-check") {
    const { runReviewReadinessCheck } = await import("./commands/review-readiness-check.js");
    runReviewReadinessCheck(argv);
    return;
  }

  // ─── Finding Noise Score Command ─────────────────────────────────
  if (args.command === "finding-noise-score") {
    const { runFindingNoiseScore } = await import("./commands/finding-noise-score.js");
    runFindingNoiseScore(argv);
    return;
  }

  // ─── Review Workflow Suggest Command ──────────────────────────────
  if (args.command === "review-workflow-suggest") {
    const { runReviewWorkflowSuggest } = await import("./commands/review-workflow-suggest.js");
    runReviewWorkflowSuggest(argv);
    return;
  }

  // ─── Finding Top Offender Command ────────────────────────────────
  if (args.command === "finding-top-offender") {
    const { runFindingTopOffender } = await import("./commands/finding-top-offender.js");
    runFindingTopOffender(argv);
    return;
  }

  // ─── Review Team Skill Map Command ───────────────────────────────
  if (args.command === "review-team-skill-map") {
    const { runReviewTeamSkillMap } = await import("./commands/review-team-skill-map.js");
    runReviewTeamSkillMap(argv);
    return;
  }

  // ─── Finding Repeat Detect Command ───────────────────────────────
  if (args.command === "finding-repeat-detect") {
    const { runFindingRepeatDetect } = await import("./commands/finding-repeat-detect.js");
    runFindingRepeatDetect(argv);
    return;
  }

  // ─── Tune Command ─────────────────────────────────────────────────
  if (args.command === "tune") {
    const { runTune } = await import("./commands/tune.js");
    await runTune(argv);
    return;
  }

  // ─── Calibration Dashboard Command ────────────────────────────────
  if (args.command === "calibration-dashboard") {
    const { runCalibrationDashboard } = await import("./commands/calibration-dashboard.js");
    await runCalibrationDashboard(argv);
    process.exit(0);
  }

  // ─── Community Patterns Command ───────────────────────────────────────
  if (args.command === "community-patterns") {
    const { runCommunityPatterns } = await import("./commands/community-patterns.js");
    await runCommunityPatterns(argv);
    process.exit(0);
  }

  // ─── Calibration Share Command ───────────────────────────────────────
  if (args.command === "calibration-share") {
    const { runCalibrationShare } = await import("./commands/calibration-share.js");
    runCalibrationShare(argv);
    process.exit(0);
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

  // ─── Scaffold Plugin Command ─────────────────────────────────────────
  if (args.command === "scaffold-plugin") {
    const { runScaffoldPlugin } = await import("./commands/scaffold-plugin.js");
    runScaffoldPlugin(argv);
    process.exit(0);
  }

  // ─── Plugin Search Command ───────────────────────────────────────────
  if (args.command === "plugin") {
    const { runPluginSearch } = await import("./commands/plugin-search.js");
    runPluginSearch(argv);
    process.exit(0);
  }

  // ─── Trust Ramp Command ──────────────────────────────────────────────
  if (args.command === "trust-ramp") {
    const { runTrustRamp } = await import("./commands/trust-ramp.js");
    runTrustRamp(argv);
    process.exit(0);
  }

  // ─── Metrics Command ────────────────────────────────────────────────
  if (args.command === "metrics") {
    const { runMetrics } = await import("./commands/metrics.js");
    runMetrics(argv);
    process.exit(0);
  }

  // ─── Metrics Dashboard Command ────────────────────────────────────────
  if (args.command === "metrics-dashboard") {
    const { runMetricsDashboard } = await import("./commands/metrics-dashboard.js");
    runMetricsDashboard(argv);
    process.exit(0);
  }

  // ─── Help Command ────────────────────────────────────────────────────
  if (args.command === "help") {
    const { runHelp } = await import("./commands/help.js");
    runHelp(argv);
    process.exit(0);
  }

  // ─── Onboard Command ─────────────────────────────────────────────────
  if (args.command === "onboard") {
    const { runOnboard } = await import("./commands/onboard.js");
    await runOnboard(argv);
    process.exit(0);
  }

  // ─── Org Metrics Command ──────────────────────────────────────────────
  if (args.command === "org-metrics") {
    const { runOrgMetrics } = await import("./commands/org-metrics.js");
    runOrgMetrics(argv);
    process.exit(0);
  }

  // ─── Plugins Command ──────────────────────────────────────────────────
  if (args.command === "plugins") {
    const { runPlugins } = await import("./commands/plugins.js");
    runPlugins(argv);
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
      args.minScore = config.failOnScoreBelow;
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

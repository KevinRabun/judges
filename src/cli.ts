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
import { execSync } from "child_process";

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
import { verdictToPdfHtml } from "./formatters/pdf.js";
import { verdictToCodeClimate } from "./formatters/codeclimate.js";
import { verdictToGitHubActions } from "./formatters/github-actions.js";
import { runReport } from "./commands/report.js";
import { runHook } from "./commands/hook.js";
import { runDiff } from "./commands/diff.js";
import { runDeps } from "./commands/deps.js";
import { runBaseline, loadBaselineData, isBaselined, type LoadedBaseline } from "./commands/baseline.js";
import { runCompletions } from "./commands/completions.js";
import { runDocs } from "./commands/docs.js";
import { generateGitLabCi, generateAzurePipelines, generateBitbucketPipelines } from "./commands/ci-templates.js";
import { getPreset, listPresets, composePresets } from "./presets.js";
import { parseConfig } from "./config.js";
import type { Finding, JudgesConfig, TribunalVerdict } from "./types.js";
import { applyPatches, type PatchCandidate } from "./commands/fix.js";
import { DiskCache } from "./disk-cache.js";
import { contentHash } from "./cache.js";
import { runFeedback } from "./commands/feedback.js";
import { runBenchmark } from "./commands/benchmark.js";
import { runRule } from "./commands/rule.js";
import { runPack } from "./commands/language-packs.js";
import { runConfig } from "./commands/config-share.js";
import { runDoctor } from "./commands/doctor.js";
import { runTriage } from "./commands/triage.js";
import { formatComparisonReport, formatFullComparisonMatrix, TOOL_PROFILES } from "./comparison.js";
import { runOverride, loadOverrideStore, applyOverrides } from "./commands/override.js";
import { runNotify } from "./commands/notify.js";

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
    changedOnly: false,
    stagedOnly: false,
    explain: false,
    sample: false,
    trace: false,
    incremental: false,
    noCache: false,
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
                                     --rule <id>  --severity <level>  --lines <start>-<end>
  judges fix-pr <path>               Create a PR with auto-fix patches (like Dependabot)
  judges watch <path>                 Watch files and re-evaluate on save
  judges lsp                          Start LSP server for editor integration
  judges trend [file]                 Show findings trend from snapshots
  judges scaffold-plugin <name>       Generate a starter custom plugin project
  judges report <dir>                 Generate project-level report
  judges hook install                 Install pre-commit git hook
  judges diff                         Evaluate only changed lines from a diff
  judges deps [dir]                   Analyze dependencies for supply-chain risks
  judges doctor                       Run diagnostic healthcheck
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
  judges review                       Post inline review comments on a GitHub PR
  judges app serve                    Start GitHub App webhook server (zero-config PR reviews)
  judges notify                       Send results to Slack, Teams, or webhook endpoints
  judges quality-gate                 Evaluate composite quality gate policies
  judges auto-calibrate               Auto-tune thresholds from feedback history
  judges dep-audit                    Correlate dependency vulnerabilities with code findings
  judges monorepo                     Discover and evaluate monorepo packages
  judges config-migrate               Migrate .judgesrc to current schema
  judges deprecated                   List deprecated rules with migration guidance
  judges dedup-report                 Cross-run finding deduplication report
  judges upload                       Upload SARIF results to GitHub Code Scanning
  judges smart-select                 Show which judges are relevant for a file
  judges pr-summary                   Post a PR summary comment with verdict
  judges profile                      Performance profiling for judge evaluations
  judges group                        Group findings by category, severity, or file
  judges diff-only                    Evaluate only changed lines in a PR diff
  judges auto-triage                  Auto-suppress low-confidence findings
  judges validate-config              Validate .judgesrc configuration
  judges coverage-map                 Show which rules apply to which languages
  judges warm-cache                   Pre-populate eval cache for faster CI
  judges policy-audit                 Compliance audit trail with policy snapshots
  judges remediation <rule-id>        Step-by-step fix guide for a finding
  judges hook-install                 Install git pre-commit/pre-push hooks
  judges false-negatives              Track and report false-negative feedback
  judges assign                       Assign findings to team members
  judges ticket-sync                  Create tickets from findings (Jira/Linear/GitHub)
  judges sla-track                    SLA tracking and violation detection
  judges regression-alert             Detect quality regressions between scans
  judges suppress                     Batch false-positive suppression
  judges rule-owner                   Map rules to team owners
  judges noise-advisor                Analyze rule performance and recommend tuning
  judges review-queue                 Human review queue for low-confidence findings
  judges report-template              Generate reports from templates
  judges burndown                     Track finding resolution progress
  judges kb                           Team knowledge base for rule decisions
  judges recommend                    Analyze project and recommend judges
  judges vote                         Consensus voting on findings
  judges query                        Advanced finding search and filter
  judges judge-reputation             Per-judge accuracy and FP tracking
  judges correlate                    Finding correlation and root-cause analysis
  judges digest                       Periodic finding digest and trend reports
  judges rule-share                   Export/import custom rule configurations
  judges explain-finding              Detailed finding explanation with context
  judges compare-runs                 Compare evaluation runs side by side
  judges audit-bundle                 Assemble auditor-ready evidence package
  judges dev-score                    Developer security growth score
  judges model-risk                   AI model vulnerability risk profiles
  judges retro                        Security incident retrospective analysis
  judges config-drift                 Detect config divergence from baseline
  judges reg-watch                    Regulatory standard coverage monitor
  judges learn                        Personalized developer learning paths
  judges generate                     Secure code template generator
  judges ai-model-trust               AI model confidence scoring
  judges team-rules-sync              Fast team onboarding with shared rules
  judges cost-forecast                Security debt cost projections
  judges team-leaderboard             Gamified security review engagement
  judges code-owner-suggest           Auto-recommend CODEOWNERS entries
  judges pr-quality-gate              Automated PR pass/fail quality gate
  judges ai-prompt-audit              Scan for prompt injection risks
  judges adoption-report              Team adoption metrics dashboard
  judges auto-fix                     Automated fix suggestions for findings
  judges audit-trail                  Chain-of-custody tracking for findings
  judges pattern-registry             Team security pattern knowledge repo
  judges security-maturity            Security posture maturity assessment
  judges perf-hotspot                 Performance anti-pattern detection
  judges doc-gen                      Generate security documentation
  judges dep-correlate                Dependency vulnerability correlation
  judges judge-author                 Custom judge authoring toolkit
  judges sbom-export                  Generate Software Bill of Materials
  judges license-scan                 Dependency license compliance
  judges test-correlate               Test coverage × finding correlation
  judges predict                      Forecast remediation timelines
  judges org-policy                   Organization-wide policy management
  judges incident-response            Incident response playbook generation
  judges risk-heatmap                 File/directory risk visualization
  judges learning-path                Personalized security learning
  judges secret-scan                  Scan for hardcoded secrets and API keys
  judges iac-lint                     Lint Dockerfiles and Kubernetes manifests
  judges pii-scan                     Detect PII patterns in source code
  judges api-audit                    API endpoint security audit
  judges compliance-map               Multi-framework compliance mapping
  judges perf-compare                 Before/after performance comparison
  judges guided-tour                  Interactive onboarding tutorials
  judges exec-report                  Executive security dashboard
  judges ai-output-compare            Compare outputs from multiple AI models
  judges hallucination-score          Hallucination risk score for AI code
  judges ai-gate                      Pre-merge gate for AI-generated code
  judges ai-pattern-trend             Track AI code pattern evolution over time
  judges test-suggest                 Test scenario suggestions for AI code
  judges vendor-lock-detect           Detect vendor-specific API lock-in
  judges clarity-score                Code readability and self-documentation score
  judges arch-audit                   Architecture quality audit
  judges watch-judge                  Continuously watch and auto-evaluate files
  judges impact-scan                  Cross-file ripple effect detection
  judges model-report                 AI model scorecard and comparison
  judges trust-adaptive               Adaptive trust scoring for actors
  judges judge-learn                  Generate custom judges from feedback
  judges chat-notify                  Publish findings to chat platforms
  judges design-audit                 Detect code breaking project conventions
  judges remediation-lib              Proven fix templates for common findings
  judges doc-drift                    Detect documentation-to-code drift
  judges cross-pr-regression          Track flagged pattern recurrence across PRs
  judges code-similarity              Compare code across files for duplication
  judges team-trust                   Team-wide trust profile aggregation
  judges exception-consistency        Detect inconsistent exception handling
  judges resource-cleanup             Validate resource cleanup patterns
  judges refactor-safety              Analyze refactoring safety
  judges compliance-weight            Re-weight findings by compliance framework
  judges prompt-replay                Reverse-engineer AI prompts and suggest improvements
  judges review-replay                Record and replay evaluation runs
  judges context-inject               Feed project context into evaluation
  judges habit-tracker                Track recurring finding patterns per author
  judges finding-contest              Gamified fix challenge mode
  judges approve-chain                Multi-stage approval workflows
  judges snippet-eval                 Evaluate code snippets instantly
  judges coach-mode                   Educational security coaching
  judges tune                         Analyze project and suggest optimal config
  judges list                         List all available judges
  judges version                      Show version information
  judges --help                       Show this help

EVAL OPTIONS:
  --file, -f <path>          File to evaluate (or pass as positional arg)
  --language, -l <lang>      Language override (auto-detected from extension)
  --format, -o <fmt>         Output: text, json, sarif, markdown, html, pdf, junit, codeclimate, github-actions
  --judge, -j <id>           Run a single judge instead of the full tribunal
  --fail-on-findings         Exit with code 1 when verdict is fail
  --baseline, -b <path>      Suppress findings already in baseline file
  --summary                  Show one-line summary instead of full output
  --config, -c <path>        Path to .judgesrc config file
  --preset, -p <name>        Use a named preset (strict, lenient, security-only, startup, compliance,
                             performance, react, express, fastapi, django, spring-boot, rails, nextjs,
                             terraform, kubernetes)
                             Compose presets with commas: --preset security-only,react
  --min-score <n>            Fail if score drops below threshold (0-100)
  --exclude, -x <glob>       Exclude files matching glob pattern (repeatable)
  --include, -i <glob>       Only include files matching glob pattern (repeatable)
  --max-files <n>            Maximum number of files to analyze in directory mode
  --sample                   Randomly sample files instead of taking first N (use with --max-files)
  --no-color                 Disable colored output
  --verbose                  Show detailed evaluation information
  --quiet                    Suppress non-essential output
  --fix                      Auto-fix findings after evaluation (applies patches in-place)
  --changed-only             Only evaluate files changed since last commit (uses git diff)
  --explain                  Enrich findings with OWASP/CWE learning context
  --trace                    Show detailed decision trace for every finding
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

REVIEW OPTIONS:
  --pr, -p <number>          PR number to review (required)
  --repo, -r <owner/repo>    Repository (default: current repo from git remote)
  --approve                  Approve PR if no findings
  --dry-run, -n              Print comments without posting
  --min-severity <level>     Minimum severity: info, warning, error (default: warning)
  --max-comments <n>         Maximum review comments (default: 25)
  --format, -o <fmt>         Output: text, json, sarif, markdown

TUNE OPTIONS:
  --dir, -d <path>           Project directory to analyze (default: .)
  --apply                    Write recommended .judgesrc.json
  --max-files <n>            Max files to sample (default: 200)
  --verbose, -v              Show detailed analysis

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
  judges review --pr 42 --dry-run
  judges review --pr 42 --repo owner/repo --approve
  judges tune
  judges tune --dir ./my-project --apply
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
  p = p.replace(/[.+^${}()|[\]\\-]/g, "\\$&");
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
  sample?: boolean;
}

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
    const diffOutput = execSync("git diff --name-only HEAD", {
      cwd: resolvedCwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    // Untracked files
    const untrackedOutput = execSync("git ls-files --others --exclude-standard", {
      cwd: resolvedCwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

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
    const output = execSync("git diff --cached --name-only --diff-filter=ACM", {
      cwd: resolvedCwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
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
    case "sarif":
      return JSON.stringify(verdictToSarif(verdict, filePath), null, 2);
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
    runWatch(argv);
    return; // Watch runs indefinitely
  }

  // ─── LSP Command ─────────────────────────────────────────────────────
  if (args.command === "lsp") {
    const { runLsp } = await import("./commands/lsp.js");
    runLsp(argv);
    return; // LSP server runs indefinitely
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

  // ─── Doctor Command ──────────────────────────────────────────────────
  if (args.command === "doctor") {
    runDoctor(argv);
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

  // ─── Override Command ─────────────────────────────────────────────────
  if (args.command === "override") {
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
    await runNotify(argv);
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

    // Load config from file or preset
    const evalConfig = loadEvalConfig(args);

    // Load baseline if specified (from CLI flag — config doesn't carry baseline)
    let loadedBaseline: LoadedBaseline | undefined;
    if (args.baseline) {
      loadedBaseline = loadBaselineData(args.baseline);
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
        console.log(verdictToPdfHtml(wrappedForPdf, resolvedPath || args.file));
      } else {
        console.log(formatSingleJudgeTextOutput(evaluation));
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
        console.log(verdictToHtml(verdict, resolvedPath || args.file));
      } else if (args.format === "pdf") {
        console.log(verdictToPdfHtml(verdict, resolvedPath || args.file));
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

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

import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";

import {
  evaluateWithTribunal,
  evaluateWithJudge,
  formatVerdictAsMarkdown,
  formatEvaluationAsMarkdown,
} from "./evaluators/index.js";
import { getJudge, getJudgeSummaries } from "./judges/index.js";
import { verdictToSarif } from "./formatters/sarif.js";
import { verdictToHtml } from "./formatters/html.js";
import { runReport } from "./commands/report.js";
import { runHook } from "./commands/hook.js";

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
  format: "text" | "json" | "sarif" | "markdown" | "html";
  judge: string | undefined;
  help: boolean;
  failOnFindings: boolean;
  baseline: string | undefined;
  summary: boolean;
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
  judges list                         List all available judges
  judges --help                       Show this help

EVAL OPTIONS:
  --file, -f <path>          File to evaluate (or pass as positional arg)
  --language, -l <lang>      Language override (auto-detected from extension)
  --format, -o <fmt>         Output: text (default), json, sarif, markdown, html
  --judge, -j <id>           Run a single judge instead of the full tribunal
  --fail-on-findings         Exit with code 1 when verdict is fail
  --baseline, -b <path>      Suppress findings already in baseline file
  --summary                  Show one-line summary instead of full output
  --help, -h                 Show this help

FIX OPTIONS:
  --apply, -a                Apply patches in-place (default is dry-run)
  --judge, -j <id>           Only apply fixes from a specific judge

WATCH OPTIONS:
  --judge, -j <id>           Only evaluate with a specific judge
  --fail-on-findings         Exit on first failure

STDIN:
  cat file.ts | judges eval --language typescript

EXAMPLES:
  judges eval src/app.ts
  judges eval --file api.py --format sarif
  judges eval --judge cybersecurity server.ts
  judges eval --format html --fail-on-findings src/
  judges eval --baseline .judges-baseline.json src/app.ts
  judges init
  judges fix src/app.ts --apply
  judges watch src/
  judges report .
  judges hook install
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

// ─── Main CLI Entry Point ───────────────────────────────────────────────────

export async function runCli(argv: string[]): Promise<void> {
  const args = parseCliArgs(argv);

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

  // ─── List Command ────────────────────────────────────────────────────
  if (args.command === "list") {
    listJudges();
    process.exit(0);
  }

  // ─── Eval Command ────────────────────────────────────────────────────
  if (args.command === "eval" || args.file) {
    const { code, resolvedPath } = readCode(args.file);
    const language = args.language || detectLanguage(args.file || resolvedPath) || "typescript";

    // Load baseline if specified
    let baselineFindings: Set<string> | undefined;
    if (args.baseline) {
      baselineFindings = loadBaseline(args.baseline);
    }

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

      // Exit code
      if (args.failOnFindings && evaluation.verdict === "fail") {
        process.exit(1);
      }
    } else {
      // Full tribunal mode
      const verdict = evaluateWithTribunal(code, language);

      // Apply baseline suppression
      if (baselineFindings) {
        for (const evaluation of verdict.evaluations) {
          evaluation.findings = evaluation.findings.filter((f) => !baselineFindings!.has(baselineKey(f)));
        }
        verdict.findings = verdict.findings.filter((f) => !baselineFindings!.has(baselineKey(f)));
      }

      if (args.summary) {
        const totalFindings = verdict.evaluations.reduce((s, e) => s + e.findings.length, 0);
        printSummaryLine(verdict.overallVerdict, verdict.overallScore, totalFindings);
      } else if (args.format === "html") {
        console.log(verdictToHtml(verdict, resolvedPath || args.file));
      } else {
        console.log(formatTribunalOutput(verdict, args.format, resolvedPath || args.file));
      }

      // Exit code
      if (args.failOnFindings && verdict.overallVerdict === "fail") {
        process.exit(1);
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

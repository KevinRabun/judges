/**
 * `judges report` — Generate a project-level report from a local directory.
 *
 * Usage:
 *   judges report .                             # Report on current directory
 *   judges report src/                           # Report on src/ directory
 *   judges report . --format json                # JSON output
 *   judges report . --format html                # HTML output
 *   judges report . --output report.html         # Save to file
 *   judges report . --max-files 100              # Limit files scanned
 */

import { existsSync, writeFileSync, statSync } from "fs";
import { resolve, basename } from "path";

import { generateRepoReportFromLocalPath } from "../reports/public-repo-report.js";

// ─── Report Arguments ───────────────────────────────────────────────────────

interface ReportArgs {
  path: string;
  format: "text" | "json" | "html" | "markdown";
  output: string | undefined;
  maxFiles: number;
  maxFileBytes: number;
}

function parseReportArgs(argv: string[]): ReportArgs {
  const args: ReportArgs = {
    path: ".",
    format: "text",
    output: undefined,
    maxFiles: 600,
    maxFileBytes: 300_000,
  };

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--format":
      case "-o":
        args.format = argv[++i] as ReportArgs["format"];
        break;
      case "--output":
        args.output = argv[++i];
        break;
      case "--max-files":
        args.maxFiles = parseInt(argv[++i], 10);
        break;
      case "--max-file-bytes":
        args.maxFileBytes = parseInt(argv[++i], 10);
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

// ─── Progress Display ───────────────────────────────────────────────────────

function showProgress(message: string): void {
  if (process.stderr.isTTY) {
    process.stderr.write(`\r  ⏳ ${message}`.padEnd(70));
  }
}

function clearProgress(): void {
  if (process.stderr.isTTY) {
    process.stderr.write("\r" + " ".repeat(70) + "\r");
  }
}

// ─── Main Report Command ───────────────────────────────────────────────────

export function runReport(argv: string[]): void {
  const args = parseReportArgs(argv);
  const targetPath = resolve(args.path);

  if (!existsSync(targetPath)) {
    console.error(`Error: Path not found: ${targetPath}`);
    process.exit(1);
  }

  if (!statSync(targetPath).isDirectory()) {
    console.error("Error: 'judges report' requires a directory path.");
    console.error("Use 'judges eval' to evaluate a single file.");
    process.exit(1);
  }

  const projectName = basename(targetPath) || "project";

  console.error("");
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║              Judges Panel — Project Report                  ║");
  console.error("╚══════════════════════════════════════════════════════════════╝");
  console.error("");
  console.error(`  Scanning: ${args.path}`);
  console.error(`  Max files: ${args.maxFiles}`);
  console.error("");

  showProgress("Analyzing source files...");

  const startTime = Date.now();
  const result = generateRepoReportFromLocalPath({
    repoPath: targetPath,
    repoLabel: projectName,
    maxFiles: args.maxFiles,
    maxFileBytes: args.maxFileBytes,
    includeAstFindings: true,
  });

  clearProgress();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.error(`  ✅ Analyzed ${result.analyzedFileCount} files in ${elapsed}s`);
  console.error(
    `  Score: ${result.averageScore}/100 | Verdict: ${result.overallVerdict.toUpperCase()} | Findings: ${result.totalFindings}`,
  );
  console.error("");

  // Format output
  let output: string;
  switch (args.format) {
    case "json":
      output = JSON.stringify(
        {
          project: projectName,
          analyzedFiles: result.analyzedFileCount,
          totalFindings: result.totalFindings,
          averageScore: result.averageScore,
          overallVerdict: result.overallVerdict,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      );
      break;
    case "html": {
      // Wrap as a simple HTML page with the markdown
      const escapedMd = result.markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      output = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Judges Report — ${projectName}</title>
<style>body{font-family:monospace;max-width:960px;margin:2rem auto;padding:1rem;white-space:pre-wrap;line-height:1.6}</style>
</head><body>${escapedMd}</body></html>`;
      break;
    }
    case "markdown":
      output = result.markdown;
      break;
    case "text":
    default:
      output = result.markdown;
      break;
  }

  // Write to file or stdout
  if (args.output) {
    writeFileSync(resolve(args.output), output, "utf-8");
    console.error(`  📝 Report saved to: ${args.output}\n`);
  } else {
    console.log(output);
  }

  // Exit with appropriate code
  if (result.overallVerdict === "fail") {
    process.exit(1);
  }
  process.exit(0);
}

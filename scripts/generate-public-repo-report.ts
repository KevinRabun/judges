#!/usr/bin/env tsx

/// <reference types="node" />

import { generatePublicRepoReport } from "../src/reports/public-repo-report.js";

function parseArg(name: string): string | undefined {
  const key = `--${name}`;
  const index = process.argv.indexOf(key);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function parseArgs(name: string): string[] {
  const key = `--${name}`;
  const values: string[] = [];

  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === key && index + 1 < process.argv.length) {
      values.push(process.argv[index + 1]);
    }
  }

  return values;
}

function parseIntArg(name: string, fallback?: number): number | undefined {
  const value = parseArg(name);
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for --${name}: ${value}`);
  }
  return parsed;
}

function parseFloatArg(name: string, fallback?: number): number | undefined {
  const value = parseArg(name);
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric value for --${name}: ${value}`);
  }
  return parsed;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseCredentialMode(): "standard" | "strict" | undefined {
  const value = parseArg("credentialMode");
  if (!value) return undefined;
  if (value === "standard" || value === "strict") {
    return value;
  }
  throw new Error(`Invalid value for --credentialMode: ${value}. Use 'standard' or 'strict'.`);
}

function printUsage() {
  console.log(`
Usage:
  npx tsx scripts/generate-public-repo-report.ts --repoUrl <https-url> [options]

Options:
  --repoUrl <url>            Public repository URL (required)
  --branch <name>            Branch to clone (default: repository default branch)
  --output <path>            Write markdown report to file
  --maxFiles <n>             Max source files to analyze (default: 600)
  --maxFileBytes <n>         Max single file size in bytes (default: 300000)
  --maxFindings <n>          Max detailed findings included in report (default: 150)
  --excludePathRegex <expr>  Exclude files/dirs whose relative path matches regex (repeatable)
  --credentialMode <mode>    Credential detection mode: standard|strict (default: standard)
  --includeAstFindings <b>   Include AST/code-structure findings: true|false (default: true)
  --minConfidence <0-1>      Minimum finding confidence to include (default: 0)
  --keepClone                Keep cloned temp directory for inspection
`);
}

function parseBooleanArg(name: string, fallback?: boolean): boolean | undefined {
  const value = parseArg(name);
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  throw new Error(`Invalid boolean value for --${name}: ${value}. Use 'true' or 'false'.`);
}

async function main() {
  if (hasFlag("help") || hasFlag("h")) {
    printUsage();
    return;
  }

  const repoUrl = parseArg("repoUrl");
  if (!repoUrl) {
    printUsage();
    throw new Error("Missing required --repoUrl argument.");
  }

  const report = generatePublicRepoReport({
    repoUrl,
    branch: parseArg("branch"),
    outputPath: parseArg("output"),
    maxFiles: parseIntArg("maxFiles", 600),
    maxFileBytes: parseIntArg("maxFileBytes", 300_000),
    maxFindingsInReport: parseIntArg("maxFindings", 150),
    excludePathRegexes: parseArgs("excludePathRegex"),
    credentialMode: parseCredentialMode(),
    includeAstFindings: parseBooleanArg("includeAstFindings", true),
    minConfidence: parseFloatArg("minConfidence", 0),
    keepClone: hasFlag("keepClone"),
  });

  console.log(`\nOverall verdict: ${report.overallVerdict.toUpperCase()}`);
  console.log(`Average score: ${report.averageScore}/100`);
  console.log(`Files analyzed: ${report.analyzedFileCount}`);
  console.log(`Total findings: ${report.totalFindings}`);
  if (report.outputPath) {
    console.log(`Report written to: ${report.outputPath}`);
  } else {
    console.log("\n--- Report Preview ---\n");
    console.log(report.markdown.slice(0, 3000));
  }
  if (report.clonePath) {
    console.log(`Clone path: ${report.clonePath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

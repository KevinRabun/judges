/**
 * Review-dry-run — Simulate a review without persisting results.
 */

import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDryRun(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-dry-run — Simulate a review without persisting results

Usage:
  judges review-dry-run --file <source> [options]

Options:
  --file <path>        Source file to simulate review for (required)
  --config <path>      Config file to use
  --show-config        Show effective config without running
  --format json        JSON output
  --help, -h           Show this help

Runs analysis in simulation mode — no files written, no caches updated.
`);
    return;
  }

  const sourceFile = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const configFile = argv.find((_a: string, i: number) => argv[i - 1] === "--config");
  const showConfig = argv.includes("--show-config");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!sourceFile && !showConfig) {
    console.error("Error: --file required (or use --show-config)");
    process.exitCode = 1;
    return;
  }

  // Load config if specified
  let config: Record<string, unknown> = {};
  if (configFile) {
    if (!existsSync(configFile)) {
      console.error(`Error: config file not found: ${configFile}`);
      process.exitCode = 1;
      return;
    }
    try {
      config = JSON.parse(readFileSync(configFile, "utf-8"));
    } catch {
      console.error("Error: could not parse config file");
      process.exitCode = 1;
      return;
    }
  }

  if (showConfig) {
    if (format === "json") {
      console.log(JSON.stringify({ mode: "dry-run", config }, null, 2));
    } else {
      console.log("\nDry-Run Config:");
      console.log("═".repeat(40));
      console.log(JSON.stringify(config, null, 2));
      console.log("═".repeat(40));
    }
    return;
  }

  if (!existsSync(sourceFile!)) {
    console.error(`Error: source file not found: ${sourceFile}`);
    process.exitCode = 1;
    return;
  }

  // Read source and simulate analysis
  const source = readFileSync(sourceFile!, "utf-8");
  const lineCount = source.split("\n").length;
  const ext = sourceFile!.split(".").pop() || "unknown";

  // Simple dry-run simulation — estimate what a full review would produce
  const simulation = {
    mode: "dry-run",
    sourceFile: sourceFile,
    language: ext,
    lineCount,
    estimatedJudges: getEstimatedJudgeCount(ext),
    estimatedDuration: `${Math.max(1, Math.round(lineCount / 100))}s`,
    configApplied: Object.keys(config).length > 0,
    wouldPersist: false,
    wouldUpdateCache: false,
  };

  if (format === "json") {
    console.log(JSON.stringify(simulation, null, 2));
    return;
  }

  console.log("\nDry-Run Simulation:");
  console.log("═".repeat(50));
  console.log(`  File:              ${sourceFile}`);
  console.log(`  Language:          ${ext}`);
  console.log(`  Lines:             ${lineCount}`);
  console.log(`  Est. judges:       ${simulation.estimatedJudges}`);
  console.log(`  Est. duration:     ${simulation.estimatedDuration}`);
  console.log(`  Config applied:    ${simulation.configApplied ? "yes" : "no (defaults)"}`);
  console.log(`  Would persist:     no (dry-run)`);
  console.log(`  Would cache:       no (dry-run)`);
  console.log("═".repeat(50));
  console.log("  No files were written. Use 'judges eval' for a real review.");
}

function getEstimatedJudgeCount(ext: string): number {
  const langMap: Record<string, number> = {
    ts: 45,
    js: 45,
    tsx: 45,
    jsx: 45,
    py: 40,
    java: 40,
    cs: 38,
    go: 35,
    rs: 30,
    cpp: 30,
    c: 28,
    rb: 32,
    php: 35,
    swift: 28,
    kt: 28,
  };
  return langMap[ext] || 25;
}

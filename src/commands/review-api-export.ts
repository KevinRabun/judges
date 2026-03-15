/**
 * Review-api-export — Export review data in API-compatible JSON format.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApiExport {
  version: string;
  exportedAt: string;
  reviews: Array<{
    verdict: string;
    score: number;
    findingCount: number;
    criticalCount: number;
    highCount: number;
    timestamp: string;
    findings: Array<{
      ruleId: string;
      severity: string;
      title: string;
      description: string;
      recommendation: string;
      lineNumbers?: number[];
      confidence?: number;
    }>;
  }>;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewApiExport(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const dirIdx = argv.indexOf("--dir");
  const outputIdx = argv.indexOf("--output");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const dirPath = dirIdx >= 0 ? argv[dirIdx + 1] : undefined;
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-api-export — Export review data in API format

Usage:
  judges review-api-export --file <review.json> [--output <file>]
  judges review-api-export --dir <path> [--output <file>]

Options:
  --file <path>     Single review JSON file
  --dir <path>      Directory of review JSON files
  --output <path>   Write API export to file
  --help, -h        Show this help
`);
    return;
  }

  const verdicts: TribunalVerdict[] = [];

  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`Error: file not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }
    try {
      verdicts.push(JSON.parse(readFileSync(filePath, "utf-8")) as TribunalVerdict);
    } catch {
      console.error(`Error: failed to parse: ${filePath}`);
      process.exitCode = 1;
      return;
    }
  } else if (dirPath) {
    if (!existsSync(dirPath)) {
      console.error(`Error: directory not found: ${dirPath}`);
      process.exitCode = 1;
      return;
    }
    const files = (readdirSync(dirPath) as unknown as string[]).filter(
      (f) => typeof f === "string" && f.endsWith(".json"),
    );
    for (const file of files) {
      try {
        const v = JSON.parse(readFileSync(join(dirPath, file), "utf-8")) as TribunalVerdict;
        if (v.overallVerdict !== undefined) {
          verdicts.push(v);
        }
      } catch {
        // skip
      }
    }
  } else {
    console.error("Error: --file or --dir is required");
    process.exitCode = 1;
    return;
  }

  const apiExport: ApiExport = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    reviews: verdicts.map((v) => ({
      verdict: v.overallVerdict,
      score: v.overallScore,
      findingCount: v.findings.length,
      criticalCount: v.criticalCount,
      highCount: v.highCount,
      timestamp: v.timestamp ?? new Date().toISOString(),
      findings: v.findings.map((f) => ({
        ruleId: f.ruleId,
        severity: f.severity,
        title: f.title,
        description: f.description,
        recommendation: f.recommendation,
        lineNumbers: f.lineNumbers,
        confidence: f.confidence,
      })),
    })),
  };

  const output = JSON.stringify(apiExport, null, 2);

  if (outputPath) {
    writeFileSync(outputPath, output);
    console.log(`API export written to ${outputPath} (${verdicts.length} review(s))`);
    return;
  }

  console.log(output);
}

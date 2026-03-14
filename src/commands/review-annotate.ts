/**
 * Review-annotate — Generate GitHub-compatible PR annotations from findings.
 */

import { readFileSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Annotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: string;
  message: string;
  title: string;
}

// ─── Severity mapping ──────────────────────────────────────────────────────

function severityToLevel(severity: string): string {
  switch (severity) {
    case "critical":
    case "high":
      return "failure";
    case "medium":
      return "warning";
    default:
      return "notice";
  }
}

// ─── Annotation generation ─────────────────────────────────────────────────

function findingToAnnotation(finding: Finding, defaultPath: string): Annotation {
  const line = finding.lineNumbers?.[0] || 1;

  return {
    path: defaultPath,
    start_line: line,
    end_line: line,
    annotation_level: severityToLevel(finding.severity || "low"),
    title: `[${finding.severity || "low"}] ${finding.ruleId || "unknown"}`,
    message:
      `${finding.title}\n\n${finding.description || ""}\n\nRecommendation: ${finding.recommendation || "Review this finding."}`.trim(),
  };
}

// ─── Output formatters ─────────────────────────────────────────────────────

function formatGitHubActions(annotations: Annotation[]): string {
  return annotations
    .map((a) => {
      const level = a.annotation_level === "failure" ? "error" : a.annotation_level;
      const msg = a.message.replace(/\n/g, "%0A");
      return `::${level} file=${a.path},line=${a.start_line},title=${a.title}::${msg}`;
    })
    .join("\n");
}

function formatCheckRun(annotations: Annotation[]): string {
  return JSON.stringify(
    {
      name: "Judges Panel Review",
      conclusion: annotations.some((a) => a.annotation_level === "failure") ? "failure" : "success",
      output: {
        title: "Judges Panel Review",
        summary: `${annotations.length} annotation(s) from Judges Panel review`,
        annotations: annotations.slice(0, 50),
      },
    },
    null,
    2,
  );
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAnnotate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-annotate — Generate PR annotations from findings

Usage:
  judges review-annotate --input verdict.json --file src/app.ts
  judges review-annotate --input verdict.json --style github-actions
  judges review-annotate --input verdict.json --style check-run
  judges review-annotate --format json

Options:
  --input <file>       TribunalVerdict JSON file (required)
  --file <path>        Source file path for annotations (default: "unknown")
  --style <type>       Output style: github-actions, check-run, json (default: github-actions)
  --min-severity <s>   Minimum severity to annotate (default: low)
  --limit <n>          Maximum annotations (default: 50, GitHub limit)
  --format json        Raw JSON annotations
  --help, -h           Show this help

Styles:
  github-actions       ::error/::warning/::notice workflow commands
  check-run            Check Run API payload format
  json                 Raw annotation JSON array

Generates annotations compatible with GitHub Actions workflow commands
or Check Run API payloads.
`);
    return;
  }

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "unknown";
  const style = argv.find((_a: string, i: number) => argv[i - 1] === "--style") || "github-actions";
  const minSev = argv.find((_a: string, i: number) => argv[i - 1] === "--min-severity") || "low";
  const limitStr = argv.find((_a: string, i: number) => argv[i - 1] === "--limit");
  const limit = limitStr ? parseInt(limitStr, 10) : 50;
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!inputPath) {
    console.error("Error: --input is required. Provide a verdict JSON file.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(inputPath, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Cannot read or parse ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const minLevel = sevOrder[minSev] ?? 3;

  let findings = (verdict.findings || []).filter((f) => (sevOrder[f.severity || "low"] ?? 3) <= minLevel);
  findings = findings.slice(0, limit);

  const annotations = findings.map((f) => findingToAnnotation(f, filePath));

  if (format === "json") {
    console.log(JSON.stringify(annotations, null, 2));
    return;
  }

  switch (style) {
    case "check-run":
      console.log(formatCheckRun(annotations));
      break;
    case "json":
      console.log(JSON.stringify(annotations, null, 2));
      break;
    default:
      console.log(formatGitHubActions(annotations));
      break;
  }
}

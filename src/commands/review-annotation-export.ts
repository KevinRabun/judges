/**
 * Review-annotation-export — Export review findings as code annotations.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Annotation {
  type: "error" | "warning" | "notice";
  ruleId: string;
  title: string;
  message: string;
  line: number;
  endLine?: number;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function toAnnotations(verdict: TribunalVerdict): Annotation[] {
  const annotations: Annotation[] = [];

  for (const f of verdict.findings) {
    const lines = f.lineNumbers || [];
    const sev = (f.severity || "medium").toLowerCase();
    const type: Annotation["type"] =
      sev === "critical" || sev === "high" ? "error" : sev === "medium" ? "warning" : "notice";

    if (lines.length === 0) {
      annotations.push({
        type,
        ruleId: f.ruleId,
        title: f.title,
        message: `${f.description}\n\nRecommendation: ${f.recommendation}`,
        line: 1,
      });
    } else {
      annotations.push({
        type,
        ruleId: f.ruleId,
        title: f.title,
        message: `${f.description}\n\nRecommendation: ${f.recommendation}`,
        line: lines[0],
        endLine: lines.length > 1 ? lines[lines.length - 1] : undefined,
      });
    }
  }

  return annotations;
}

function toGitHubFormat(annotations: Annotation[]): string {
  return annotations
    .map((a) => {
      const lineRef = a.endLine ? `line=${a.line},endLine=${a.endLine}` : `line=${a.line}`;
      return `::${a.type} ${lineRef},title=${a.ruleId}: ${a.title}::${a.message.replace(/\n/g, "%0A")}`;
    })
    .join("\n");
}

function toInlineComments(annotations: Annotation[]): string {
  return annotations.map((a) => `// [${a.type.toUpperCase()}] L${a.line}: ${a.ruleId} — ${a.title}`).join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAnnotationExport(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "github";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-annotation-export — Export findings as annotations

Usage:
  judges review-annotation-export --file <verdict.json> [--output <file>]
                                  [--format github|inline|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --output <path>    Write annotations to file
  --format <fmt>     Format: github (default), inline, json
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const annotations = toAnnotations(verdict);

  let output: string;
  if (format === "json") {
    output = JSON.stringify(annotations, null, 2);
  } else if (format === "inline") {
    output = toInlineComments(annotations);
  } else {
    output = toGitHubFormat(annotations);
  }

  if (outputPath) {
    writeFileSync(outputPath, output);
    console.log(`Annotations written to ${outputPath} (${annotations.length} annotations)`);
    return;
  }

  console.log(output);
}

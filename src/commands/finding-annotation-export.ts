import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-annotation-export ──────────────────────────────────────
   Export findings as code annotations in formats compatible with
   IDEs and CI systems (VS Code problem matchers, GitHub annotations,
   SARIF-like inline comments). All output is local files.
   ─────────────────────────────────────────────────────────────────── */

interface Annotation {
  ruleId: string;
  severity: string;
  title: string;
  message: string;
  startLine: number;
  endLine: number;
}

function toAnnotations(findings: Finding[]): Annotation[] {
  const annotations: Annotation[] = [];

  for (const f of findings) {
    const startLine = f.lineNumbers !== undefined && f.lineNumbers.length > 0 ? f.lineNumbers[0] : 1;
    const endLine =
      f.lineNumbers !== undefined && f.lineNumbers.length > 1 ? f.lineNumbers[f.lineNumbers.length - 1] : startLine;

    annotations.push({
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      message: f.description,
      startLine,
      endLine,
    });
  }

  return annotations;
}

function formatGitHub(annotations: Annotation[]): string {
  const lines: string[] = [];
  for (const a of annotations) {
    const level = a.severity === "critical" || a.severity === "high" ? "error" : "warning";
    lines.push(`::${level} title=${a.ruleId}::${a.title} (line ${a.startLine}): ${a.message}`);
  }
  return lines.join("\n");
}

function formatProblemMatcher(annotations: Annotation[]): string {
  const lines: string[] = [];
  for (const a of annotations) {
    lines.push(`${a.ruleId}:${a.startLine}:${a.endLine}: ${a.severity}: ${a.title} - ${a.message}`);
  }
  return lines.join("\n");
}

export function runFindingAnnotationExport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-annotation-export [options]

Export findings as code annotations for IDEs and CI systems.

Options:
  --report <path>     Path to verdict JSON file
  --output <path>     Output file path (default: stdout)
  --type <type>       Annotation type: github, problem-matcher, json (default: json)
  --format <fmt>      Output format: table (default) or json
  -h, --help          Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    console.log("Run a review first or provide --report.");
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to export.");
    return;
  }

  const annotations = toAnnotations(findings);

  const typeIdx = argv.indexOf("--type");
  const annotationType = typeIdx !== -1 && argv[typeIdx + 1] ? argv[typeIdx + 1] : "json";

  let output: string;
  if (annotationType === "github") {
    output = formatGitHub(annotations);
  } else if (annotationType === "problem-matcher") {
    output = formatProblemMatcher(annotations);
  } else {
    output = JSON.stringify(annotations, null, 2);
  }

  const outputIdx = argv.indexOf("--output");
  if (outputIdx !== -1 && argv[outputIdx + 1]) {
    const outPath = join(process.cwd(), argv[outputIdx + 1]);
    const outDir = join(outPath, "..");
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(outPath, output);
    console.log(`Annotations exported to: ${outPath}`);
    return;
  }

  if (format === "json" || annotationType === "json") {
    console.log(output);
    return;
  }

  console.log("\n=== Finding Annotations ===\n");
  console.log(`Type: ${annotationType}`);
  console.log(`Findings: ${annotations.length}\n`);
  console.log(output);
}

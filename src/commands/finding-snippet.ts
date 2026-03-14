/**
 * Finding-snippet — Extract and share finding code snippets with context.
 */

import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSnippet(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-snippet — Extract code snippets from findings

Usage:
  judges finding-snippet --file <results> [options]

Options:
  --file <path>       Results file with findings (required)
  --source <path>     Source file to extract snippets from
  --context <n>       Lines of context around finding (default: 3)
  --index <n>         Extract snippet for finding at index N
  --format json       JSON output
  --help, -h          Show this help

Extracts code snippets from findings with surrounding context lines.
`);
    return;
  }

  const resultsFile = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!resultsFile) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(resultsFile)) {
    console.error(`Error: file not found: ${resultsFile}`);
    process.exitCode = 1;
    return;
  }

  const sourceFile = argv.find((_a: string, i: number) => argv[i - 1] === "--source");
  const contextLines = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--context") || "3", 10);
  const indexStr = argv.find((_a: string, i: number) => argv[i - 1] === "--index");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  let findings: Array<{
    title?: string;
    description?: string;
    severity?: string;
    lineNumbers?: number[];
    ruleId?: string;
  }>;
  try {
    const data = JSON.parse(readFileSync(resultsFile, "utf-8"));
    findings = Array.isArray(data) ? data : data.findings || [];
  } catch {
    console.error("Error: could not parse results file");
    process.exitCode = 1;
    return;
  }

  if (indexStr !== undefined) {
    const idx = parseInt(indexStr, 10);
    if (idx < 0 || idx >= findings.length) {
      console.error(`Error: index ${idx} out of range (0-${findings.length - 1})`);
      process.exitCode = 1;
      return;
    }
    findings = [findings[idx]];
  }

  // Load source lines if available
  let sourceLines: string[] = [];
  if (sourceFile && existsSync(sourceFile)) {
    sourceLines = readFileSync(sourceFile, "utf-8").split("\n");
  }

  const snippets: Array<{ finding: string; severity: string; lines: number[]; snippet: string }> = [];

  for (const f of findings) {
    const title = f.title || f.ruleId || "Unknown";
    const severity = f.severity || "medium";
    const lines = f.lineNumbers || [];

    let snippet: string;
    if (sourceLines.length > 0 && lines.length > 0) {
      const minLine = Math.max(0, Math.min(...lines) - 1 - contextLines);
      const maxLine = Math.min(sourceLines.length, Math.max(...lines) + contextLines);
      const extracted = sourceLines.slice(minLine, maxLine);
      snippet = extracted
        .map((l, i) => {
          const lineNum = minLine + i + 1;
          const marker = lines.includes(lineNum) ? ">>>" : "   ";
          return `${marker} ${String(lineNum).padStart(4)} | ${l}`;
        })
        .join("\n");
    } else {
      snippet = f.description || "(no source available)";
    }

    snippets.push({ finding: title, severity, lines, snippet });
  }

  if (format === "json") {
    console.log(JSON.stringify(snippets, null, 2));
    return;
  }

  console.log(`\nCode Snippets (${snippets.length} findings):`);
  console.log("═".repeat(60));
  for (const s of snippets) {
    console.log(`\n[${s.severity.toUpperCase()}] ${s.finding}`);
    if (s.lines.length > 0) console.log(`  Lines: ${s.lines.join(", ")}`);
    console.log("─".repeat(60));
    console.log(s.snippet);
    console.log("─".repeat(60));
  }
}

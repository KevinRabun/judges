/**
 * Finding-patch-preview — Preview how patches would modify source files.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingPatchPreview(argv: string[]): void {
  const reportIdx = argv.indexOf("--report");
  const sourceIdx = argv.indexOf("--source");
  const contextIdx = argv.indexOf("--context");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const contextLines = contextIdx >= 0 ? parseInt(argv[contextIdx + 1], 10) : 3;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-patch-preview — Preview patch modifications

Usage:
  judges finding-patch-preview --report <path> --source <path>
                               [--context <n>] [--format table|json]

Options:
  --report <path>   Report file with findings
  --source <path>   Source file to preview patches against
  --context <n>     Context lines around changes (default: 3)
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help
`);
    return;
  }

  if (reportIdx < 0 || sourceIdx < 0) {
    console.error("Missing --report <path> and --source <path>");
    process.exitCode = 1;
    return;
  }

  const reportPath = argv[reportIdx + 1];
  const sourcePath = argv[sourceIdx + 1];

  if (!existsSync(reportPath)) {
    console.error(`Report not found: ${reportPath}`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf-8")) as { findings?: Finding[] };
  const findings = (report.findings ?? []).filter((f) => f.patch !== undefined && f.patch !== null);
  const sourceContent = readFileSync(sourcePath, "utf-8");
  const sourceLines = sourceContent.split("\n");

  if (findings.length === 0) {
    console.log("No findings with patches to preview.");
    return;
  }

  interface PatchPreview {
    ruleId: string;
    title: string;
    patchSnippet: string;
    applicable: boolean;
    affectedLines: number[];
  }

  const previews: PatchPreview[] = [];

  for (const f of findings) {
    const patchStr = String(f.patch);
    const patchLines = patchStr.split("\n");
    const firstLine = patchLines[0] ?? "";
    const lineIdx = sourceLines.findIndex((l) => l.includes(firstLine.trim()));

    const applicable = lineIdx >= 0;
    const start = Math.max(0, lineIdx - contextLines);
    const end = Math.min(sourceLines.length - 1, lineIdx + contextLines);

    const affectedLines: number[] = [];
    if (applicable) {
      for (let i = start; i <= end; i++) {
        affectedLines.push(i + 1);
      }
    }

    const snippet = applicable
      ? sourceLines
          .slice(start, end + 1)
          .map((l, i) => {
            const lineNum = start + i + 1;
            const marker = lineNum === lineIdx + 1 ? ">" : " ";
            return `${marker} ${String(lineNum).padStart(4)} | ${l}`;
          })
          .join("\n")
      : "(patch target not found in source)";

    previews.push({
      ruleId: f.ruleId,
      title: f.title,
      patchSnippet: snippet,
      applicable,
      affectedLines,
    });
  }

  if (format === "json") {
    console.log(JSON.stringify(previews, null, 2));
    return;
  }

  console.log(`\nPatch Preview — ${sourcePath}`);
  console.log("═".repeat(70));

  for (const p of previews) {
    const status = p.applicable ? "APPLICABLE" : "NOT FOUND";
    console.log(`\n  [${status}] ${p.ruleId} — ${p.title}`);
    console.log("  " + "─".repeat(60));
    console.log(p.patchSnippet);
  }

  const applicableCount = previews.filter((p) => p.applicable).length;
  console.log(`\n  ${applicableCount}/${previews.length} patches applicable`);
  console.log("═".repeat(70));
}

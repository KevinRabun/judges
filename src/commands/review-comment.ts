/**
 * Review-comment — Generate inline source code comments from review findings.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CommentBlock {
  line: number;
  text: string;
}

type CommentStyle = "line" | "block" | "jsdoc";

const COMMENT_STYLES: Record<string, { line: string; blockStart: string; blockEnd: string }> = {
  javascript: { line: "//", blockStart: "/*", blockEnd: "*/" },
  typescript: { line: "//", blockStart: "/*", blockEnd: "*/" },
  python: { line: "#", blockStart: '"""', blockEnd: '"""' },
  ruby: { line: "#", blockStart: "=begin", blockEnd: "=end" },
  java: { line: "//", blockStart: "/*", blockEnd: "*/" },
  csharp: { line: "//", blockStart: "/*", blockEnd: "*/" },
  go: { line: "//", blockStart: "/*", blockEnd: "*/" },
  rust: { line: "//", blockStart: "/*", blockEnd: "*/" },
  cpp: { line: "//", blockStart: "/*", blockEnd: "*/" },
  c: { line: "//", blockStart: "/*", blockEnd: "*/" },
};

function getCommentStyle(lang: string): { line: string; blockStart: string; blockEnd: string } {
  return COMMENT_STYLES[lang.toLowerCase()] || COMMENT_STYLES["javascript"];
}

function formatComment(finding: Finding, style: { line: string }, commentStyle: CommentStyle): string {
  const severity = (finding.severity || "info").toUpperCase();
  const rule = finding.ruleId || "JUDGES";
  const title = finding.title || "Finding";

  if (commentStyle === "line") {
    const lines = [`${style.line} JUDGES [${severity}] ${rule}: ${title}`];
    if (finding.recommendation) {
      lines.push(`${style.line}   Fix: ${finding.recommendation}`);
    }
    return lines.join("\n");
  }

  if (commentStyle === "jsdoc") {
    const lines = [`/** JUDGES [${severity}] ${rule}: ${title}`];
    if (finding.recommendation) {
      lines.push(` *  Fix: ${finding.recommendation}`);
    }
    lines.push(" */");
    return lines.join("\n");
  }

  // block
  const lines = [`/* JUDGES [${severity}] ${rule}: ${title}`];
  if (finding.recommendation) {
    lines.push(`   Fix: ${finding.recommendation}`);
  }
  lines.push("*/");
  return lines.join("\n");
}

function generateComments(findings: Finding[], lang: string, style: CommentStyle): CommentBlock[] {
  const cs = getCommentStyle(lang);
  const blocks: CommentBlock[] = [];

  for (const f of findings) {
    const line = f.lineNumbers && f.lineNumbers.length > 0 ? f.lineNumbers[0] : 1;
    blocks.push({ line, text: formatComment(f, cs, style) });
  }

  // Sort by line descending so insertions don't shift subsequent lines
  blocks.sort((a, b) => b.line - a.line);
  return blocks;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewComment(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-comment — Generate inline code comments from findings

Usage:
  judges review-comment --verdict verdict.json --source app.ts
  judges review-comment --verdict verdict.json --source app.py --lang python
  judges review-comment --verdict verdict.json --preview

Options:
  --verdict <path>       Verdict JSON file
  --source <path>        Source file to annotate (optional; preview without)
  --lang <language>      Language (auto-detected from extension)
  --style line|block|jsdoc  Comment style (default: line)
  --output <path>        Write annotated file to path (default: modifies in-place)
  --preview              Show comments without modifying files
  --min-severity <sev>   Only include findings at this severity or above
  --format json          JSON output
  --help, -h             Show this help

Generates inline code comments from review findings. Comments include
severity, rule ID, title, and fix recommendation.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const verdictFile = argv.find((_a: string, i: number) => argv[i - 1] === "--verdict");
  const sourceFile = argv.find((_a: string, i: number) => argv[i - 1] === "--source");
  const lang = argv.find((_a: string, i: number) => argv[i - 1] === "--lang") || "";
  const styleArg = argv.find((_a: string, i: number) => argv[i - 1] === "--style") || "line";
  const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");
  const preview = argv.includes("--preview");
  const minSev = argv.find((_a: string, i: number) => argv[i - 1] === "--min-severity");

  if (!verdictFile) {
    console.error("Error: --verdict is required.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(verdictFile)) {
    console.error(`Error: File not found: ${verdictFile}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(verdictFile, "utf-8")) as TribunalVerdict;
  } catch {
    console.error(`Error: Could not parse ${verdictFile}`);
    process.exitCode = 1;
    return;
  }

  let findings = verdict.findings || [];

  // Severity filter
  if (minSev) {
    const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    const threshold = sevOrder[minSev.toLowerCase()] ?? 0;
    findings = findings.filter((f) => (sevOrder[(f.severity || "").toLowerCase()] ?? 0) >= threshold);
  }

  // Detect language from source file extension
  const detectedLang = lang || (sourceFile ? sourceFile.split(".").pop() || "ts" : "ts");
  const languageMap: Record<string, string> = {
    ts: "typescript",
    js: "javascript",
    py: "python",
    rb: "ruby",
    java: "java",
    cs: "csharp",
    go: "go",
    rs: "rust",
    cpp: "cpp",
    c: "c",
  };
  const resolvedLang = languageMap[detectedLang] || detectedLang;
  const commentStyle = (["line", "block", "jsdoc"].includes(styleArg) ? styleArg : "line") as CommentStyle;

  const comments = generateComments(findings, resolvedLang, commentStyle);

  if (format === "json") {
    console.log(JSON.stringify({ language: resolvedLang, style: commentStyle, comments }, null, 2));
    return;
  }

  if (preview || !sourceFile) {
    console.log(
      `\n  Review Comments Preview (${resolvedLang}, ${commentStyle} style)\n  ─────────────────────────────`,
    );
    for (const c of [...comments].reverse()) {
      console.log(`\n  Line ${c.line}:`);
      for (const line of c.text.split("\n")) {
        console.log(`    ${line}`);
      }
    }
    console.log(`\n  Total: ${comments.length} comment(s)\n`);
    return;
  }

  // Insert comments into source file
  if (!existsSync(sourceFile)) {
    console.error(`Error: Source file not found: ${sourceFile}`);
    process.exitCode = 1;
    return;
  }

  const sourceLines = readFileSync(sourceFile, "utf-8").split("\n");
  for (const c of comments) {
    const insertAt = Math.max(0, c.line - 1);
    sourceLines.splice(insertAt, 0, c.text);
  }

  const dest = outputFile || sourceFile;
  writeFileSync(dest, sourceLines.join("\n"), "utf-8");
  console.log(`Inserted ${comments.length} comment(s) into ${dest}`);
}

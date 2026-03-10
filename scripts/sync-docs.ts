#!/usr/bin/env npx tsx
// ─── Documentation Sync Script ──────────────────────────────────────────────
// Synchronize documentation files with the canonical JUDGES array.
//
// Usage:
//   npx tsx scripts/sync-docs.ts          # sync all docs
//   npm run sync-docs                     # same, via npm script
//
// This script is the single point of truth for judge counts, tables, and
// arrays across all static files. When a judge is added or removed, run
// this script instead of manually editing 20+ files.
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { JUDGES } from "../src/judges/index.js";

const ROOT = resolve(import.meta.dirname, "..");
const COUNT = JUDGES.length;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

function write(rel: string, content: string): void {
  writeFileSync(join(ROOT, rel), content, "utf-8");
}

/** Detect the file's line ending style. */
function eol(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

/** Normalize generated content to match the file's line ending. */
function normalizeEol(generated: string, fileEol: string): string {
  return generated.replace(/\r\n/g, "\n").replace(/\n/g, fileEol);
}

/**
 * Replace content between start/end markers, keeping the markers.
 * Generated content is normalized to the file's line ending.
 */
function replaceMarkerSection(content: string, startMarker: string, endMarker: string, newContent: string): string {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    console.warn(`  ⚠  markers not found: ${startMarker}`);
    return content;
  }
  const nl = eol(content);
  const normalized = normalizeEol(newContent, nl);
  return content.substring(0, startIdx + startMarker.length) + nl + normalized + nl + content.substring(endIdx);
}

/**
 * Replace judge-count patterns in text.
 * Only matches numbers followed by judge-specific keywords, so unrelated
 * numbers (line numbers, scores, GDPR articles, etc.) are untouched.
 */
function replaceJudgeCounts(text: string): string {
  text = text.replace(/\b\d+ specialized judges\b/g, `${COUNT} specialized judges`);
  text = text.replace(/\b\d+ judges\b/g, `${COUNT} judges`);
  text = text.replace(/\b\d+-judge\b/g, `${COUNT}-judge`);
  text = text.replace(/\b\d+ domains\b/g, `${COUNT} domains`);
  text = text.replace(/\b\d+ expert-persona\b/g, `${COUNT} expert-persona`);
  text = text.replace(/\b\d+ specialized reviewers\b/g, `${COUNT} specialized reviewers`);
  text = text.replace(/\b\d+ deterministic evaluators\b/g, `${COUNT} deterministic evaluators`);
  text = text.replace(/\b\d+ evaluation domains\b/g, `${COUNT} evaluation domains`);
  text = text.replace(/\b\d+ evaluators\b/g, `${COUNT} evaluators`);
  // "and N more dimensions" where N = COUNT - 5 (5 dimensions explicitly named)
  text = text.replace(/and \d+ more dimensions/g, `and ${COUNT - 5} more dimensions`);
  return text;
}

// ─── Table / Array Generators ────────────────────────────────────────────────

function generateJudgeTable(): string {
  const lines = [
    "| Judge | Domain | Rule Prefix | What It Evaluates |",
    "|-------|--------|-------------|-------------------|",
  ];
  for (const j of JUDGES) {
    const displayName = j.name.replace(/^Judge\s+/, "");
    lines.push(`| **${displayName}** | ${j.domain} | \`${j.rulePrefix}-\` | ${j.tableDescription} |`);
  }
  return lines.join("\n");
}

function generatePromptsTable(): string {
  const lines = ["| Prompt | Description |", "|--------|-------------|"];
  for (const j of JUDGES) {
    lines.push(`| \`judge-${j.id}\` | ${j.promptDescription} |`);
  }
  lines.push(`| \`full-tribunal\` | all ${COUNT} judges in a single prompt |`);
  return lines.join("\n");
}

function generateHtmlJudgesArray(): string {
  const lines = ["    const judges = ["];
  for (const j of JUDGES) {
    const displayName = j.name.replace(/^Judge\s+/, "");
    // Escape any double quotes in descriptions for JS string safety
    const desc = j.tableDescription.replace(/"/g, '\\"');
    lines.push(`      { name: "${displayName}", desc: "${desc}" },`);
  }
  lines.push("    ];");
  return lines.join("\n");
}

// ─── File Syncers ────────────────────────────────────────────────────────────

function syncReadme(): void {
  let content = read("README.md");
  content = replaceJudgeCounts(content);
  content = replaceMarkerSection(
    content,
    "<!-- JUDGES_TABLE_START -->",
    "<!-- JUDGES_TABLE_END -->",
    generateJudgeTable(),
  );
  content = replaceMarkerSection(
    content,
    "<!-- PROMPTS_TABLE_START -->",
    "<!-- PROMPTS_TABLE_END -->",
    generatePromptsTable(),
  );
  write("README.md", content);
  console.log("  ✅ README.md");
}

function syncDocsIndex(): void {
  let content = read("docs/index.html");
  content = replaceJudgeCounts(content);
  // Stat card: <div class="value accent">NN</div>
  content = content.replace(/<div class="value accent">\d+<\/div>/, `<div class="value accent">${COUNT}</div>`);
  // Heading: The NN Judges
  content = content.replace(/The \d+ Judges/, `The ${COUNT} Judges`);
  // JS comment + inline text: All NN judges
  content = content.replace(/All \d+ judges/g, `All ${COUNT} judges`);
  // Regenerate JS array between markers
  content = replaceMarkerSection(content, "// JUDGES_ARRAY_START", "// JUDGES_ARRAY_END", generateHtmlJudgesArray());
  write("docs/index.html", content);
  console.log("  ✅ docs/index.html");
}

function syncCountFile(rel: string): void {
  const content = read(rel);
  const updated = replaceJudgeCounts(content);
  if (updated !== content) {
    write(rel, updated);
    console.log(`  ✅ ${rel}`);
  } else {
    console.log(`  ── ${rel} (no changes)`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\nSyncing documentation with ${COUNT} judges...\n`);

syncReadme();
syncDocsIndex();

const countFiles = [
  "package.json",
  "server.json",
  "action.yml",
  "Dockerfile",
  "docs/playground.html",
  "docs/api-reference.md",
  "docs/migration-guides.md",
  "docs/real-world-evidence.md",
  "vscode-extension/package.json",
  "vscode-extension/README.md",
  "vscode-extension/src/chat-participant.ts",
  "vscode-extension/src/extension.ts",
  "examples/quickstart.ts",
];

for (const rel of countFiles) {
  syncCountFile(rel);
}

console.log(`\n✅ All files synced to ${COUNT} judges.\n`);

/**
 * Review-changelog-gen — Auto-generate changelog entries from review findings and fixes.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ChangelogEntry {
  date: string;
  type: "fix" | "improvement" | "security";
  description: string;
  ruleIds: string[];
}

// ─── Generation ─────────────────────────────────────────────────────────────

function generateEntries(verdict: TribunalVerdict): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const date = new Date().toISOString().slice(0, 10);
  const ruleGroups = new Map<string, { rules: string[]; severity: string; count: number }>();

  for (const f of verdict.findings || []) {
    const prefix = (f.ruleId || "UNKNOWN").split("-")[0];
    const group = ruleGroups.get(prefix) || { rules: [], severity: String(f.severity || "medium"), count: 0 };
    if (f.ruleId && !group.rules.includes(f.ruleId)) group.rules.push(f.ruleId);
    group.count++;
    ruleGroups.set(prefix, group);
  }

  for (const [prefix, group] of ruleGroups) {
    const type: "fix" | "improvement" | "security" =
      group.severity === "critical" || group.severity === "high" ? "security" : "improvement";
    entries.push({
      date,
      type,
      description: `Address ${group.count} ${prefix} finding(s) (${group.severity} severity)`,
      ruleIds: group.rules,
    });
  }

  return entries;
}

function formatMarkdown(entries: ChangelogEntry[], version: string): string {
  const lines: string[] = [];
  lines.push(`## [${version}] — ${entries[0]?.date || new Date().toISOString().slice(0, 10)}`);
  lines.push("");

  const security = entries.filter((e) => e.type === "security");
  const fixes = entries.filter((e) => e.type === "fix");
  const improvements = entries.filter((e) => e.type === "improvement");

  if (security.length > 0) {
    lines.push("### Security");
    for (const e of security) {
      lines.push(`- ${e.description} (${e.ruleIds.join(", ")})`);
    }
    lines.push("");
  }
  if (fixes.length > 0) {
    lines.push("### Fixed");
    for (const e of fixes) {
      lines.push(`- ${e.description} (${e.ruleIds.join(", ")})`);
    }
    lines.push("");
  }
  if (improvements.length > 0) {
    lines.push("### Improved");
    for (const e of improvements) {
      lines.push(`- ${e.description} (${e.ruleIds.join(", ")})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewChangelogGen(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-changelog-gen — Generate changelog entries from review findings

Usage:
  judges review-changelog-gen --file verdict.json  Generate from verdict
  judges review-changelog-gen --file v.json --version 1.2.0  With version
  judges review-changelog-gen --file v.json --output CHANGES.md  Save to file

Options:
  --file <path>         Verdict JSON file
  --version <ver>       Version string (default: "Unreleased")
  --output <path>       Save output to file
  --format json         JSON output
  --help, -h            Show this help

Auto-generates changelog entries from review findings for documentation.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  const version = argv.find((_a: string, i: number) => argv[i - 1] === "--version") || "Unreleased";
  const output = argv.find((_a: string, i: number) => argv[i - 1] === "--output");

  if (!file || !existsSync(file)) {
    console.error("Error: --file with valid verdict JSON is required.");
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
  } catch {
    console.error("Error: Failed to parse verdict file.");
    process.exitCode = 1;
    return;
  }

  const entries = generateEntries(verdict);

  if (entries.length === 0) {
    console.log("No findings to generate changelog entries from.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  const md = formatMarkdown(entries, version);

  if (output) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, md, "utf-8");
    console.log(`Changelog entries saved to ${output}`);
    return;
  }

  console.log(md);
}

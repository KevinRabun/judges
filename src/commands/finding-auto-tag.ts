/**
 * Finding-auto-tag — Automatically tag findings based on content analysis.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaggedFinding {
  ruleId: string;
  title: string;
  severity: string;
  tags: string[];
}

// ─── Tag Rules ──────────────────────────────────────────────────────────────

const TAG_PATTERNS: Array<{ tag: string; patterns: string[] }> = [
  { tag: "security", patterns: ["auth", "crypt", "inject", "xss", "csrf", "vuln", "secret", "password"] },
  { tag: "performance", patterns: ["perf", "optim", "cache", "memory", "latency", "n+1"] },
  { tag: "data-validation", patterns: ["valid", "sanitiz", "input", "schema", "type-check"] },
  { tag: "error-handling", patterns: ["error", "exception", "catch", "throw", "fault"] },
  { tag: "dependency", patterns: ["depend", "import", "require", "package", "vulnerab"] },
  { tag: "configuration", patterns: ["config", "env", "setting", "option", "flag"] },
  { tag: "api", patterns: ["api", "endpoint", "route", "request", "response"] },
  { tag: "database", patterns: ["sql", "query", "database", "orm", "migration"] },
  { tag: "testing", patterns: ["test", "mock", "stub", "assert", "coverage"] },
  { tag: "logging", patterns: ["log", "monitor", "trace", "debug", "audit"] },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function autoTag(verdict: TribunalVerdict): TaggedFinding[] {
  return verdict.findings.map((f) => {
    const combined = `${f.ruleId} ${f.title} ${f.description}`.toLowerCase();
    const tags: string[] = [];

    for (const rule of TAG_PATTERNS) {
      if (rule.patterns.some((p) => combined.includes(p))) {
        tags.push(rule.tag);
      }
    }

    if (tags.length === 0) tags.push("general");

    return {
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
      tags,
    };
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAutoTag(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const tagIdx = argv.indexOf("--tag");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const filterTag = tagIdx >= 0 ? argv[tagIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-auto-tag — Auto-tag findings by content

Usage:
  judges finding-auto-tag --file <verdict.json> [--tag <filter>]
                          [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
  --tag <tag>        Filter by tag (e.g., security, performance)
  --format <fmt>     Output format: table (default), json
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

  let tagged = autoTag(verdict);
  if (filterTag) {
    tagged = tagged.filter((t) => t.tags.includes(filterTag));
  }

  if (format === "json") {
    console.log(JSON.stringify(tagged, null, 2));
    return;
  }

  // tag summary
  const tagCounts = new Map<string, number>();
  for (const t of tagged) {
    for (const tag of t.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  console.log(`\nAuto-Tagged Findings (${tagged.length})`);
  console.log("═".repeat(70));
  console.log("  Tag Summary:");
  for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${tag.padEnd(20)} ${count}`);
  }
  console.log("─".repeat(70));
  console.log(`${"Rule".padEnd(20)} ${"Severity".padEnd(10)} ${"Tags".padEnd(30)} Title`);
  console.log("─".repeat(70));

  for (const t of tagged) {
    const rule = t.ruleId.length > 18 ? t.ruleId.slice(0, 18) + "…" : t.ruleId;
    const title = t.title.length > 20 ? t.title.slice(0, 20) + "…" : t.title;
    const tags = t.tags.join(", ");
    const tagsStr = tags.length > 28 ? tags.slice(0, 28) + "…" : tags;
    console.log(`${rule.padEnd(20)} ${t.severity.padEnd(10)} ${tagsStr.padEnd(30)} ${title}`);
  }
  console.log("═".repeat(70));
}

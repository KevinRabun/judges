/**
 * Finding-pattern-match — Match findings against custom patterns.
 */

import type { Finding, TribunalVerdict } from "../types.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MatchPattern {
  name: string;
  rulePattern: string;
  titlePattern: string;
  severities: string[];
  action: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function patternsFile(): string {
  return join(process.cwd(), ".judges", "match-patterns.json");
}

function loadPatterns(): MatchPattern[] {
  const f = patternsFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function savePatterns(patterns: MatchPattern[]): void {
  const f = patternsFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(patterns, null, 2));
}

function matchFinding(finding: Finding, pattern: MatchPattern): boolean {
  if (pattern.rulePattern && !finding.ruleId.includes(pattern.rulePattern)) return false;
  if (pattern.titlePattern && !finding.title.toLowerCase().includes(pattern.titlePattern.toLowerCase())) return false;
  if (pattern.severities.length > 0 && !pattern.severities.includes(finding.severity)) return false;
  return true;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingPatternMatch(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges finding-pattern-match — Match findings against custom patterns

Usage:
  judges finding-pattern-match apply  --file <results.json> [--format json]
  judges finding-pattern-match add    --name <name> [--rule <pattern>] [--title <pattern>] [--severity <list>] [--action <act>]
  judges finding-pattern-match list
  judges finding-pattern-match remove --name <name>
  judges finding-pattern-match clear

Options:
  --name <name>       Pattern name
  --rule <pattern>    Substring to match in ruleId
  --title <pattern>   Substring to match in title
  --severity <list>   Comma-separated severities
  --action <act>      Action: flag, suppress, escalate (default: flag)
  --format json       JSON output
  --help, -h          Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const patterns = loadPatterns();

  if (sub === "apply") {
    const file = args.find((_a: string, i: number) => args[i - 1] === "--file");
    const format = args.find((_a: string, i: number) => args[i - 1] === "--format") || "text";
    if (!file) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(file)) {
      console.error(`Error: file not found: ${file}`);
      process.exitCode = 1;
      return;
    }

    let verdict: TribunalVerdict;
    try {
      verdict = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      console.error("Error: could not parse file");
      process.exitCode = 1;
      return;
    }

    const findings = verdict.findings || [];
    const matches = findings.map((f) => {
      const matched = patterns.filter((p) => matchFinding(f, p));
      return { ...f, matchedPatterns: matched.map((p) => p.name), actions: matched.map((p) => p.action) };
    });
    const withMatches = matches.filter((m) => m.matchedPatterns.length > 0);

    if (format === "json") {
      console.log(JSON.stringify({ total: findings.length, matched: withMatches.length, findings: matches }, null, 2));
      return;
    }

    console.log(`\nPattern Match Results:`);
    console.log("═".repeat(65));
    console.log(`  ${withMatches.length} of ${findings.length} findings matched ${patterns.length} patterns`);
    console.log("─".repeat(65));

    for (const m of withMatches.slice(0, 20)) {
      const acts = [...new Set(m.actions)].join(", ");
      console.log(`  ${m.ruleId.padEnd(22)} [${acts}]  patterns: ${m.matchedPatterns.join(", ")}`);
    }
    if (withMatches.length > 20) console.log(`  ... and ${withMatches.length - 20} more`);
    console.log("═".repeat(65));
  } else if (sub === "add") {
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    const ruleP = args.find((_a: string, i: number) => args[i - 1] === "--rule") || "";
    const titleP = args.find((_a: string, i: number) => args[i - 1] === "--title") || "";
    const sevStr = args.find((_a: string, i: number) => args[i - 1] === "--severity") || "";
    const action = args.find((_a: string, i: number) => args[i - 1] === "--action") || "flag";

    patterns.push({
      name,
      rulePattern: ruleP,
      titlePattern: titleP,
      severities: sevStr ? sevStr.split(",") : [],
      action,
    });
    savePatterns(patterns);
    console.log(`Added pattern: ${name}`);
  } else if (sub === "list") {
    if (patterns.length === 0) {
      console.log("No patterns defined.");
      return;
    }
    console.log(`\nMatch Patterns (${patterns.length}):`);
    console.log("═".repeat(55));
    for (const p of patterns) {
      console.log(`  ${p.name.padEnd(18)} [${p.action}]  rule:${p.rulePattern || "*"} title:${p.titlePattern || "*"}`);
    }
    console.log("═".repeat(55));
  } else if (sub === "remove") {
    const name = args.find((_a: string, i: number) => args[i - 1] === "--name");
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    const filtered = patterns.filter((p) => p.name !== name);
    if (filtered.length === patterns.length) {
      console.error(`Pattern "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    savePatterns(filtered);
    console.log(`Removed pattern: ${name}`);
  } else if (sub === "clear") {
    savePatterns([]);
    console.log("All patterns cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}

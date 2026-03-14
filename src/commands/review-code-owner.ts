/**
 * Review-code-owner — Map findings to CODEOWNERS entries.
 *
 * Cross-references findings with CODEOWNERS file to identify
 * responsible teams/individuals for each finding.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OwnerRule {
  pattern: string;
  owners: string[];
}

interface FindingOwnership {
  ruleId: string;
  title: string;
  severity: string;
  owners: string[];
  matchedPattern: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseCodeowners(content: string): OwnerRule[] {
  const rules: OwnerRule[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
      rules.push({ pattern: parts[0], owners: parts.slice(1) });
    }
  }
  return rules;
}

function findCodeownersFile(): string | null {
  const candidates = [
    join(process.cwd(), "CODEOWNERS"),
    join(process.cwd(), ".github", "CODEOWNERS"),
    join(process.cwd(), "docs", "CODEOWNERS"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function matchPattern(filePath: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("/")) return filePath.startsWith(pattern) || filePath.includes("/" + pattern);
  if (pattern.startsWith("*.")) return filePath.endsWith(pattern.slice(1));
  if (pattern.includes("*")) {
    const prefix = pattern.split("*")[0];
    return filePath.startsWith(prefix) || filePath.includes(prefix);
  }
  return filePath.includes(pattern);
}

function inferFilePath(title: string): string {
  const match = title.match(/in\s+[`']?(\S+\.\w{1,5})[`']?/i);
  return match ? match[1] : "";
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCodeOwner(argv: string[]): void {
  const verdictIdx = argv.indexOf("--verdict");
  const ownersIdx = argv.indexOf("--owners");
  const formatIdx = argv.indexOf("--format");
  const verdictPath = verdictIdx >= 0 ? argv[verdictIdx + 1] : undefined;
  const ownersPath = ownersIdx >= 0 ? argv[ownersIdx + 1] : findCodeownersFile();
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-code-owner — Map findings to CODEOWNERS

Usage:
  judges review-code-owner --verdict <verdict.json> [--owners <CODEOWNERS>]
                            [--format table|json]

Options:
  --verdict <path>   Path to verdict JSON file (required)
  --owners <path>    Path to CODEOWNERS file (auto-detected)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!verdictPath) {
    console.error("Error: --verdict required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(verdictPath)) {
    console.error(`Error: verdict not found: ${verdictPath}`);
    process.exitCode = 1;
    return;
  }
  if (!ownersPath) {
    console.error("Error: CODEOWNERS file not found. Use --owners to specify.");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(ownersPath)) {
    console.error(`Error: CODEOWNERS not found: ${ownersPath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(verdictPath, "utf-8"));
  } catch {
    console.error("Error: invalid verdict JSON");
    process.exitCode = 1;
    return;
  }

  const rules = parseCodeowners(readFileSync(ownersPath, "utf-8"));
  const results: FindingOwnership[] = [];

  for (const f of verdict.findings) {
    const filePath = inferFilePath(f.title);
    let matched = false;

    // Match against CODEOWNERS rules (last match wins, per GitHub convention)
    for (let i = rules.length - 1; i >= 0; i--) {
      if (filePath && matchPattern(filePath, rules[i].pattern)) {
        results.push({
          ruleId: f.ruleId,
          title: f.title,
          severity: f.severity || "medium",
          owners: rules[i].owners,
          matchedPattern: rules[i].pattern,
        });
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Check for wildcard default owner
      const defaultRule = rules.find((r) => r.pattern === "*");
      results.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity || "medium",
        owners: defaultRule ? defaultRule.owners : ["unassigned"],
        matchedPattern: defaultRule ? "*" : "none",
      });
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nFinding Ownership (${results.length} findings)`);
  console.log("═".repeat(70));
  console.log(`${"Owner(s)".padEnd(25)} ${"Severity".padEnd(10)} Title`);
  console.log("─".repeat(70));

  for (const r of results) {
    const owners = r.owners.join(", ");
    const ownerStr = owners.length > 23 ? owners.slice(0, 23) + "…" : owners;
    const sev = (r.severity || "medium").padEnd(10);
    const title = r.title.length > 30 ? r.title.slice(0, 30) + "…" : r.title;
    console.log(`${ownerStr.padEnd(25)} ${sev} ${title}`);
  }

  // Owner summary
  const ownerCounts = new Map<string, number>();
  for (const r of results) {
    for (const o of r.owners) {
      ownerCounts.set(o, (ownerCounts.get(o) || 0) + 1);
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log("Owner Summary:");
  for (const [owner, count] of [...ownerCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${owner}: ${count} finding(s)`);
  }
  console.log("═".repeat(70));
}

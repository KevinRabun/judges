/**
 * Review-finding-link — Link related findings together.
 *
 * Identifies findings that share common patterns, lines, or rules
 * and links them together for holistic remediation.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FindingLink {
  findingA: { ruleId: string; title: string };
  findingB: { ruleId: string; title: string };
  linkType: string;
  strength: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findLinks(verdict: TribunalVerdict): FindingLink[] {
  const links: FindingLink[] = [];
  const findings = verdict.findings;

  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i];
      const b = findings[j];
      let strength = 0;
      const linkTypes: string[] = [];

      // Same rule
      if (a.ruleId === b.ruleId) {
        strength += 3;
        linkTypes.push("same-rule");
      }

      // Shared line numbers
      if (a.lineNumbers && b.lineNumbers) {
        const shared = a.lineNumbers.filter((ln) => b.lineNumbers!.includes(ln));
        if (shared.length > 0) {
          strength += 2;
          linkTypes.push("shared-lines");
        }
      }

      // Similar titles (word overlap)
      const wordsA = new Set(a.title.toLowerCase().split(/\s+/));
      const wordsB = new Set(b.title.toLowerCase().split(/\s+/));
      const commonWords = [...wordsA].filter((w) => wordsB.has(w) && w.length > 3);
      if (commonWords.length >= 2) {
        strength += 1;
        linkTypes.push("similar-title");
      }

      // Same severity
      if ((a.severity || "medium") === (b.severity || "medium")) {
        strength += 0.5;
      }

      if (strength >= 2) {
        links.push({
          findingA: { ruleId: a.ruleId, title: a.title },
          findingB: { ruleId: b.ruleId, title: b.title },
          linkType: linkTypes.join(", "),
          strength,
        });
      }
    }
  }

  return links.sort((a, b) => b.strength - a.strength);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewFindingLink(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const minIdx = argv.indexOf("--min-strength");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const minStrength = minIdx >= 0 ? parseFloat(argv[minIdx + 1]) : 2;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-finding-link — Link related findings

Usage:
  judges review-finding-link --file <verdict.json> [--format table|json]
                              [--min-strength <n>]

Options:
  --file <path>           Path to verdict JSON file (required)
  --format <fmt>          Output format: table (default), json
  --min-strength <n>      Minimum link strength (default: 2)
  --help, -h              Show this help
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

  const links = findLinks(verdict).filter((l) => l.strength >= minStrength);

  if (format === "json") {
    console.log(JSON.stringify(links, null, 2));
    return;
  }

  if (links.length === 0) {
    console.log("No linked findings detected.");
    return;
  }

  console.log(`\nLinked Findings (${links.length} links)`);
  console.log("═".repeat(70));

  for (const l of links) {
    console.log(`\n  [Strength: ${l.strength}] ${l.linkType}`);
    console.log(`  A: ${l.findingA.title} (${l.findingA.ruleId})`);
    console.log(`  B: ${l.findingB.title} (${l.findingB.ruleId})`);
  }

  console.log("\n" + "═".repeat(70));
}

/**
 * Finding-evidence-chain — Build evidence chains across related findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict, Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EvidenceLink {
  fromRuleId: string;
  fromTitle: string;
  toRuleId: string;
  toTitle: string;
  relationship: string;
  strength: "strong" | "moderate" | "weak";
}

interface EvidenceChain {
  chainId: number;
  rootFinding: string;
  links: EvidenceLink[];
  totalFindings: number;
  maxSeverity: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEV_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function findRelationship(a: Finding, b: Finding): { rel: string; strength: "strong" | "moderate" | "weak" } | null {
  const aDesc = `${a.title} ${a.description || ""} ${a.ruleId}`.toLowerCase();
  const bDesc = `${b.title} ${b.description || ""} ${b.ruleId}`.toLowerCase();

  // same rule category
  const aCat = a.ruleId.split("/")[0] || a.ruleId.split("-")[0];
  const bCat = b.ruleId.split("/")[0] || b.ruleId.split("-")[0];

  if (a.ruleId === b.ruleId) {
    return { rel: "same-rule", strength: "strong" };
  }

  if (aCat === bCat && aCat.length > 2) {
    return { rel: "same-category", strength: "moderate" };
  }

  // check for shared line numbers
  if (a.lineNumbers && b.lineNumbers) {
    const aLines = new Set(a.lineNumbers);
    const hasOverlap = b.lineNumbers.some((l) => aLines.has(l));
    if (hasOverlap) {
      return { rel: "shared-location", strength: "strong" };
    }
  }

  // Check for description keyword overlap
  const aWords = new Set(aDesc.split(/\s+/).filter((w) => w.length > 4));
  const bWords = new Set(bDesc.split(/\s+/).filter((w) => w.length > 4));
  let shared = 0;
  for (const w of aWords) {
    if (bWords.has(w)) shared++;
  }
  if (shared >= 3) {
    return { rel: "related-description", strength: "weak" };
  }

  return null;
}

function buildChains(findings: Finding[]): EvidenceChain[] {
  const chains: EvidenceChain[] = [];
  const used = new Set<number>();

  for (let i = 0; i < findings.length; i++) {
    if (used.has(i)) continue;

    const links: EvidenceLink[] = [];
    const members = [i];
    used.add(i);

    for (let j = i + 1; j < findings.length; j++) {
      if (used.has(j)) continue;

      // check relationship with any member of the chain
      for (const m of members) {
        const rel = findRelationship(findings[m], findings[j]);
        if (rel) {
          links.push({
            fromRuleId: findings[m].ruleId,
            fromTitle: findings[m].title,
            toRuleId: findings[j].ruleId,
            toTitle: findings[j].title,
            relationship: rel.rel,
            strength: rel.strength,
          });
          members.push(j);
          used.add(j);
          break;
        }
      }
    }

    if (links.length === 0) continue;

    const sevs = members.map((m) => (findings[m].severity || "medium").toLowerCase());
    const maxSev = sevs.reduce((a, b) => ((SEV_ORDER[a] || 0) >= (SEV_ORDER[b] || 0) ? a : b));

    chains.push({
      chainId: chains.length + 1,
      rootFinding: findings[i].ruleId,
      links,
      totalFindings: members.length,
      maxSeverity: maxSev,
    });
  }

  return chains.sort((a, b) => b.totalFindings - a.totalFindings);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingEvidenceChain(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-evidence-chain — Build evidence chains across findings

Usage:
  judges finding-evidence-chain --file <verdict.json> [--format table|json]

Options:
  --file <path>      Path to verdict JSON file (required)
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

  if (verdict.findings.length === 0) {
    console.log("No findings to chain.");
    return;
  }

  const chains = buildChains(verdict.findings);

  if (chains.length === 0) {
    console.log("No evidence chains found — findings appear unrelated.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(chains, null, 2));
    return;
  }

  console.log(`\nEvidence Chains (${chains.length} chains)`);
  console.log("═".repeat(65));

  for (const c of chains) {
    console.log(`\nChain #${c.chainId} — ${c.totalFindings} findings (max severity: ${c.maxSeverity})`);
    console.log(`  Root: ${c.rootFinding}`);
    for (const link of c.links) {
      const arrow = link.strength === "strong" ? "══>" : link.strength === "moderate" ? "──>" : "··>";
      console.log(`  ${link.fromRuleId} ${arrow} ${link.toRuleId} [${link.relationship}]`);
    }
  }

  console.log("\n" + "═".repeat(65));
}

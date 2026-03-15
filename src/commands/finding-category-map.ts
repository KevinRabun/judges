/**
 * Finding-category-map — Map findings to categories and display category breakdown.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CategoryEntry {
  category: string;
  domain: string;
  findings: Array<{ ruleId: string; title: string; severity: string }>;
  count: number;
}

// ─── Category Mapping ──────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  security: ["auth", "crypt", "inject", "xss", "csrf", "vuln", "secret", "password", "token", "session"],
  performance: ["perf", "optim", "cache", "memory", "latency", "throughput", "bottleneck"],
  quality: ["quality", "complex", "duplic", "maintai", "readab", "smell", "debt"],
  compliance: ["compl", "gdpr", "hipaa", "sox", "pci", "regulat", "policy", "privacy"],
  reliability: ["error", "exception", "fault", "retry", "timeout", "availab", "resilien"],
  data: ["data", "validat", "sanitiz", "input", "schema", "format"],
};

function categorize(ruleId: string, title: string, description: string, domain: string): string {
  const combined = `${ruleId} ${title} ${description} ${domain}`.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      return category;
    }
  }
  return "general";
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function buildCategoryMap(verdict: TribunalVerdict): CategoryEntry[] {
  const judges = defaultRegistry.getJudges();
  const catMap = new Map<string, CategoryEntry>();

  for (const f of verdict.findings) {
    const judge = judges.find((j) => f.ruleId.startsWith(j.rulePrefix));
    const domain = judge ? judge.domain : "unknown";
    const category = categorize(f.ruleId, f.title, f.description, domain);

    const entry = catMap.get(category) || { category, domain, findings: [], count: 0 };
    entry.findings.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: (f.severity || "medium").toLowerCase(),
    });
    entry.count++;
    catMap.set(category, entry);
  }

  return [...catMap.values()].sort((a, b) => b.count - a.count);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingCategoryMap(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-category-map — Map findings to categories

Usage:
  judges finding-category-map --file <verdict.json> [--format table|json]

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

  const categories = buildCategoryMap(verdict);

  if (format === "json") {
    console.log(JSON.stringify(categories, null, 2));
    return;
  }

  console.log(`\nFinding Category Map (${verdict.findings.length} findings)`);
  console.log("═".repeat(65));

  for (const cat of categories) {
    const pct = ((cat.count / verdict.findings.length) * 100).toFixed(0);
    console.log(`\n  ${cat.category.toUpperCase()} (${cat.count} findings, ${pct}%)`);
    console.log("  " + "─".repeat(60));

    for (const f of cat.findings.slice(0, 5)) {
      const rule = f.ruleId.length > 18 ? f.ruleId.slice(0, 18) + "…" : f.ruleId;
      const title = f.title.length > 35 ? f.title.slice(0, 35) + "…" : f.title;
      console.log(`    [${f.severity.padEnd(8)}] ${rule.padEnd(20)} ${title}`);
    }
    if (cat.findings.length > 5) {
      console.log(`    ... +${cat.findings.length - 5} more`);
    }
  }
  console.log("\n" + "═".repeat(65));
}

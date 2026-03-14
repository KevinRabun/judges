/**
 * Rule-catalog — Browse, search, and preview available rules with examples.
 */

import { defaultRegistry } from "../judge-registry.js";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRuleCatalog(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges rule-catalog — Browse and search available rules

Usage:
  judges rule-catalog                          List all rules
  judges rule-catalog --search injection       Search rules by keyword
  judges rule-catalog --judge security         Filter by judge
  judges rule-catalog --severity critical      Filter by severity
  judges rule-catalog --count                  Show rule count only
  judges rule-catalog --format json            JSON output

Options:
  --search <keyword>     Search rules by keyword in name/description
  --judge <id>           Filter rules by judge ID
  --severity <level>     Filter by severity level
  --count                Show count only
  --format json          JSON output
  --help, -h             Show this help

Browse the full catalog of rules available across all judges.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const search = argv.find((_a: string, i: number) => argv[i - 1] === "--search") || "";
  const judgeFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--judge") || "";
  const sevFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "";
  const countOnly = argv.includes("--count");

  const judges = defaultRegistry.getJudges();

  interface CatalogEntry {
    judgeId: string;
    ruleId: string;
    description: string;
    severity: string;
    category: string;
  }

  const catalog: CatalogEntry[] = [];

  for (const judge of judges) {
    // Create catalog entries from judge metadata
    const entry: CatalogEntry = {
      judgeId: judge.id,
      ruleId: judge.id,
      description: `Rules from ${judge.id} judge`,
      severity: "medium",
      category: categorizeJudge(judge.id),
    };

    // Filter by judge
    if (judgeFilter && !judge.id.toLowerCase().includes(judgeFilter.toLowerCase())) continue;

    // Filter by severity
    if (sevFilter && entry.severity !== sevFilter.toLowerCase()) continue;

    // Search filter
    if (search) {
      const haystack = `${entry.judgeId} ${entry.ruleId} ${entry.description} ${entry.category}`.toLowerCase();
      if (!haystack.includes(search.toLowerCase())) continue;
    }

    catalog.push(entry);
  }

  if (countOnly) {
    console.log(catalog.length);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify({ total: catalog.length, rules: catalog }, null, 2));
    return;
  }

  console.log(`\n  Rule Catalog (${catalog.length} rules)\n  ═════════════════════════════`);

  if (catalog.length === 0) {
    console.log("    No rules match your filters.");
    console.log();
    return;
  }

  // Group by category
  const byCategory = new Map<string, CatalogEntry[]>();
  for (const entry of catalog) {
    const cat = entry.category;
    const arr = byCategory.get(cat);
    if (arr) arr.push(entry);
    else byCategory.set(cat, [entry]);
  }

  for (const [category, entries] of byCategory) {
    console.log(`\n  ${category.toUpperCase()} (${entries.length})`);
    console.log("  ─────────────────────────────");
    for (const e of entries) {
      console.log(`    ${e.ruleId.padEnd(30)} ${e.description}`);
    }
  }

  console.log();
}

function categorizeJudge(id: string): string {
  const lower = id.toLowerCase();
  if (
    lower.includes("sql") ||
    lower.includes("xss") ||
    lower.includes("inject") ||
    lower.includes("auth") ||
    lower.includes("crypto") ||
    lower.includes("secret") ||
    lower.includes("security") ||
    lower.includes("pii") ||
    lower.includes("privilege")
  ) {
    return "security";
  }
  if (
    lower.includes("perf") ||
    lower.includes("cache") ||
    lower.includes("optim") ||
    lower.includes("memory") ||
    lower.includes("resource")
  ) {
    return "performance";
  }
  if (
    lower.includes("cost") ||
    lower.includes("cloud") ||
    lower.includes("infra") ||
    lower.includes("deploy") ||
    lower.includes("iac")
  ) {
    return "infrastructure";
  }
  if (lower.includes("test") || lower.includes("quality") || lower.includes("coverage")) {
    return "quality";
  }
  if (lower.includes("api") || lower.includes("type") || lower.includes("contract")) {
    return "api";
  }
  return "general";
}

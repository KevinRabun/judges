import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-auto-categorize ────────────────────────────────────────
   Auto-categorize findings by domain (security, performance,
   maintainability, correctness, style) based on rule ID prefixes
   and title patterns to help organize triage workflows.
   ─────────────────────────────────────────────────────────────────── */

interface CategoryGroup {
  category: string;
  findings: Array<{ ruleId: string; severity: string; title: string }>;
  count: number;
}

const CATEGORY_PATTERNS: Array<{ category: string; prefixes: string[]; keywords: string[] }> = [
  {
    category: "Security",
    prefixes: ["SEC", "INJ", "XSS", "AUTH", "CSRF", "SSRF", "PRIV", "CRYPT"],
    keywords: ["injection", "vulnerability", "authentication", "authorization", "secret", "credential"],
  },
  {
    category: "Performance",
    prefixes: ["PERF", "OPT", "MEM"],
    keywords: ["performance", "latency", "memory", "cache", "bottleneck", "slow"],
  },
  {
    category: "Correctness",
    prefixes: ["BUG", "ERR", "NULL", "TYPE", "RACE"],
    keywords: ["error", "null", "undefined", "race condition", "type", "assertion"],
  },
  {
    category: "Maintainability",
    prefixes: ["MAINT", "COMPLEX", "DUP", "DEBT"],
    keywords: ["complexity", "duplicate", "dead code", "refactor", "debt"],
  },
  {
    category: "Style",
    prefixes: ["STYLE", "FMT", "LINT", "NAME"],
    keywords: ["naming", "format", "convention", "whitespace", "indent"],
  },
];

function categorize(findings: Finding[]): CategoryGroup[] {
  const groups = new Map<string, Array<{ ruleId: string; severity: string; title: string }>>();

  for (const f of findings) {
    let matched = false;
    for (const pattern of CATEGORY_PATTERNS) {
      const prefixMatch = pattern.prefixes.some((p) => f.ruleId.startsWith(p));
      const keywordMatch = pattern.keywords.some((k) => f.title.toLowerCase().includes(k));
      if (prefixMatch || keywordMatch) {
        const group = groups.get(pattern.category);
        const entry = { ruleId: f.ruleId, severity: f.severity, title: f.title };
        if (group !== undefined) {
          group.push(entry);
        } else {
          groups.set(pattern.category, [entry]);
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      const other = groups.get("Other");
      const entry = { ruleId: f.ruleId, severity: f.severity, title: f.title };
      if (other !== undefined) {
        other.push(entry);
      } else {
        groups.set("Other", [entry]);
      }
    }
  }

  const result: CategoryGroup[] = [];
  for (const [category, items] of groups) {
    result.push({ category, findings: items, count: items.length });
  }
  result.sort((a, b) => b.count - a.count);
  return result;
}

export function runFindingAutoCategorize(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-auto-categorize [options]

Auto-categorize findings by domain.

Options:
  --report <path>    Path to verdict JSON file
  --format <fmt>     Output format: table (default) or json
  -h, --help         Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to categorize.");
    return;
  }

  const groups = categorize(findings);

  if (format === "json") {
    console.log(JSON.stringify(groups, null, 2));
    return;
  }

  console.log("\n=== Auto-Categorized Findings ===\n");
  for (const g of groups) {
    console.log(`[${g.category}] — ${g.count} finding(s)`);
    for (const f of g.findings) {
      console.log(`  ${f.ruleId} (${f.severity}): ${f.title}`);
    }
    console.log();
  }
}

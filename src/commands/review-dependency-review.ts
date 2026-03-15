import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-dependency-review ───────────────────────────────────────
   Identify dependency-related findings and summarize the
   dependency risk landscape of the review.  All analysis is local
   based on finding rule prefixes and metadata.
   ─────────────────────────────────────────────────────────────────── */

interface DependencyRisk {
  ruleId: string;
  title: string;
  severity: string;
  category: string;
  recommendation: string;
}

interface DependencySummary {
  totalDependencyFindings: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  risks: DependencyRisk[];
}

const DEP_KEYWORDS = [
  "dependency",
  "dep",
  "import",
  "require",
  "package",
  "module",
  "library",
  "npm",
  "version",
  "outdated",
  "vulnerable",
  "supply-chain",
];

function isDependencyRelated(f: Finding): boolean {
  const lower = `${f.ruleId} ${f.title} ${f.description}`.toLowerCase();
  return DEP_KEYWORDS.some((kw) => lower.includes(kw));
}

function categorizeDep(f: Finding): string {
  const lower = `${f.ruleId} ${f.title} ${f.description}`.toLowerCase();
  if (lower.includes("vulnerable") || lower.includes("cve")) return "vulnerability";
  if (lower.includes("outdated") || lower.includes("version")) return "outdated";
  if (lower.includes("supply-chain") || lower.includes("integrity")) return "supply-chain";
  if (lower.includes("unused") || lower.includes("dead")) return "unused";
  return "general";
}

function analyzeDependencies(findings: Finding[]): DependencySummary {
  const depFindings = findings.filter(isDependencyRelated);
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const risks: DependencyRisk[] = [];

  for (const f of depFindings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    const cat = categorizeDep(f);
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    risks.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      category: cat,
      recommendation: f.recommendation,
    });
  }

  return {
    totalDependencyFindings: depFindings.length,
    bySeverity,
    byCategory,
    risks,
  };
}

export function runReviewDependencyReview(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-dependency-review [options]

Review dependency-related findings and risks.

Options:
  --report <path>      Path to verdict JSON file
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
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

  const summary = analyzeDependencies(findings);

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("\n=== Dependency Review ===\n");
  console.log(`Dependency findings: ${summary.totalDependencyFindings} of ${findings.length} total\n`);

  if (summary.totalDependencyFindings === 0) {
    console.log("No dependency-related findings detected.");
    return;
  }

  console.log("By severity:");
  for (const [sev, count] of Object.entries(summary.bySeverity)) {
    console.log(`  ${sev}: ${count}`);
  }

  console.log("\nBy category:");
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log("\nRisks:");
  for (const r of summary.risks) {
    console.log(`  [${r.severity.toUpperCase()}] ${r.ruleId}: ${r.title} (${r.category})`);
  }
}

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-dependency-impact ──────────────────────────────────────
   Show the impact of dependency-related findings by identifying
   findings linked to third-party packages and assessing their
   blast radius. All analysis runs locally.
   ─────────────────────────────────────────────────────────────────── */

interface DependencyFinding {
  ruleId: string;
  title: string;
  severity: string;
  isDependencyRelated: boolean;
  impactLevel: string;
  recommendation: string;
}

interface DependencyImpact {
  totalFindings: number;
  dependencyFindings: number;
  percentage: number;
  findings: DependencyFinding[];
}

const DEP_PATTERNS = [
  "dependency",
  "dep-",
  "package",
  "npm",
  "import",
  "require",
  "module",
  "library",
  "vendor",
  "third-party",
  "outdated",
  "vulnerable",
  "cve",
  "supply-chain",
];

function analyzeDependencyImpact(verdict: TribunalVerdict): DependencyImpact {
  const findings: DependencyFinding[] = [];

  for (const f of verdict.findings ?? []) {
    const combined = (f.ruleId + " " + f.title + " " + f.recommendation).toLowerCase();
    const isDep = DEP_PATTERNS.some((p) => combined.includes(p));

    let impactLevel: string;
    if (f.severity === "critical") impactLevel = "Critical — immediate action required";
    else if (f.severity === "high") impactLevel = "High — affects production security";
    else if (isDep) impactLevel = "Moderate — dependency risk present";
    else impactLevel = "Low — minimal dependency impact";

    findings.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      isDependencyRelated: isDep,
      impactLevel,
      recommendation: f.recommendation,
    });
  }

  const depFindings = findings.filter((f) => f.isDependencyRelated);
  findings.sort((a, b) => {
    if (a.isDependencyRelated && !b.isDependencyRelated) return -1;
    if (!a.isDependencyRelated && b.isDependencyRelated) return 1;
    return 0;
  });

  return {
    totalFindings: findings.length,
    dependencyFindings: depFindings.length,
    percentage: findings.length > 0 ? Math.round((depFindings.length / findings.length) * 100) : 0,
    findings,
  };
}

export function runFindingDependencyImpact(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-dependency-impact [options]

Show impact of dependency-related findings.

Options:
  --report <path>      Path to verdict JSON
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
  const impact = analyzeDependencyImpact(data);

  if (format === "json") {
    console.log(JSON.stringify(impact, null, 2));
    return;
  }

  console.log(
    `\n=== Dependency Impact (${impact.dependencyFindings}/${impact.totalFindings} = ${impact.percentage}%) ===\n`,
  );

  const depFindings = impact.findings.filter((f) => f.isDependencyRelated);
  if (depFindings.length === 0) {
    console.log("No dependency-related findings detected.");
    return;
  }

  for (const f of depFindings) {
    console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}`);
    console.log(`           ${f.title}`);
    console.log(`           Impact: ${f.impactLevel}`);
    console.log();
  }
}

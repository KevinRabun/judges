import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-security-posture ────────────────────────────────────────
   Summarize the security posture implied by review findings —
   categorize by threat domain, compute risk scores, and provide
   an overall security health assessment.
   ─────────────────────────────────────────────────────────────────── */

interface SecurityDomain {
  domain: string;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  riskScore: number;
}

interface PostureSummary {
  overallRisk: string;
  totalSecurityFindings: number;
  domains: SecurityDomain[];
  topThreats: { ruleId: string; title: string; severity: string }[];
}

const SECURITY_PREFIXES = ["SEC", "AUTH", "CRYPTO", "INJECT", "XSS", "SSRF", "IDOR", "CORS"];

function isSecurityFinding(f: Finding): boolean {
  const prefix = f.ruleId.split("-")[0].toUpperCase();
  if (SECURITY_PREFIXES.includes(prefix)) return true;
  const lower = `${f.title} ${f.description}`.toLowerCase();
  return lower.includes("security") || lower.includes("vulnerab") || lower.includes("exploit");
}

function getDomain(f: Finding): string {
  const prefix = f.ruleId.split("-")[0].toUpperCase();
  if (SECURITY_PREFIXES.includes(prefix)) return prefix;
  return "GENERAL";
}

function analyzePosture(findings: Finding[]): PostureSummary {
  const secFindings = findings.filter(isSecurityFinding);
  const domainMap = new Map<string, Finding[]>();

  for (const f of secFindings) {
    const domain = getDomain(f);
    const list = domainMap.get(domain) ?? [];
    list.push(f);
    domainMap.set(domain, list);
  }

  const domains: SecurityDomain[] = [];
  for (const [domain, dFindings] of domainMap) {
    const critCount = dFindings.filter((f) => f.severity === "critical").length;
    const highCount = dFindings.filter((f) => f.severity === "high").length;
    const riskScore = critCount * 10 + highCount * 5 + dFindings.length;
    domains.push({
      domain,
      findingCount: dFindings.length,
      criticalCount: critCount,
      highCount,
      riskScore,
    });
  }

  domains.sort((a, b) => b.riskScore - a.riskScore);

  const topThreats = secFindings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 5)
    .map((f) => ({ ruleId: f.ruleId, title: f.title, severity: f.severity }));

  const totalRisk = domains.reduce((s, d) => s + d.riskScore, 0);
  let overallRisk: string;
  if (totalRisk === 0) overallRisk = "Low";
  else if (totalRisk <= 10) overallRisk = "Moderate";
  else if (totalRisk <= 30) overallRisk = "High";
  else overallRisk = "Critical";

  return {
    overallRisk,
    totalSecurityFindings: secFindings.length,
    domains,
    topThreats,
  };
}

export function runReviewSecurityPosture(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-security-posture [options]

Assess security posture from review findings.

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
  const summary = analyzePosture(findings);

  if (format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`\n=== Security Posture: ${summary.overallRisk} Risk ===\n`);
  console.log(`Security findings: ${summary.totalSecurityFindings} of ${findings.length} total\n`);

  if (summary.domains.length > 0) {
    console.log("Domains:");
    for (const d of summary.domains) {
      console.log(`  ${d.domain}: ${d.findingCount} findings (risk score: ${d.riskScore})`);
    }
  }

  if (summary.topThreats.length > 0) {
    console.log("\nTop Threats:");
    for (const t of summary.topThreats) {
      console.log(`  [${t.severity.toUpperCase()}] ${t.ruleId}: ${t.title}`);
    }
  }
  console.log();
}

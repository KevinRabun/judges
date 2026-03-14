/**
 * `judges dep-audit` — Dependency vulnerability correlation.
 *
 * Correlates code-level findings with known vulnerabilities in project
 * dependencies. Uses npm audit / pip audit output to enrich findings
 * with CVE data, adding urgency context to code review.
 *
 * Usage:
 *   judges dep-audit                             # Audit current directory
 *   judges dep-audit --format json               # JSON output
 *   judges dep-audit --correlate results.json     # Correlate with findings
 */

import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, join } from "path";
import type { Finding, Severity } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VulnerablePackage {
  /** Package name */
  name: string;
  /** Installed version */
  version: string;
  /** Vulnerability severity */
  severity: Severity;
  /** CVE identifier(s) */
  cves: string[];
  /** CWE identifier(s) */
  cwes: string[];
  /** Advisory title */
  title: string;
  /** URL for more information */
  url?: string;
  /** Fixed version (if known) */
  fixedIn?: string;
}

export interface DepAuditResult {
  /** Detected package manager */
  packageManager: "npm" | "pip" | "unknown";
  /** Vulnerable packages found */
  vulnerabilities: VulnerablePackage[];
  /** Total vulnerability count */
  totalVulnerabilities: number;
  /** Counts by severity */
  severityCounts: Record<Severity, number>;
  /** Correlations with code findings */
  correlations: Array<{
    vulnerability: VulnerablePackage;
    relatedFindings: Array<{ ruleId: string; title: string; reason: string }>;
  }>;
}

// ─── npm Audit ──────────────────────────────────────────────────────────────

function runNpmAudit(dir: string): VulnerablePackage[] {
  try {
    const output = execSync("npm audit --json 2>/dev/null || true", {
      cwd: dir,
      encoding: "utf-8",
      timeout: 30000,
    });

    const data = JSON.parse(output) as Record<string, unknown>;
    const vulns: VulnerablePackage[] = [];

    // npm audit v2 format (npm >= 7)
    const advisories = (data.vulnerabilities || {}) as Record<string, Record<string, unknown>>;
    for (const [name, info] of Object.entries(advisories)) {
      const severity = mapNpmSeverity(info.severity as string);
      const via = (info.via || []) as Array<Record<string, unknown> | string>;

      const cves: string[] = [];
      const cwes: string[] = [];
      let title = `Vulnerability in ${name}`;
      let url: string | undefined;

      for (const v of via) {
        if (typeof v === "object" && v !== null) {
          if (v.cve) cves.push(v.cve as string);
          if (v.cwe) {
            const cweArr = Array.isArray(v.cwe) ? v.cwe : [v.cwe];
            cwes.push(...cweArr.map((c: string) => c));
          }
          if (v.title) title = v.title as string;
          if (v.url) url = v.url as string;
        }
      }

      vulns.push({
        name,
        version: (info.version as string) || "unknown",
        severity,
        cves: [...new Set(cves)],
        cwes: [...new Set(cwes)],
        title,
        url,
        fixedIn: (info.fixAvailable as Record<string, string>)?.version,
      });
    }

    return vulns;
  } catch {
    return [];
  }
}

function mapNpmSeverity(sev: string): Severity {
  switch (sev) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "moderate":
      return "medium";
    case "low":
      return "low";
    default:
      return "info";
  }
}

// ─── pip Audit ──────────────────────────────────────────────────────────────

function runPipAudit(dir: string): VulnerablePackage[] {
  try {
    const output = execSync(
      "pip-audit --format=json 2>/dev/null || python -m pip_audit --format=json 2>/dev/null || true",
      {
        cwd: dir,
        encoding: "utf-8",
        timeout: 30000,
      },
    );

    if (!output.trim().startsWith("[")) return [];

    const data = JSON.parse(output) as Array<Record<string, unknown>>;
    return data
      .filter((entry) => entry.vulns && Array.isArray(entry.vulns) && (entry.vulns as Array<unknown>).length > 0)
      .map((entry) => {
        const vulnEntries = entry.vulns as Array<Record<string, string>>;
        return {
          name: entry.name as string,
          version: entry.version as string,
          severity: "high" as Severity,
          cves: vulnEntries.map((v) => v.id || "").filter(Boolean),
          cwes: [],
          title: `Vulnerability in ${entry.name}`,
          fixedIn: vulnEntries[0]?.fix_versions,
        };
      });
  } catch {
    return [];
  }
}

// ─── Correlation Engine ─────────────────────────────────────────────────────

/** CWE-to-rule mapping for correlating deps vulnerabilities with code findings */
const CWE_TO_RULE_PREFIX: Record<string, string[]> = {
  "CWE-79": ["SEC", "XSS"],
  "CWE-89": ["SEC", "SQLI"],
  "CWE-94": ["SEC"],
  "CWE-78": ["SEC", "CMD"],
  "CWE-22": ["SEC", "PATH"],
  "CWE-611": ["SEC"],
  "CWE-502": ["SEC"],
  "CWE-200": ["DATA"],
  "CWE-287": ["AUTH"],
  "CWE-306": ["AUTH"],
  "CWE-352": ["SEC", "CSRF"],
  "CWE-918": ["SEC", "SSRF"],
  "CWE-1321": ["SEC"],
  "CWE-400": ["PERF", "DOS"],
};

function correlateVulnsWithFindings(vulns: VulnerablePackage[], findings: Finding[]): DepAuditResult["correlations"] {
  const correlations: DepAuditResult["correlations"] = [];

  for (const vuln of vulns) {
    const related: Array<{ ruleId: string; title: string; reason: string }> = [];

    for (const finding of findings) {
      // Match by CWE
      if (finding.cweIds && vuln.cwes.length > 0) {
        const overlap = finding.cweIds.filter((cwe) => vuln.cwes.includes(cwe));
        if (overlap.length > 0) {
          related.push({
            ruleId: finding.ruleId,
            title: finding.title,
            reason: `Shares CWE: ${overlap.join(", ")} with vulnerable dep ${vuln.name}`,
          });
          continue;
        }
      }

      // Match by rule prefix → CWE category
      for (const cwe of vuln.cwes) {
        const prefixes = CWE_TO_RULE_PREFIX[cwe] || [];
        if (prefixes.some((p) => finding.ruleId.startsWith(p))) {
          related.push({
            ruleId: finding.ruleId,
            title: finding.title,
            reason: `Code pattern (${finding.ruleId}) relates to ${cwe} in vulnerable dep ${vuln.name}`,
          });
          break;
        }
      }
    }

    if (related.length > 0) {
      correlations.push({ vulnerability: vuln, relatedFindings: related });
    }
  }

  return correlations;
}

// ─── Main Audit Function ────────────────────────────────────────────────────

export function runDepAudit(dir: string, findings?: Finding[]): DepAuditResult {
  let packageManager: DepAuditResult["packageManager"] = "unknown";
  let vulns: VulnerablePackage[] = [];

  // Detect and run audit
  if (existsSync(join(dir, "package.json")) || existsSync(join(dir, "package-lock.json"))) {
    packageManager = "npm";
    vulns = runNpmAudit(dir);
  } else if (
    existsSync(join(dir, "requirements.txt")) ||
    existsSync(join(dir, "pyproject.toml")) ||
    existsSync(join(dir, "Pipfile"))
  ) {
    packageManager = "pip";
    vulns = runPipAudit(dir);
  }

  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const v of vulns) {
    severityCounts[v.severity]++;
  }

  const correlations = findings ? correlateVulnsWithFindings(vulns, findings) : [];

  return {
    packageManager,
    vulnerabilities: vulns,
    totalVulnerabilities: vulns.length,
    severityCounts,
    correlations,
  };
}

// ─── CLI Runner ─────────────────────────────────────────────────────────────

export function runDepAuditCommand(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges dep-audit — Dependency vulnerability correlation

Usage:
  judges dep-audit [dir]                        Audit dependencies
  judges dep-audit --correlate results.json     Correlate with code findings
  judges dep-audit --format json                JSON output

Supports:
  • npm (package.json / package-lock.json)
  • pip (requirements.txt / pyproject.toml / Pipfile)

Correlates dependency vulnerabilities with code findings by CWE mapping.

Options:
  --correlate <file>   Path to Judges JSON results file
  --format <fmt>       Output format: text, json
  --help, -h           Show this help
`);
    return;
  }

  const dir =
    argv.find((a, i) => i > 1 && !a.startsWith("-") && argv[i - 1] !== "--correlate" && argv[i - 1] !== "--format") ||
    ".";
  const format = argv.find((_a, i) => argv[i - 1] === "--format") || "text";
  const correlatePath = argv.find((_a, i) => argv[i - 1] === "--correlate");

  // Load findings for correlation if provided
  let findings: Finding[] | undefined;
  if (correlatePath && existsSync(correlatePath)) {
    try {
      const data = JSON.parse(readFileSync(correlatePath, "utf-8"));
      findings = data.findings || [];
    } catch {
      console.error(`Warning: Could not parse findings from ${correlatePath}`);
    }
  }

  console.log(`\n  Running dependency audit in ${resolve(dir)}...\n`);
  const result = runDepAudit(resolve(dir), findings);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Text output
  if (result.packageManager === "unknown") {
    console.log("  No supported package manifest found (package.json, requirements.txt, etc.)\n");
    return;
  }

  console.log(`  Package manager: ${result.packageManager}`);
  console.log(`  Vulnerabilities: ${result.totalVulnerabilities}\n`);

  if (result.totalVulnerabilities === 0) {
    console.log("  ✅ No known vulnerabilities found.\n");
    return;
  }

  // Severity breakdown
  for (const sev of ["critical", "high", "medium", "low", "info"] as Severity[]) {
    if (result.severityCounts[sev] > 0) {
      console.log(`  ${sev.toUpperCase().padEnd(10)} ${result.severityCounts[sev]}`);
    }
  }
  console.log("");

  // Top vulnerabilities
  for (const vuln of result.vulnerabilities.slice(0, 15)) {
    const fixInfo = vuln.fixedIn ? ` → fix: ${vuln.fixedIn}` : "";
    console.log(`  • [${vuln.severity.toUpperCase()}] ${vuln.name}@${vuln.version}: ${vuln.title}${fixInfo}`);
    if (vuln.cves.length > 0) {
      console.log(`    CVE: ${vuln.cves.join(", ")}`);
    }
  }

  // Correlations
  if (result.correlations.length > 0) {
    console.log(`\n  ─── Code ↔ Dependency Correlations ───\n`);
    for (const corr of result.correlations) {
      console.log(`  📦 ${corr.vulnerability.name} (${corr.vulnerability.cves.join(", ")})`);
      for (const rel of corr.relatedFindings) {
        console.log(`    ↳ ${rel.ruleId}: ${rel.reason}`);
      }
    }
  }

  console.log("");

  if (result.severityCounts.critical > 0 || result.severityCounts.high > 0) {
    process.exit(1);
  }
}

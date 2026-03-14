/**
 * Finding-dependency-check — Check findings related to dependency vulnerabilities.
 */

import { readFileSync, existsSync } from "fs";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDependencyCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-dependency-check — Analyze dependency-related findings

Usage:
  judges finding-dependency-check --file <results> [options]
  judges finding-dependency-check scan --lockfile <path>

Options:
  --file <path>        Results file with findings
  --lockfile <path>    package-lock.json or similar
  --min-severity <s>   Filter by minimum severity
  --format json        JSON output
  --help, -h           Show this help

Identifies findings related to dependency vulnerabilities.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => a === "scan");

  if (subcommand === "scan") {
    const lockfile = argv.find((_a: string, i: number) => argv[i - 1] === "--lockfile") || "package-lock.json";
    if (!existsSync(lockfile)) {
      console.error(`Error: lockfile not found: ${lockfile}`);
      process.exitCode = 1;
      return;
    }

    let lockData: {
      dependencies?: Record<string, { version?: string }>;
      packages?: Record<string, { version?: string }>;
    };
    try {
      lockData = JSON.parse(readFileSync(lockfile, "utf-8"));
    } catch {
      console.error("Error: could not parse lockfile");
      process.exitCode = 1;
      return;
    }

    const deps = lockData.dependencies || {};
    const depCount = Object.keys(deps).length;
    const pkgs = lockData.packages || {};
    const pkgCount = Object.keys(pkgs).length;

    if (format === "json") {
      console.log(JSON.stringify({ lockfile, dependencies: depCount, packages: pkgCount }, null, 2));
      return;
    }

    console.log(`\nDependency Scan: ${lockfile}`);
    console.log("═".repeat(45));
    console.log(`  Dependencies: ${depCount}`);
    console.log(`  Packages:     ${pkgCount}`);
    console.log("═".repeat(45));
    console.log("  Use 'judges eval' with dependency judges for full vulnerability analysis.");
    return;
  }

  // Analyze findings for dependency-related issues
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("Error: --file or scan subcommand required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(file)) {
    console.error(`Error: file not found: ${file}`);
    process.exitCode = 1;
    return;
  }

  const minSeverity = argv.find((_a: string, i: number) => argv[i - 1] === "--min-severity");
  const sevOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

  let findings: Array<{ ruleId?: string; severity?: string; title?: string; description?: string }>;
  try {
    const data = JSON.parse(readFileSync(file, "utf-8"));
    findings = Array.isArray(data) ? data : data.findings || [];
  } catch {
    console.error("Error: could not parse results file");
    process.exitCode = 1;
    return;
  }

  // Filter for dependency-related findings
  const depKeywords = [
    "dependency",
    "package",
    "module",
    "import",
    "require",
    "version",
    "cve",
    "vulnerability",
    "outdated",
    "deprecated",
  ];
  let depFindings = findings.filter((f) => {
    const text = `${f.ruleId || ""} ${f.title || ""} ${f.description || ""}`.toLowerCase();
    return depKeywords.some((k) => text.includes(k));
  });

  if (minSeverity) {
    const minLevel = sevOrder[minSeverity.toLowerCase()] || 0;
    depFindings = depFindings.filter((f) => (sevOrder[(f.severity || "medium").toLowerCase()] || 0) >= minLevel);
  }

  if (depFindings.length === 0) {
    console.log("No dependency-related findings.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(depFindings, null, 2));
    return;
  }

  console.log(`\nDependency-Related Findings (${depFindings.length}):`);
  console.log("═".repeat(65));
  for (const f of depFindings) {
    console.log(`  [${(f.severity || "medium").toUpperCase()}] ${f.ruleId || "?"}: ${f.title || ""}`);
  }
  console.log("═".repeat(65));
}

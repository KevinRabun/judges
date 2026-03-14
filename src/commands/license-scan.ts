/**
 * License scan — scans project dependencies for license
 * compatibility, flags copyleft/unknown licenses, and
 * generates a license obligations report.
 *
 * All data from local files.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LicenseInfo {
  dependency: string;
  version: string;
  license: string;
  category: "permissive" | "copyleft" | "weak-copyleft" | "proprietary" | "unknown";
  risk: "low" | "medium" | "high";
}

interface LicenseReport {
  licenses: LicenseInfo[];
  summary: { permissive: number; copyleft: number; weakCopyleft: number; proprietary: number; unknown: number };
  conflicts: string[];
  timestamp: string;
}

// ─── License DB ─────────────────────────────────────────────────────────────

const LICENSE_CATEGORIES: Record<string, { category: LicenseInfo["category"]; risk: LicenseInfo["risk"] }> = {
  MIT: { category: "permissive", risk: "low" },
  ISC: { category: "permissive", risk: "low" },
  "BSD-2-Clause": { category: "permissive", risk: "low" },
  "BSD-3-Clause": { category: "permissive", risk: "low" },
  "Apache-2.0": { category: "permissive", risk: "low" },
  Unlicense: { category: "permissive", risk: "low" },
  "0BSD": { category: "permissive", risk: "low" },
  "CC0-1.0": { category: "permissive", risk: "low" },
  Zlib: { category: "permissive", risk: "low" },
  "GPL-2.0": { category: "copyleft", risk: "high" },
  "GPL-3.0": { category: "copyleft", risk: "high" },
  "AGPL-3.0": { category: "copyleft", risk: "high" },
  "GPL-2.0-only": { category: "copyleft", risk: "high" },
  "GPL-3.0-only": { category: "copyleft", risk: "high" },
  "AGPL-3.0-only": { category: "copyleft", risk: "high" },
  "LGPL-2.1": { category: "weak-copyleft", risk: "medium" },
  "LGPL-3.0": { category: "weak-copyleft", risk: "medium" },
  "MPL-2.0": { category: "weak-copyleft", risk: "medium" },
  "EPL-1.0": { category: "weak-copyleft", risk: "medium" },
  "EPL-2.0": { category: "weak-copyleft", risk: "medium" },
  "CDDL-1.0": { category: "weak-copyleft", risk: "medium" },
};

function classifyLicense(license: string): { category: LicenseInfo["category"]; risk: LicenseInfo["risk"] } {
  const normalized = license.trim().replace(/\s+/g, "-");
  return LICENSE_CATEGORIES[normalized] || { category: "unknown", risk: "high" };
}

// ─── Scanning ───────────────────────────────────────────────────────────────

function scanNpmLicenses(): LicenseInfo[] {
  const results: LicenseInfo[] = [];

  // Try node_modules approach
  if (existsSync("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const [name, ver] of Object.entries(allDeps)) {
        let license = "UNKNOWN";

        // Check node_modules for the package's package.json
        const depPkgPath = join("node_modules", name, "package.json");
        if (existsSync(depPkgPath)) {
          try {
            const depPkg = JSON.parse(readFileSync(depPkgPath, "utf-8"));
            if (typeof depPkg.license === "string") {
              license = depPkg.license;
            } else if (depPkg.license?.type) {
              license = depPkg.license.type;
            } else if (Array.isArray(depPkg.licenses)) {
              license = depPkg.licenses.map((l: { type?: string }) => l.type || "UNKNOWN").join(" OR ");
            }
          } catch {
            /* skip */
          }
        }

        const { category, risk } = classifyLicense(license);
        results.push({
          dependency: name,
          version: String(ver).replace(/^[\^~>=<]+/, ""),
          license,
          category,
          risk,
        });
      }
    } catch {
      /* skip */
    }
  }

  return results;
}

function detectConflicts(licenses: LicenseInfo[]): string[] {
  const conflicts: string[] = [];
  const hasCopyleft = licenses.some((l) => l.category === "copyleft");
  const hasProprietary = licenses.some((l) => l.category === "proprietary");

  if (hasCopyleft && hasProprietary) {
    conflicts.push("Copyleft and proprietary licenses detected — may be incompatible");
  }

  const agpl = licenses.filter((l) => l.license.includes("AGPL"));
  if (agpl.length > 0) {
    conflicts.push(
      `AGPL license detected in: ${agpl.map((l) => l.dependency).join(", ")} — requires source disclosure for network use`,
    );
  }

  const unknown = licenses.filter((l) => l.category === "unknown");
  if (unknown.length > 0) {
    conflicts.push(`Unknown licenses in: ${unknown.map((l) => l.dependency).join(", ")} — review manually`);
  }

  return conflicts;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-licenses";

export function runLicenseScan(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges license-scan — Dependency license compliance scanning

Usage:
  judges license-scan
  judges license-scan --risk high
  judges license-scan --category copyleft
  judges license-scan --save

Options:
  --risk <level>        Filter by risk level (low, medium, high)
  --category <cat>      Filter by category (permissive, copyleft, weak-copyleft, proprietary, unknown)
  --save                Save report to ${STORE}/
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  let licenses = scanNpmLicenses();

  if (licenses.length === 0) {
    console.log("  No dependencies found. Run from a project root with package.json.");
    return;
  }

  // Filters
  const riskFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--risk");
  if (riskFilter) licenses = licenses.filter((l) => l.risk === riskFilter);

  const catFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--category");
  if (catFilter) licenses = licenses.filter((l) => l.category === catFilter);

  const conflicts = detectConflicts(licenses);

  const report: LicenseReport = {
    licenses,
    summary: {
      permissive: licenses.filter((l) => l.category === "permissive").length,
      copyleft: licenses.filter((l) => l.category === "copyleft").length,
      weakCopyleft: licenses.filter((l) => l.category === "weak-copyleft").length,
      proprietary: licenses.filter((l) => l.category === "proprietary").length,
      unknown: licenses.filter((l) => l.category === "unknown").length,
    },
    conflicts,
    timestamp: new Date().toISOString(),
  };

  if (argv.includes("--save")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, "license-report.json"), JSON.stringify(report, null, 2));
    console.log(`  Report saved to ${STORE}/license-report.json`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  License Scan — ${licenses.length} dependencies`);
    console.log(`  ──────────────────────────`);
    console.log(`    Permissive:   ${report.summary.permissive}`);
    console.log(`    Weak-copyleft: ${report.summary.weakCopyleft}`);
    console.log(`    Copyleft:     ${report.summary.copyleft}`);
    console.log(`    Unknown:      ${report.summary.unknown}`);

    if (conflicts.length > 0) {
      console.log(`\n  ⚠️  Conflicts:`);
      for (const c of conflicts) console.log(`    ${c}`);
    }

    // Show high-risk
    const highRisk = licenses.filter((l) => l.risk === "high");
    if (highRisk.length > 0) {
      console.log(`\n  High Risk (${highRisk.length}):`);
      for (const l of highRisk) {
        console.log(`    ${l.dependency.padEnd(30)} ${l.license.padEnd(15)} ${l.category}`);
      }
    }
    console.log("");
  }
}

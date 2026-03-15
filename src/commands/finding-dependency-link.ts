/**
 * Finding-dependency-link — Link findings to project dependencies.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DependencyLink {
  ruleId: string;
  title: string;
  severity: string;
  linkedPackage: string;
  linkType: "direct" | "transitive" | "none";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function linkFindings(findings: Finding[], dependencies: string[]): DependencyLink[] {
  return findings.map((f) => {
    const desc = f.description.toLowerCase();
    const rec = f.recommendation.toLowerCase();
    const combined = `${desc} ${rec}`;
    const matched = dependencies.find((dep) => combined.includes(dep.toLowerCase()));
    return {
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      linkedPackage: matched ?? "",
      linkType: matched ? "direct" : "none",
    };
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDependencyLink(argv: string[]): void {
  const findingsIdx = argv.indexOf("--findings");
  const findingsPath = findingsIdx >= 0 ? argv[findingsIdx + 1] : "";
  const pkgIdx = argv.indexOf("--package-json");
  const pkgPath = pkgIdx >= 0 ? argv[pkgIdx + 1] : "package.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-dependency-link — Link findings to dependencies

Usage:
  judges finding-dependency-link --findings <path> [--package-json <path>] [--format table|json]

Options:
  --findings <path>       Path to findings JSON
  --package-json <path>   Path to package.json (default: package.json)
  --format <fmt>          Output format: table (default), json
  --help, -h              Show this help
`);
    return;
  }

  if (!findingsPath || !existsSync(findingsPath)) {
    console.error("Provide --findings <path> to a valid findings JSON file.");
    process.exitCode = 1;
    return;
  }

  const findings = JSON.parse(readFileSync(findingsPath, "utf-8")) as Finding[];
  let deps: string[] = [];

  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const dependencies = (pkg.dependencies ?? {}) as Record<string, string>;
    const devDependencies = (pkg.devDependencies ?? {}) as Record<string, string>;
    deps = [...Object.keys(dependencies), ...Object.keys(devDependencies)];
  }

  const results = linkFindings(findings, deps);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nFinding–Dependency Links (${results.length} findings)`);
  console.log("═".repeat(80));
  console.log(`  ${"Rule ID".padEnd(25)} ${"Severity".padEnd(10)} ${"Link Type".padEnd(12)} Package`);
  console.log("  " + "─".repeat(60));

  for (const r of results) {
    const pkg = r.linkedPackage || "—";
    console.log(`  ${r.ruleId.padEnd(25)} ${r.severity.padEnd(10)} ${r.linkType.padEnd(12)} ${pkg}`);
  }

  const linked = results.filter((r) => r.linkType !== "none").length;
  console.log(`\n  Linked: ${linked} | Unlinked: ${results.length - linked}`);
  console.log("═".repeat(80));
}

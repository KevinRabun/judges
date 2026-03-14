/**
 * Finding-dependency-risk — Assess risk level of project dependencies.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DepRisk {
  name: string;
  version: string;
  type: "production" | "development";
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  reasons: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const KNOWN_RISKY_PATTERNS = [
  { pattern: /^eval-/, reason: "eval-prefixed package" },
  { pattern: /^exec-/, reason: "exec-prefixed package" },
  { pattern: /^shell-/, reason: "shell-prefixed package" },
];

function assessDep(name: string, version: string, type: "production" | "development"): DepRisk {
  const reasons: string[] = [];
  let score = 0;

  // version range checks
  if (version === "*" || version === "latest") {
    reasons.push("unpinned version (*)");
    score += 30;
  } else if (version.startsWith(">=")) {
    reasons.push("open-ended version range (>=)");
    score += 20;
  } else if (version.startsWith("^") && version.includes("0.")) {
    reasons.push("caret range on 0.x (breaking changes expected)");
    score += 15;
  }

  // name pattern checks
  for (const { pattern, reason } of KNOWN_RISKY_PATTERNS) {
    if (pattern.test(name)) {
      reasons.push(reason);
      score += 25;
    }
  }

  // scoped package is slightly less risky
  if (!name.startsWith("@")) {
    reasons.push("unscoped package");
    score += 5;
  }

  // production deps carry higher baseline risk
  if (type === "production") {
    score += 5;
  }

  const riskLevel = score >= 50 ? "critical" : score >= 30 ? "high" : score >= 15 ? "medium" : "low";

  return { name, version, type, riskScore: score, riskLevel, reasons };
}

function analyzeDeps(pkgPath: string): DepRisk[] {
  const raw = readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw);
  const results: DepRisk[] = [];

  const deps = pkg.dependencies || {};
  for (const [name, ver] of Object.entries(deps)) {
    results.push(assessDep(name, String(ver), "production"));
  }

  const devDeps = pkg.devDependencies || {};
  for (const [name, ver] of Object.entries(devDeps)) {
    results.push(assessDep(name, String(ver), "development"));
  }

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDependencyRisk(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const minIdx = argv.indexOf("--min-risk");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : "package.json";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const minRisk = minIdx >= 0 ? argv[minIdx + 1] : "low";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-dependency-risk — Assess dependency risk levels

Usage:
  judges finding-dependency-risk [--file <package.json>]
        [--min-risk low|medium|high|critical] [--format table|json]

Options:
  --file <path>      Path to package.json (default: package.json)
  --min-risk <lvl>   Minimum risk level to show (default: low)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let results: DepRisk[];
  try {
    results = analyzeDeps(filePath);
  } catch {
    console.error("Error: invalid package.json");
    process.exitCode = 1;
    return;
  }

  const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
  const minLevel = riskOrder[minRisk] || 0;
  results = results.filter((r) => (riskOrder[r.riskLevel] || 0) >= minLevel);

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`\nDependency Risk Analysis (${results.length} dependencies)`);
  console.log("═".repeat(75));
  console.log(`${"Package".padEnd(30)} ${"Version".padEnd(12)} ${"Type".padEnd(12)} ${"Score".padEnd(7)} Risk`);
  console.log("─".repeat(75));

  for (const r of results) {
    const name = r.name.length > 28 ? r.name.slice(0, 28) + "…" : r.name;
    console.log(
      `${name.padEnd(30)} ${r.version.padEnd(12)} ${r.type.padEnd(12)} ${String(r.riskScore).padEnd(7)} ${r.riskLevel}`,
    );
    for (const reason of r.reasons) {
      console.log(`  └─ ${reason}`);
    }
  }
  console.log("═".repeat(75));
}

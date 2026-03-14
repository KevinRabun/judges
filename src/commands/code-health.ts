/**
 * Code-health — Overall codebase health score across multiple dimensions.
 */

import { readFileSync, existsSync } from "fs";
import type { Finding, TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthDimension {
  name: string;
  score: number;
  weight: number;
  findingsCount: number;
  details: string;
}

interface HealthReport {
  timestamp: string;
  overallScore: number;
  grade: string;
  dimensions: HealthDimension[];
  totalFindings: number;
  summary: string;
}

// ─── Severity weights ───────────────────────────────────────────────────────

const SEVERITY_PENALTY: Record<string, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

function computeGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ─── Dimension Analysis ────────────────────────────────────────────────────

function categorizeFinding(f: Finding): string {
  const rule = (f.ruleId || "").toLowerCase();
  const title = (f.title || "").toLowerCase();

  if (
    rule.includes("sql") ||
    rule.includes("xss") ||
    rule.includes("inject") ||
    rule.includes("auth") ||
    rule.includes("crypto") ||
    rule.includes("secret") ||
    title.includes("vulnerab") ||
    title.includes("security") ||
    title.includes("injection")
  ) {
    return "security";
  }

  if (
    rule.includes("error") ||
    rule.includes("null") ||
    rule.includes("type") ||
    rule.includes("bound") ||
    rule.includes("overflow") ||
    title.includes("bug") ||
    title.includes("error") ||
    title.includes("crash")
  ) {
    return "reliability";
  }

  if (
    rule.includes("complex") ||
    rule.includes("dupl") ||
    rule.includes("smell") ||
    rule.includes("long") ||
    rule.includes("dead") ||
    title.includes("maintain") ||
    title.includes("complex") ||
    title.includes("duplicate")
  ) {
    return "maintainability";
  }

  if (
    rule.includes("perf") ||
    rule.includes("optim") ||
    rule.includes("leak") ||
    title.includes("perform") ||
    title.includes("slow") ||
    title.includes("memory")
  ) {
    return "performance";
  }

  return "quality";
}

function computeDimension(name: string, findings: Finding[], weight: number): HealthDimension {
  let penalty = 0;
  for (const f of findings) {
    const sev = (f.severity || "low").toLowerCase();
    penalty += SEVERITY_PENALTY[sev] || 3;
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const details = findings.length === 0 ? `No ${name} issues found` : `${findings.length} ${name} finding(s) detected`;

  return { name, score, weight, findingsCount: findings.length, details };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCodeHealth(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges code-health — Overall codebase health score

Usage:
  judges code-health --file verdict.json       Compute health from verdict
  judges code-health --format json             JSON output
  judges code-health --weights "security=40,reliability=25,maintainability=20,performance=10,quality=5"

Options:
  --file <path>         Verdict JSON file
  --weights <spec>      Custom dimension weights (must total 100)
  --format json         JSON output
  --help, -h            Show this help

Dimensions:
  security              Injection, auth, crypto, secrets
  reliability           Null checks, type errors, bounds
  maintainability       Complexity, duplication, code smells
  performance           Memory leaks, optimization issues
  quality               General code quality findings

Computes a weighted health score (0-100) with a letter grade (A-F).
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");

  // Parse custom weights
  const defaultWeights: Record<string, number> = {
    security: 35,
    reliability: 25,
    maintainability: 20,
    performance: 10,
    quality: 10,
  };

  const weightsArg = argv.find((_a: string, i: number) => argv[i - 1] === "--weights");
  if (weightsArg) {
    for (const part of weightsArg.split(",")) {
      const [key, val] = part.split("=");
      if (key && val) defaultWeights[key.trim()] = parseInt(val, 10);
    }
  }

  let findings: Finding[] = [];
  let baseScore = 0;

  if (file) {
    if (!existsSync(file)) {
      console.error(`Error: File not found: ${file}`);
      process.exitCode = 1;
      return;
    }
    try {
      const verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
      findings = verdict.findings || [];
      baseScore = verdict.overallScore || 0;
    } catch {
      console.error(`Error: Could not parse ${file}`);
      process.exitCode = 1;
      return;
    }
  }

  // Group findings by dimension
  const groups = new Map<string, Finding[]>();
  for (const key of Object.keys(defaultWeights)) {
    groups.set(key, []);
  }
  for (const f of findings) {
    const cat = categorizeFinding(f);
    const arr = groups.get(cat);
    if (arr) arr.push(f);
    else {
      const qArr = groups.get("quality");
      if (qArr) qArr.push(f);
    }
  }

  // Compute dimensions
  const dimensions: HealthDimension[] = [];
  for (const [name, weight] of Object.entries(defaultWeights)) {
    const dimFindings = groups.get(name) || [];
    dimensions.push(computeDimension(name, dimFindings, weight));
  }

  // Weighted average
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const weightedScore =
    totalWeight > 0 ? Math.round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight) : baseScore;

  const report: HealthReport = {
    timestamp: new Date().toISOString(),
    overallScore: weightedScore,
    grade: computeGrade(weightedScore),
    dimensions,
    totalFindings: findings.length,
    summary: `Health score: ${weightedScore}/100 (Grade ${computeGrade(weightedScore)}). ${findings.length} total findings across ${dimensions.filter((d) => d.findingsCount > 0).length} dimensions.`,
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n  Codebase Health Report\n  ═════════════════════════════`);
  console.log(`    Overall Score: ${report.overallScore}/100`);
  console.log(`    Grade: ${report.grade}`);
  console.log(`    Total Findings: ${report.totalFindings}`);
  console.log();

  console.log("  Dimensions");
  console.log("  ─────────────────────────────");
  for (const d of dimensions) {
    const bar = "█".repeat(Math.floor(d.score / 5)) + "░".repeat(20 - Math.floor(d.score / 5));
    const grade = computeGrade(d.score);
    console.log(
      `    ${d.name.padEnd(18)} ${bar} ${d.score}/100 (${grade}) — ${d.findingsCount} findings [weight: ${d.weight}%]`,
    );
  }

  console.log(`\n  Summary: ${report.summary}`);
  console.log();
}

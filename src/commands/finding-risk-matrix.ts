/**
 * Finding-risk-matrix — Generate risk matrices from findings.
 */

import { readFileSync, existsSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RiskCell {
  severity: string;
  confidence: string;
  count: number;
  findings: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SEVERITY_LEVELS = ["critical", "high", "medium", "low", "info"];
const CONFIDENCE_LEVELS = ["high", "medium", "low"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadVerdict(filePath: string): TribunalVerdict | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function buildMatrix(verdict: TribunalVerdict): RiskCell[] {
  const cells: RiskCell[] = [];

  for (const sev of SEVERITY_LEVELS) {
    for (const conf of CONFIDENCE_LEVELS) {
      const matching = verdict.findings.filter((f) => {
        const fSev = (f.severity || "medium").toLowerCase();
        const fConf =
          f.confidence !== undefined && f.confidence !== null
            ? f.confidence >= 0.8
              ? "high"
              : f.confidence >= 0.5
                ? "medium"
                : "low"
            : "medium";
        return fSev === sev && fConf === conf;
      });
      if (matching.length > 0) {
        cells.push({
          severity: sev,
          confidence: conf,
          count: matching.length,
          findings: matching.map((f) => f.title),
        });
      }
    }
  }
  return cells;
}

function riskScore(severity: string, confidence: string): string {
  const sevWeight: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  const confWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const score = (sevWeight[severity] || 1) * (confWeight[confidence] || 1);
  if (score >= 12) return "CRITICAL";
  if (score >= 8) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRiskMatrix(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-risk-matrix — Generate risk matrix from findings

Usage:
  judges finding-risk-matrix --file <verdict.json> [--format table|json|markdown]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Output format: table (default), json, markdown
  --help, -h         Show this help
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }

  const verdict = loadVerdict(filePath);
  if (!verdict) {
    console.error(`Error: cannot load ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const cells = buildMatrix(verdict);

  if (format === "json") {
    console.log(JSON.stringify(cells, null, 2));
    return;
  }

  if (format === "markdown") {
    console.log("| Severity | Confidence | Count | Risk Level |");
    console.log("|----------|------------|-------|------------|");
    for (const c of cells) {
      console.log(`| ${c.severity} | ${c.confidence} | ${c.count} | ${riskScore(c.severity, c.confidence)} |`);
    }
    return;
  }

  // Table format
  console.log("\nRisk Matrix");
  console.log("═".repeat(60));
  console.log(`${"Severity".padEnd(12)} ${"Confidence".padEnd(12)} ${"Count".padEnd(8)} Risk Level`);
  console.log("─".repeat(60));

  const sorted = [...cells].sort((a, b) => {
    const sevOrder = SEVERITY_LEVELS.indexOf(a.severity) - SEVERITY_LEVELS.indexOf(b.severity);
    if (sevOrder !== 0) return sevOrder;
    return CONFIDENCE_LEVELS.indexOf(a.confidence) - CONFIDENCE_LEVELS.indexOf(b.confidence);
  });

  for (const c of sorted) {
    const risk = riskScore(c.severity, c.confidence);
    console.log(`${c.severity.padEnd(12)} ${c.confidence.padEnd(12)} ${String(c.count).padEnd(8)} ${risk}`);
    for (const t of c.findings.slice(0, 3)) {
      console.log(`  → ${t}`);
    }
    if (c.findings.length > 3) console.log(`  … and ${c.findings.length - 3} more`);
  }

  console.log("─".repeat(60));
  const total = cells.reduce((s, c) => s + c.count, 0);
  console.log(`Total findings: ${total}`);
  console.log("═".repeat(60));
}

/**
 * Test correlate — ingests test coverage data and cross-references
 * with security findings to prioritize high-risk untested areas.
 *
 * All data from local coverage files.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CoverageEntry {
  file: string;
  lines: { covered: number; total: number; percentage: number };
}

interface CorrelatedFinding {
  file: string;
  coveragePercent: number;
  findingCount: number;
  riskCategory: "critical" | "high" | "medium" | "low";
  findings: Array<{ ruleId: string; severity: string; title: string }>;
}

interface CorrelationReport {
  correlations: CorrelatedFinding[];
  totalFiles: number;
  untestedFilesWithFindings: number;
  avgCoverage: number;
  timestamp: string;
}

// ─── Coverage parsers ───────────────────────────────────────────────────────

function parseLcov(content: string): CoverageEntry[] {
  const entries: CoverageEntry[] = [];
  let currentFile = "";
  let linesFound = 0;
  let linesHit = 0;

  for (const line of content.split("\n")) {
    if (line.startsWith("SF:")) {
      currentFile = line.substring(3).trim();
      linesFound = 0;
      linesHit = 0;
    } else if (line.startsWith("LF:")) {
      linesFound = parseInt(line.substring(3), 10);
    } else if (line.startsWith("LH:")) {
      linesHit = parseInt(line.substring(3), 10);
    } else if (line === "end_of_record" && currentFile) {
      entries.push({
        file: currentFile,
        lines: {
          covered: linesHit,
          total: linesFound,
          percentage: linesFound > 0 ? Math.round((linesHit / linesFound) * 100) : 0,
        },
      });
      currentFile = "";
    }
  }

  return entries;
}

function parseIstanbul(content: string): CoverageEntry[] {
  try {
    const data = JSON.parse(content);
    const entries: CoverageEntry[] = [];

    for (const [file, info] of Object.entries(data)) {
      const cov = info as { s?: Record<string, number> };
      if (cov.s) {
        const stmts = Object.values(cov.s);
        const total = stmts.length;
        const covered = stmts.filter((v) => v > 0).length;
        entries.push({
          file,
          lines: { covered, total, percentage: total > 0 ? Math.round((covered / total) * 100) : 0 },
        });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

function loadCoverage(): CoverageEntry[] {
  const lcovPaths = ["coverage/lcov.info", "lcov.info"];
  for (const p of lcovPaths) {
    if (existsSync(p)) return parseLcov(readFileSync(p, "utf-8"));
  }

  const istanbulPaths = ["coverage/coverage-final.json", ".nyc_output/coverage-final.json"];
  for (const p of istanbulPaths) {
    if (existsSync(p)) return parseIstanbul(readFileSync(p, "utf-8"));
  }

  // Cobertura XML — simplified check
  if (existsSync("coverage/cobertura-coverage.xml") || existsSync("coverage.xml")) {
    const p = existsSync("coverage/cobertura-coverage.xml") ? "coverage/cobertura-coverage.xml" : "coverage.xml";
    const content = readFileSync(p, "utf-8");
    const entries: CoverageEntry[] = [];
    const fileRegex = /filename="([^"]+)"/g;
    const rateRegex = /line-rate="([\d.]+)"/g;
    let fileMatch: RegExpExecArray | null;
    let rateMatch: RegExpExecArray | null;
    while ((fileMatch = fileRegex.exec(content)) && (rateMatch = rateRegex.exec(content))) {
      entries.push({
        file: fileMatch[1],
        lines: { covered: 0, total: 0, percentage: Math.round(parseFloat(rateMatch[1]) * 100) },
      });
    }
    return entries;
  }

  return [];
}

function loadFindings(): Array<{ file?: string; ruleId: string; severity: string; title: string }> {
  const paths = [".judges-findings.json", "judges-report.json"];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      if (Array.isArray(data)) return data;
      if (data.findings) return data.findings;
    } catch {
      /* skip */
    }
  }
  return [];
}

// ─── Correlation ────────────────────────────────────────────────────────────

function correlate(
  coverage: CoverageEntry[],
  findings: Array<{ file?: string; ruleId: string; severity: string; title: string }>,
): CorrelatedFinding[] {
  const coverageMap = new Map<string, CoverageEntry>();
  for (const c of coverage) coverageMap.set(c.file, c);

  const findingsByFile = new Map<string, Array<{ ruleId: string; severity: string; title: string }>>();
  for (const f of findings) {
    const key = f.file || "unknown";
    if (!findingsByFile.has(key)) findingsByFile.set(key, []);
    findingsByFile.get(key)!.push(f);
  }

  const correlations: CorrelatedFinding[] = [];

  for (const [file, fileFindings] of findingsByFile) {
    const cov = coverageMap.get(file);
    const covPct = cov ? cov.lines.percentage : 0;

    const sevWeights: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 1 };
    const riskScore = fileFindings.reduce((s, f) => s + (sevWeights[f.severity] || 2), 0);
    const combinedRisk = riskScore * (1 + (100 - covPct) / 100);

    let riskCategory: CorrelatedFinding["riskCategory"] = "low";
    if (combinedRisk > 30) riskCategory = "critical";
    else if (combinedRisk > 15) riskCategory = "high";
    else if (combinedRisk > 7) riskCategory = "medium";

    correlations.push({
      file,
      coveragePercent: covPct,
      findingCount: fileFindings.length,
      riskCategory,
      findings: fileFindings,
    });
  }

  return correlations.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.riskCategory] || 4) - (order[b.riskCategory] || 4);
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-test-correlate";

export function runTestCorrelate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges test-correlate — Cross-reference test coverage with findings

Usage:
  judges test-correlate
  judges test-correlate --risk critical,high
  judges test-correlate --save

Options:
  --risk <levels>       Filter by risk category (comma-separated)
  --save                Save report to ${STORE}/
  --format json         JSON output
  --help, -h            Show this help

Supports: lcov.info, coverage-final.json (Istanbul), cobertura XML
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const coverage = loadCoverage();
  const findings = loadFindings();

  if (coverage.length === 0) {
    console.log("  No coverage data found. Run tests with coverage first.");
    console.log("  Supported formats: lcov.info, coverage-final.json, cobertura XML");
    return;
  }

  let correlations = correlate(coverage, findings);

  const riskFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--risk");
  if (riskFilter) {
    const allowed = riskFilter.split(",");
    correlations = correlations.filter((c) => allowed.includes(c.riskCategory));
  }

  const avgCov =
    coverage.length > 0 ? Math.round(coverage.reduce((s, c) => s + c.lines.percentage, 0) / coverage.length) : 0;

  const report: CorrelationReport = {
    correlations,
    totalFiles: coverage.length,
    untestedFilesWithFindings: correlations.filter((c) => c.coveragePercent === 0).length,
    avgCoverage: avgCov,
    timestamp: new Date().toISOString(),
  };

  if (argv.includes("--save")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, "correlation-report.json"), JSON.stringify(report, null, 2));
    console.log(`  Saved to ${STORE}/correlation-report.json`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Test-Finding Correlation`);
    console.log(`  Files: ${report.totalFiles}  Avg Coverage: ${report.avgCoverage}%`);
    console.log(`  Untested files with findings: ${report.untestedFilesWithFindings}`);
    console.log(`  ──────────────────────────`);

    if (correlations.length === 0) {
      console.log(`    ✅ No finding-coverage correlations\n`);
      return;
    }

    for (const c of correlations.slice(0, 20)) {
      const covBar = c.coveragePercent > 0 ? `${c.coveragePercent}%` : "0% ⚠️";
      console.log(`    [${c.riskCategory.toUpperCase().padEnd(8)}] ${c.file}`);
      console.log(`      Coverage: ${covBar}  Findings: ${c.findingCount}`);
    }
    if (correlations.length > 20) console.log(`    ... and ${correlations.length - 20} more`);
    console.log("");
  }
}

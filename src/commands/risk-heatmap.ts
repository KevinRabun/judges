/**
 * Risk heatmap — generates a file/directory risk heatmap
 * combining finding density, severity, and test coverage.
 *
 * All data from local files.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RiskEntry {
  path: string;
  findingCount: number;
  criticalCount: number;
  highCount: number;
  riskScore: number;
  riskLevel: "critical" | "high" | "medium" | "low" | "clean";
}

interface HeatmapReport {
  entries: RiskEntry[];
  totalFiles: number;
  totalFindings: number;
  hotspots: string[];
  timestamp: string;
}

// ─── Data Loading ───────────────────────────────────────────────────────────

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

function getProjectFiles(dir: string, maxFiles: number): string[] {
  const result: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "__pycache__"]);

  function walk(d: string): void {
    if (result.length >= maxFiles) return;
    let names: string[];
    try {
      names = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of names) {
      if (result.length >= maxFiles) return;
      if (skipDirs.has(name)) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        result.push(relative(dir, full));
      }
    }
  }

  walk(dir);
  return result;
}

// ─── Heatmap ────────────────────────────────────────────────────────────────

function buildHeatmap(findings: Array<{ file?: string; severity: string }>): RiskEntry[] {
  const fileMap = new Map<string, { findings: number; critical: number; high: number }>();

  for (const f of findings) {
    const file = f.file || "unknown";
    if (!fileMap.has(file)) fileMap.set(file, { findings: 0, critical: 0, high: 0 });
    const entry = fileMap.get(file)!;
    entry.findings++;
    if (f.severity === "critical") entry.critical++;
    if (f.severity === "high") entry.high++;
  }

  // Also aggregate by directory
  const dirMap = new Map<string, { findings: number; critical: number; high: number }>();
  for (const [file, data] of fileMap) {
    const dir = dirname(file);
    if (!dirMap.has(dir)) dirMap.set(dir, { findings: 0, critical: 0, high: 0 });
    const entry = dirMap.get(dir)!;
    entry.findings += data.findings;
    entry.critical += data.critical;
    entry.high += data.high;
  }

  const entries: RiskEntry[] = [];

  for (const [path, data] of [...fileMap, ...dirMap]) {
    const riskScore = data.critical * 10 + data.high * 5 + (data.findings - data.critical - data.high) * 2;
    let riskLevel: RiskEntry["riskLevel"] = "clean";
    if (riskScore > 30) riskLevel = "critical";
    else if (riskScore > 15) riskLevel = "high";
    else if (riskScore > 5) riskLevel = "medium";
    else if (riskScore > 0) riskLevel = "low";

    entries.push({
      path,
      findingCount: data.findings,
      criticalCount: data.critical,
      highCount: data.high,
      riskScore,
      riskLevel,
    });
  }

  return entries.sort((a, b) => b.riskScore - a.riskScore);
}

function renderHeatmapHtml(entries: RiskEntry[]): string {
  const rows = entries
    .slice(0, 50)
    .map((e) => {
      const color =
        e.riskLevel === "critical"
          ? "#dc3545"
          : e.riskLevel === "high"
            ? "#fd7e14"
            : e.riskLevel === "medium"
              ? "#ffc107"
              : e.riskLevel === "low"
                ? "#28a745"
                : "#6c757d";
      return `<tr><td>${e.path}</td><td style="background:${color};color:white;text-align:center">${e.riskScore}</td><td>${e.findingCount}</td><td>${e.criticalCount}</td><td>${e.highCount}</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html><head><title>Risk Heatmap</title>
<style>body{font-family:system-ui;margin:2rem}table{border-collapse:collapse;width:100%}th,td{padding:8px 12px;border:1px solid #ddd;text-align:left}th{background:#f5f5f5}tr:hover{background:#f0f0f0}</style>
</head><body>
<h1>Risk Heatmap</h1>
<p>Generated: ${new Date().toISOString()}</p>
<table><thead><tr><th>Path</th><th>Risk Score</th><th>Findings</th><th>Critical</th><th>High</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-risk-heatmap";

export function runRiskHeatmap(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges risk-heatmap — File/directory risk visualization

Usage:
  judges risk-heatmap
  judges risk-heatmap --risk critical,high
  judges risk-heatmap --html
  judges risk-heatmap --dirs-only

Options:
  --risk <levels>       Filter by risk level (comma-separated)
  --html                Generate HTML heatmap report
  --dirs-only           Show directory-level aggregation only
  --top <n>             Show top N riskiest entries
  --save                Save report to ${STORE}/
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const findings = loadFindings();

  if (findings.length === 0) {
    console.log("  No findings data found. Run a scan first to populate findings.");
    return;
  }

  let entries = buildHeatmap(findings);

  // Filters
  if (argv.includes("--dirs-only")) {
    entries = entries.filter((e) => !e.path.includes(".") || e.path === ".");
  }

  const riskFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--risk");
  if (riskFilter) {
    const allowed = riskFilter.split(",");
    entries = entries.filter((e) => allowed.includes(e.riskLevel));
  }

  const topN = argv.find((_a: string, i: number) => argv[i - 1] === "--top");
  if (topN) entries = entries.slice(0, parseInt(topN, 10));

  const totalFindings = findings.length;
  const hotspots = entries.filter((e) => e.riskLevel === "critical").map((e) => e.path);
  const _projectFiles = getProjectFiles(".", 1000);

  const report: HeatmapReport = {
    entries,
    totalFiles: entries.length,
    totalFindings,
    hotspots,
    timestamp: new Date().toISOString(),
  };

  // HTML output
  if (argv.includes("--html")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    const html = renderHeatmapHtml(entries);
    const htmlPath = join(STORE, "heatmap.html");
    writeFileSync(htmlPath, html);
    console.log(`  HTML heatmap saved to ${htmlPath}`);
    return;
  }

  // Save
  if (argv.includes("--save")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, "heatmap.json"), JSON.stringify(report, null, 2));
    console.log(`  Report saved to ${STORE}/heatmap.json`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Risk Heatmap — ${totalFindings} findings across ${entries.length} locations`);
    console.log(`  ──────────────────────────`);

    if (hotspots.length > 0) {
      console.log(`\n  🔥 Critical hotspots: ${hotspots.slice(0, 5).join(", ")}`);
    }

    console.log("");
    for (const e of entries.slice(0, 25)) {
      const bar = "█".repeat(Math.min(e.riskScore, 20));
      const label = e.riskLevel.toUpperCase().padEnd(8);
      console.log(`    [${label}] ${e.path.padEnd(40)} ${bar} ${e.riskScore} (${e.findingCount} findings)`);
    }
    if (entries.length > 25) console.log(`    ... and ${entries.length - 25} more`);
    console.log("");
  }
}

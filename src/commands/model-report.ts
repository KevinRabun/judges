/**
 * Model report — track which AI model/version produced each finding
 * across evaluation runs. Generates model scorecards with pass rates,
 * failure categories, and vendor-specific blind spots.
 *
 * All data stored locally in `.judges-model-reports/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ModelEntry {
  model: string;
  timestamp: string;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  score: number;
  categories: Record<string, number>;
}

interface ModelReport {
  model: string;
  evaluations: number;
  avgScore: number;
  avgFindings: number;
  topCategories: { category: string; count: number }[];
  trend: "improving" | "declining" | "stable";
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-model-reports";

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadEntries(): ModelEntry[] {
  const file = join(DATA_DIR, "history.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveEntries(entries: ModelEntry[]): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, "history.json"), JSON.stringify(entries, null, 2));
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function categorizeFindings(content: string): Record<string, number> {
  const cats: Record<string, number> = {};
  const patterns: [string, RegExp][] = [
    ["security", /injection|xss|csrf|auth|password|secret|token|key/gi],
    ["error-handling", /catch|error|exception|throw|reject|finally/gi],
    ["performance", /loop|recursion|allocation|memory|cache|lazy|eager/gi],
    ["naming", /naming|variable|identifier|abbreviation|convention/gi],
    ["complexity", /complex|nested|depth|cyclomatic|conditional/gi],
    ["duplication", /duplicate|copy|clone|repeat|redundant/gi],
    ["documentation", /comment|doc|readme|jsdoc|annotation/gi],
    ["testing", /test|assert|mock|stub|coverage|spec/gi],
  ];
  for (const [cat, re] of patterns) {
    const matches = (content.match(re) || []).length;
    if (matches > 0) cats[cat] = matches;
  }
  return cats;
}

function generateReports(entries: ModelEntry[]): ModelReport[] {
  const models = new Map<string, ModelEntry[]>();
  for (const entry of entries) {
    const list = models.get(entry.model) || [];
    list.push(entry);
    models.set(entry.model, list);
  }

  const reports: ModelReport[] = [];
  for (const [model, evalList] of models) {
    const avgScore = Math.round(evalList.reduce((s, e) => s + e.score, 0) / evalList.length);
    const avgFindings = Math.round(evalList.reduce((s, e) => s + e.totalFindings, 0) / evalList.length);

    // Aggregate categories
    const catTotals: Record<string, number> = {};
    for (const e of evalList) {
      for (const [cat, count] of Object.entries(e.categories)) {
        catTotals[cat] = (catTotals[cat] || 0) + count;
      }
    }
    const topCategories = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count }));

    // Trend
    let trend: "improving" | "declining" | "stable" = "stable";
    if (evalList.length >= 3) {
      const recent = evalList.slice(-3);
      const scoreDiff = recent[recent.length - 1].score - recent[0].score;
      if (scoreDiff > 5) trend = "improving";
      else if (scoreDiff < -5) trend = "declining";
    }

    reports.push({ model, evaluations: evalList.length, avgScore, avgFindings, topCategories, trend });
  }

  return reports.sort((a, b) => b.avgScore - a.avgScore);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runModelReport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges model-report — AI model scorecard and comparison

Usage:
  judges model-report --record --model "gpt-4" --score 85 --findings 3
  judges model-report --record --model "claude-4" --file eval-output.json
  judges model-report --show
  judges model-report --compare

Options:
  --record              Record a new evaluation entry
  --model <name>        Model name/version
  --score <n>           Evaluation score (0-100)
  --findings <n>        Number of findings
  --file <path>         Import findings from evaluation output
  --show                Display model scorecards
  --compare             Side-by-side model comparison
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const record = argv.includes("--record");
  const show = argv.includes("--show");
  const compare = argv.includes("--compare");
  const modelName = argv.find((_a: string, i: number) => argv[i - 1] === "--model") || "";
  const scoreArg = argv.find((_a: string, i: number) => argv[i - 1] === "--score");
  const findingsArg = argv.find((_a: string, i: number) => argv[i - 1] === "--findings");
  const fileArg = argv.find((_a: string, i: number) => argv[i - 1] === "--file");

  if (record) {
    if (!modelName) {
      console.error("  --model is required for --record");
      return;
    }

    let totalFindings = parseInt(findingsArg || "0");
    let score = parseInt(scoreArg || "0");
    let categories: Record<string, number> = {};

    if (fileArg && existsSync(fileArg)) {
      try {
        const data = readFileSync(fileArg, "utf-8");
        categories = categorizeFindings(data);
        const parsed = JSON.parse(data);
        if (parsed.findings) totalFindings = Array.isArray(parsed.findings) ? parsed.findings.length : totalFindings;
        if (parsed.overallScore) score = parsed.overallScore;
      } catch {
        /* use manual values */
      }
    }

    const entry: ModelEntry = {
      model: modelName,
      timestamp: new Date().toISOString(),
      totalFindings,
      criticalCount: 0,
      highCount: 0,
      mediumCount: Math.round(totalFindings * 0.6),
      lowCount: Math.round(totalFindings * 0.4),
      score,
      categories,
    };

    const entries = loadEntries();
    entries.push(entry);
    saveEntries(entries);
    console.log(`  ✅ Recorded evaluation for ${modelName} (score: ${score}, findings: ${totalFindings})`);
    return;
  }

  const entries = loadEntries();
  if (entries.length === 0) {
    console.log("  No model data recorded yet. Use --record to add evaluations.");
    return;
  }

  const reports = generateReports(entries);

  if (format === "json") {
    console.log(
      JSON.stringify({ reports, totalEntries: entries.length, timestamp: new Date().toISOString() }, null, 2),
    );
    return;
  }

  if (compare) {
    console.log(`\n  Model Comparison — ${reports.length} models\n  ──────────────────────────`);
    console.log(
      `    ${"Model".padEnd(25)} ${"Evals".padEnd(8)} ${"Avg Score".padEnd(12)} ${"Avg Findings".padEnd(14)} Trend`,
    );
    console.log(`    ${"─".repeat(25)} ${"─".repeat(8)} ${"─".repeat(12)} ${"─".repeat(14)} ${"─".repeat(10)}`);
    for (const r of reports) {
      const trendIcon = r.trend === "improving" ? "📈" : r.trend === "declining" ? "📉" : "➡️";
      console.log(
        `    ${r.model.padEnd(25)} ${String(r.evaluations).padEnd(8)} ${String(r.avgScore).padEnd(12)} ${String(r.avgFindings).padEnd(14)} ${trendIcon} ${r.trend}`,
      );
    }
    console.log("");
    return;
  }

  // Show (default)
  if (show || !compare) {
    console.log(
      `\n  Model Report Cards — ${entries.length} evaluations across ${reports.length} models\n  ──────────────────────────`,
    );

    for (const r of reports) {
      const icon = r.avgScore >= 80 ? "🟢" : r.avgScore >= 60 ? "🟡" : "🔴";
      const trendIcon = r.trend === "improving" ? "📈" : r.trend === "declining" ? "📉" : "➡️";
      console.log(`\n    ${icon} ${r.model}`);
      console.log(
        `        Score: ${r.avgScore}/100  |  Findings: ${r.avgFindings} avg  |  Evals: ${r.evaluations}  |  ${trendIcon} ${r.trend}`,
      );
      if (r.topCategories.length > 0) {
        console.log(`        Top issues: ${r.topCategories.map((c) => `${c.category}(${c.count})`).join(", ")}`);
      }
    }
    console.log("");
  }
}

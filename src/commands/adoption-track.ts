/**
 * Adoption-track — measure team-level Judges adoption metrics from local data.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdoptionMetrics {
  configCompleteness: number;
  coverageEstimate: number;
  suppressionRate: number;
  ruleOverrideCount: number;
  activeJudgeCount: number;
  totalJudgeCount: number;
  coldSpots: string[];
  healthScore: number;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".cs"]);

function collectFiles(dir: string, max = 500): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Config analysis ────────────────────────────────────────────────────────

interface JudgesrcConfig {
  preset?: string;
  disabledJudges?: string[];
  disabledRules?: string[];
  ruleOverrides?: Record<string, unknown>;
  minSeverity?: string;
  judges?: Record<string, unknown>;
  [key: string]: unknown;
}

function analyzeConfig(dir: string): { config: JudgesrcConfig | null; completeness: number } {
  const configPaths = [
    join(dir, ".judgesrc"),
    join(dir, ".judgesrc.json"),
    join(dir, "judgesrc.json"),
    join(dir, ".judges.json"),
  ];

  for (const p of configPaths) {
    if (existsSync(p)) {
      try {
        const raw = readFileSync(p, "utf-8");
        const config = JSON.parse(raw) as JudgesrcConfig;
        let completeness = 20; // Base for having a config at all
        if (config.preset) completeness += 15;
        if (config.minSeverity) completeness += 10;
        if (config.judges && Object.keys(config.judges).length > 0) completeness += 20;
        if (config.disabledRules && config.disabledRules.length > 0) completeness += 10;
        if (config.ruleOverrides && Object.keys(config.ruleOverrides).length > 0) completeness += 15;
        if (config.disabledJudges && config.disabledJudges.length > 0) completeness += 10;
        return { config, completeness: Math.min(100, completeness) };
      } catch {
        /* malformed config */
      }
    }
  }

  // Check package.json for judges config
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.judges || pkg.judgesConfig) {
        return { config: (pkg.judges || pkg.judgesConfig) as JudgesrcConfig, completeness: 30 };
      }
    } catch {
      /* skip */
    }
  }

  return { config: null, completeness: 0 };
}

// ─── Suppression tracking ───────────────────────────────────────────────────

function countSuppressions(files: string[]): { total: number; categories: Map<string, number> } {
  let total = 0;
  const categories = new Map<string, number>();

  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }

    const suppressions = content.match(/judges-disable|judges-ignore|judges-suppress|noinspection|@suppress/gi) || [];
    total += suppressions.length;

    // Categorize by nearby judge name
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (/judges-disable|judges-ignore|judges-suppress/i.test(lines[i])) {
        const ruleMatch = lines[i].match(/(?:judges-(?:disable|ignore|suppress))\s+(\S+)/i);
        const cat = ruleMatch ? ruleMatch[1] : "unspecified";
        categories.set(cat, (categories.get(cat) || 0) + 1);
      }
    }
  }

  return { total, categories };
}

// ─── Cold spots (directories with no judges integration) ────────────────────

function findColdSpots(dir: string, files: string[]): string[] {
  const dirCounts = new Map<string, number>();
  const dirFiles = new Map<string, number>();

  for (const f of files) {
    const rel = relative(dir, f);
    const parts = rel.split(/[/\\]/);
    if (parts.length > 1) {
      const topDir = parts[0];
      dirFiles.set(topDir, (dirFiles.get(topDir) || 0) + 1);
    }
  }

  // Directories with code but no suppression comments → likely not being reviewed
  for (const f of files) {
    let content: string;
    try {
      content = readFileSync(f, "utf-8");
    } catch {
      continue;
    }
    const rel = relative(dir, f);
    const parts = rel.split(/[/\\]/);
    if (parts.length > 1) {
      const topDir = parts[0];
      if (/judges-|@judges|judges\.config/i.test(content)) {
        dirCounts.set(topDir, (dirCounts.get(topDir) || 0) + 1);
      }
    }
  }

  // Directories with files but zero judges references
  const coldSpots: string[] = [];
  for (const [d, count] of dirFiles) {
    if (count >= 3 && !dirCounts.has(d)) {
      coldSpots.push(d);
    }
  }

  return coldSpots;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAdoptionTrack(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges adoption-track — Measure team-level Judges adoption metrics

Usage:
  judges adoption-track [dir]
  judges adoption-track --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Measures: config completeness, suppression rate, rule override count,
cold spots (directories with code but no review engagement),
adoption health score.

Note: All metrics are computed from local files only — no data is sent
or stored externally.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const { config, completeness } = analyzeConfig(dir);
  const { total: suppressionTotal, categories: suppressionCats } = countSuppressions(files);
  const coldSpots = findColdSpots(dir, files);

  const suppressionRate = files.length > 0 ? Math.round((suppressionTotal / files.length) * 100) : 0;
  const ruleOverrideCount = config?.ruleOverrides ? Object.keys(config.ruleOverrides).length : 0;
  const disabledCount = config?.disabledJudges?.length || 0;

  // Estimate active vs total judges (heuristic)
  const totalJudgeCount = 60; // Approximate total available judges
  const activeJudgeCount = totalJudgeCount - disabledCount;
  const coverageEstimate = files.length > 0 ? Math.round((activeJudgeCount / totalJudgeCount) * 100) : 0;

  // Health score
  let healthScore = 0;
  healthScore += completeness * 0.3; // Config completeness weight
  healthScore += coverageEstimate * 0.3; // Coverage weight
  healthScore += Math.max(0, 100 - suppressionRate * 2) * 0.2; // Low suppression is good
  healthScore += Math.max(0, 100 - coldSpots.length * 15) * 0.2; // Few cold spots is good
  healthScore = Math.round(Math.min(100, Math.max(0, healthScore)));

  const metrics: AdoptionMetrics = {
    configCompleteness: completeness,
    coverageEstimate,
    suppressionRate,
    ruleOverrideCount,
    activeJudgeCount,
    totalJudgeCount,
    coldSpots,
    healthScore,
  };

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          metrics,
          suppressionCategories: Object.fromEntries(suppressionCats),
          filesScanned: files.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge =
      healthScore >= 80 ? "✅ HIGH ADOPTION" : healthScore >= 50 ? "⚠️  PARTIAL ADOPTION" : "❌ LOW ADOPTION";
    console.log(`\n  Adoption Track: ${badge} (${healthScore}/100)\n  ─────────────────────────────`);
    console.log(`    Files scanned:      ${files.length}`);
    console.log(`    Config completeness: ${completeness}%${config ? "" : " (no config found)"}`);
    console.log(`    Judge coverage:      ${coverageEstimate}% (${activeJudgeCount}/${totalJudgeCount} judges active)`);
    console.log(`    Suppression rate:    ${suppressionRate}% (${suppressionTotal} suppressions)`);
    console.log(`    Rule overrides:      ${ruleOverrideCount}`);

    if (suppressionCats.size > 0) {
      console.log(`\n    Suppressed categories:`);
      for (const [cat, count] of [...suppressionCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`      ${cat}: ${count}`);
      }
    }

    if (coldSpots.length > 0) {
      console.log(`\n    Cold spots (low/no engagement):`);
      for (const spot of coldSpots.slice(0, 10)) console.log(`      📁 ${spot}/`);
    }

    console.log(`\n    Recommendations:`);
    if (completeness < 50) console.log(`      → Create or improve .judgesrc configuration`);
    if (disabledCount > 10) console.log(`      → Review disabled judges — ${disabledCount} disabled may be excessive`);
    if (suppressionRate > 20)
      console.log(`      → High suppression rate (${suppressionRate}%) — review if suppressions are justified`);
    if (coldSpots.length > 0) console.log(`      → Engage cold-spot directories: ${coldSpots.slice(0, 3).join(", ")}`);
    if (healthScore >= 80) console.log(`      → Adoption is healthy — maintain current practices`);
    console.log();
  }
}

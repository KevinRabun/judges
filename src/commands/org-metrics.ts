/**
 * `judges org-metrics` — Aggregate metrics across team members.
 *
 * Merges metric data from multiple local finding stores or DataAdapter
 * sources to produce org-level summary statistics. Judges never hosts
 * this data — users provide their own storage via DataAdapter config.
 *
 * Usage:
 *   judges org-metrics --dirs project1/ project2/     # Local directories
 *   judges org-metrics --format json                  # Machine-readable
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, join, basename } from "path";

import { computeMetrics, type RoiMetrics } from "./metrics.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OrgMetrics {
  contributors: number;
  projects: string[];
  aggregated: RoiMetrics;
  perProject: Array<{ project: string; metrics: RoiMetrics }>;
}

// ─── Aggregation ────────────────────────────────────────────────────────────

export function aggregateOrgMetrics(dirs: string[], sinceDays?: number): OrgMetrics {
  const perProject: OrgMetrics["perProject"] = [];

  for (const dir of dirs) {
    const absDir = resolve(dir);
    if (!existsSync(absDir)) continue;

    // Check if this directory has a finding store
    const storePath = join(absDir, ".judges-findings.json");
    if (!existsSync(storePath)) continue;

    const metrics = computeMetrics(absDir, sinceDays);
    perProject.push({ project: basename(absDir), metrics });
  }

  if (perProject.length === 0) {
    return {
      contributors: 0,
      projects: [],
      aggregated: emptyMetrics(),
      perProject: [],
    };
  }

  // Merge all per-project metrics into one aggregate
  const aggregated = mergeMetrics(perProject.map((p) => p.metrics));

  // Count unique contributors from feedback files
  const contributors = new Set<string>();
  for (const dir of dirs) {
    const feedbackPath = join(resolve(dir), ".judges-feedback.json");
    if (existsSync(feedbackPath)) {
      try {
        const data = JSON.parse(readFileSync(feedbackPath, "utf-8"));
        for (const entry of data.entries ?? []) {
          if (entry.author) contributors.add(entry.author);
        }
      } catch {
        // Skip corrupt files
      }
    }
  }

  return {
    contributors: Math.max(contributors.size, perProject.length),
    projects: perProject.map((p) => p.project),
    aggregated,
    perProject,
  };
}

function mergeMetrics(all: RoiMetrics[]): RoiMetrics {
  const from = all.reduce((a, m) => (m.period.from < a ? m.period.from : a), all[0].period.from);
  const to = all.reduce((a, m) => (m.period.to > a ? m.period.to : a), all[0].period.to);

  const bySeverity: Record<string, { detected: number; fixed: number }> = {};
  for (const m of all) {
    for (const [sev, s] of Object.entries(m.findings.bySeverity)) {
      if (!bySeverity[sev]) bySeverity[sev] = { detected: 0, fixed: 0 };
      bySeverity[sev].detected += s.detected;
      bySeverity[sev].fixed += s.fixed;
    }
  }

  const totalDetected = all.reduce((s, m) => s + m.findings.totalDetected, 0);
  const totalFixed = all.reduce((s, m) => s + m.findings.totalFixed, 0);
  const totalOpen = all.reduce((s, m) => s + m.findings.totalOpen, 0);
  const totalAcceptedRisk = all.reduce((s, m) => s + m.findings.totalAcceptedRisk, 0);
  const totalFalsePositive = all.reduce((s, m) => s + m.findings.totalFalsePositive, 0);
  const totalAutoApplied = all.reduce((s, m) => s + m.autoFix.applied, 0);
  const totalMinutes = all.reduce((s, m) => s + m.timeSaved.estimatedMinutes, 0);

  // Merge breakdowns
  const breakdownMap = new Map<string, { count: number; minutesPerItem: number; totalMinutes: number }>();
  for (const m of all) {
    for (const b of m.timeSaved.breakdown) {
      const existing = breakdownMap.get(b.category);
      if (existing) {
        existing.count += b.count;
        existing.totalMinutes += b.totalMinutes;
      } else {
        breakdownMap.set(b.category, {
          count: b.count,
          minutesPerItem: b.minutesPerItem,
          totalMinutes: b.totalMinutes,
        });
      }
    }
  }

  // Trend: majority vote
  const trends = all.map((m) => m.trend.direction);
  const improving = trends.filter((t) => t === "improving").length;
  const degrading = trends.filter((t) => t === "degrading").length;
  const direction = improving > degrading ? "improving" : degrading > improving ? "degrading" : "stable";

  return {
    period: { from, to },
    findings: {
      totalDetected,
      totalFixed,
      totalOpen,
      totalAcceptedRisk,
      totalFalsePositive,
      fixRate: totalDetected > 0 ? totalFixed / totalDetected : 0,
      bySeverity,
    },
    autoFix: {
      available: totalDetected,
      applied: totalAutoApplied,
      adoptionRate: totalDetected > 0 ? totalAutoApplied / totalDetected : 0,
    },
    timeSaved: {
      estimatedMinutes: totalMinutes,
      estimatedHours: Math.round((totalMinutes / 60) * 10) / 10,
      breakdown: [...breakdownMap.entries()].map(([category, v]) => ({
        category,
        count: v.count,
        minutesPerItem: v.minutesPerItem,
        totalMinutes: v.totalMinutes,
      })),
    },
    trend: {
      direction,
      newFindingsPerRun: all.reduce((s, m) => s + m.trend.newFindingsPerRun, 0) / all.length,
      fixedFindingsPerRun: all.reduce((s, m) => s + m.trend.fixedFindingsPerRun, 0) / all.length,
    },
  };
}

function emptyMetrics(): RoiMetrics {
  const now = new Date().toISOString();
  return {
    period: { from: now, to: now },
    findings: {
      totalDetected: 0,
      totalFixed: 0,
      totalOpen: 0,
      totalAcceptedRisk: 0,
      totalFalsePositive: 0,
      fixRate: 0,
      bySeverity: {},
    },
    autoFix: { available: 0, applied: 0, adoptionRate: 0 },
    timeSaved: { estimatedMinutes: 0, estimatedHours: 0, breakdown: [] },
    trend: { direction: "stable", newFindingsPerRun: 0, fixedFindingsPerRun: 0 },
  };
}

// ─── Runner ─────────────────────────────────────────────────────────────────

export function runOrgMetrics(argv: string[]): void {
  const dirs: string[] = [];
  let format = "text";
  let sinceDays: number | undefined;

  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--format" && argv[i + 1]) {
      format = argv[++i];
    } else if (argv[i] === "--since" && argv[i + 1]) {
      const m = /^(\d+)d$/.exec(argv[++i]);
      if (m) sinceDays = parseInt(m[1], 10);
    } else if (argv[i] === "--dirs") {
      // Collect all subsequent non-flag arguments as directories
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        dirs.push(argv[++i]);
      }
    } else if (!argv[i].startsWith("--")) {
      dirs.push(argv[i]);
    }
  }

  // If no dirs specified, look for sibling project directories
  if (dirs.length === 0) {
    const cwd = process.cwd();
    try {
      const siblings = readdirSync(cwd, { withFileTypes: true });
      for (const entry of siblings) {
        if (entry.isDirectory() && existsSync(join(cwd, entry.name, ".judges-findings.json"))) {
          dirs.push(join(cwd, entry.name));
        }
      }
    } catch {
      // Ignore
    }
    // Also check current directory
    if (existsSync(join(cwd, ".judges-findings.json"))) {
      dirs.push(cwd);
    }
  }

  if (dirs.length === 0) {
    console.error("  No project directories with Judges findings found.");
    console.error("  Usage: judges org-metrics --dirs project1/ project2/");
    process.exit(1);
  }

  const org = aggregateOrgMetrics(dirs, sinceDays);

  if (format === "json") {
    console.log(JSON.stringify(org, null, 2));
    return;
  }

  // Text format
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║         Judges — Organization-Level Metrics                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Projects:      ${org.projects.length}`);
  console.log(`  Contributors:  ${org.contributors}`);
  console.log(`  Period:        ${org.aggregated.period.from.slice(0, 10)} → ${org.aggregated.period.to.slice(0, 10)}`);
  console.log("");
  console.log("── Aggregate Findings ──────────────────────────────────────────");
  console.log(`   Detected:       ${org.aggregated.findings.totalDetected}`);
  console.log(`   Fixed:          ${org.aggregated.findings.totalFixed}`);
  console.log(`   Open:           ${org.aggregated.findings.totalOpen}`);
  console.log(`   Fix rate:       ${(org.aggregated.findings.fixRate * 100).toFixed(1)}%`);
  console.log("");
  console.log("── Estimated Time Saved ────────────────────────────────────────");
  console.log(`   Total: ~${org.aggregated.timeSaved.estimatedHours} hours`);
  console.log(`   Trend: ${org.aggregated.trend.direction}`);
  console.log("");

  if (org.perProject.length > 1) {
    console.log("── Per-Project Breakdown ───────────────────────────────────────");
    for (const p of org.perProject) {
      const rate = (p.metrics.findings.fixRate * 100).toFixed(0);
      console.log(
        `   ${p.project.padEnd(25)} ${p.metrics.findings.totalDetected} findings, ${rate}% fixed, ~${p.metrics.timeSaved.estimatedHours}h saved`,
      );
    }
    console.log("");
  }
}

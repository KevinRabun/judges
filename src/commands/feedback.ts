/**
 * `judges feedback` — False-positive tracking & finding feedback.
 *
 * Allows users to mark findings as true positives, false positives,
 * or "won't fix" and persists feedback to a local .judges-feedback.json file.
 * This data is used by the confidence calibration system to improve
 * accuracy over time.
 *
 * Usage:
 *   judges feedback submit --rule SEC-001 --verdict fp          # Mark false positive
 *   judges feedback submit --rule AUTH-002 --verdict tp          # Mark true positive
 *   judges feedback submit --rule SEC-001 --verdict wontfix     # Won't fix
 *   judges feedback stats                                        # Show FP rate stats
 *   judges feedback export                                       # Export feedback data
 *   judges feedback reset                                        # Clear all feedback
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export type FeedbackVerdict = "tp" | "fp" | "wontfix";

export interface FeedbackEntry {
  /** Rule ID (e.g. SEC-001) */
  ruleId: string;
  /** User verdict: true positive, false positive, or won't fix */
  verdict: FeedbackVerdict;
  /** Optional comment */
  comment?: string;
  /** File path where finding was reported */
  filePath?: string;
  /** Timestamp of feedback submission */
  timestamp: string;
  /** Finding title for context */
  title?: string;
  /** Finding severity at time of feedback */
  severity?: string;
}

export interface FeedbackStore {
  /** Schema version for migration support */
  version: 1;
  /** All feedback entries */
  entries: FeedbackEntry[];
  /** Metadata */
  metadata: {
    createdAt: string;
    lastUpdated: string;
    totalSubmissions: number;
  };
}

export interface FeedbackStats {
  /** Total feedback entries */
  total: number;
  /** True positive count */
  truePositives: number;
  /** False positive count */
  falsePositives: number;
  /** Won't fix count */
  wontFix: number;
  /** Overall false positive rate (0-1) */
  falsePositiveRate: number;
  /** Per-rule breakdown */
  perRule: Map<string, RuleFeedbackStats>;
  /** Per-judge breakdown (by rule prefix) */
  perJudge: Map<string, JudgeFeedbackStats>;
}

export interface RuleFeedbackStats {
  ruleId: string;
  total: number;
  tp: number;
  fp: number;
  wontfix: number;
  fpRate: number;
}

export interface JudgeFeedbackStats {
  judgePrefix: string;
  total: number;
  tp: number;
  fp: number;
  wontfix: number;
  fpRate: number;
}

// ─── Feedback Store Operations ──────────────────────────────────────────────

const DEFAULT_FEEDBACK_FILE = ".judges-feedback.json";

function createEmptyStore(): FeedbackStore {
  const now = new Date().toISOString();
  return {
    version: 1,
    entries: [],
    metadata: {
      createdAt: now,
      lastUpdated: now,
      totalSubmissions: 0,
    },
  };
}

export function loadFeedbackStore(feedbackPath?: string): FeedbackStore {
  const filePath = resolve(feedbackPath || DEFAULT_FEEDBACK_FILE);
  if (!existsSync(filePath)) {
    return createEmptyStore();
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    if (raw.version === 1 && Array.isArray(raw.entries)) {
      return raw as FeedbackStore;
    }
    return createEmptyStore();
  } catch {
    return createEmptyStore();
  }
}

export function saveFeedbackStore(store: FeedbackStore, feedbackPath?: string): void {
  const filePath = resolve(feedbackPath || DEFAULT_FEEDBACK_FILE);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  store.metadata.lastUpdated = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export function addFeedback(store: FeedbackStore, entry: FeedbackEntry): FeedbackStore {
  store.entries.push(entry);
  store.metadata.totalSubmissions++;
  store.metadata.lastUpdated = new Date().toISOString();
  return store;
}

// ─── Statistics ─────────────────────────────────────────────────────────────

export function computeFeedbackStats(store: FeedbackStore): FeedbackStats {
  const perRule = new Map<string, RuleFeedbackStats>();
  const perJudge = new Map<string, JudgeFeedbackStats>();

  let tp = 0;
  let fp = 0;
  let wontfix = 0;

  for (const entry of store.entries) {
    // Overall counts
    if (entry.verdict === "tp") tp++;
    else if (entry.verdict === "fp") fp++;
    else if (entry.verdict === "wontfix") wontfix++;

    // Per-rule stats
    const ruleStats = perRule.get(entry.ruleId) || {
      ruleId: entry.ruleId,
      total: 0,
      tp: 0,
      fp: 0,
      wontfix: 0,
      fpRate: 0,
    };
    ruleStats.total++;
    if (entry.verdict === "tp") ruleStats.tp++;
    else if (entry.verdict === "fp") ruleStats.fp++;
    else if (entry.verdict === "wontfix") ruleStats.wontfix++;
    ruleStats.fpRate = ruleStats.total > 0 ? ruleStats.fp / ruleStats.total : 0;
    perRule.set(entry.ruleId, ruleStats);

    // Per-judge stats (by rule prefix, e.g. "SEC" from "SEC-001")
    const prefix = entry.ruleId.split("-")[0];
    if (prefix) {
      const judgeStats = perJudge.get(prefix) || {
        judgePrefix: prefix,
        total: 0,
        tp: 0,
        fp: 0,
        wontfix: 0,
        fpRate: 0,
      };
      judgeStats.total++;
      if (entry.verdict === "tp") judgeStats.tp++;
      else if (entry.verdict === "fp") judgeStats.fp++;
      else if (entry.verdict === "wontfix") judgeStats.wontfix++;
      judgeStats.fpRate = judgeStats.total > 0 ? judgeStats.fp / judgeStats.total : 0;
      perJudge.set(prefix, judgeStats);
    }
  }

  const total = store.entries.length;
  return {
    total,
    truePositives: tp,
    falsePositives: fp,
    wontFix: wontfix,
    falsePositiveRate: total > 0 ? fp / total : 0,
    perRule,
    perJudge,
  };
}

/**
 * Get a lookup map of FP rates by rule ID, suitable for confidence calibration.
 */
export function getFpRateByRule(store: FeedbackStore): Map<string, number> {
  const stats = computeFeedbackStats(store);
  const result = new Map<string, number>();
  for (const [ruleId, ruleStat] of stats.perRule) {
    if (ruleStat.total >= 3) {
      // Only calibrate if we have enough data
      result.set(ruleId, ruleStat.fpRate);
    }
  }
  return result;
}

// ─── CLI Command ────────────────────────────────────────────────────────────

interface FeedbackArgs {
  subcommand: string; // submit | stats | export | reset
  ruleId?: string;
  verdict?: FeedbackVerdict;
  comment?: string;
  filePath?: string;
  title?: string;
  severity?: string;
  feedbackFile?: string;
  format?: "text" | "json";
}

function parseFeedbackArgs(argv: string[]): FeedbackArgs {
  const args: FeedbackArgs = {
    subcommand: argv[3] || "stats",
    format: "text",
  };

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--rule":
      case "-r":
        args.ruleId = argv[++i];
        break;
      case "--verdict":
      case "-v":
        args.verdict = argv[++i] as FeedbackVerdict;
        break;
      case "--comment":
      case "-m":
        args.comment = argv[++i];
        break;
      case "--file":
      case "-f":
        args.filePath = argv[++i];
        break;
      case "--title":
        args.title = argv[++i];
        break;
      case "--severity":
        args.severity = argv[++i];
        break;
      case "--feedback-file":
        args.feedbackFile = argv[++i];
        break;
      case "--format":
      case "-o":
        args.format = argv[++i] as "text" | "json";
        break;
      default:
        break;
    }
  }

  return args;
}

function printFeedbackHelp(): void {
  console.log(`
Judges Panel — Feedback & False Positive Tracking

USAGE:
  judges feedback submit --rule <id> --verdict <tp|fp|wontfix>   Submit feedback
  judges feedback stats                                           View FP rate stats
  judges feedback export                                          Export as JSON
  judges feedback reset                                           Clear all feedback

SUBMIT OPTIONS:
  --rule, -r <id>          Rule ID (e.g. SEC-001, AUTH-002)
  --verdict, -v <verdict>  tp (true positive), fp (false positive), wontfix
  --comment, -m <text>     Optional comment explaining the feedback
  --file, -f <path>        File where finding was reported
  --title <text>           Finding title for context
  --severity <sev>         Finding severity
  --feedback-file <path>   Path to feedback file (default: .judges-feedback.json)
  --format, -o <fmt>       Output format: text, json

EXAMPLES:
  judges feedback submit --rule SEC-001 --verdict fp --comment "Used in test file"
  judges feedback submit --rule AUTH-002 --verdict tp
  judges feedback stats
  judges feedback export > feedback-report.json
`);
}

function formatStatsOutput(stats: FeedbackStats): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║           Judges Panel — Feedback Statistics                ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Total Feedback     : ${stats.total}`);
  lines.push(`  True Positives     : ${stats.truePositives}`);
  lines.push(`  False Positives    : ${stats.falsePositives}`);
  lines.push(`  Won't Fix          : ${stats.wontFix}`);
  lines.push(`  FP Rate            : ${(stats.falsePositiveRate * 100).toFixed(1)}%`);
  lines.push("");

  if (stats.perJudge.size > 0) {
    lines.push("  Per-Judge FP Rates:");
    lines.push("  " + "─".repeat(55));
    const sorted = [...stats.perJudge.values()].sort((a, b) => b.fpRate - a.fpRate);
    for (const j of sorted) {
      const prefix = j.judgePrefix.padEnd(12);
      const rate = `${(j.fpRate * 100).toFixed(1)}%`.padStart(6);
      const counts = `${j.tp}tp / ${j.fp}fp / ${j.wontfix}wf`;
      lines.push(`  ${prefix} FP: ${rate}   (${counts})`);
    }
    lines.push("");
  }

  if (stats.perRule.size > 0) {
    lines.push("  Per-Rule FP Rates (top 20):");
    lines.push("  " + "─".repeat(55));
    const sorted = [...stats.perRule.values()].sort((a, b) => b.fpRate - a.fpRate).slice(0, 20);
    for (const r of sorted) {
      const ruleId = r.ruleId.padEnd(12);
      const rate = `${(r.fpRate * 100).toFixed(1)}%`.padStart(6);
      const counts = `${r.tp}tp / ${r.fp}fp / ${r.wontfix}wf`;
      lines.push(`  ${ruleId} FP: ${rate}   (${counts})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function runFeedback(argv: string[]): void {
  const args = parseFeedbackArgs(argv);

  if (args.subcommand === "--help" || args.subcommand === "-h") {
    printFeedbackHelp();
    process.exit(0);
  }

  const store = loadFeedbackStore(args.feedbackFile);

  switch (args.subcommand) {
    case "submit": {
      if (!args.ruleId) {
        console.error("Error: --rule is required for submit");
        process.exit(1);
      }
      if (!args.verdict || !["tp", "fp", "wontfix"].includes(args.verdict)) {
        console.error("Error: --verdict must be one of: tp, fp, wontfix");
        process.exit(1);
      }

      const entry: FeedbackEntry = {
        ruleId: args.ruleId.toUpperCase(),
        verdict: args.verdict,
        comment: args.comment,
        filePath: args.filePath,
        title: args.title,
        severity: args.severity,
        timestamp: new Date().toISOString(),
      };

      addFeedback(store, entry);
      saveFeedbackStore(store, args.feedbackFile);

      const verdictLabel = { tp: "true positive", fp: "false positive", wontfix: "won't fix" };
      console.log(`✓ Recorded ${args.ruleId.toUpperCase()} as ${verdictLabel[args.verdict]}`);
      process.exit(0);
      break;
    }

    case "stats": {
      const stats = computeFeedbackStats(store);
      if (args.format === "json") {
        // Convert Maps to objects for JSON
        const jsonStats = {
          ...stats,
          perRule: Object.fromEntries(stats.perRule),
          perJudge: Object.fromEntries(stats.perJudge),
        };
        console.log(JSON.stringify(jsonStats, null, 2));
      } else {
        console.log(formatStatsOutput(stats));
      }
      process.exit(0);
      break;
    }

    case "export": {
      console.log(JSON.stringify(store, null, 2));
      process.exit(0);
      break;
    }

    case "reset": {
      const empty = createEmptyStore();
      saveFeedbackStore(empty, args.feedbackFile);
      console.log("✓ Feedback store reset");
      process.exit(0);
      break;
    }

    default:
      console.error(`Unknown feedback subcommand: ${args.subcommand}`);
      printFeedbackHelp();
      process.exit(1);
  }
}

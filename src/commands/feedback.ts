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
import { generateAutoTuneReport, formatAutoTuneReport, formatAutoTuneReportJson } from "../auto-tune.js";

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
  /** Contributor identifier (username, email, etc.) for team aggregation */
  contributor?: string;
  /**
   * Origin of this feedback entry:
   * - "manual"       — developer submitted via CLI or UI
   * - "l2-dismissal" — LLM deep review dismissed an L1 finding as FP
   * - "pr-review"    — captured from PR review interaction
   */
  source?: "manual" | "l2-dismissal" | "pr-review";
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

/**
 * Team-wide aggregated feedback statistics from multiple contributors.
 */
export interface TeamFeedbackStats extends FeedbackStats {
  /** Number of distinct feedback sources merged */
  contributorCount: number;
  /** Per-rule details including contributor consensus */
  perRuleTeam: Map<string, RuleTeamStats>;
  /** Rules where ≥2 contributors independently flagged as FP */
  consensusFpRules: string[];
  /** Rules where feedback is split (some say TP, others say FP) */
  disputedRules: string[];
}

/**
 * Per-rule stats with multi-contributor consensus data.
 */
export interface RuleTeamStats extends RuleFeedbackStats {
  /** Number of distinct contributors who provided feedback for this rule */
  contributors: number;
  /** How many distinct contributors marked this rule as FP */
  fpContributors: number;
  /** Consensus strength: fpContributors / contributors (0-1) */
  consensus: number;
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

// ─── Team-wide Feedback Aggregation ─────────────────────────────────────────

/**
 * Merge multiple feedback stores into a single aggregate store.
 * Entries are deduplicated by {ruleId + verdict + timestamp + filePath}.
 * Each source can be tagged with a contributor identifier.
 */
export function mergeFeedbackStores(stores: FeedbackStore[], contributorLabels?: string[]): FeedbackStore {
  const merged = createEmptyStore();
  const seen = new Set<string>();

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    const label = contributorLabels?.[i];

    for (const entry of store.entries) {
      // Tag with contributor if not already set
      const tagged = label && !entry.contributor ? { ...entry, contributor: label } : entry;

      // Dedup key: ruleId + verdict + timestamp + filePath
      const key = `${tagged.ruleId}::${tagged.verdict}::${tagged.timestamp}::${tagged.filePath || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.entries.push(tagged);
      }
    }
  }

  merged.metadata.totalSubmissions = merged.entries.length;
  merged.metadata.lastUpdated = new Date().toISOString();
  return merged;
}

/**
 * Compute team-wide feedback statistics with multi-contributor consensus.
 * Identifies rules where multiple contributors independently flagged issues
 * as FP (consensus) or where feedback is split between TP and FP (disputed).
 */
export function computeTeamFeedbackStats(store: FeedbackStore): TeamFeedbackStats {
  const base = computeFeedbackStats(store);

  // Track per-rule contributor data
  const ruleContributors = new Map<string, Set<string>>();
  const ruleFpContributors = new Map<string, Set<string>>();

  for (const entry of store.entries) {
    const contributor = entry.contributor || "anonymous";

    const rc = ruleContributors.get(entry.ruleId) ?? new Set();
    rc.add(contributor);
    ruleContributors.set(entry.ruleId, rc);

    if (entry.verdict === "fp") {
      const fc = ruleFpContributors.get(entry.ruleId) ?? new Set();
      fc.add(contributor);
      ruleFpContributors.set(entry.ruleId, fc);
    }
  }

  // Build per-rule team stats
  const perRuleTeam = new Map<string, RuleTeamStats>();
  for (const [ruleId, ruleStats] of base.perRule) {
    const contributors = ruleContributors.get(ruleId)?.size ?? 1;
    const fpContributors = ruleFpContributors.get(ruleId)?.size ?? 0;
    perRuleTeam.set(ruleId, {
      ...ruleStats,
      contributors,
      fpContributors,
      consensus: contributors > 0 ? fpContributors / contributors : 0,
    });
  }

  // Identify consensus FP rules (≥2 contributors independently flagged FP)
  const consensusFpRules: string[] = [];
  const disputedRules: string[] = [];

  for (const [ruleId, teamStats] of perRuleTeam) {
    if (teamStats.fpContributors >= 2) {
      consensusFpRules.push(ruleId);
    }
    // Disputed: has both TP and FP verdicts from different contributors
    if (teamStats.tp > 0 && teamStats.fp > 0 && teamStats.contributors >= 2) {
      disputedRules.push(ruleId);
    }
  }

  // Count distinct contributors across all entries
  const allContributors = new Set(store.entries.map((e) => e.contributor || "anonymous"));

  return {
    ...base,
    contributorCount: allContributors.size,
    perRuleTeam,
    consensusFpRules: consensusFpRules.sort(),
    disputedRules: disputedRules.sort(),
  };
}

/**
 * Format team feedback stats as a human-readable summary.
 */
export function formatTeamStatsOutput(stats: TeamFeedbackStats): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║        Judges Panel — Team Feedback Statistics              ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Contributors       : ${stats.contributorCount}`);
  lines.push(`  Total Feedback     : ${stats.total}`);
  lines.push(`  True Positives     : ${stats.truePositives}`);
  lines.push(`  False Positives    : ${stats.falsePositives}`);
  lines.push(`  Won't Fix          : ${stats.wontFix}`);
  lines.push(`  Team FP Rate       : ${(stats.falsePositiveRate * 100).toFixed(1)}%`);
  lines.push("");

  if (stats.consensusFpRules.length > 0) {
    lines.push("  ⚠ Consensus FP Rules (≥2 contributors agree):");
    lines.push("  " + "─".repeat(55));
    for (const ruleId of stats.consensusFpRules) {
      const rs = stats.perRuleTeam.get(ruleId)!;
      lines.push(
        `    ${ruleId.padEnd(12)} ${rs.fpContributors}/${rs.contributors} contributors flagged FP (${(rs.fpRate * 100).toFixed(0)}% FP rate)`,
      );
    }
    lines.push("");
  }

  if (stats.disputedRules.length > 0) {
    lines.push("  ⚡ Disputed Rules (mixed TP/FP verdicts):");
    lines.push("  " + "─".repeat(55));
    for (const ruleId of stats.disputedRules) {
      const rs = stats.perRuleTeam.get(ruleId)!;
      lines.push(`    ${ruleId.padEnd(12)} ${rs.tp}tp / ${rs.fp}fp from ${rs.contributors} contributors`);
    }
    lines.push("");
  }

  if (stats.perJudge.size > 0) {
    lines.push("  Per-Judge FP Rates:");
    lines.push("  " + "─".repeat(55));
    const sorted = [...stats.perJudge.values()].sort((a, b) => b.fpRate - a.fpRate);
    for (const j of sorted) {
      const prefix = j.judgePrefix.padEnd(12);
      const rate = `${(j.fpRate * 100).toFixed(1)}%`.padStart(6);
      lines.push(`  ${prefix} FP: ${rate}   (${j.tp}tp / ${j.fp}fp / ${j.wontfix}wf)`);
    }
    lines.push("");
  }

  return lines.join("\n");
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
  judges feedback tune                                            Auto-tune recommendations
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

// ─── L2 Closed-Loop Feedback ─────────────────────────────────────────────────
// Parse "Dismissed Findings" from LLM deep-review responses and record them
// automatically as FP feedback, closing the loop between L2 analysis and
// the confidence calibration system.

/**
 * A finding dismissed by the LLM during deep contextual review (L2).
 */
export interface DismissedFinding {
  /** Rule ID of the dismissed finding (e.g. SEC-001) */
  ruleId: string;
  /** LLM's explanation of why it was dismissed */
  reason: string;
}

/**
 * Parse dismissed findings from an LLM deep-review response.
 *
 * The deep-review prompt instructs the LLM to list dismissed findings in a
 * "Dismissed Findings" section, each with a rule ID and explanation. This
 * function extracts those entries from the markdown.
 *
 * Accepted formats:
 *   - `SEC-001` — reason text
 *   - `**SEC-001**` — reason text
 *   - `SEC-001: reason text`
 *   - `- SEC-001 — reason text`
 *   - `- **SEC-001**: reason text`
 */
export function parseDismissedFindings(llmResponse: string): DismissedFinding[] {
  const dismissed: DismissedFinding[] = [];
  const lines = llmResponse.split("\n");
  let inSection = false;

  for (const line of lines) {
    // Detect "Dismissed Findings" section header
    if (/^#+\s*\*{0,2}Dismissed Findings\*{0,2}/i.test(line)) {
      inSection = true;
      continue;
    }
    // Detect section end (next heading or horizontal rule)
    if (inSection && /^(?:#+\s|={3,}$|-{3,}$)/.test(line)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;

    // Match rule IDs followed by explanations on each line
    // Supports: - SEC-001 — reason, - **SEC-001**: reason, SEC-001: reason
    const match = line.match(/\*{0,2}([A-Z]{2,10}-\d{1,4})\*{0,2}\s*[—:–-]\s*(.+)/);
    if (match) {
      const ruleId = match[1].trim();
      const reason = match[2].trim();
      if (ruleId && reason) {
        dismissed.push({ ruleId, reason });
      }
    }
  }

  return dismissed;
}

/**
 * Record L2 deep-review dismissals as FP feedback entries.
 *
 * This closes the feedback loop: when the LLM's deep contextual review
 * dismisses L1 pattern findings as false positives, those dismissals are
 * persisted to the feedback store and feed into the confidence calibration
 * system (auto-tune, FP rate tracking).
 *
 * Returns the number of new entries recorded.
 */
export function recordL2Feedback(llmResponse: string, feedbackPath?: string, filePath?: string): number {
  const dismissed = parseDismissedFindings(llmResponse);
  if (dismissed.length === 0) return 0;

  const store = loadFeedbackStore(feedbackPath);
  const now = new Date().toISOString();

  for (const d of dismissed) {
    addFeedback(store, {
      ruleId: d.ruleId,
      verdict: "fp",
      comment: `L2 deep review dismissal: ${d.reason}`,
      filePath,
      timestamp: now,
      source: "l2-dismissal",
    });
  }

  saveFeedbackStore(store, feedbackPath);
  return dismissed.length;
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

    case "tune": {
      const report = generateAutoTuneReport(store);
      if (args.format === "json") {
        console.log(formatAutoTuneReportJson(report));
      } else {
        console.log(formatAutoTuneReport(report));
      }
      process.exit(0);
      break;
    }

    default:
      console.error(`Unknown feedback subcommand: ${args.subcommand}`);
      printFeedbackHelp();
      process.exit(1);
  }
}

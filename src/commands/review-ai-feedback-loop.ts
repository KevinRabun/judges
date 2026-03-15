import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Finding } from "../types.js";

/* ── review-ai-feedback-loop ────────────────────────────────────────
   Capture reviewer feedback on AI findings to build a local
   feedback dataset that improves accuracy over time. All data
   is stored locally — no user data is sent externally.
   ─────────────────────────────────────────────────────────────────── */

interface FeedbackEntry {
  ruleId: string;
  verdict: string;
  feedback: "agree" | "disagree" | "partial";
  reason: string;
  timestamp: string;
}

interface FeedbackStats {
  total: number;
  agree: number;
  disagree: number;
  partial: number;
  agreementRate: number;
  topDisagreed: Array<{ ruleId: string; count: number }>;
}

function computeStats(entries: FeedbackEntry[]): FeedbackStats {
  const agree = entries.filter((e) => e.feedback === "agree").length;
  const disagree = entries.filter((e) => e.feedback === "disagree").length;
  const partial = entries.filter((e) => e.feedback === "partial").length;

  const disagreedRules = new Map<string, number>();
  for (const e of entries) {
    if (e.feedback === "disagree") {
      disagreedRules.set(e.ruleId, (disagreedRules.get(e.ruleId) ?? 0) + 1);
    }
  }

  const topDisagreed = [...disagreedRules.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ruleId, count]) => ({ ruleId, count }));

  return {
    total: entries.length,
    agree,
    disagree,
    partial,
    agreementRate: entries.length > 0 ? agree / entries.length : 0,
    topDisagreed,
  };
}

export function runReviewAiFeedbackLoop(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-ai-feedback-loop [options]

Capture and analyze reviewer feedback on AI findings.

Options:
  --add <ruleId>       Add feedback for a specific rule
  --feedback <type>    Feedback type: agree, disagree, partial
  --reason <text>      Reason for feedback
  --report <path>      Path to verdict JSON to review
  --stats              Show feedback statistics
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";
  const feedbackDir = join(process.cwd(), ".judges", "feedback");

  if (!existsSync(feedbackDir)) {
    mkdirSync(feedbackDir, { recursive: true });
  }

  const feedbackFile = join(feedbackDir, "feedback-log.json");
  let entries: FeedbackEntry[] = [];
  if (existsSync(feedbackFile)) {
    entries = JSON.parse(readFileSync(feedbackFile, "utf-8")) as FeedbackEntry[];
  }

  if (argv.includes("--stats")) {
    const stats = computeStats(entries);
    if (format === "json") {
      console.log(JSON.stringify(stats, null, 2));
      return;
    }
    console.log("\n=== AI Feedback Statistics ===\n");
    console.log(`Total feedback entries: ${stats.total}`);
    console.log(`  Agree: ${stats.agree} (${(stats.agreementRate * 100).toFixed(1)}%)`);
    console.log(`  Disagree: ${stats.disagree}`);
    console.log(`  Partial: ${stats.partial}`);
    if (stats.topDisagreed.length > 0) {
      console.log("\nTop Disagreed Rules:");
      for (const rule of stats.topDisagreed) {
        console.log(`  ${rule.ruleId}: ${rule.count} disagreements`);
      }
    }
    return;
  }

  const addIdx = argv.indexOf("--add");
  if (addIdx !== -1 && argv[addIdx + 1]) {
    const ruleId = argv[addIdx + 1];
    const fbIdx = argv.indexOf("--feedback");
    const feedbackType = fbIdx !== -1 && argv[fbIdx + 1] ? argv[fbIdx + 1] : "agree";
    const reasonIdx = argv.indexOf("--reason");
    const reason = reasonIdx !== -1 && argv[reasonIdx + 1] ? argv[reasonIdx + 1] : "";

    if (feedbackType !== "agree" && feedbackType !== "disagree" && feedbackType !== "partial") {
      console.error("Invalid feedback type. Use: agree, disagree, or partial");
      process.exitCode = 1;
      return;
    }

    const entry: FeedbackEntry = {
      ruleId,
      verdict: "reviewed",
      feedback: feedbackType,
      reason,
      timestamp: new Date().toISOString(),
    };
    entries.push(entry);
    writeFileSync(feedbackFile, JSON.stringify(entries, null, 2));
    console.log(`Feedback recorded for ${ruleId}: ${feedbackType}`);
    return;
  }

  const reportIdx = argv.indexOf("--report");
  if (reportIdx !== -1 && argv[reportIdx + 1]) {
    const reportPath = join(process.cwd(), argv[reportIdx + 1]);
    if (!existsSync(reportPath)) {
      console.error(`Report not found: ${reportPath}`);
      process.exitCode = 1;
      return;
    }
    const data = JSON.parse(readFileSync(reportPath, "utf-8"));
    const findings: Finding[] = data.findings ?? [];
    console.log(`\nFound ${findings.length} findings to review.`);
    console.log("Use --add <ruleId> --feedback <type> to record feedback.\n");
    for (const f of findings) {
      const existingFb = entries.find((e) => e.ruleId === f.ruleId);
      const fbStatus = existingFb !== undefined ? ` [${existingFb.feedback}]` : " [no feedback]";
      console.log(`  ${f.ruleId} (${f.severity})${fbStatus}: ${f.title}`);
    }
    return;
  }

  console.log("Use --stats, --add, or --report to interact with the feedback system.");
}

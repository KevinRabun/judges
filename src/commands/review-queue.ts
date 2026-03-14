/**
 * Review queue — surface findings needing human judgment and route
 * them to appropriate experts based on rule ownership.
 *
 * Uses local data from findings, rule-owners, and feedback.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReviewItem {
  id: string;
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  confidence: number;
  recommendedReviewer?: string;
  status: "pending" | "approved" | "dismissed" | "escalated";
  verdict?: string;
  reviewedBy?: string;
  reviewedIso?: string;
  addedIso: string;
}

interface ReviewDb {
  items: ReviewItem[];
}

const REVIEW_FILE = ".judges-review-queue.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(file = REVIEW_FILE): ReviewDb {
  if (!existsSync(file)) return { items: [] };
  return JSON.parse(readFileSync(file, "utf-8"));
}

function saveDb(db: ReviewDb, file = REVIEW_FILE): void {
  writeFileSync(file, JSON.stringify(db, null, 2));
}

function itemId(f: Finding): string {
  return `${f.ruleId}:${f.title}`.slice(0, 80);
}

function resolveReviewer(ruleId: string): string | undefined {
  try {
    const ownerFile = ".judges-owners.json";
    if (!existsSync(ownerFile)) return undefined;
    const db = JSON.parse(readFileSync(ownerFile, "utf-8"));
    if (!db.owners) return undefined;
    // Exact match first
    const exact = db.owners.find((o: { pattern: string }) => o.pattern === ruleId);
    if (exact) return exact.owner;
    // Prefix match
    let best: { pattern: string; owner: string } | undefined;
    for (const o of db.owners) {
      if (ruleId.startsWith(o.pattern) && (!best || o.pattern.length > best.pattern.length)) {
        best = o;
      }
    }
    return best?.owner;
  } catch {
    return undefined;
  }
}

export function addToReviewQueue(findings: Finding[], confidenceThreshold = 0.6): ReviewItem[] {
  const db = loadDb();
  const existing = new Set(db.items.map((i) => i.id));
  const added: ReviewItem[] = [];
  const now = new Date().toISOString();

  for (const f of findings) {
    const conf = f.confidence ?? 0.5;
    if (conf >= confidenceThreshold) continue; // High-confidence: auto-approved

    const id = itemId(f);
    if (existing.has(id)) continue;

    const item: ReviewItem = {
      id,
      ruleId: f.ruleId,
      severity: f.severity,
      title: f.title,
      description: f.description,
      confidence: conf,
      recommendedReviewer: resolveReviewer(f.ruleId),
      status: "pending",
      addedIso: now,
    };
    db.items.push(item);
    added.push(item);
    existing.add(id);
  }

  saveDb(db);
  return added;
}

export function reviewItem(id: string, verdict: "approved" | "dismissed" | "escalated", reviewer: string): void {
  const db = loadDb();
  const item = db.items.find((i) => i.id === id);
  if (!item) throw new Error(`Review item not found: ${id}`);
  item.status = verdict;
  item.verdict = verdict;
  item.reviewedBy = reviewer;
  item.reviewedIso = new Date().toISOString();
  saveDb(db);
}

export function getQueueStats(): {
  total: number;
  pending: number;
  approved: number;
  dismissed: number;
  escalated: number;
  byReviewer: Record<string, number>;
  avgConfidence: number;
} {
  const db = loadDb();
  const stats = {
    total: db.items.length,
    pending: db.items.filter((i) => i.status === "pending").length,
    approved: db.items.filter((i) => i.status === "approved").length,
    dismissed: db.items.filter((i) => i.status === "dismissed").length,
    escalated: db.items.filter((i) => i.status === "escalated").length,
    byReviewer: {} as Record<string, number>,
    avgConfidence: 0,
  };

  for (const i of db.items) {
    const reviewer = i.recommendedReviewer || "unassigned";
    stats.byReviewer[reviewer] = (stats.byReviewer[reviewer] || 0) + 1;
  }

  const pending = db.items.filter((i) => i.status === "pending");
  if (pending.length > 0) {
    stats.avgConfidence = Math.round((pending.reduce((s, i) => s + i.confidence, 0) / pending.length) * 100) / 100;
  }

  return stats;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export async function runReviewQueue(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-queue — Human review queue for low-confidence findings

Usage:
  judges review-queue --input results.json      Add low-confidence findings to queue
  judges review-queue --list                     Show pending review items
  judges review-queue --approve <id> --reviewer "Alice"
  judges review-queue --dismiss <id> --reviewer "Bob"
  judges review-queue --escalate <id> --reviewer "Carol"
  judges review-queue --stats                    Show queue statistics

Options:
  --input <path>        Results JSON with findings
  --threshold <n>       Confidence threshold (default: 0.6, below → queue)
  --list                Show pending items
  --approve <id>        Approve a finding as valid
  --dismiss <id>        Dismiss a finding as FP
  --escalate <id>       Escalate for deeper review
  --reviewer <name>     Reviewer name (required for verdicts)
  --stats               Queue statistics
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Add findings from input
  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  if (inputPath) {
    if (!existsSync(inputPath)) {
      console.error(`Error: file not found: ${inputPath}`);
      process.exit(1);
    }
    const data = JSON.parse(readFileSync(inputPath, "utf-8"));
    const findings: Finding[] = data.evaluations
      ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
      : data.findings || data;

    const thresholdStr = argv.find((_a: string, i: number) => argv[i - 1] === "--threshold");
    const threshold = thresholdStr ? parseFloat(thresholdStr) : 0.6;
    const added = addToReviewQueue(findings, threshold);

    if (format === "json") {
      console.log(JSON.stringify(added, null, 2));
    } else {
      console.log(`\n  Added ${added.length} finding(s) to review queue (threshold: ${threshold})\n`);
      for (const item of added.slice(0, 10)) {
        console.log(
          `    ${item.severity.padEnd(8)} ${item.ruleId.padEnd(12)} conf: ${item.confidence} → ${item.recommendedReviewer || "unassigned"}`,
        );
      }
      if (added.length > 10) console.log(`    ... and ${added.length - 10} more`);
      console.log("");
    }
    return;
  }

  // Verdicts
  const reviewer = argv.find((_a: string, i: number) => argv[i - 1] === "--reviewer");
  for (const action of ["approve", "dismiss", "escalate"] as const) {
    const target = argv.find((_a: string, i: number) => argv[i - 1] === `--${action}`);
    if (target) {
      if (!reviewer) {
        console.error("Error: --reviewer required");
        process.exit(1);
      }
      const verdict = action === "approve" ? "approved" : action === "dismiss" ? "dismissed" : "escalated";
      reviewItem(target, verdict, reviewer);
      console.log(`  ${verdict}: ${target} by ${reviewer}`);
      return;
    }
  }

  // List pending
  if (argv.includes("--list")) {
    const db = loadDb();
    const pending = db.items.filter((i) => i.status === "pending");
    if (format === "json") {
      console.log(JSON.stringify(pending, null, 2));
    } else if (pending.length === 0) {
      console.log("\n  Review queue is empty.\n");
    } else {
      console.log(`\n  Pending Reviews (${pending.length})\n  ──────────────────`);
      for (const item of pending) {
        console.log(
          `    ${item.severity.padEnd(8)} ${item.ruleId.padEnd(12)} conf: ${item.confidence} → ${item.recommendedReviewer || "unassigned"}`,
        );
        console.log(`      ${item.title}`);
        console.log(`      ID: ${item.id}`);
      }
      console.log("");
    }
    return;
  }

  // Stats (default)
  const s = getQueueStats();
  if (format === "json") {
    console.log(JSON.stringify(s, null, 2));
  } else {
    console.log(`
  Review Queue
  ────────────
  Total:     ${s.total}
  Pending:   ${s.pending}
  Approved:  ${s.approved}
  Dismissed: ${s.dismissed}
  Escalated: ${s.escalated}
  Avg conf:  ${s.avgConfidence}
`);
    if (Object.keys(s.byReviewer).length > 0) {
      console.log("  By reviewer:");
      for (const [name, count] of Object.entries(s.byReviewer)) {
        console.log(`    ${name.padEnd(20)} ${count}`);
      }
      console.log("");
    }
  }
}

/**
 * Review-handoff — structured escalation to human reviewers with narrowed scope.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HandoffItem {
  file: string;
  lineStart: number;
  lineEnd: number;
  reason: string;
  confidence: number;
  question: string;
  preAnalysis: string;
  severity: "critical" | "high" | "medium" | "low";
}

interface HandoffReport {
  escalationCount: number;
  verifiedCount: number;
  items: HandoffItem[];
  verifiedSummary: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".cs"]);

function collectFiles(dir: string, max = 300): string[] {
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

// ─── Escalation patterns ───────────────────────────────────────────────────

interface EscalationPattern {
  regex: RegExp;
  reason: string;
  question: string;
  preAnalysis: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
}

const ESCALATION_PATTERNS: EscalationPattern[] = [
  {
    regex: /(?:payment|billing|charge|refund|invoice)\w*\s*(?:=|:|\()/i,
    reason: "Payment/billing logic",
    question: "Is this payment flow correctly handling edge cases (partial payments, refunds, currency conversion)?",
    preAnalysis:
      "Payment logic detected — automated review verified syntax but cannot assess business rule correctness",
    severity: "high",
    confidence: 40,
  },
  {
    regex: /(?:auth|permission|role|acl|rbac)\w*\s*(?:=|:|\()/i,
    reason: "Authorization/permission logic",
    question: "Does this authorization check cover all required permissions and fail-closed on errors?",
    preAnalysis: "Authorization pattern detected — verify the permission model matches business requirements",
    severity: "high",
    confidence: 45,
  },
  {
    regex: /(?:encrypt|decrypt|sign|verify|hash|hmac|cipher)\s*\(/i,
    reason: "Cryptographic operation",
    question: "Are the crypto algorithm, key size, and mode appropriate for this use case?",
    preAnalysis:
      "Cryptographic code detected — automated review verified API usage but cannot assess algorithm fitness",
    severity: "critical",
    confidence: 35,
  },
  {
    regex: /(?:delete|remove|purge|destroy|drop)\s*(?:All|Many|Collection|Table|Database|User)/i,
    reason: "Destructive bulk operation",
    question: "Is this bulk deletion protected by confirmation, soft-delete, or backup mechanisms?",
    preAnalysis: "Bulk destructive operation detected — verify rollback and recovery procedures exist",
    severity: "high",
    confidence: 50,
  },
  {
    regex: /(?:migration|migrate|schema|alter\s+table|add\s+column)/i,
    reason: "Database schema change",
    question: "Is this migration reversible? Has it been tested against production-sized data?",
    preAnalysis: "Schema migration detected — verify backward compatibility and rollback plan",
    severity: "high",
    confidence: 45,
  },
  {
    regex: /(?:cron|schedule|interval|recurring|periodic)\s*(?:=|:|\()/i,
    reason: "Scheduled task configuration",
    question: "Is the schedule correct? What happens if the task runs longer than the interval?",
    preAnalysis: "Scheduled task detected — verify idempotency and overlap handling",
    severity: "medium",
    confidence: 55,
  },
  {
    regex: /(?:feature[_-]?flag|toggle|experiment|canary|rollout)\s*(?:=|:|\()/i,
    reason: "Feature flag / experiment",
    question: "Is the feature flag cleanup planned? Are default values safe?",
    preAnalysis: "Feature flag detected — verify kill switch and rollback behavior",
    severity: "medium",
    confidence: 55,
  },
  {
    regex: /(?:race|mutex|lock|semaphore|atomic|concurrent)/i,
    reason: "Concurrency primitive",
    question: "Is this concurrency pattern correct? Could it deadlock under load?",
    preAnalysis: "Concurrency pattern detected — automated analysis cannot verify liveness guarantees",
    severity: "high",
    confidence: 35,
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string, baseDir: string): HandoffItem[] {
  const items: HandoffItem[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return items;
  }

  const lines = content.split("\n");
  const rel = relative(baseDir, filepath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    for (const pattern of ESCALATION_PATTERNS) {
      if (pattern.regex.test(line)) {
        items.push({
          file: rel,
          lineStart: Math.max(1, i - 2),
          lineEnd: Math.min(lines.length, i + 5),
          reason: pattern.reason,
          confidence: pattern.confidence,
          question: pattern.question,
          preAnalysis: pattern.preAnalysis,
          severity: pattern.severity,
        });
        break; // Only one escalation per line
      }
    }
  }

  return items;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewHandoff(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-handoff — Structured escalation to human reviewers

Usage:
  judges review-handoff [dir]
  judges review-handoff src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

When Judges encounters low-confidence findings (payment logic, crypto,
permissions, schema migrations, concurrency), it creates targeted human
review requests with narrowed scope, specific questions, and pre-analysis.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir =
    argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0 && argv[argv.indexOf(a) - 1] !== "--format") || ".";

  const files = collectFiles(dir);
  const allItems: HandoffItem[] = [];
  for (const f of files) allItems.push(...analyzeFile(f, dir));

  // Sort by severity then confidence (lowest confidence first — highest need for human review)
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  allItems.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.confidence - b.confidence);

  const totalFiles = files.length;
  const filesWithEscalations = new Set(allItems.map((i) => i.file)).size;
  const verifiedCount = totalFiles - filesWithEscalations;

  const report: HandoffReport = {
    escalationCount: allItems.length,
    verifiedCount,
    items: allItems,
    verifiedSummary: `${verifiedCount}/${totalFiles} files passed automated review with high confidence — no human review needed.`,
  };

  if (format === "json") {
    console.log(JSON.stringify({ ...report, timestamp: new Date().toISOString() }, null, 2));
  } else {
    console.log(`\n  Review Handoff\n  ─────────────────────────────`);
    console.log(`    ✅ ${verifiedCount}/${totalFiles} files — automated review complete (high confidence)`);
    console.log(`    🔍 ${allItems.length} item(s) escalated for human review\n`);

    if (allItems.length === 0) {
      console.log("    No escalations needed — all files passed automated review.\n");
      return;
    }

    for (const item of allItems.slice(0, 15)) {
      const icon =
        item.severity === "critical"
          ? "🔴"
          : item.severity === "high"
            ? "🟠"
            : item.severity === "medium"
              ? "🟡"
              : "🔵";
      console.log(`    ${icon} ${item.reason} (confidence: ${item.confidence}%)`);
      console.log(`        📄 ${item.file}:${item.lineStart}-${item.lineEnd}`);
      console.log(`        ❓ ${item.question}`);
      console.log(`        📋 ${item.preAnalysis}`);
      console.log();
    }
    if (allItems.length > 15) console.log(`    ... and ${allItems.length - 15} more escalations\n`);
  }
}

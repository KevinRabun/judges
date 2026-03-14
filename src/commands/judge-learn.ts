/**
 * Judge-learn — interactive wizard that ingests false positive/negative
 * feedback to automatically generate domain-specific judges with
 * detection rules and confidence calibration.
 *
 * All data stored locally in `.judges-learned/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FeedbackEntry {
  id: string;
  type: "false-positive" | "false-negative" | "correct";
  pattern: string;
  language: string;
  context: string;
  timestamp: string;
}

interface LearnedRule {
  id: string;
  name: string;
  pattern: string;
  language: string;
  confidence: number;
  feedbackCount: number;
  description: string;
}

interface LearnedJudge {
  id: string;
  name: string;
  description: string;
  rules: LearnedRule[];
  createdAt: string;
  updatedAt: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-learned";

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadFeedback(): FeedbackEntry[] {
  const file = join(DATA_DIR, "feedback.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveFeedback(entries: FeedbackEntry[]): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, "feedback.json"), JSON.stringify(entries, null, 2));
}

function loadJudges(): LearnedJudge[] {
  const file = join(DATA_DIR, "judges.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveJudges(judges: LearnedJudge[]): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, "judges.json"), JSON.stringify(judges, null, 2));
}

// ─── Pattern extraction ─────────────────────────────────────────────────────

function extractPatterns(feedback: FeedbackEntry[]): LearnedRule[] {
  const patternMap = new Map<string, { entries: FeedbackEntry[]; fpCount: number; fnCount: number }>();

  for (const entry of feedback) {
    const key = `${entry.pattern}:${entry.language}`;
    const existing = patternMap.get(key) || { entries: [], fpCount: 0, fnCount: 0 };
    existing.entries.push(entry);
    if (entry.type === "false-positive") existing.fpCount++;
    if (entry.type === "false-negative") existing.fnCount++;
    patternMap.set(key, existing);
  }

  const rules: LearnedRule[] = [];
  for (const [key, data] of patternMap) {
    const [pattern, language] = key.split(":");
    const total = data.entries.length;
    const correctRate = total > 0 ? (total - data.fpCount) / total : 0;
    const confidence = Math.round(correctRate * 100);

    // Only create rules for patterns with enough feedback
    if (total >= 2) {
      rules.push({
        id: `learned-${rules.length + 1}`,
        name: `${pattern}-detector`,
        pattern,
        language: language || "any",
        confidence,
        feedbackCount: total,
        description: `Detects "${pattern}" pattern (${total} feedback entries, ${confidence}% confidence)`,
      });
    }
  }

  return rules.sort((a, b) => b.confidence - a.confidence);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runJudgeLearn(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges judge-learn — Generate custom judges from feedback

Usage:
  judges judge-learn --feedback --type fp --pattern "unused-import" --lang ts
  judges judge-learn --feedback --type fn --pattern "sql-injection" --lang py --context "raw query"
  judges judge-learn --generate --name "my-team-judge"
  judges judge-learn --show

Options:
  --feedback            Record feedback entry
  --type <fp|fn|ok>     Feedback type: fp (false positive), fn (false negative), ok (correct)
  --pattern <name>      Pattern/rule that triggered
  --lang <language>     Language context
  --context <text>      Additional context
  --generate            Generate judge from accumulated feedback
  --name <name>         Judge name for generation
  --show                Show learned judges and feedback stats
  --format json         JSON output
  --help, -h            Show this help

Workflow:
  1. Record feedback as you review findings (--feedback)
  2. Generate a custom judge once patterns emerge (--generate)
  3. Use generated judge in .judgesrc config
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isFeedback = argv.includes("--feedback");
  const isGenerate = argv.includes("--generate");
  const _isShow = argv.includes("--show");

  if (isFeedback) {
    const typeMap: Record<string, FeedbackEntry["type"]> = {
      fp: "false-positive",
      fn: "false-negative",
      ok: "correct",
    };
    const typeArg = argv.find((_a: string, i: number) => argv[i - 1] === "--type") || "fp";
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern") || "";
    const lang = argv.find((_a: string, i: number) => argv[i - 1] === "--lang") || "any";
    const context = argv.find((_a: string, i: number) => argv[i - 1] === "--context") || "";

    if (!pattern) {
      console.error("  --pattern is required");
      return;
    }

    const entry: FeedbackEntry = {
      id: `fb-${Date.now()}`,
      type: typeMap[typeArg] || "false-positive",
      pattern,
      language: lang,
      context,
      timestamp: new Date().toISOString(),
    };

    const feedback = loadFeedback();
    feedback.push(entry);
    saveFeedback(feedback);
    console.log(`  ✅ Recorded ${entry.type} feedback for "${pattern}" (${lang})`);
    return;
  }

  if (isGenerate) {
    const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name") || "custom-judge";
    const feedback = loadFeedback();

    if (feedback.length < 3) {
      console.log(`  Need at least 3 feedback entries to generate a judge (have ${feedback.length}).`);
      return;
    }

    const rules = extractPatterns(feedback);
    if (rules.length === 0) {
      console.log("  No patterns with enough feedback to generate rules.");
      return;
    }

    const judge: LearnedJudge = {
      id: `learned-${name}`,
      name,
      description: `Auto-generated judge from ${feedback.length} feedback entries`,
      rules,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const judges = loadJudges();
    const existing = judges.findIndex((j) => j.id === judge.id);
    if (existing >= 0) {
      judges[existing] = judge;
    } else {
      judges.push(judge);
    }
    saveJudges(judges);

    if (format === "json") {
      console.log(JSON.stringify(judge, null, 2));
    } else {
      console.log(`\n  ✅ Generated judge: ${name}`);
      console.log(`     ${rules.length} rule(s) from ${feedback.length} feedback entries\n`);
      for (const rule of rules) {
        const icon = rule.confidence >= 80 ? "🟢" : rule.confidence >= 50 ? "🟡" : "🔴";
        console.log(`     ${icon} ${rule.name} — ${rule.confidence}% confidence (${rule.feedbackCount} entries)`);
      }
      console.log(`\n     Add to .judgesrc: { "customJudges": ["${judge.id}"] }\n`);
    }
    return;
  }

  // Show
  const feedback = loadFeedback();
  const judges = loadJudges();

  if (format === "json") {
    console.log(JSON.stringify({ feedback: feedback.length, judges, timestamp: new Date().toISOString() }, null, 2));
    return;
  }

  console.log(
    `\n  Judge Learn — ${feedback.length} feedback entries, ${judges.length} generated judges\n  ──────────────────────────`,
  );

  if (feedback.length > 0) {
    const fpCount = feedback.filter((f) => f.type === "false-positive").length;
    const fnCount = feedback.filter((f) => f.type === "false-negative").length;
    const okCount = feedback.filter((f) => f.type === "correct").length;
    console.log(`    Feedback: ${fpCount} false positives, ${fnCount} false negatives, ${okCount} correct`);

    const patterns = extractPatterns(feedback);
    if (patterns.length > 0) {
      console.log(`    Learnable patterns: ${patterns.length}`);
      for (const p of patterns.slice(0, 5)) {
        console.log(`      • ${p.name} — ${p.confidence}% confidence`);
      }
    }
  }

  if (judges.length > 0) {
    console.log(`\n    Generated Judges:`);
    for (const j of judges) {
      console.log(`      📋 ${j.name} — ${j.rules.length} rules (${j.updatedAt})`);
    }
  }

  if (feedback.length === 0 && judges.length === 0) {
    console.log("    No data yet. Use --feedback to record findings feedback.");
  }
  console.log("");
}

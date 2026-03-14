/**
 * Trust-adaptive — adjust judge sensitivity based on historical
 * accuracy of developers or AI models. High-trust actors skip
 * non-critical judges; low-trust get stricter scrutiny.
 *
 * All data stored locally in `.judges-trust/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrustRecord {
  actor: string;
  evaluations: number;
  passCount: number;
  failCount: number;
  falsePositives: number;
  avgScore: number;
  lastUpdated: string;
}

interface TrustProfile {
  actor: string;
  trustLevel: "high" | "medium" | "low" | "unknown";
  trustScore: number;
  sensitivity: "relaxed" | "normal" | "strict";
  skipJudges: string[];
  escalate: boolean;
  detail: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-trust";

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadRecords(): TrustRecord[] {
  const file = join(DATA_DIR, "records.json");
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

function saveRecords(records: TrustRecord[]): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, "records.json"), JSON.stringify(records, null, 2));
}

// ─── Analysis ───────────────────────────────────────────────────────────────

// Non-critical judges that can be skipped for high-trust actors
const NON_CRITICAL_JUDGES = [
  "style-consistency",
  "naming-convention",
  "comment-coverage",
  "line-length",
  "function-length",
  "import-order",
];

function computeProfile(record: TrustRecord): TrustProfile {
  const passRate = record.evaluations > 0 ? record.passCount / record.evaluations : 0;
  const fpRate = record.evaluations > 0 ? record.falsePositives / record.evaluations : 0;

  // Trust score: weighted combination
  const trustScore = Math.round(
    passRate * 40 + record.avgScore * 0.4 + fpRate * 20, // High FP rate = tool noise, bump trust
  );

  let trustLevel: "high" | "medium" | "low" | "unknown";
  let sensitivity: "relaxed" | "normal" | "strict";
  let skipJudges: string[] = [];
  let escalate = false;
  let detail: string;

  if (record.evaluations < 5) {
    trustLevel = "unknown";
    sensitivity = "normal";
    detail = `Only ${record.evaluations} evaluations — need ≥5 for trust assignment`;
  } else if (trustScore >= 75) {
    trustLevel = "high";
    sensitivity = "relaxed";
    skipJudges = NON_CRITICAL_JUDGES;
    detail = `High trust (${trustScore}) — skip ${skipJudges.length} non-critical judges`;
  } else if (trustScore >= 45) {
    trustLevel = "medium";
    sensitivity = "normal";
    detail = `Medium trust (${trustScore}) — standard evaluation`;
  } else {
    trustLevel = "low";
    sensitivity = "strict";
    escalate = true;
    detail = `Low trust (${trustScore}) — strict evaluation with human escalation`;
  }

  return { actor: record.actor, trustLevel, trustScore, sensitivity, skipJudges, escalate, detail };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTrustAdaptive(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges trust-adaptive — Adaptive trust scoring for actors

Usage:
  judges trust-adaptive --record --actor "copilot" --score 85 --pass
  judges trust-adaptive --record --actor "dev-alice" --score 40 --fail
  judges trust-adaptive --record --actor "copilot" --fp (record false positive)
  judges trust-adaptive --show
  judges trust-adaptive --profile "copilot"

Options:
  --record              Record evaluation result
  --actor <name>        Actor name (developer, AI model, team)
  --score <n>           Evaluation score (0-100)
  --pass                Record a pass
  --fail                Record a fail
  --fp                  Record a false positive
  --show                Show all trust profiles
  --profile <name>      Show specific actor profile
  --format json         JSON output
  --help, -h            Show this help

Trust Levels:
  high    → Skip non-critical judges, relaxed thresholds
  medium  → Standard evaluation
  low     → Strict evaluation, escalation to human reviewer
  unknown → <5 evaluations, standard evaluation
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const record = argv.includes("--record");
  const _show = argv.includes("--show");
  const profileName = argv.find((_a: string, i: number) => argv[i - 1] === "--profile");
  const actor = argv.find((_a: string, i: number) => argv[i - 1] === "--actor") || "";
  const scoreArg = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
  const isPass = argv.includes("--pass");
  const isFail = argv.includes("--fail");
  const isFp = argv.includes("--fp");

  if (record) {
    if (!actor) {
      console.error("  --actor is required for --record");
      return;
    }

    const records = loadRecords();
    let rec = records.find((r) => r.actor === actor);
    if (!rec) {
      rec = { actor, evaluations: 0, passCount: 0, failCount: 0, falsePositives: 0, avgScore: 0, lastUpdated: "" };
      records.push(rec);
    }

    rec.evaluations++;
    if (isPass) rec.passCount++;
    if (isFail) rec.failCount++;
    if (isFp) rec.falsePositives++;
    rec.avgScore = Math.round((rec.avgScore * (rec.evaluations - 1) + scoreArg) / rec.evaluations);
    rec.lastUpdated = new Date().toISOString();

    saveRecords(records);
    console.log(
      `  ✅ Recorded for ${actor}: eval #${rec.evaluations} (score: ${scoreArg}${isPass ? ", pass" : ""}${isFail ? ", fail" : ""}${isFp ? ", FP" : ""})`,
    );
    return;
  }

  const records = loadRecords();
  if (records.length === 0) {
    console.log("  No trust records yet. Use --record to add evaluations.");
    return;
  }

  if (profileName) {
    const rec = records.find((r) => r.actor === profileName);
    if (!rec) {
      console.error(`  Actor "${profileName}" not found.`);
      return;
    }
    const profile = computeProfile(rec);
    if (format === "json") {
      console.log(JSON.stringify(profile, null, 2));
    } else {
      const icon =
        profile.trustLevel === "high"
          ? "🟢"
          : profile.trustLevel === "medium"
            ? "🟡"
            : profile.trustLevel === "low"
              ? "🔴"
              : "⚪";
      console.log(`\n    ${icon} ${profile.actor}`);
      console.log(`        Trust: ${profile.trustLevel} (${profile.trustScore}/100)`);
      console.log(`        Sensitivity: ${profile.sensitivity}`);
      console.log(`        ${profile.detail}`);
      if (profile.skipJudges.length > 0) console.log(`        Skip: ${profile.skipJudges.join(", ")}`);
      if (profile.escalate) console.log(`        ⚠ Human escalation required`);
      console.log(
        `        Stats: ${rec.evaluations} evals, ${rec.passCount} pass, ${rec.failCount} fail, ${rec.falsePositives} FP`,
      );
      console.log("");
    }
    return;
  }

  // Show all
  const profiles = records.map(computeProfile);
  profiles.sort((a, b) => b.trustScore - a.trustScore);

  if (format === "json") {
    console.log(JSON.stringify({ profiles, timestamp: new Date().toISOString() }, null, 2));
  } else {
    console.log(`\n  Trust Profiles — ${profiles.length} actors\n  ──────────────────────────`);
    console.log(
      `    ${"Actor".padEnd(25)} ${"Level".padEnd(10)} ${"Score".padEnd(8)} ${"Sensitivity".padEnd(12)} ${"Evals".padEnd(8)} Detail`,
    );
    console.log(
      `    ${"─".repeat(25)} ${"─".repeat(10)} ${"─".repeat(8)} ${"─".repeat(12)} ${"─".repeat(8)} ${"─".repeat(30)}`,
    );

    for (const p of profiles) {
      const icon =
        p.trustLevel === "high" ? "🟢" : p.trustLevel === "medium" ? "🟡" : p.trustLevel === "low" ? "🔴" : "⚪";
      console.log(
        `    ${icon} ${p.actor.padEnd(23)} ${p.trustLevel.padEnd(10)} ${String(p.trustScore).padEnd(8)} ${p.sensitivity.padEnd(12)} ${String(records.find((r) => r.actor === p.actor)?.evaluations || 0).padEnd(8)} ${p.detail}`,
      );
    }
    console.log("");
  }
}

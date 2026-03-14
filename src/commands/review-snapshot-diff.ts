/**
 * Review-snapshot-diff — Diff between review snapshots.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SnapshotSummary {
  score: number;
  findingCount: number;
  ruleIds: string[];
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadSnapshot(filePath: string): SnapshotSummary | null {
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf-8"));
    const findings = Array.isArray(data.findings) ? data.findings : [];
    const ruleIds = findings.map((f: { ruleId?: string }) => f.ruleId || "").filter(Boolean) as string[];
    return {
      score: typeof data.overallScore === "number" ? data.overallScore : 0,
      findingCount: findings.length,
      ruleIds,
      timestamp: typeof data.timestamp === "string" ? data.timestamp : "unknown",
    };
  } catch {
    return null;
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSnapshotDiff(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-snapshot-diff — Diff between review snapshots

Usage:
  judges review-snapshot-diff --a snapshot1.json --b snapshot2.json

Options:
  --a <path>            First snapshot (earlier)
  --b <path>            Second snapshot (later)
  --format json         JSON output
  --help, -h            Show this help

Compares two review snapshot files and shows what changed.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const pathA = argv.find((_a: string, i: number) => argv[i - 1] === "--a") || "";
  const pathB = argv.find((_a: string, i: number) => argv[i - 1] === "--b") || "";

  if (!pathA || !pathB) {
    console.log("Specify --a and --b snapshot file paths.");
    return;
  }

  const snapA = loadSnapshot(pathA);
  const snapB = loadSnapshot(pathB);

  if (!snapA) {
    console.log(`Cannot load: ${pathA}`);
    return;
  }
  if (!snapB) {
    console.log(`Cannot load: ${pathB}`);
    return;
  }

  const setA = new Set(snapA.ruleIds);
  const setB = new Set(snapB.ruleIds);
  const added = snapB.ruleIds.filter((r) => !setA.has(r));
  const removed = snapA.ruleIds.filter((r) => !setB.has(r));
  const scoreDelta = snapB.score - snapA.score;

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          scoreA: snapA.score,
          scoreB: snapB.score,
          scoreDelta,
          findingsA: snapA.findingCount,
          findingsB: snapB.findingCount,
          addedRules: added,
          removedRules: removed,
        },
        null,
        2,
      ),
    );
    return;
  }

  const arrow = scoreDelta > 0 ? "↗" : scoreDelta < 0 ? "↘" : "→";

  console.log("\nSnapshot Diff:");
  console.log("═".repeat(55));
  console.log(`  A: ${pathA} (${snapA.timestamp.slice(0, 10)})`);
  console.log(`  B: ${pathB} (${snapB.timestamp.slice(0, 10)})`);
  console.log("");
  console.log(
    `  Score: ${snapA.score.toFixed(1)} → ${snapB.score.toFixed(1)}  (${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(1)} ${arrow})`,
  );
  console.log(`  Findings: ${snapA.findingCount} → ${snapB.findingCount}`);

  if (added.length > 0) {
    console.log(`\n  New rules in B (${added.length}):`);
    for (const r of added.slice(0, 10)) console.log(`    + ${r}`);
    if (added.length > 10) console.log(`    ... and ${added.length - 10} more`);
  }

  if (removed.length > 0) {
    console.log(`\n  Resolved in B (${removed.length}):`);
    for (const r of removed.slice(0, 10)) console.log(`    - ${r}`);
    if (removed.length > 10) console.log(`    ... and ${removed.length - 10} more`);
  }

  console.log("═".repeat(55));
}

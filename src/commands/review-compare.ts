/**
 * Review-compare — Compare two review runs to measure improvement.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewSnapshot {
  id: string;
  timestamp: string;
  label: string;
  findings: { pattern: string; severity: string; file: string; line: number }[];
  counts: { critical: number; high: number; medium: number; low: number; total: number };
}

interface CompareResult {
  before: { id: string; label: string; total: number };
  after: { id: string; label: string; total: number };
  improvement: number;
  improvementPercent: number;
  newFindings: { pattern: string; severity: string; file: string }[];
  fixedFindings: { pattern: string; severity: string; file: string }[];
  persistingFindings: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSnapshotsDir(): string {
  return join(".", ".judges", "snapshots");
}

function loadSnapshot(id: string): ReviewSnapshot | null {
  const dir = getSnapshotsDir();
  const filePath = join(dir, `${id}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as ReviewSnapshot;
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot: ReviewSnapshot): void {
  const dir = getSnapshotsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${snapshot.id}.json`), JSON.stringify(snapshot, null, 2), "utf-8");
}

function listSnapshots(): string[] {
  const dir = getSnapshotsDir();
  if (!existsSync(dir)) return [];
  try {
    return (readdirSync(dir) as unknown as string[])
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(".json", ""));
  } catch {
    return [];
  }
}

function compareSnapshots(before: ReviewSnapshot, after: ReviewSnapshot): CompareResult {
  // Build finding signatures for comparison
  const beforeSigs = new Set(before.findings.map((f) => `${f.pattern}:${f.file}:${f.line}`));
  const afterSigs = new Set(after.findings.map((f) => `${f.pattern}:${f.file}:${f.line}`));

  const newFindings = after.findings
    .filter((f) => !beforeSigs.has(`${f.pattern}:${f.file}:${f.line}`))
    .map((f) => ({ pattern: f.pattern, severity: f.severity, file: f.file }));

  const fixedFindings = before.findings
    .filter((f) => !afterSigs.has(`${f.pattern}:${f.file}:${f.line}`))
    .map((f) => ({ pattern: f.pattern, severity: f.severity, file: f.file }));

  const persisting = after.counts.total - newFindings.length;
  const improvement = before.counts.total - after.counts.total;
  const improvementPercent = before.counts.total > 0 ? Math.round((improvement / before.counts.total) * 100) : 0;

  return {
    before: { id: before.id, label: before.label, total: before.counts.total },
    after: { id: after.id, label: after.label, total: after.counts.total },
    improvement,
    improvementPercent,
    newFindings,
    fixedFindings,
    persistingFindings: Math.max(0, persisting),
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCompare(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-compare — Compare two review runs to measure improvement

Usage:
  judges review-compare save --id run1 --label "Before refactor" --findings findings.json
  judges review-compare diff --before run1 --after run2
  judges review-compare list                      List saved snapshots
  judges review-compare --format json              JSON output

Subcommands:
  save          Save a review snapshot for later comparison
  diff          Compare two saved snapshots
  list          List all saved snapshots

Save Options:
  --id <name>          Snapshot identifier
  --label <text>       Human-readable label
  --findings <path>    JSON file with findings array

Diff Options:
  --before <id>        First snapshot ID
  --after <id>         Second snapshot ID

Snapshots are stored locally in .judges/snapshots/.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => !a.startsWith("-") && a !== "review-compare") || "list";

  if (subcommand === "save") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    const label = argv.find((_a: string, i: number) => argv[i - 1] === "--label") || id || "unlabeled";
    const findingsPath = argv.find((_a: string, i: number) => argv[i - 1] === "--findings");

    if (!id) {
      console.error("Error: --id is required for save.");
      process.exitCode = 1;
      return;
    }

    let findings: { pattern: string; severity: string; file: string; line: number }[] = [];
    if (findingsPath && existsSync(findingsPath)) {
      try {
        const raw = JSON.parse(readFileSync(findingsPath, "utf-8"));
        findings = Array.isArray(raw) ? raw : Array.isArray(raw.findings) ? raw.findings : [];
      } catch {
        console.error("Error: Cannot parse findings file.");
        process.exitCode = 1;
        return;
      }
    }

    const counts = { critical: 0, high: 0, medium: 0, low: 0, total: findings.length };
    for (const f of findings) {
      if (f.severity === "critical") counts.critical++;
      else if (f.severity === "high") counts.high++;
      else if (f.severity === "medium") counts.medium++;
      else counts.low++;
    }

    const snapshot: ReviewSnapshot = { id, timestamp: new Date().toISOString(), label, findings, counts };
    saveSnapshot(snapshot);
    console.log(`Saved snapshot '${id}' with ${findings.length} findings.`);
    return;
  }

  if (subcommand === "list") {
    const ids = listSnapshots();
    if (ids.length === 0) {
      console.log("No snapshots saved. Use 'judges review-compare save' to create one.");
      return;
    }

    console.log(`\n  Saved Snapshots:\n  ─────────────────────────────`);
    for (const id of ids) {
      const snap = loadSnapshot(id);
      if (snap) {
        console.log(`    ${snap.id} — ${snap.label} (${snap.counts.total} findings, ${snap.timestamp.slice(0, 10)})`);
      }
    }
    console.log();
    return;
  }

  if (subcommand === "diff") {
    const beforeId = argv.find((_a: string, i: number) => argv[i - 1] === "--before");
    const afterId = argv.find((_a: string, i: number) => argv[i - 1] === "--after");

    if (!beforeId || !afterId) {
      console.error("Error: Both --before and --after snapshot IDs are required.");
      process.exitCode = 1;
      return;
    }

    const before = loadSnapshot(beforeId);
    const after = loadSnapshot(afterId);

    if (!before) {
      console.error(`Error: Snapshot '${beforeId}' not found.`);
      process.exitCode = 1;
      return;
    }
    if (!after) {
      console.error(`Error: Snapshot '${afterId}' not found.`);
      process.exitCode = 1;
      return;
    }

    const result = compareSnapshots(before, after);

    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const trendIcon = result.improvement > 0 ? "📉" : result.improvement < 0 ? "📈" : "➡️";
    console.log(`\n  Review Comparison\n  ─────────────────────────────`);
    console.log(`    Before: ${result.before.label} (${result.before.total} findings)`);
    console.log(`    After:  ${result.after.label} (${result.after.total} findings)`);
    console.log(
      `    ${trendIcon} Change: ${result.improvement > 0 ? "-" : "+"}${Math.abs(result.improvement)} findings (${result.improvementPercent}%)`,
    );
    console.log(
      `    Fixed: ${result.fixedFindings.length}  New: ${result.newFindings.length}  Persisting: ${result.persistingFindings}`,
    );

    if (result.fixedFindings.length > 0) {
      console.log("\n    Fixed findings:");
      for (const f of result.fixedFindings.slice(0, 10)) {
        console.log(`      ✅ [${f.severity}] ${f.pattern} — ${f.file}`);
      }
      if (result.fixedFindings.length > 10) console.log(`      ... +${result.fixedFindings.length - 10} more`);
    }

    if (result.newFindings.length > 0) {
      console.log("\n    New findings:");
      for (const f of result.newFindings.slice(0, 10)) {
        console.log(`      ❌ [${f.severity}] ${f.pattern} — ${f.file}`);
      }
      if (result.newFindings.length > 10) console.log(`      ... +${result.newFindings.length - 10} more`);
    }

    console.log();
    return;
  }

  console.log("Unknown subcommand. Use --help for usage.");
}

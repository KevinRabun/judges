/**
 * Review-checkpoint — Save and restore review state checkpoints.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Checkpoint {
  id: string;
  name: string;
  timestamp: string;
  commit: string;
  verdictFile: string;
  score: number;
  findingsCount: number;
  notes: string;
}

interface CheckpointStore {
  version: string;
  checkpoints: Checkpoint[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const CHECKPOINT_DIR = join(".judges", "checkpoints");
const INDEX_FILE = join(CHECKPOINT_DIR, "index.json");

function loadCheckpoints(): CheckpointStore {
  if (!existsSync(INDEX_FILE)) return { version: "1.0.0", checkpoints: [] };
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf-8")) as CheckpointStore;
  } catch {
    return { version: "1.0.0", checkpoints: [] };
  }
}

function saveCheckpoints(store: CheckpointStore): void {
  mkdirSync(dirname(INDEX_FILE), { recursive: true });
  writeFileSync(INDEX_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function getCurrentCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "unknown";
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCheckpoint(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-checkpoint — Save and restore review state

Usage:
  judges review-checkpoint list                        List checkpoints
  judges review-checkpoint save --name before-refactor Save checkpoint
  judges review-checkpoint show --id cp-xxx            Show checkpoint details
  judges review-checkpoint compare --a cp-xxx --b cp-yyy  Compare two checkpoints
  judges review-checkpoint --format json               JSON output

Subcommands:
  list                 List all checkpoints
  save                 Save current review state as checkpoint
  show                 Show checkpoint details
  compare              Compare two checkpoints

Options:
  --name <name>        Checkpoint name (for save)
  --id <id>            Checkpoint ID (for show)
  --a <id>             First checkpoint (for compare)
  --b <id>             Second checkpoint (for compare)
  --score <n>          Score to record (for save)
  --findings <n>       Findings count (for save)
  --notes <text>       Notes about checkpoint
  --format json        JSON output
  --help, -h           Show this help

Checkpoints track review state over time, letting you compare
how code quality has changed between milestones.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["list", "save", "show", "compare"].includes(a)) || "list";
  const store = loadCheckpoints();

  if (subcommand === "save") {
    const name =
      argv.find((_a: string, i: number) => argv[i - 1] === "--name") || `checkpoint-${store.checkpoints.length + 1}`;
    const scoreStr = argv.find((_a: string, i: number) => argv[i - 1] === "--score");
    const findingsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--findings");
    const notes = argv.find((_a: string, i: number) => argv[i - 1] === "--notes") || "";

    const cp: Checkpoint = {
      id: `cp-${Date.now().toString(36)}`,
      name,
      timestamp: new Date().toISOString(),
      commit: getCurrentCommit(),
      verdictFile: "",
      score: parseInt(scoreStr || "0", 10),
      findingsCount: parseInt(findingsStr || "0", 10),
      notes,
    };

    store.checkpoints.push(cp);
    saveCheckpoints(store);
    console.log(`Saved checkpoint '${name}' (${cp.id})`);
    return;
  }

  if (subcommand === "show") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }

    const cp = store.checkpoints.find((c) => c.id === id);
    if (!cp) {
      console.error(`Error: Checkpoint '${id}' not found.`);
      process.exitCode = 1;
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(cp, null, 2));
      return;
    }

    console.log(`\n  Checkpoint: ${cp.name}\n  ─────────────────────────────`);
    console.log(`    ID: ${cp.id}`);
    console.log(`    Date: ${cp.timestamp}`);
    console.log(`    Commit: ${cp.commit.slice(0, 8)}`);
    console.log(`    Score: ${cp.score}/100`);
    console.log(`    Findings: ${cp.findingsCount}`);
    if (cp.notes) console.log(`    Notes: ${cp.notes}`);
    console.log();
    return;
  }

  if (subcommand === "compare") {
    const idA = argv.find((_a: string, i: number) => argv[i - 1] === "--a");
    const idB = argv.find((_a: string, i: number) => argv[i - 1] === "--b");

    if (!idA || !idB) {
      console.error("Error: Both --a and --b checkpoint IDs are required.");
      process.exitCode = 1;
      return;
    }

    const cpA = store.checkpoints.find((c) => c.id === idA);
    const cpB = store.checkpoints.find((c) => c.id === idB);

    if (!cpA || !cpB) {
      console.error("Error: One or both checkpoints not found.");
      process.exitCode = 1;
      return;
    }

    const scoreDelta = cpB.score - cpA.score;
    const findingsDelta = cpB.findingsCount - cpA.findingsCount;

    if (format === "json") {
      console.log(JSON.stringify({ a: cpA, b: cpB, scoreDelta, findingsDelta }, null, 2));
      return;
    }

    console.log(`\n  Checkpoint Comparison\n  ─────────────────────────────`);
    console.log(`    A: ${cpA.name} (${cpA.timestamp.slice(0, 10)})`);
    console.log(`    B: ${cpB.name} (${cpB.timestamp.slice(0, 10)})`);
    console.log();
    console.log(`    Score:    ${cpA.score} → ${cpB.score} (${scoreDelta >= 0 ? "+" : ""}${scoreDelta})`);
    console.log(
      `    Findings: ${cpA.findingsCount} → ${cpB.findingsCount} (${findingsDelta >= 0 ? "+" : ""}${findingsDelta})`,
    );

    const icon = scoreDelta > 0 ? "📈" : scoreDelta < 0 ? "📉" : "➡️";
    console.log(`\n    Trend: ${icon} ${scoreDelta > 0 ? "Improving" : scoreDelta < 0 ? "Declining" : "Stable"}`);
    console.log();
    return;
  }

  // List
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\n  Checkpoints (${store.checkpoints.length})\n  ─────────────────────────────`);

  if (store.checkpoints.length === 0) {
    console.log("    No checkpoints. Save one with: judges review-checkpoint save --name <name> --score <n>");
  }

  for (const cp of store.checkpoints) {
    console.log(
      `    📌 ${cp.id} — ${cp.name} (${cp.timestamp.slice(0, 10)}) score: ${cp.score}, findings: ${cp.findingsCount}`,
    );
  }

  console.log();
}

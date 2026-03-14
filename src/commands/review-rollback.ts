/**
 * Review-rollback — Roll back review configuration to a previous state.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Snapshot {
  id: string;
  timestamp: string;
  label: string;
  configFile: string;
  snapshotFile: string;
}

interface RollbackStore {
  version: string;
  snapshots: Snapshot[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const ROLLBACK_DIR = join(".judges", "rollback");
const INDEX_FILE = join(ROLLBACK_DIR, "index.json");

function loadIndex(): RollbackStore {
  if (!existsSync(INDEX_FILE)) return { version: "1.0.0", snapshots: [] };
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf-8")) as RollbackStore;
  } catch {
    return { version: "1.0.0", snapshots: [] };
  }
}

function saveIndex(store: RollbackStore): void {
  mkdirSync(ROLLBACK_DIR, { recursive: true });
  writeFileSync(INDEX_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `snap-${Date.now().toString(36)}`;
}

// ─── Config Discovery ───────────────────────────────────────────────────────

const CONFIG_FILES = [".judgesrc", ".judgesrc.json", "judgesrc.json", ".judges/config.json"];

function findConfigFile(): string | null {
  for (const f of CONFIG_FILES) {
    if (existsSync(f)) return f;
  }
  return null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRollback(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-rollback — Roll back review config to a previous state

Usage:
  judges review-rollback save --label "before refactor"
  judges review-rollback list
  judges review-rollback restore --id snap-abc123
  judges review-rollback diff --id snap-abc123
  judges review-rollback clear

Subcommands:
  save                  Save a config snapshot
  list                  List saved snapshots
  restore               Restore a snapshot
  diff                  Compare snapshot with current config
  clear                 Clear all snapshots

Options:
  --label <text>        Label for the snapshot
  --id <id>             Snapshot ID
  --config <path>       Config file path (auto-detected)
  --format json         JSON output
  --help, -h            Show this help

Snapshots stored in .judges/rollback/.
`);
    return;
  }

  const subcommand = argv.find((a) => ["save", "list", "restore", "diff", "clear"].includes(a)) || "list";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadIndex();

  if (subcommand === "save") {
    const label = argv.find((_a: string, i: number) => argv[i - 1] === "--label") || "";
    const configArg = argv.find((_a: string, i: number) => argv[i - 1] === "--config");
    const configFile = configArg || findConfigFile();

    if (!configFile || !existsSync(configFile)) {
      console.error("Error: No config file found. Use --config to specify.");
      process.exitCode = 1;
      return;
    }

    const id = generateId();
    const snapshotFile = join(ROLLBACK_DIR, `${id}.json`);
    mkdirSync(ROLLBACK_DIR, { recursive: true });
    copyFileSync(configFile, snapshotFile);

    store.snapshots.push({ id, timestamp: new Date().toISOString(), label, configFile, snapshotFile });
    saveIndex(store);
    console.log(`Saved snapshot ${id}${label ? ` (${label})` : ""} from "${configFile}".`);
    return;
  }

  if (subcommand === "restore") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const snapshot = store.snapshots.find((s) => s.id === id);
    if (!snapshot) {
      console.error(`Error: Snapshot "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    if (!existsSync(snapshot.snapshotFile)) {
      console.error(`Error: Snapshot file missing from disk.`);
      process.exitCode = 1;
      return;
    }
    mkdirSync(dirname(snapshot.configFile), { recursive: true });
    copyFileSync(snapshot.snapshotFile, snapshot.configFile);
    console.log(`Restored snapshot ${id} to "${snapshot.configFile}".`);
    return;
  }

  if (subcommand === "diff") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const snapshot = store.snapshots.find((s) => s.id === id);
    if (!snapshot) {
      console.error(`Error: Snapshot "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    if (!existsSync(snapshot.snapshotFile)) {
      console.error("Error: Snapshot file missing.");
      process.exitCode = 1;
      return;
    }
    const configFile = findConfigFile();
    if (!configFile || !existsSync(configFile)) {
      console.error("Error: No current config file found.");
      process.exitCode = 1;
      return;
    }

    const snapshotContent = readFileSync(snapshot.snapshotFile, "utf-8");
    const currentContent = readFileSync(configFile, "utf-8");

    if (snapshotContent === currentContent) {
      console.log("No differences between snapshot and current config.");
      return;
    }

    console.log(`\nDiff: snapshot ${id} vs current config`);
    console.log("─".repeat(60));
    console.log("Snapshot:");
    console.log(snapshotContent.slice(0, 500));
    console.log("\nCurrent:");
    console.log(currentContent.slice(0, 500));
    console.log("─".repeat(60));
    return;
  }

  if (subcommand === "clear") {
    saveIndex({ version: "1.0.0", snapshots: [] });
    console.log("Rollback snapshots cleared.");
    return;
  }

  // list
  if (store.snapshots.length === 0) {
    console.log("No snapshots saved. Use 'judges review-rollback save' to create one.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.snapshots, null, 2));
    return;
  }

  console.log("\nConfig Snapshots:");
  console.log("─".repeat(70));
  for (const s of store.snapshots) {
    console.log(`  ${s.id}  ${s.timestamp.slice(0, 19)}  ${s.label || "(no label)"}`);
    console.log(`    Config: ${s.configFile}`);
  }
  console.log("─".repeat(70));
  console.log(`  Total: ${store.snapshots.length} snapshot(s)`);
}

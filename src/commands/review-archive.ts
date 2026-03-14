/**
 * Review-archive — Archive and retrieve old review results.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { join, basename, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ArchiveEntry {
  id: string;
  originalPath: string;
  archivedAt: string;
  label: string;
  sizeBytes: number;
}

interface ArchiveIndex {
  version: string;
  entries: ArchiveEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const ARCHIVE_DIR = join(".judges", "archive");
const INDEX_FILE = join(ARCHIVE_DIR, "index.json");

function loadIndex(): ArchiveIndex {
  if (!existsSync(INDEX_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf-8")) as ArchiveIndex;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveIndex(index: ArchiveIndex): void {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");
}

function generateId(): string {
  return `arc-${Date.now().toString(36)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewArchive(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-archive — Archive and retrieve old review results

Usage:
  judges review-archive add --file report.json --label sprint-42
  judges review-archive list
  judges review-archive restore --id arc-abc123 --out restored.json
  judges review-archive clear

Subcommands:
  add                   Archive a review result file
  list                  List archived reviews
  restore               Restore an archived review
  clear                 Clear all archived data

Options:
  --file <path>         File to archive
  --label <text>        Label for the archive entry
  --id <id>             Archive entry ID
  --out <path>          Output path for restored file
  --format json         JSON output
  --help, -h            Show this help

Archives are stored in .judges/archive/.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "restore", "clear"].includes(a)) || "list";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const index = loadIndex();

  if (subcommand === "add") {
    const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    const label = argv.find((_a: string, i: number) => argv[i - 1] === "--label") || "";
    if (!filePath || !existsSync(filePath)) {
      console.error("Error: --file is required and must exist.");
      process.exitCode = 1;
      return;
    }
    const id = generateId();
    const archiveName = `${id}-${basename(filePath)}`;
    const archivePath = join(ARCHIVE_DIR, archiveName);
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    copyFileSync(filePath, archivePath);
    const stat = readFileSync(filePath);
    index.entries.push({
      id,
      originalPath: filePath,
      archivedAt: new Date().toISOString(),
      label,
      sizeBytes: stat.length,
    });
    saveIndex(index);
    console.log(`Archived "${filePath}" as ${id}${label ? ` (${label})` : ""}.`);
    return;
  }

  if (subcommand === "restore") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    const out = argv.find((_a: string, i: number) => argv[i - 1] === "--out");
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const entry = index.entries.find((e) => e.id === id);
    if (!entry) {
      console.error(`Error: Archive "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    // Find the archived file
    const files = readdirSync(ARCHIVE_DIR) as unknown as string[];
    const archiveFile = files.find((f: string) => (f as string).startsWith(id));
    if (!archiveFile) {
      console.error(`Error: Archive file for "${id}" missing from disk.`);
      process.exitCode = 1;
      return;
    }
    const dest = out || entry.originalPath;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(ARCHIVE_DIR, archiveFile), dest);
    console.log(`Restored ${id} to "${dest}".`);
    return;
  }

  if (subcommand === "clear") {
    saveIndex({ version: "1.0.0", entries: [] });
    console.log("Archive index cleared.");
    return;
  }

  // list
  if (index.entries.length === 0) {
    console.log("No archived reviews. Use 'judges review-archive add' to start.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(index.entries, null, 2));
    return;
  }

  console.log("\nArchived Reviews:");
  console.log("─".repeat(70));
  for (const e of index.entries) {
    const size = e.sizeBytes < 1024 ? `${e.sizeBytes}B` : `${(e.sizeBytes / 1024).toFixed(1)}KB`;
    console.log(`  ${e.id}  ${e.archivedAt.slice(0, 10)}  ${size.padEnd(8)} ${e.label || "(no label)"}`);
    console.log(`    Original: ${e.originalPath}`);
  }
  console.log("─".repeat(70));
  console.log(`  Total: ${index.entries.length} archived review(s)`);
}

/**
 * Review-note — Attach notes to reviews.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewNote {
  id: string;
  reviewId: string;
  text: string;
  author: string;
  createdAt: string;
}

interface NoteStore {
  version: string;
  notes: ReviewNote[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const NOTE_FILE = ".judges/review-notes.json";

function loadStore(): NoteStore {
  if (!existsSync(NOTE_FILE)) return { version: "1.0.0", notes: [] };
  try {
    return JSON.parse(readFileSync(NOTE_FILE, "utf-8")) as NoteStore;
  } catch {
    return { version: "1.0.0", notes: [] };
  }
}

function saveStore(store: NoteStore): void {
  mkdirSync(dirname(NOTE_FILE), { recursive: true });
  writeFileSync(NOTE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewNote(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-note — Attach notes to reviews

Usage:
  judges review-note add --review <id> --text "Needs follow-up"
  judges review-note list
  judges review-note list --review <id>
  judges review-note remove --id <id>
  judges review-note clear

Subcommands:
  add                   Add a note to a review
  list                  List all notes (or for a specific review)
  remove                Remove a note by ID
  clear                 Clear all notes

Options:
  --review <id>         Review identifier
  --text <text>         Note content
  --author <name>       Note author
  --format json         JSON output
  --help, -h            Show this help

Notes stored in .judges/review-notes.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const reviewId = argv.find((_a: string, i: number) => argv[i - 1] === "--review") || "";
    const text = argv.find((_a: string, i: number) => argv[i - 1] === "--text") || "";
    const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author") || "";

    if (!text) {
      console.log("Specify --text for the note content.");
      return;
    }

    const note: ReviewNote = { id: generateId(), reviewId, text, author, createdAt: new Date().toISOString() };
    store.notes.push(note);
    saveStore(store);
    console.log(`Note added (${note.id}) to review ${reviewId || "(general)"}.`);
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id") || "";
    const before = store.notes.length;
    store.notes = store.notes.filter((n) => n.id !== id);
    saveStore(store);
    console.log(before > store.notes.length ? `Removed ${id}.` : `${id} not found.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", notes: [] });
    console.log("All notes cleared.");
    return;
  }

  // Default: list
  const reviewFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--review") || "";
  const notes = reviewFilter ? store.notes.filter((n) => n.reviewId === reviewFilter) : store.notes;

  if (notes.length === 0) {
    console.log("No notes found.");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(notes, null, 2));
    return;
  }
  console.log(`\nReview Notes (${notes.length}):`);
  console.log("─".repeat(60));
  for (const n of notes) {
    const authorTag = n.author ? ` by ${n.author}` : "";
    console.log(`  ${n.id}  ${n.createdAt.slice(0, 10)}${authorTag}  review=${n.reviewId || "(general)"}`);
    console.log(`    "${n.text}"`);
  }
  console.log("─".repeat(60));
}

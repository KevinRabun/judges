/**
 * Review-tag — Tag reviews with labels for organization and filtering.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaggedReview {
  id: string;
  tags: string[];
  createdAt: string;
  score: number;
  findingCount: number;
  source: string;
}

interface TagStore {
  version: string;
  reviews: TaggedReview[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const TAG_FILE = join(".judges", "review-tags.json");

function loadStore(): TagStore {
  if (!existsSync(TAG_FILE)) return { version: "1.0.0", reviews: [] };
  try {
    return JSON.parse(readFileSync(TAG_FILE, "utf-8")) as TagStore;
  } catch {
    return { version: "1.0.0", reviews: [] };
  }
}

function saveStore(store: TagStore): void {
  mkdirSync(dirname(TAG_FILE), { recursive: true });
  writeFileSync(TAG_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `rev-${Date.now().toString(36)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTag(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-tag — Tag reviews for organization and filtering

Usage:
  judges review-tag add --tags sprint-42,hotfix --score 8.5
  judges review-tag list                           List all tags
  judges review-tag list --tag sprint-42           List reviews with tag
  judges review-tag remove --id rev-abc123 --tag hotfix
  judges review-tag clear                          Clear all tags

Subcommands:
  add                   Tag a review
  list                  List tags or tagged reviews
  remove                Remove a tag from a review
  clear                 Clear all tag data

Options:
  --tags <t1,t2>        Comma-separated tags
  --tag <tag>           Filter by single tag
  --id <id>             Review ID
  --score <n>           Review score
  --source <text>       Source description
  --format json         JSON output
  --help, -h            Show this help

Tag reviews for easy organization. Data in .judges/review-tags.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand = argv.find((a) => ["add", "list", "remove", "clear"].includes(a)) || "list";
  const store = loadStore();

  if (subcommand === "add") {
    const tagsArg = argv.find((_a: string, i: number) => argv[i - 1] === "--tags") || "";
    const tags = tagsArg
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) {
      console.error("Error: --tags is required.");
      process.exitCode = 1;
      return;
    }
    const score = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
    const source = argv.find((_a: string, i: number) => argv[i - 1] === "--source") || "";
    const id = generateId();
    store.reviews.push({ id, tags, createdAt: new Date().toISOString(), score, findingCount: 0, source });
    saveStore(store);
    console.log(`Tagged review ${id} with: ${tags.join(", ")}`);
    return;
  }

  if (subcommand === "remove") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    const tag = argv.find((_a: string, i: number) => argv[i - 1] === "--tag");
    if (!id || !tag) {
      console.error("Error: --id and --tag are required.");
      process.exitCode = 1;
      return;
    }
    const review = store.reviews.find((r) => r.id === id);
    if (!review) {
      console.error(`Error: Review "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    review.tags = review.tags.filter((t) => t !== tag);
    saveStore(store);
    console.log(`Removed tag "${tag}" from ${id}.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", reviews: [] });
    console.log("Tag data cleared.");
    return;
  }

  // list
  const filterTag = argv.find((_a: string, i: number) => argv[i - 1] === "--tag");
  const filtered = filterTag ? store.reviews.filter((r) => r.tags.includes(filterTag)) : store.reviews;

  if (format === "json") {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }

  if (filtered.length === 0) {
    console.log(
      filterTag ? `No reviews tagged "${filterTag}".` : "No tagged reviews. Use 'judges review-tag add' to start.",
    );
    return;
  }

  // Show unique tags summary
  if (!filterTag) {
    const tagCounts = new Map<string, number>();
    for (const r of store.reviews) {
      for (const t of r.tags) {
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }
    console.log("\nReview Tags:");
    console.log("─".repeat(40));
    for (const [tag, count] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${tag.padEnd(25)} ${count} review(s)`);
    }
    console.log("─".repeat(40));
    return;
  }

  console.log(`\nReviews tagged "${filterTag}":`);
  console.log("─".repeat(60));
  for (const r of filtered) {
    console.log(`  ${r.id}  score=${r.score.toFixed(1)}  ${r.createdAt.slice(0, 10)}  [${r.tags.join(", ")}]`);
  }
  console.log("─".repeat(60));
}

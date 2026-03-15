/**
 * Review-tag-manager — Manage tags for reviews and findings.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TagEntry {
  name: string;
  color: string;
  description: string;
  createdAt: string;
  usageCount: number;
}

interface TagStore {
  tags: TagEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTagManager(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-tags.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const addIdx = argv.indexOf("--add");
  const addTag = addIdx >= 0 ? argv[addIdx + 1] : "";
  const removeIdx = argv.indexOf("--remove");
  const removeTag = removeIdx >= 0 ? argv[removeIdx + 1] : "";
  const descIdx = argv.indexOf("--description");
  const desc = descIdx >= 0 ? argv[descIdx + 1] : "";
  const initMode = argv.includes("--init");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-tag-manager — Manage review tags

Usage:
  judges review-tag-manager [--store <path>] [--format table|json]
  judges review-tag-manager --init [--store <path>]
  judges review-tag-manager --add <name> [--description <text>] [--store <path>]
  judges review-tag-manager --remove <name> [--store <path>]

Options:
  --store <path>         Tag store (default: .judges-tags.json)
  --init                 Create default tag set
  --add <name>           Add a tag
  --remove <name>        Remove a tag
  --description <text>   Tag description (with --add)
  --format <fmt>         Output format: table (default), json
  --help, -h             Show this help
`);
    return;
  }

  if (initMode) {
    const defaultStore: TagStore = {
      tags: [
        {
          name: "security",
          color: "red",
          description: "Security-related findings",
          createdAt: new Date().toISOString(),
          usageCount: 0,
        },
        {
          name: "performance",
          color: "orange",
          description: "Performance issues",
          createdAt: new Date().toISOString(),
          usageCount: 0,
        },
        {
          name: "quality",
          color: "blue",
          description: "Code quality findings",
          createdAt: new Date().toISOString(),
          usageCount: 0,
        },
        {
          name: "compliance",
          color: "purple",
          description: "Compliance-related",
          createdAt: new Date().toISOString(),
          usageCount: 0,
        },
      ],
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(storePath, JSON.stringify(defaultStore, null, 2));
    console.log(`Created default tag store: ${storePath}`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No tag store found at: ${storePath}`);
    console.log("Run with --init to create one.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as TagStore;

  if (addTag) {
    const exists = store.tags.some((t) => t.name === addTag);
    if (exists) {
      console.error(`Tag already exists: ${addTag}`);
      process.exitCode = 1;
      return;
    }
    store.tags.push({
      name: addTag,
      color: "gray",
      description: desc || addTag,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    });
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Added tag: ${addTag}`);
    return;
  }

  if (removeTag) {
    const idx = store.tags.findIndex((t) => t.name === removeTag);
    if (idx < 0) {
      console.error(`Tag not found: ${removeTag}`);
      process.exitCode = 1;
      return;
    }
    store.tags.splice(idx, 1);
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Removed tag: ${removeTag}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nReview Tags");
  console.log("═".repeat(60));
  console.log(`  ${"Name".padEnd(18)} ${"Color".padEnd(10)} ${"Usage".padEnd(8)} Description`);
  console.log("  " + "─".repeat(55));

  for (const t of store.tags) {
    console.log(`  ${t.name.padEnd(18)} ${t.color.padEnd(10)} ${String(t.usageCount).padEnd(8)} ${t.description}`);
  }

  console.log(`\n  Total tags: ${store.tags.length}`);
  console.log("═".repeat(60));
}

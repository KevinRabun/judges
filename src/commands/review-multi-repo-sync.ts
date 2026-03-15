/**
 * Review-multi-repo-sync — Synchronize review configs across multiple repositories.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RepoEntry {
  name: string;
  path: string;
  configHash: string;
  lastSynced: string;
  status: "synced" | "drift" | "unknown";
}

interface MultiRepoStore {
  repos: RepoEntry[];
  sourceConfig: string;
  lastUpdated: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewMultiRepoSync(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-multi-repo.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const addIdx = argv.indexOf("--add");
  const addPath = addIdx >= 0 ? argv[addIdx + 1] : "";
  const checkMode = argv.includes("--check");
  const initMode = argv.includes("--init");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-multi-repo-sync — Sync review configs across repos

Usage:
  judges review-multi-repo-sync [--store <path>] [--format table|json]
  judges review-multi-repo-sync --init [--store <path>]
  judges review-multi-repo-sync --add <repo-path> [--store <path>]
  judges review-multi-repo-sync --check [--store <path>]

Options:
  --store <path>     Multi-repo store file (default: .judges-multi-repo.json)
  --init             Create default multi-repo store
  --add <path>       Add a repository by path
  --check            Check config drift across repos
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (initMode) {
    const defaultStore: MultiRepoStore = {
      repos: [],
      sourceConfig: ".judgesrc",
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(storePath, JSON.stringify(defaultStore, null, 2));
    console.log(`Created multi-repo store: ${storePath}`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No multi-repo store found at: ${storePath}`);
    console.log("Run with --init to create one.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as MultiRepoStore;

  if (addPath) {
    const configFile = addPath.replace(/\/$/, "") + "/" + store.sourceConfig;
    const hash = existsSync(configFile) ? simpleHash(readFileSync(configFile, "utf-8")) : "none";
    const name = addPath.split("/").pop() ?? addPath;

    store.repos.push({
      name,
      path: addPath,
      configHash: hash,
      lastSynced: new Date().toISOString(),
      status: "unknown",
    });
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Added repository: ${name} (${addPath})`);
    return;
  }

  if (checkMode) {
    let driftCount = 0;
    const sourceHash = store.repos.length > 0 ? store.repos[0].configHash : "";

    for (const repo of store.repos) {
      const configFile = repo.path.replace(/\/$/, "") + "/" + store.sourceConfig;
      if (existsSync(configFile)) {
        const currentHash = simpleHash(readFileSync(configFile, "utf-8"));
        repo.configHash = currentHash;
        repo.status = currentHash === sourceHash ? "synced" : "drift";
      } else {
        repo.status = "drift";
      }
      if (repo.status === "drift") driftCount++;
    }

    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Checked ${store.repos.length} repos. Drift detected in ${driftCount}.`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nMulti-Repo Sync Status");
  console.log("═".repeat(70));

  if (store.repos.length === 0) {
    console.log("  No repositories registered. Use --add <path> to add one.");
  } else {
    console.log(`  ${"Name".padEnd(20)} ${"Status".padEnd(10)} ${"Hash".padEnd(12)} Last Synced`);
    console.log("  " + "─".repeat(65));

    for (const repo of store.repos) {
      console.log(
        `  ${repo.name.padEnd(20)} ${repo.status.padEnd(10)} ${repo.configHash.padEnd(12)} ${repo.lastSynced.slice(0, 10)}`,
      );
    }
  }

  console.log(`\n  Source config: ${store.sourceConfig}`);
  console.log("═".repeat(70));
}

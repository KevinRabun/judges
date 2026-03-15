/**
 * Review-branch-policy — Manage branch-level review policies.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BranchPolicy {
  pattern: string;
  preset: string;
  minScore: number;
  blockOnCritical: boolean;
  requiredJudges: string[];
}

interface BranchPolicyStore {
  policies: BranchPolicy[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBranchPolicy(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-branch-policy.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const initMode = argv.includes("--init");
  const addIdx = argv.indexOf("--add");
  const addPattern = addIdx >= 0 ? argv[addIdx + 1] : "";
  const removeIdx = argv.indexOf("--remove");
  const removePattern = removeIdx >= 0 ? argv[removeIdx + 1] : "";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-branch-policy — Manage branch-level review policies

Usage:
  judges review-branch-policy [--store <path>] [--format table|json]
  judges review-branch-policy --init [--store <path>]
  judges review-branch-policy --add <pattern> [--store <path>]
  judges review-branch-policy --remove <pattern> [--store <path>]

Options:
  --store <path>     Policy store (default: .judges-branch-policy.json)
  --init             Create default policies (main, develop, feature/*)
  --add <pattern>    Add a branch pattern policy
  --remove <pattern> Remove a branch pattern policy
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (initMode) {
    const defaultStore: BranchPolicyStore = {
      policies: [
        { pattern: "main", preset: "strict", minScore: 80, blockOnCritical: true, requiredJudges: [] },
        { pattern: "develop", preset: "default", minScore: 60, blockOnCritical: true, requiredJudges: [] },
        { pattern: "feature/*", preset: "default", minScore: 50, blockOnCritical: false, requiredJudges: [] },
      ],
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(storePath, JSON.stringify(defaultStore, null, 2));
    console.log(`Created default branch policies: ${storePath}`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No branch policy store found at: ${storePath}`);
    console.log("Run with --init to create one.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as BranchPolicyStore;

  if (addPattern) {
    const exists = store.policies.some((p) => p.pattern === addPattern);
    if (exists) {
      console.error(`Policy already exists for pattern: ${addPattern}`);
      process.exitCode = 1;
      return;
    }
    store.policies.push({
      pattern: addPattern,
      preset: "default",
      minScore: 60,
      blockOnCritical: false,
      requiredJudges: [],
    });
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Added branch policy: ${addPattern}`);
    return;
  }

  if (removePattern) {
    const idx = store.policies.findIndex((p) => p.pattern === removePattern);
    if (idx < 0) {
      console.error(`Policy not found for pattern: ${removePattern}`);
      process.exitCode = 1;
      return;
    }
    store.policies.splice(idx, 1);
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Removed branch policy: ${removePattern}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nBranch Review Policies");
  console.log("═".repeat(70));
  console.log(
    `  ${"Pattern".padEnd(20)} ${"Preset".padEnd(12)} ${"Min Score".padEnd(12)} ${"Block Crit".padEnd(12)} Required`,
  );
  console.log("  " + "─".repeat(65));

  for (const p of store.policies) {
    const block = p.blockOnCritical ? "Yes" : "No";
    const req = p.requiredJudges.length > 0 ? p.requiredJudges.join(", ") : "—";
    console.log(
      `  ${p.pattern.padEnd(20)} ${p.preset.padEnd(12)} ${String(p.minScore).padEnd(12)} ${block.padEnd(12)} ${req}`,
    );
  }

  console.log(`\n  Total policies: ${store.policies.length}`);
  console.log("═".repeat(70));
}

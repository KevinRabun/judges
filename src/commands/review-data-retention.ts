/**
 * Review-data-retention — Configure data retention policies for review data.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RetentionPolicy {
  dataType: "reports" | "cache" | "annotations" | "dismissals";
  retentionDays: number;
  autoClean: boolean;
}

interface RetentionStore {
  policies: RetentionPolicy[];
  lastUpdated: string;
}

const DEFAULT_POLICIES: RetentionPolicy[] = [
  { dataType: "reports", retentionDays: 90, autoClean: false },
  { dataType: "cache", retentionDays: 30, autoClean: true },
  { dataType: "annotations", retentionDays: 365, autoClean: false },
  { dataType: "dismissals", retentionDays: 180, autoClean: false },
];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewDataRetention(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-retention.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-data-retention — Configure data retention policies

Usage:
  judges review-data-retention [--store <path>] [--init] [--set <json>]
                               [--clean <dir>] [--format table|json]

Options:
  --store <path>   Retention config file (default: .judges-retention.json)
  --init           Initialize with default retention policies
  --set <json>     Set retention policy (JSON)
  --clean <dir>    Run cleanup on directory based on retention policy
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  // Init
  if (argv.includes("--init")) {
    const store: RetentionStore = {
      policies: DEFAULT_POLICIES,
      lastUpdated: new Date().toISOString().split("T")[0],
    };
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Retention policies initialized at: ${storePath}`);
    return;
  }

  let store: RetentionStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as RetentionStore;
  } else {
    store = { policies: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Set policy
  const setIdx = argv.indexOf("--set");
  if (setIdx >= 0) {
    const policy = JSON.parse(argv[setIdx + 1]) as RetentionPolicy;
    const existingIdx = store.policies.findIndex((p) => p.dataType === policy.dataType);
    if (existingIdx >= 0) {
      store.policies[existingIdx] = policy;
    } else {
      store.policies.push(policy);
    }
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Retention policy for "${policy.dataType}" saved.`);
    return;
  }

  // Clean
  const cleanIdx = argv.indexOf("--clean");
  if (cleanIdx >= 0) {
    const cleanDir = argv[cleanIdx + 1];
    if (!existsSync(cleanDir)) {
      console.log(`Directory not found: ${cleanDir}`);
      return;
    }

    const files = (readdirSync(cleanDir) as unknown as string[]).filter((f: string) => f.endsWith(".json"));
    const cutoffMs = 30 * 24 * 60 * 60 * 1000; // Default 30 days
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      const filePath = join(cleanDir, file);
      try {
        const content = JSON.parse(readFileSync(filePath, "utf-8")) as { timestamp?: string };
        if (content.timestamp !== undefined) {
          const fileTime = new Date(content.timestamp).getTime();
          if (now - fileTime > cutoffMs) {
            unlinkSync(filePath);
            cleaned++;
          }
        }
      } catch {
        // Skip files that can't be parsed
      }
    }

    console.log(`Cleaned ${cleaned} file(s) from ${cleanDir}`);
    return;
  }

  // Display
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nData Retention Policies`);
  console.log("═".repeat(55));

  if (store.policies.length === 0) {
    console.log("  No retention policies. Use --init for defaults.");
  } else {
    console.log(`  ${"Data Type".padEnd(15)} ${"Retention".padEnd(12)} Auto-clean`);
    console.log("  " + "─".repeat(40));

    for (const p of store.policies) {
      const retention = p.retentionDays < 365 ? `${p.retentionDays}d` : `${Math.round(p.retentionDays / 365)}y`;
      console.log(`  ${p.dataType.padEnd(15)} ${retention.padEnd(12)} ${p.autoClean ? "Yes" : "No"}`);
    }
  }

  console.log("═".repeat(55));
}

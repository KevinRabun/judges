/**
 * Review-access-log — View and manage review access logs.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AccessEntry {
  user: string;
  action: string;
  resource: string;
  timestamp: string;
  result: "allowed" | "denied";
}

interface AccessLogStore {
  entries: AccessEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAccessLog(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-access-log.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const userFilter = argv.indexOf("--user");
  const filterUser = userFilter >= 0 ? argv[userFilter + 1] : "";
  const lastN = argv.indexOf("--last");
  const lastCount = lastN >= 0 ? parseInt(argv[lastN + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-access-log — View review access logs

Usage:
  judges review-access-log [--store <path>] [--user <name>] [--last <n>] [--format table|json]

Options:
  --store <path>     Access log file (default: .judges-access-log.json)
  --user <name>      Filter by user
  --last <n>         Show only the last N entries
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No access log found at: ${storePath}`);
    console.log("Access logs are generated when permission features are enabled.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as AccessLogStore;
  let entries = store.entries;

  if (filterUser) {
    entries = entries.filter((e) => e.user === filterUser);
  }

  if (lastCount > 0) {
    entries = entries.slice(-lastCount);
  }

  if (format === "json") {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  console.log(`\nAccess Log (${entries.length} entries)`);
  console.log("═".repeat(80));

  if (entries.length === 0) {
    console.log("  No access log entries to display.");
  } else {
    console.log(`  ${"User".padEnd(18)} ${"Action".padEnd(15)} ${"Resource".padEnd(20)} ${"Result".padEnd(10)} Date`);
    console.log("  " + "─".repeat(75));

    for (const e of entries) {
      const res = e.resource.length > 18 ? e.resource.slice(0, 15) + "..." : e.resource;
      console.log(
        `  ${e.user.padEnd(18)} ${e.action.padEnd(15)} ${res.padEnd(20)} ${e.result.padEnd(10)} ${e.timestamp.slice(0, 10)}`,
      );
    }
  }

  const allowed = entries.filter((e) => e.result === "allowed").length;
  const denied = entries.filter((e) => e.result === "denied").length;
  console.log(`\n  Allowed: ${allowed} | Denied: ${denied}`);
  console.log("═".repeat(80));
}

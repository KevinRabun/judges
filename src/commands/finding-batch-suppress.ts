/**
 * Finding-batch-suppress — Batch suppress multiple findings at once.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuppressionEntry {
  ruleId: string;
  reason: string;
  suppressedAt: string;
  expiresAt: string;
}

interface SuppressionStore {
  suppressions: SuppressionEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingBatchSuppress(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-suppressions.json";
  const findingsIdx = argv.indexOf("--findings");
  const findingsPath = findingsIdx >= 0 ? argv[findingsIdx + 1] : "";
  const reasonIdx = argv.indexOf("--reason");
  const reason = reasonIdx >= 0 ? argv[reasonIdx + 1] : "batch suppressed";
  const severityIdx = argv.indexOf("--severity");
  const severity = severityIdx >= 0 ? argv[severityIdx + 1] : "";
  const daysIdx = argv.indexOf("--expires-days");
  const expiresDays = daysIdx >= 0 ? parseInt(argv[daysIdx + 1], 10) : 30;
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-batch-suppress — Batch suppress findings

Usage:
  judges finding-batch-suppress --findings <path> [--severity <sev>] [--reason <text>] [--expires-days <n>]
  judges finding-batch-suppress [--store <path>] [--format table|json]

Options:
  --findings <path>    Path to findings JSON to suppress
  --severity <sev>     Only suppress findings of this severity
  --reason <text>      Suppression reason (default: "batch suppressed")
  --expires-days <n>   Days until suppression expires (default: 30)
  --store <path>       Suppression store (default: .judges-suppressions.json)
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  const store: SuppressionStore = existsSync(storePath)
    ? (JSON.parse(readFileSync(storePath, "utf-8")) as SuppressionStore)
    : { suppressions: [], lastUpdated: new Date().toISOString() };

  if (findingsPath && existsSync(findingsPath)) {
    const findings = JSON.parse(readFileSync(findingsPath, "utf-8")) as Finding[];
    let filtered = findings;
    if (severity) {
      filtered = findings.filter((f) => f.severity === severity);
    }

    const now = new Date();
    const expires = new Date(now.getTime() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
    let count = 0;

    for (const f of filtered) {
      const existing = store.suppressions.find((s) => s.ruleId === f.ruleId);
      if (!existing) {
        store.suppressions.push({
          ruleId: f.ruleId,
          reason,
          suppressedAt: now.toISOString(),
          expiresAt: expires,
        });
        count++;
      }
    }

    store.lastUpdated = now.toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Suppressed ${count} findings (expires in ${expiresDays} days).`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nSuppressed Findings (${store.suppressions.length})`);
  console.log("═".repeat(70));

  if (store.suppressions.length === 0) {
    console.log("  No suppressions.");
  } else {
    console.log(`  ${"Rule ID".padEnd(25)} ${"Reason".padEnd(20)} ${"Suppressed".padEnd(14)} Expires`);
    console.log("  " + "─".repeat(65));

    for (const s of store.suppressions) {
      const rsn = s.reason.length > 18 ? s.reason.slice(0, 15) + "..." : s.reason;
      console.log(
        `  ${s.ruleId.padEnd(25)} ${rsn.padEnd(20)} ${s.suppressedAt.slice(0, 10).padEnd(14)} ${s.expiresAt.slice(0, 10)}`,
      );
    }
  }

  console.log("═".repeat(70));
}

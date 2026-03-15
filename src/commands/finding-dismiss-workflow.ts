/**
 * Finding-dismiss-workflow — Manage finding dismissal workflows.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Dismissal {
  ruleId: string;
  reason: "false-positive" | "accepted-risk" | "wont-fix" | "duplicate";
  dismissedBy: string;
  dismissedAt: string;
  expiresAt: string;
  note: string;
}

interface DismissalStore {
  dismissals: Dismissal[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingDismissWorkflow(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-dismissals.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-dismiss-workflow — Manage finding dismissals

Usage:
  judges finding-dismiss-workflow [--store <path>]
    [--dismiss <ruleId> --reason <r> --by <name> --note <text> --expires <date>]
    [--revoke <ruleId>] [--audit] [--format table|json]

Options:
  --store <path>      Dismissal store (default: .judges-dismissals.json)
  --dismiss <ruleId>  Dismiss a finding
  --reason <r>        Reason: false-positive, accepted-risk, wont-fix, duplicate
  --by <name>         Who dismissed it
  --note <text>       Additional note
  --expires <date>    Expiry date (YYYY-MM-DD)
  --revoke <ruleId>   Revoke a dismissal
  --audit             Show audit log of all dismissals
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  let store: DismissalStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as DismissalStore;
  } else {
    store = { dismissals: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Dismiss
  const dismissIdx = argv.indexOf("--dismiss");
  if (dismissIdx >= 0) {
    const ruleId = argv[dismissIdx + 1];
    const reasonIdx = argv.indexOf("--reason");
    const byIdx = argv.indexOf("--by");
    const noteIdx = argv.indexOf("--note");
    const expiresIdx = argv.indexOf("--expires");

    const dismissal: Dismissal = {
      ruleId,
      reason: (reasonIdx >= 0 ? argv[reasonIdx + 1] : "accepted-risk") as Dismissal["reason"],
      dismissedBy: byIdx >= 0 ? argv[byIdx + 1] : "unknown",
      dismissedAt: new Date().toISOString().split("T")[0],
      expiresAt: expiresIdx >= 0 ? argv[expiresIdx + 1] : "9999-12-31",
      note: noteIdx >= 0 ? argv[noteIdx + 1] : "",
    };

    store.dismissals.push(dismissal);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Dismissed: ${ruleId} (${dismissal.reason})`);
    return;
  }

  // Revoke
  const revokeIdx = argv.indexOf("--revoke");
  if (revokeIdx >= 0) {
    const ruleId = argv[revokeIdx + 1];
    const before = store.dismissals.length;
    store.dismissals = store.dismissals.filter((d) => d.ruleId !== ruleId);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Revoked ${before - store.dismissals.length} dismissal(s) for: ${ruleId}`);
    return;
  }

  // Audit log
  if (argv.includes("--audit")) {
    const today = new Date().toISOString().split("T")[0];
    const active = store.dismissals.filter((d) => d.expiresAt >= today);
    const expired = store.dismissals.filter((d) => d.expiresAt < today);

    if (format === "json") {
      console.log(JSON.stringify({ active, expired }, null, 2));
      return;
    }

    console.log(`\nDismissal Audit`);
    console.log("═".repeat(70));

    if (active.length > 0) {
      console.log("  Active:");
      for (const d of active) {
        console.log(`    ${d.ruleId.padEnd(25)} [${d.reason}] by ${d.dismissedBy} (${d.dismissedAt})`);
        if (d.note.length > 0) console.log(`      Note: ${d.note}`);
      }
    }

    if (expired.length > 0) {
      console.log("  Expired:");
      for (const d of expired) {
        console.log(`    ${d.ruleId.padEnd(25)} [${d.reason}] expired ${d.expiresAt}`);
      }
    }

    console.log(`\n  Active: ${active.length} | Expired: ${expired.length}`);
    console.log("═".repeat(70));
    return;
  }

  // List
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nDismissals`);
  console.log("═".repeat(65));

  if (store.dismissals.length === 0) {
    console.log("  No dismissals. Use --dismiss <ruleId> to add one.");
  } else {
    for (const d of store.dismissals) {
      console.log(`  ${d.ruleId.padEnd(25)} [${d.reason}] by ${d.dismissedBy}`);
    }
  }

  console.log("═".repeat(65));
}

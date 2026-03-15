/**
 * Finding-ownership-assign — Assign ownership of findings to team members.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OwnerAssignment {
  ruleId: string;
  title: string;
  severity: string;
  owner: string;
  assignedAt: string;
  status: "assigned" | "acknowledged" | "resolved";
}

interface OwnershipStore {
  assignments: OwnerAssignment[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingOwnershipAssign(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-ownership.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const assignIdx = argv.indexOf("--assign");
  const assignRule = assignIdx >= 0 ? argv[assignIdx + 1] : "";
  const ownerIdx = argv.indexOf("--owner");
  const ownerName = ownerIdx >= 0 ? argv[ownerIdx + 1] : "";
  const findingsIdx = argv.indexOf("--findings");
  const findingsPath = findingsIdx >= 0 ? argv[findingsIdx + 1] : "";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-ownership-assign — Assign finding ownership

Usage:
  judges finding-ownership-assign [--store <path>] [--format table|json]
  judges finding-ownership-assign --assign <ruleId> --owner <name> [--store <path>]
  judges finding-ownership-assign --findings <path> --owner <name> [--store <path>]

Options:
  --store <path>      Ownership store (default: .judges-ownership.json)
  --assign <ruleId>   Assign a specific rule finding
  --findings <path>   Bulk assign from findings JSON
  --owner <name>      Owner name/email
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  const store: OwnershipStore = existsSync(storePath)
    ? (JSON.parse(readFileSync(storePath, "utf-8")) as OwnershipStore)
    : { assignments: [], lastUpdated: new Date().toISOString() };

  if (assignRule && ownerName) {
    const existing = store.assignments.find((a) => a.ruleId === assignRule);
    if (existing) {
      existing.owner = ownerName;
      existing.assignedAt = new Date().toISOString();
      existing.status = "assigned";
    } else {
      store.assignments.push({
        ruleId: assignRule,
        title: assignRule,
        severity: "medium",
        owner: ownerName,
        assignedAt: new Date().toISOString(),
        status: "assigned",
      });
    }
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Assigned ${assignRule} to ${ownerName}.`);
    return;
  }

  if (findingsPath && ownerName && existsSync(findingsPath)) {
    const findings = JSON.parse(readFileSync(findingsPath, "utf-8")) as Finding[];
    let count = 0;
    for (const f of findings) {
      const existing = store.assignments.find((a) => a.ruleId === f.ruleId);
      if (!existing) {
        store.assignments.push({
          ruleId: f.ruleId,
          title: f.title,
          severity: f.severity,
          owner: ownerName,
          assignedAt: new Date().toISOString(),
          status: "assigned",
        });
        count++;
      }
    }
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Bulk assigned ${count} findings to ${ownerName}.`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nFinding Ownership");
  console.log("═".repeat(80));

  if (store.assignments.length === 0) {
    console.log("  No assignments yet.");
  } else {
    console.log(
      `  ${"Rule ID".padEnd(25)} ${"Severity".padEnd(10)} ${"Owner".padEnd(18)} ${"Status".padEnd(14)} Assigned`,
    );
    console.log("  " + "─".repeat(75));

    for (const a of store.assignments) {
      console.log(
        `  ${a.ruleId.padEnd(25)} ${a.severity.padEnd(10)} ${a.owner.padEnd(18)} ${a.status.padEnd(14)} ${a.assignedAt.slice(0, 10)}`,
      );
    }
  }

  console.log(`\n  Total assignments: ${store.assignments.length}`);
  console.log("═".repeat(80));
}

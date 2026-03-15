/**
 * Review-incident-link — Link review findings to incident tracking systems.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IncidentLink {
  ruleId: string;
  severity: string;
  incidentId: string;
  system: string;
  linkedAt: string;
  status: "open" | "resolved" | "pending";
}

interface IncidentStore {
  links: IncidentLink[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewIncidentLink(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-incidents.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const linkIdx = argv.indexOf("--link");
  const linkRule = linkIdx >= 0 ? argv[linkIdx + 1] : "";
  const incidentIdx = argv.indexOf("--incident");
  const incidentId = incidentIdx >= 0 ? argv[incidentIdx + 1] : "";
  const systemIdx = argv.indexOf("--system");
  const system = systemIdx >= 0 ? argv[systemIdx + 1] : "generic";
  const findingsIdx = argv.indexOf("--findings");
  const findingsPath = findingsIdx >= 0 ? argv[findingsIdx + 1] : "";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-incident-link — Link findings to incidents

Usage:
  judges review-incident-link [--store <path>] [--format table|json]
  judges review-incident-link --link <ruleId> --incident <id> [--system <name>]
  judges review-incident-link --findings <path> --incident <id> [--system <name>]

Options:
  --store <path>        Incident store (default: .judges-incidents.json)
  --link <ruleId>       Link a specific rule to an incident
  --incident <id>       Incident/ticket ID
  --system <name>       Tracking system name (default: generic)
  --findings <path>     Bulk link from findings JSON
  --format <fmt>        Output format: table (default), json
  --help, -h            Show this help
`);
    return;
  }

  const store: IncidentStore = existsSync(storePath)
    ? (JSON.parse(readFileSync(storePath, "utf-8")) as IncidentStore)
    : { links: [], lastUpdated: new Date().toISOString() };

  if (linkRule && incidentId) {
    store.links.push({
      ruleId: linkRule,
      severity: "medium",
      incidentId,
      system,
      linkedAt: new Date().toISOString(),
      status: "open",
    });
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Linked ${linkRule} to incident ${incidentId} (${system}).`);
    return;
  }

  if (findingsPath && incidentId && existsSync(findingsPath)) {
    const findings = JSON.parse(readFileSync(findingsPath, "utf-8")) as Finding[];
    let count = 0;
    for (const f of findings) {
      store.links.push({
        ruleId: f.ruleId,
        severity: f.severity,
        incidentId,
        system,
        linkedAt: new Date().toISOString(),
        status: "open",
      });
      count++;
    }
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Linked ${count} findings to incident ${incidentId}.`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nIncident Links");
  console.log("═".repeat(80));

  if (store.links.length === 0) {
    console.log("  No incident links.");
  } else {
    console.log(
      `  ${"Rule ID".padEnd(25)} ${"Severity".padEnd(10)} ${"Incident".padEnd(15)} ${"System".padEnd(12)} Status`,
    );
    console.log("  " + "─".repeat(70));

    for (const l of store.links) {
      console.log(
        `  ${l.ruleId.padEnd(25)} ${l.severity.padEnd(10)} ${l.incidentId.padEnd(15)} ${l.system.padEnd(12)} ${l.status}`,
      );
    }
  }

  console.log(`\n  Total links: ${store.links.length}`);
  console.log("═".repeat(80));
}

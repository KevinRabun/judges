/**
 * Review-sla-config — Configure SLA targets for review resolution.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Severity } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SlaTarget {
  severity: Severity;
  maxResolutionHours: number;
  escalateAfterHours: number;
  notifyOnBreach: boolean;
}

interface SlaStore {
  targets: SlaTarget[];
  lastUpdated: string;
}

const DEFAULT_SLAS: SlaTarget[] = [
  { severity: "critical", maxResolutionHours: 4, escalateAfterHours: 2, notifyOnBreach: true },
  { severity: "high", maxResolutionHours: 24, escalateAfterHours: 12, notifyOnBreach: true },
  { severity: "medium", maxResolutionHours: 72, escalateAfterHours: 48, notifyOnBreach: false },
  { severity: "low", maxResolutionHours: 168, escalateAfterHours: 120, notifyOnBreach: false },
  { severity: "info", maxResolutionHours: 336, escalateAfterHours: 240, notifyOnBreach: false },
];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSlaConfig(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-sla.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-sla-config — Configure SLA targets for review resolution

Usage:
  judges review-sla-config [--store <path>] [--init] [--set <json>]
                           [--format table|json]

Options:
  --store <path>   SLA config file (default: .judges-sla.json)
  --init           Initialize with default SLA targets
  --set <json>     Set SLA target (JSON with severity, maxResolutionHours, etc.)
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  // Init with defaults
  if (argv.includes("--init")) {
    const store: SlaStore = {
      targets: DEFAULT_SLAS,
      lastUpdated: new Date().toISOString().split("T")[0],
    };
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`SLA config initialized with defaults at: ${storePath}`);
    return;
  }

  let store: SlaStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as SlaStore;
  } else {
    store = { targets: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Set SLA target
  const setIdx = argv.indexOf("--set");
  if (setIdx >= 0) {
    const target = JSON.parse(argv[setIdx + 1]) as SlaTarget;
    const existingIdx = store.targets.findIndex((t) => t.severity === target.severity);
    if (existingIdx >= 0) {
      store.targets[existingIdx] = target;
    } else {
      store.targets.push(target);
    }
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`SLA target for "${target.severity}" saved.`);
    return;
  }

  // Display
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nSLA Configuration`);
  console.log("═".repeat(65));

  if (store.targets.length === 0) {
    console.log("  No SLA targets configured. Use --init for defaults or --set to add.");
  } else {
    console.log(`  ${"Severity".padEnd(12)} ${"Max Resolution".padEnd(16)} ${"Escalate After".padEnd(16)} Notify`);
    console.log("  " + "─".repeat(55));

    for (const t of store.targets) {
      const maxRes =
        t.maxResolutionHours < 24 ? `${t.maxResolutionHours}h` : `${Math.round(t.maxResolutionHours / 24)}d`;
      const escalate =
        t.escalateAfterHours < 24 ? `${t.escalateAfterHours}h` : `${Math.round(t.escalateAfterHours / 24)}d`;
      console.log(
        `  ${t.severity.padEnd(12)} ${maxRes.padEnd(16)} ${escalate.padEnd(16)} ${t.notifyOnBreach ? "Yes" : "No"}`,
      );
    }
  }

  console.log("═".repeat(65));
}

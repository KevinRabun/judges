/**
 * Review-gate-config — Configure quality gates for review pipelines.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Severity } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QualityGate {
  id: string;
  name: string;
  conditions: GateCondition[];
  enabled: boolean;
}

interface GateCondition {
  metric: "criticalCount" | "highCount" | "totalFindings" | "passRate" | "overallScore";
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  threshold: number;
}

interface GateStore {
  gates: QualityGate[];
  lastUpdated: string;
}

interface ReportData {
  criticalCount?: number;
  highCount?: number;
  findings?: { severity?: Severity }[];
  overallScore?: number;
  overallVerdict?: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewGateConfig(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-gates.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-gate-config — Configure quality gates

Usage:
  judges review-gate-config [--store <path>] [--add <json>]
                            [--remove <id>] [--check <report>]
                            [--format table|json]

Options:
  --store <path>   Gate config file (default: .judges-gates.json)
  --add <json>     Add quality gate (JSON)
  --remove <id>    Remove gate by id
  --check <report> Check report against configured gates
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help

Example gate JSON:
  {"id":"no-criticals","name":"No Critical Findings",
   "conditions":[{"metric":"criticalCount","operator":"eq","threshold":0}],
   "enabled":true}
`);
    return;
  }

  let store: GateStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as GateStore;
  } else {
    store = { gates: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Add gate
  const addIdx = argv.indexOf("--add");
  if (addIdx >= 0) {
    const gate = JSON.parse(argv[addIdx + 1]) as QualityGate;
    const existingIdx = store.gates.findIndex((g) => g.id === gate.id);
    if (existingIdx >= 0) {
      store.gates[existingIdx] = gate;
    } else {
      store.gates.push(gate);
    }
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Gate "${gate.id}" saved.`);
    return;
  }

  // Remove gate
  const removeIdx = argv.indexOf("--remove");
  if (removeIdx >= 0) {
    const id = argv[removeIdx + 1];
    store.gates = store.gates.filter((g) => g.id !== id);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Gate "${id}" removed.`);
    return;
  }

  // Check report
  const checkIdx = argv.indexOf("--check");
  if (checkIdx >= 0) {
    const reportPath = argv[checkIdx + 1];
    if (!existsSync(reportPath)) {
      console.error(`Report not found: ${reportPath}`);
      process.exitCode = 1;
      return;
    }

    const report = JSON.parse(readFileSync(reportPath, "utf-8")) as ReportData;
    const totalFindings = report.findings?.length ?? 0;
    const criticalCount = report.criticalCount ?? 0;
    const highCount = report.highCount ?? 0;
    const overallScore = report.overallScore ?? 0;
    const passRate = report.overallVerdict === "pass" ? 100 : 0;

    const metrics: Record<string, number> = {
      criticalCount,
      highCount,
      totalFindings,
      passRate,
      overallScore,
    };

    const results: { gateId: string; passed: boolean; details: string }[] = [];

    for (const gate of store.gates.filter((g) => g.enabled)) {
      let gatePassed = true;
      const details: string[] = [];

      for (const cond of gate.conditions) {
        const actual = metrics[cond.metric] ?? 0;
        let condPassed = false;

        if (cond.operator === "lt") condPassed = actual < cond.threshold;
        else if (cond.operator === "lte") condPassed = actual <= cond.threshold;
        else if (cond.operator === "gt") condPassed = actual > cond.threshold;
        else if (cond.operator === "gte") condPassed = actual >= cond.threshold;
        else if (cond.operator === "eq") condPassed = actual === cond.threshold;

        if (!condPassed) {
          gatePassed = false;
          details.push(`${cond.metric} ${cond.operator} ${cond.threshold} (actual: ${actual})`);
        }
      }

      results.push({ gateId: gate.id, passed: gatePassed, details: details.join("; ") });
    }

    const allPassed = results.every((r) => r.passed);

    if (format === "json") {
      console.log(JSON.stringify({ allPassed, results }, null, 2));
    } else {
      console.log(`\nQuality Gate Results`);
      console.log("═".repeat(60));
      for (const r of results) {
        const icon = r.passed ? "PASS" : "FAIL";
        console.log(`  [${icon}] ${r.gateId}${r.details.length > 0 ? ` — ${r.details}` : ""}`);
      }
      console.log(`\n  Overall: ${allPassed ? "ALL GATES PASSED" : "GATE FAILURE"}`);
      console.log("═".repeat(60));

      if (!allPassed) {
        process.exitCode = 1;
      }
    }
    return;
  }

  // List gates
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nQuality Gates`);
  console.log("═".repeat(60));

  if (store.gates.length === 0) {
    console.log("  No quality gates configured. Use --add to create one.");
  } else {
    for (const g of store.gates) {
      const status = g.enabled ? "ON" : "OFF";
      console.log(`  [${status}] ${g.id.padEnd(20)} ${g.name}`);
      for (const c of g.conditions) {
        console.log(`         ${c.metric} ${c.operator} ${c.threshold}`);
      }
    }
  }

  console.log("═".repeat(60));
}

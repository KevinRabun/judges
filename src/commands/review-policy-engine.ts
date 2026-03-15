/**
 * Review-policy-engine — Define and enforce code-review policies locally.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Severity } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Policy {
  id: string;
  name: string;
  description: string;
  rules: PolicyRule[];
  enabled: boolean;
}

interface PolicyRule {
  field: "severity" | "ruleId" | "confidence";
  operator: "eq" | "neq" | "gte" | "lte";
  value: string | number;
  action: "block" | "warn" | "allow";
}

interface PolicyStore {
  policies: Policy[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPolicyEngine(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-policies.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-policy-engine — Define and enforce code-review policies

Usage:
  judges review-policy-engine [--store <path>] [--add <json>]
                              [--remove <id>] [--check <report>]
                              [--format table|json]

Options:
  --store <path>    Policy store file (default: .judges-policies.json)
  --add <json>      Add a policy (JSON string)
  --remove <id>     Remove policy by id
  --check <report>  Check a report file against policies
  --format <fmt>    Output format: table (default), json
  --help, -h        Show this help

Example policy JSON:
  {"id":"no-critical","name":"Block Critical","description":"Block critical findings",
   "rules":[{"field":"severity","operator":"eq","value":"critical","action":"block"}],
   "enabled":true}
`);
    return;
  }

  let store: PolicyStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as PolicyStore;
  } else {
    store = { policies: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Add policy
  const addIdx = argv.indexOf("--add");
  if (addIdx >= 0) {
    const policy = JSON.parse(argv[addIdx + 1]) as Policy;
    const existingIdx = store.policies.findIndex((p) => p.id === policy.id);
    if (existingIdx >= 0) {
      store.policies[existingIdx] = policy;
    } else {
      store.policies.push(policy);
    }
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Policy "${policy.id}" saved.`);
    return;
  }

  // Remove policy
  const removeIdx = argv.indexOf("--remove");
  if (removeIdx >= 0) {
    const id = argv[removeIdx + 1];
    store.policies = store.policies.filter((p) => p.id !== id);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Policy "${id}" removed.`);
    return;
  }

  // Check report against policies
  const checkIdx = argv.indexOf("--check");
  if (checkIdx >= 0) {
    const reportPath = argv[checkIdx + 1];
    if (!existsSync(reportPath)) {
      console.error(`Report not found: ${reportPath}`);
      process.exitCode = 1;
      return;
    }
    const report = JSON.parse(readFileSync(reportPath, "utf-8")) as {
      findings?: { severity?: Severity; ruleId?: string; confidence?: number }[];
    };
    const findings = report.findings ?? [];
    const violations: { policyId: string; action: string; finding: string }[] = [];

    for (const policy of store.policies.filter((p) => p.enabled)) {
      for (const f of findings) {
        for (const rule of policy.rules) {
          const fieldVal = f[rule.field as keyof typeof f];
          let match = false;
          if (rule.operator === "eq") match = fieldVal === rule.value;
          else if (rule.operator === "neq") match = fieldVal !== rule.value;
          else if (rule.operator === "gte" && typeof fieldVal === "number") match = fieldVal >= (rule.value as number);
          else if (rule.operator === "lte" && typeof fieldVal === "number") match = fieldVal <= (rule.value as number);

          if (match && rule.action === "block") {
            violations.push({ policyId: policy.id, action: "block", finding: String(f.ruleId ?? "unknown") });
          }
        }
      }
    }

    if (format === "json") {
      console.log(JSON.stringify({ passed: violations.length === 0, violations }, null, 2));
    } else {
      if (violations.length === 0) {
        console.log("All policies passed.");
      } else {
        console.log(`Policy violations (${violations.length}):`);
        for (const v of violations) {
          console.log(`  BLOCK: ${v.policyId} — finding ${v.finding}`);
        }
        process.exitCode = 1;
      }
    }
    return;
  }

  // List policies
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nReview Policies`);
  console.log("═".repeat(60));

  if (store.policies.length === 0) {
    console.log("  No policies defined. Use --add to create one.");
  } else {
    for (const p of store.policies) {
      const status = p.enabled ? "ON" : "OFF";
      console.log(`  [${status}] ${p.id.padEnd(20)} ${p.name}`);
      console.log(`         ${p.description}`);
      console.log(`         Rules: ${p.rules.length}`);
    }
  }

  console.log("═".repeat(60));
}

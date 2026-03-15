/**
 * Finding-auto-suppress — Automatically suppress findings matching criteria.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuppressionRule {
  id: string;
  field: "ruleId" | "severity" | "title";
  pattern: string;
  reason: string;
  createdAt: string;
}

interface SuppressionStore {
  rules: SuppressionRule[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAutoSuppress(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-suppressions.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-auto-suppress — Automatically suppress findings

Usage:
  judges finding-auto-suppress [--store <path>]
    [--add-rule <id> --field <f> --pattern <p> --reason <reason>]
    [--remove-rule <id>] [--apply <report> --out <path>]
    [--format table|json]

Options:
  --store <path>      Suppression store (default: .judges-suppressions.json)
  --add-rule <id>     Add suppression rule
  --field <f>         Match field: ruleId, severity, title
  --pattern <p>       Match pattern (substring)
  --reason <reason>   Suppression reason
  --remove-rule <id>  Remove rule by id
  --apply <report>    Apply suppressions to report, output filtered findings
  --out <path>        Write filtered report to file
  --format <fmt>      Output format: table (default), json
  --help, -h          Show this help
`);
    return;
  }

  let store: SuppressionStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as SuppressionStore;
  } else {
    store = { rules: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Add rule
  const addIdx = argv.indexOf("--add-rule");
  if (addIdx >= 0) {
    const id = argv[addIdx + 1];
    const fieldIdx = argv.indexOf("--field");
    const patternIdx = argv.indexOf("--pattern");
    const reasonIdx = argv.indexOf("--reason");

    const rule: SuppressionRule = {
      id,
      field: (fieldIdx >= 0 ? argv[fieldIdx + 1] : "ruleId") as SuppressionRule["field"],
      pattern: patternIdx >= 0 ? argv[patternIdx + 1] : "",
      reason: reasonIdx >= 0 ? argv[reasonIdx + 1] : "",
      createdAt: new Date().toISOString().split("T")[0],
    };

    const existingIdx = store.rules.findIndex((r) => r.id === id);
    if (existingIdx >= 0) {
      store.rules[existingIdx] = rule;
    } else {
      store.rules.push(rule);
    }

    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Suppression rule "${id}" saved.`);
    return;
  }

  // Remove rule
  const removeIdx = argv.indexOf("--remove-rule");
  if (removeIdx >= 0) {
    const id = argv[removeIdx + 1];
    store.rules = store.rules.filter((r) => r.id !== id);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Rule "${id}" removed.`);
    return;
  }

  // Apply suppressions to report
  const applyIdx = argv.indexOf("--apply");
  if (applyIdx >= 0) {
    const reportPath = argv[applyIdx + 1];
    if (!existsSync(reportPath)) {
      console.error(`Report not found: ${reportPath}`);
      process.exitCode = 1;
      return;
    }

    const report = JSON.parse(readFileSync(reportPath, "utf-8")) as { findings?: Finding[] };
    const findings = report.findings ?? [];
    let suppressed = 0;

    const filtered = findings.filter((f) => {
      for (const rule of store.rules) {
        const fieldValue = String(f[rule.field as keyof Finding] ?? "");
        if (fieldValue.includes(rule.pattern)) {
          suppressed++;
          return false;
        }
      }
      return true;
    });

    const outIdx = argv.indexOf("--out");
    if (outIdx >= 0) {
      const outPath = argv[outIdx + 1];
      writeFileSync(outPath, JSON.stringify({ ...report, findings: filtered }, null, 2));
      console.log(`Filtered report written to: ${outPath}`);
    }

    console.log(`Suppressed: ${suppressed} | Remaining: ${filtered.length} | Total: ${findings.length}`);
    return;
  }

  // List rules
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nSuppression Rules`);
  console.log("═".repeat(65));

  if (store.rules.length === 0) {
    console.log("  No suppression rules. Use --add-rule to create one.");
  } else {
    for (const r of store.rules) {
      console.log(`  ${r.id.padEnd(20)} ${r.field}:${r.pattern}`);
      console.log(`    Reason: ${r.reason} (${r.createdAt})`);
    }
  }

  console.log("═".repeat(65));
}

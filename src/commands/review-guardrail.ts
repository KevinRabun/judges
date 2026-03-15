/**
 * Review-guardrail — Define and enforce review guardrails.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Guardrail {
  id: string;
  type: "max-findings" | "min-score" | "no-critical" | "max-severity-count";
  threshold: number;
  severity?: string;
  enabled: boolean;
}

interface GuardrailConfig {
  version: number;
  guardrails: Guardrail[];
}

interface GuardrailResult {
  guardrailId: string;
  passed: boolean;
  detail: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadGuardrails(configPath: string): GuardrailConfig {
  if (!existsSync(configPath)) {
    return {
      version: 1,
      guardrails: [
        { id: "no-critical", type: "no-critical", threshold: 0, enabled: true },
        { id: "min-score-60", type: "min-score", threshold: 60, enabled: true },
        { id: "max-findings-50", type: "max-findings", threshold: 50, enabled: true },
      ],
    };
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return { version: 1, guardrails: [] };
  }
}

function saveGuardrails(configPath: string, config: GuardrailConfig): void {
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function evaluateGuardrails(verdict: TribunalVerdict, guardrails: Guardrail[]): GuardrailResult[] {
  const results: GuardrailResult[] = [];

  for (const g of guardrails) {
    if (!g.enabled) continue;

    let passed = true;
    let detail = "";

    switch (g.type) {
      case "no-critical":
        passed = verdict.criticalCount === 0;
        detail = passed ? "No critical findings" : `${verdict.criticalCount} critical findings found`;
        break;

      case "min-score":
        passed = verdict.overallScore >= g.threshold;
        detail = `Score: ${verdict.overallScore} (threshold: ${g.threshold})`;
        break;

      case "max-findings":
        passed = verdict.findings.length <= g.threshold;
        detail = `Findings: ${verdict.findings.length} (max: ${g.threshold})`;
        break;

      case "max-severity-count": {
        const sev = (g.severity || "high").toLowerCase();
        const count = verdict.findings.filter((f) => (f.severity || "medium").toLowerCase() === sev).length;
        passed = count <= g.threshold;
        detail = `${sev}: ${count} (max: ${g.threshold})`;
        break;
      }
    }

    results.push({ guardrailId: g.id, passed, detail });
  }

  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewGuardrail(argv: string[]): void {
  const actionIdx = argv.indexOf("--action");
  const fileIdx = argv.indexOf("--file");
  const configIdx = argv.indexOf("--config");
  const formatIdx = argv.indexOf("--format");

  const action = actionIdx >= 0 ? argv[actionIdx + 1] : "check";
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const configPath = configIdx >= 0 ? argv[configIdx + 1] : ".judges-guardrails.json";
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-guardrail — Define and enforce review guardrails

Usage:
  judges review-guardrail --action <action> [options]

Actions:
  check      Check verdict against guardrails (default)
  list       List configured guardrails
  init       Initialize default guardrails config

Options:
  --action <act>     Action: check, list, init
  --file <path>      Verdict JSON file (for check)
  --config <path>    Guardrails config (default: .judges-guardrails.json)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const config = loadGuardrails(configPath);

  if (action === "init") {
    saveGuardrails(configPath, config);
    console.log(`Guardrails config initialized: ${configPath}`);
    return;
  }

  if (action === "list") {
    if (format === "json") {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    console.log(`\nGuardrails (${config.guardrails.length})`);
    console.log("═".repeat(60));
    console.log(`${"ID".padEnd(22)} ${"Type".padEnd(22)} ${"Threshold".padEnd(12)} Enabled`);
    console.log("─".repeat(60));
    for (const g of config.guardrails) {
      console.log(`${g.id.padEnd(22)} ${g.type.padEnd(22)} ${String(g.threshold).padEnd(12)} ${g.enabled}`);
    }
    console.log("═".repeat(60));
    return;
  }

  // check
  if (!filePath) {
    console.error("Error: --file required for check");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const results = evaluateGuardrails(verdict, config.guardrails);
  const allPassed = results.every((r) => r.passed);

  if (format === "json") {
    console.log(JSON.stringify({ allPassed, results }, null, 2));
    if (!allPassed) process.exitCode = 1;
    return;
  }

  console.log(`\nGuardrail Check: ${allPassed ? "PASS" : "FAIL"}`);
  console.log("═".repeat(60));
  console.log(`${"Status".padEnd(8)} ${"Guardrail".padEnd(25)} Detail`);
  console.log("─".repeat(60));

  for (const r of results) {
    const icon = r.passed ? "PASS" : "FAIL";
    console.log(`${icon.padEnd(8)} ${r.guardrailId.padEnd(25)} ${r.detail}`);
  }
  console.log("═".repeat(60));

  if (!allPassed) process.exitCode = 1;
}

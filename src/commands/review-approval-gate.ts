/**
 * Review-approval-gate — Gate reviews with configurable approval criteria.
 *
 * Evaluates whether a review verdict meets predefined quality gates
 * and provides pass/fail determination for CI/CD integration.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApprovalGate {
  name: string;
  maxCritical: number;
  maxHigh: number;
  minScore: number;
  maxTotal: number;
  requiredVerdict: string;
}

interface GateResult {
  gateName: string;
  passed: boolean;
  reasons: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function gateFile(): string {
  return join(process.cwd(), ".judges", "approval-gates.json");
}

function loadGates(): ApprovalGate[] {
  const f = gateFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveGates(gates: ApprovalGate[]): void {
  const f = gateFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(gates, null, 2));
}

function evaluateGate(verdict: TribunalVerdict, gate: ApprovalGate): GateResult {
  const reasons: string[] = [];
  let passed = true;

  if (verdict.criticalCount > gate.maxCritical) {
    passed = false;
    reasons.push(`Critical findings: ${verdict.criticalCount} > max ${gate.maxCritical}`);
  }
  if (verdict.highCount > gate.maxHigh) {
    passed = false;
    reasons.push(`High findings: ${verdict.highCount} > max ${gate.maxHigh}`);
  }
  if (verdict.overallScore < gate.minScore) {
    passed = false;
    reasons.push(`Score: ${verdict.overallScore} < min ${gate.minScore}`);
  }
  if (verdict.findings.length > gate.maxTotal) {
    passed = false;
    reasons.push(`Total findings: ${verdict.findings.length} > max ${gate.maxTotal}`);
  }
  if (gate.requiredVerdict !== "any" && verdict.overallVerdict !== gate.requiredVerdict) {
    passed = false;
    reasons.push(`Verdict: ${verdict.overallVerdict} !== required ${gate.requiredVerdict}`);
  }

  if (passed) reasons.push("All criteria met");

  return { gateName: gate.name, passed, reasons };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewApprovalGate(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-approval-gate — Configurable review approval gates

Usage:
  judges review-approval-gate add     --name <name> [gate options]
  judges review-approval-gate remove  --name <name>
  judges review-approval-gate list
  judges review-approval-gate check   --file <verdict.json> [--format table|json]
  judges review-approval-gate clear

Gate Options:
  --max-critical <n>     Max critical findings allowed (default: 0)
  --max-high <n>         Max high findings allowed (default: 5)
  --min-score <n>        Minimum score required (default: 50)
  --max-total <n>        Max total findings allowed (default: 50)
  --require-verdict <v>  Required verdict: pass, fail, any (default: any)
  --help, -h             Show this help
`);
    return;
  }

  const args = argv.slice(1);

  if (sub === "add") {
    const nameIdx = args.indexOf("--name");
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }

    const maxCritIdx = args.indexOf("--max-critical");
    const maxHighIdx = args.indexOf("--max-high");
    const minScoreIdx = args.indexOf("--min-score");
    const maxTotalIdx = args.indexOf("--max-total");
    const reqIdx = args.indexOf("--require-verdict");

    const gate: ApprovalGate = {
      name,
      maxCritical: maxCritIdx >= 0 ? parseInt(args[maxCritIdx + 1], 10) : 0,
      maxHigh: maxHighIdx >= 0 ? parseInt(args[maxHighIdx + 1], 10) : 5,
      minScore: minScoreIdx >= 0 ? parseInt(args[minScoreIdx + 1], 10) : 50,
      maxTotal: maxTotalIdx >= 0 ? parseInt(args[maxTotalIdx + 1], 10) : 50,
      requiredVerdict: reqIdx >= 0 ? args[reqIdx + 1] : "any",
    };

    const gates = loadGates().filter((g) => g.name !== name);
    gates.push(gate);
    saveGates(gates);
    console.log(`Gate added: ${name}`);
  } else if (sub === "remove") {
    const nameIdx = args.indexOf("--name");
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
    if (!name) {
      console.error("Error: --name required");
      process.exitCode = 1;
      return;
    }
    const gates = loadGates().filter((g) => g.name !== name);
    saveGates(gates);
    console.log(`Gate removed: ${name}`);
  } else if (sub === "list") {
    const gates = loadGates();
    if (gates.length === 0) {
      console.log("No approval gates configured.");
      return;
    }
    console.log(`\nApproval Gates (${gates.length})`);
    console.log("═".repeat(60));
    for (const g of gates) {
      console.log(
        `  ${g.name}: max-crit=${g.maxCritical} max-high=${g.maxHigh} min-score=${g.minScore} max-total=${g.maxTotal} verdict=${g.requiredVerdict}`,
      );
    }
    console.log("═".repeat(60));
  } else if (sub === "check") {
    const fileIdx = args.indexOf("--file");
    const formatIdx = args.indexOf("--format");
    const filePath = fileIdx >= 0 ? args[fileIdx + 1] : undefined;
    const format = formatIdx >= 0 ? args[formatIdx + 1] : "table";

    if (!filePath) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(filePath)) {
      console.error(`Error: not found: ${filePath}`);
      process.exitCode = 1;
      return;
    }

    const gates = loadGates();
    if (gates.length === 0) {
      console.error("Error: no gates configured. Use 'add' first.");
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

    const results = gates.map((g) => evaluateGate(verdict, g));

    if (format === "json") {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    const allPassed = results.every((r) => r.passed);
    console.log(`\nApproval Gate Results: ${allPassed ? "APPROVED" : "BLOCKED"}`);
    console.log("═".repeat(60));

    for (const r of results) {
      const status = r.passed ? "PASS" : "FAIL";
      console.log(`\n  [${status}] ${r.gateName}`);
      for (const reason of r.reasons) console.log(`    ${reason}`);
    }

    console.log("\n" + "═".repeat(60));
    if (!allPassed) process.exitCode = 1;
  } else if (sub === "clear") {
    saveGates([]);
    console.log("Approval gates cleared.");
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}

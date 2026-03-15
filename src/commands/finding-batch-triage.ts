import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-batch-triage ───────────────────────────────────────────
   Batch triage findings by severity tier, auto-assigning actions
   and saving triage decisions to a local ledger for tracking.
   ─────────────────────────────────────────────────────────────────── */

interface TriageDecision {
  ruleId: string;
  title: string;
  severity: string;
  action: string;
  assignedTo: string;
  triagedAt: string;
}

function triageFindings(findings: Finding[]): TriageDecision[] {
  const decisions: TriageDecision[] = [];
  const now = new Date().toISOString().slice(0, 10);

  for (const f of findings) {
    let action: string;
    let assignedTo: string;

    if (f.severity === "critical") {
      action = "Fix immediately";
      assignedTo = "security-lead";
    } else if (f.severity === "high") {
      action = "Fix before release";
      assignedTo = "team-lead";
    } else if (f.severity === "medium") {
      action = "Schedule fix";
      assignedTo = "developer";
    } else if (f.severity === "low") {
      action = "Backlog";
      assignedTo = "developer";
    } else {
      action = "Acknowledge";
      assignedTo = "any";
    }

    decisions.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      action,
      assignedTo,
      triagedAt: now,
    });
  }

  return decisions;
}

export function runFindingBatchTriage(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-batch-triage [options]

Batch triage findings with auto-assigned actions.

Options:
  --report <path>      Path to verdict JSON file
  --save               Save triage decisions to ledger
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";
  const save = argv.includes("--save");

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  if (findings.length === 0) {
    console.log("No findings to triage.");
    return;
  }

  const decisions = triageFindings(findings);

  if (save) {
    const triageDir = join(process.cwd(), ".judges");
    if (!existsSync(triageDir)) {
      mkdirSync(triageDir, { recursive: true });
    }
    const triagePath = join(triageDir, "triage-decisions.json");
    writeFileSync(triagePath, JSON.stringify({ decisions }, null, 2), "utf-8");
    console.log(`Triage decisions saved to: ${triagePath}`);
  }

  if (format === "json") {
    console.log(JSON.stringify({ total: decisions.length, decisions }, null, 2));
    return;
  }

  console.log(`\n=== Batch Triage (${decisions.length} findings) ===\n`);
  for (const d of decisions) {
    console.log(`[${d.severity.toUpperCase()}] ${d.ruleId}: ${d.title}`);
    console.log(`  Action: ${d.action} | Assigned: ${d.assignedTo}`);
    console.log();
  }
}

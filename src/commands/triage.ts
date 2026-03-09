/**
 * `judges triage` — Finding triage workflow.
 *
 * Allows developers and teams to set triage status on tracked findings,
 * recording decisions like accepted-risk, deferred, won't-fix, or
 * false-positive with reason and attribution.
 *
 * Usage:
 *   judges triage set --rule SEC-001 --status accepted-risk --reason "Mitigated by WAF"
 *   judges triage set --rule AUTH-002 --file src/api.ts --status deferred
 *   judges triage list                              # Show all triaged findings
 *   judges triage list --status deferred            # Show only deferred findings
 *   judges triage summary                           # Triage summary
 */

import { triageFinding, getTriagedFindings, formatTriageSummary, loadFindingStore } from "../finding-lifecycle.js";
import type { TriageStatus } from "../finding-lifecycle.js";

// ─── CLI Argument Parsing ───────────────────────────────────────────────────

interface TriageArgs {
  subcommand: string;
  ruleId?: string;
  filePath?: string;
  status?: TriageStatus;
  reason?: string;
  triagedBy?: string;
  format?: "text" | "json";
}

const VALID_TRIAGE_STATUSES = new Set<string>(["accepted-risk", "deferred", "wont-fix", "false-positive"]);

function parseTriageArgs(argv: string[]): TriageArgs {
  const args: TriageArgs = {
    subcommand: argv[3] || "summary",
    format: "text",
  };

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--rule":
      case "-r":
        args.ruleId = argv[++i];
        break;
      case "--file":
      case "-f":
        args.filePath = argv[++i];
        break;
      case "--status":
      case "-s":
        args.status = argv[++i] as TriageStatus;
        break;
      case "--reason":
      case "-m":
        args.reason = argv[++i];
        break;
      case "--by":
        args.triagedBy = argv[++i];
        break;
      case "--format":
      case "-o":
        args.format = argv[++i] as "text" | "json";
        break;
      default:
        break;
    }
  }

  return args;
}

function printTriageHelp(): void {
  console.log(`
Judges Panel — Finding Triage Workflow

USAGE:
  judges triage set --rule <id> --status <status>    Set triage status on a finding
  judges triage list [--status <status>]             List triaged findings
  judges triage summary                              Show triage summary

TRIAGE STATUSES:
  accepted-risk   Acknowledged risk, intentionally retained
  deferred        Will be addressed in a future iteration
  wont-fix        Team decided not to address
  false-positive  Confirmed false positive (feeds calibration)

SET OPTIONS:
  --rule, -r <id>         Rule ID to triage (e.g. SEC-001)
  --file, -f <path>       File path (disambiguates when same rule in multiple files)
  --status, -s <status>   Triage status (see above)
  --reason, -m <text>     Reason for the triage decision
  --by <name>             Who triaged this finding
  --format, -o <fmt>      Output format: text, json

EXAMPLES:
  judges triage set --rule SEC-001 --status accepted-risk --reason "Mitigated by WAF"
  judges triage set --rule AUTH-002 --file src/api.ts --status deferred --by "kevin"
  judges triage list --status false-positive
  judges triage summary
`);
}

// ─── CLI Handler ────────────────────────────────────────────────────────────

export function runTriage(argv: string[]): void {
  const args = parseTriageArgs(argv);

  if (args.subcommand === "--help" || args.subcommand === "-h") {
    printTriageHelp();
    process.exit(0);
  }

  switch (args.subcommand) {
    case "set": {
      if (!args.ruleId) {
        console.error("Error: --rule is required for triage set");
        process.exit(1);
      }
      if (!args.status || !VALID_TRIAGE_STATUSES.has(args.status)) {
        console.error(`Error: --status must be one of: ${[...VALID_TRIAGE_STATUSES].join(", ")}`);
        process.exit(1);
      }

      const result = triageFinding(
        ".",
        { ruleId: args.ruleId.toUpperCase(), filePath: args.filePath },
        args.status,
        args.reason,
        args.triagedBy,
      );

      if (result) {
        const statusLabels: Record<string, string> = {
          "accepted-risk": "accepted risk",
          deferred: "deferred",
          "wont-fix": "won't fix",
          "false-positive": "false positive",
        };
        console.log(`✓ Triaged ${result.ruleId} in ${result.filePath} as ${statusLabels[args.status]}`);
        if (args.reason) {
          console.log(`  Reason: ${args.reason}`);
        }
      } else {
        console.error(
          `Error: No open finding found for rule ${args.ruleId.toUpperCase()}${args.filePath ? ` in ${args.filePath}` : ""}`,
        );
        console.error("  Run 'judges eval' first to populate the findings store.");
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    case "list": {
      const findings = getTriagedFindings(".", args.status);
      if (args.format === "json") {
        console.log(JSON.stringify(findings, null, 2));
      } else {
        if (findings.length === 0) {
          console.log(args.status ? `  No findings with status "${args.status}".` : "  No triaged findings.");
        } else {
          const statusFilter = args.status ? ` (${args.status})` : "";
          console.log(`\n  Triaged Findings${statusFilter}: ${findings.length}\n`);
          for (const f of findings) {
            console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title} → ${f.status}`);
            if (f.triageReason) console.log(`    Reason: ${f.triageReason}`);
            if (f.triagedBy) console.log(`    By: ${f.triagedBy}`);
            console.log(`    File: ${f.filePath}`);
            console.log("");
          }
        }
      }
      process.exit(0);
      break;
    }

    case "summary": {
      const store = loadFindingStore(".");
      if (args.format === "json") {
        const triageStatuses = new Set<string>(["accepted-risk", "deferred", "wont-fix", "false-positive"]);
        const triaged = store.findings.filter((f) => triageStatuses.has(f.status));
        const byStatus: Record<string, number> = {};
        for (const f of triaged) {
          byStatus[f.status] = (byStatus[f.status] || 0) + 1;
        }
        console.log(JSON.stringify({ total: triaged.length, byStatus }, null, 2));
      } else {
        console.log("");
        console.log(formatTriageSummary(store));
      }
      process.exit(0);
      break;
    }

    default:
      console.error(`Unknown triage subcommand: ${args.subcommand}`);
      printTriageHelp();
      process.exit(1);
  }
}

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-resolution-workflow ────────────────────────────────────
   Guide developers through finding resolution workflows based on
   severity and category. Generates step-by-step checklists for
   each finding group. All processing stays local.
   ─────────────────────────────────────────────────────────────────── */

interface WorkflowStep {
  step: number;
  action: string;
  required: boolean;
}

interface ResolutionWorkflow {
  ruleId: string;
  title: string;
  severity: string;
  workflow: string;
  steps: WorkflowStep[];
}

const WORKFLOWS: Record<string, WorkflowStep[]> = {
  critical: [
    { step: 1, action: "Acknowledge finding and assign owner", required: true },
    { step: 2, action: "Create incident ticket", required: true },
    { step: 3, action: "Analyze root cause", required: true },
    { step: 4, action: "Implement fix", required: true },
    { step: 5, action: "Peer review the fix", required: true },
    { step: 6, action: "Run regression tests", required: true },
    { step: 7, action: "Deploy hotfix", required: true },
    { step: 8, action: "Post-mortem review", required: false },
  ],
  high: [
    { step: 1, action: "Assign to sprint backlog", required: true },
    { step: 2, action: "Analyze root cause", required: true },
    { step: 3, action: "Implement fix", required: true },
    { step: 4, action: "Code review", required: true },
    { step: 5, action: "Run tests", required: true },
    { step: 6, action: "Deploy in next release", required: true },
  ],
  medium: [
    { step: 1, action: "Add to backlog", required: true },
    { step: 2, action: "Fix during regular development", required: true },
    { step: 3, action: "Verify fix", required: true },
    { step: 4, action: "Update documentation if needed", required: false },
  ],
  low: [
    { step: 1, action: "Log for future cleanup", required: true },
    { step: 2, action: "Fix during refactoring", required: false },
    { step: 3, action: "Verify after fix", required: false },
  ],
  info: [
    { step: 1, action: "Review and acknowledge", required: true },
    { step: 2, action: "Address if convenient", required: false },
  ],
};

function generateWorkflows(verdict: TribunalVerdict): ResolutionWorkflow[] {
  const results: ResolutionWorkflow[] = [];

  for (const f of verdict.findings ?? []) {
    const steps = WORKFLOWS[f.severity] ?? WORKFLOWS["medium"];
    results.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      workflow: `${f.severity}-resolution`,
      steps,
    });
  }

  const severityOrder: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  results.sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));
  return results;
}

export function runFindingResolutionWorkflow(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-resolution-workflow [options]

Generate resolution workflows for findings.

Options:
  --report <path>      Path to verdict JSON
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

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
  const workflows = generateWorkflows(data);

  if (format === "json") {
    console.log(JSON.stringify(workflows, null, 2));
    return;
  }

  console.log(`\n=== Resolution Workflows (${workflows.length} findings) ===\n`);

  for (const wf of workflows) {
    console.log(`  [${wf.severity.toUpperCase()}] ${wf.ruleId}: ${wf.title}`);
    for (const s of wf.steps) {
      const req = s.required ? "*" : " ";
      console.log(`    ${req} ${s.step}. ${s.action}`);
    }
    console.log();
  }
}

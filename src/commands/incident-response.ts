/**
 * Incident response — generates incident response playbooks
 * from finding spikes, CVEs, or severity escalations.
 *
 * All data from local files.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Incident {
  id: string;
  severity: "critical" | "high" | "medium";
  title: string;
  description: string;
  affectedFiles: string[];
  findings: Array<{ ruleId: string; severity: string; title: string }>;
  playbook: PlaybookStep[];
  status: "open" | "investigating" | "mitigating" | "resolved";
  createdAt: string;
  updatedAt: string;
}

interface PlaybookStep {
  order: number;
  action: string;
  owner: string;
  status: "pending" | "in-progress" | "done";
}

// ─── Playbook Generation ────────────────────────────────────────────────────

function generatePlaybook(
  severity: string,
  findings: Array<{ ruleId: string; severity: string; title: string }>,
): PlaybookStep[] {
  const steps: PlaybookStep[] = [
    {
      order: 1,
      action: "Acknowledge incident and assign incident commander",
      owner: "security-lead",
      status: "pending",
    },
    {
      order: 2,
      action: "Assess blast radius — identify all affected files and services",
      owner: "incident-commander",
      status: "pending",
    },
    {
      order: 3,
      action: "Notify relevant code owners and stakeholders",
      owner: "incident-commander",
      status: "pending",
    },
  ];

  if (severity === "critical") {
    steps.push(
      {
        order: 4,
        action: "Evaluate if production rollback or hotfix is needed",
        owner: "engineering-lead",
        status: "pending",
      },
      { order: 5, action: "Apply emergency patches to critical findings", owner: "assigned-devs", status: "pending" },
      { order: 6, action: "Run security regression tests on patched code", owner: "qa-lead", status: "pending" },
      { order: 7, action: "Deploy hotfix through expedited release process", owner: "devops-lead", status: "pending" },
    );
  } else {
    steps.push(
      {
        order: 4,
        action: "Prioritize findings by severity and blast radius",
        owner: "security-lead",
        status: "pending",
      },
      { order: 5, action: "Create fix PRs for each affected file", owner: "assigned-devs", status: "pending" },
      { order: 6, action: "Review and merge fixes through normal PR process", owner: "code-owners", status: "pending" },
    );
  }

  const hasSqlFindings = findings.some((f) => /sql/i.test(f.ruleId) || /injection/i.test(f.title));
  if (hasSqlFindings) {
    steps.push({
      order: steps.length + 1,
      action: "Audit database access logs for exploitation evidence",
      owner: "dba",
      status: "pending",
    });
  }

  const hasAuthFindings = findings.some((f) => /auth/i.test(f.ruleId) || /auth/i.test(f.title));
  if (hasAuthFindings) {
    steps.push({
      order: steps.length + 1,
      action: "Review authentication logs and rotate affected credentials",
      owner: "security-lead",
      status: "pending",
    });
  }

  steps.push(
    {
      order: steps.length + 1,
      action: "Verify all findings are resolved with re-scan",
      owner: "security-lead",
      status: "pending",
    },
    {
      order: steps.length + 2,
      action: "Document lessons learned and update prevention controls",
      owner: "incident-commander",
      status: "pending",
    },
    {
      order: steps.length + 3,
      action: "Close incident and update status",
      owner: "incident-commander",
      status: "pending",
    },
  );

  return steps;
}

function generateId(): string {
  return `INC-${Date.now().toString(36).toUpperCase()}`;
}

// ─── Load findings ──────────────────────────────────────────────────────────

function loadRecentFindings(): Array<{ ruleId: string; severity: string; title: string; file?: string }> {
  const paths = [".judges-findings.json", "judges-report.json"];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      if (Array.isArray(data)) return data;
      if (data.findings) return data.findings;
    } catch {
      /* skip */
    }
  }
  return [];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-incidents";

export function runIncidentResponse(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges incident-response — Incident response playbook generation

Usage:
  judges incident-response --create --severity critical --title "SQL Injection in auth module"
  judges incident-response --list
  judges incident-response --show <id>
  judges incident-response --update <id> --status investigating
  judges incident-response --generate-from-findings

Options:
  --create              Create new incident
  --severity <level>    Incident severity (critical, high, medium)
  --title <text>        Incident title
  --generate-from-findings  Auto-generate incident from current findings
  --list                List all incidents
  --show <id>           Show incident details
  --update <id>         Update incident
  --status <status>     Set status (open, investigating, mitigating, resolved)
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });

  const incidentsPath = join(STORE, "incidents.json");
  const incidents: Incident[] = existsSync(incidentsPath) ? JSON.parse(readFileSync(incidentsPath, "utf-8")) : [];

  // List
  if (argv.includes("--list")) {
    if (format === "json") {
      console.log(JSON.stringify(incidents, null, 2));
    } else {
      console.log(`\n  Incidents (${incidents.length})\n  ──────────────────────────`);
      if (incidents.length === 0) {
        console.log("    No incidents recorded.\n");
        return;
      }
      for (const inc of incidents) {
        console.log(
          `    [${inc.status.toUpperCase().padEnd(13)}] ${inc.id}  ${inc.severity.toUpperCase().padEnd(8)}  ${inc.title}`,
        );
      }
      console.log("");
    }
    return;
  }

  // Show
  const showId = argv.find((_a: string, i: number) => argv[i - 1] === "--show");
  if (showId) {
    const inc = incidents.find((i) => i.id === showId);
    if (!inc) {
      console.error(`  Incident ${showId} not found.`);
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(inc, null, 2));
    } else {
      console.log(`\n  Incident: ${inc.id}\n  ──────────────────────────`);
      console.log(`    Title:    ${inc.title}`);
      console.log(`    Severity: ${inc.severity}`);
      console.log(`    Status:   ${inc.status}`);
      console.log(`    Created:  ${inc.createdAt}`);
      console.log(`    Files:    ${inc.affectedFiles.length}`);
      console.log(`    Findings: ${inc.findings.length}`);
      console.log(`\n  Playbook:`);
      for (const step of inc.playbook) {
        const icon = step.status === "done" ? "✅" : step.status === "in-progress" ? "🔄" : "⬜";
        console.log(`    ${icon} ${step.order}. ${step.action} (@${step.owner})`);
      }
      console.log("");
    }
    return;
  }

  // Update
  const updateId = argv.find((_a: string, i: number) => argv[i - 1] === "--update");
  if (updateId) {
    const inc = incidents.find((i) => i.id === updateId);
    if (!inc) {
      console.error(`  Incident ${updateId} not found.`);
      return;
    }

    const newStatus = argv.find((_a: string, i: number) => argv[i - 1] === "--status") as
      | Incident["status"]
      | undefined;
    if (newStatus) {
      inc.status = newStatus;
      inc.updatedAt = new Date().toISOString();
      writeFileSync(incidentsPath, JSON.stringify(incidents, null, 2));
      console.log(`  Incident ${updateId} → ${newStatus}`);
    }
    return;
  }

  // Generate from findings
  if (argv.includes("--generate-from-findings")) {
    const findings = loadRecentFindings();
    const criticals = findings.filter((f) => f.severity === "critical");
    const highs = findings.filter((f) => f.severity === "high");

    if (criticals.length === 0 && highs.length === 0) {
      console.log("  No critical or high severity findings to generate incident from.");
      return;
    }

    const severity = criticals.length > 0 ? "critical" : "high";
    const relevantFindings = criticals.length > 0 ? criticals : highs;
    const affectedFiles = [...new Set(relevantFindings.map((f) => f.file || "unknown"))];

    const incident: Incident = {
      id: generateId(),
      severity,
      title: `${severity.toUpperCase()} findings detected (${relevantFindings.length})`,
      description: `Auto-generated incident from ${relevantFindings.length} ${severity} severity findings`,
      affectedFiles,
      findings: relevantFindings.map((f) => ({ ruleId: f.ruleId, severity: f.severity, title: f.title })),
      playbook: generatePlaybook(severity, relevantFindings),
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    incidents.push(incident);
    writeFileSync(incidentsPath, JSON.stringify(incidents, null, 2));
    console.log(`  Created incident ${incident.id} (${severity}) with ${incident.playbook.length}-step playbook`);
    return;
  }

  // Create
  if (argv.includes("--create")) {
    const severity = (argv.find((_a: string, i: number) => argv[i - 1] === "--severity") ||
      "high") as Incident["severity"];
    const title = argv.find((_a: string, i: number) => argv[i - 1] === "--title") || "New security incident";
    const findings = loadRecentFindings();

    const incident: Incident = {
      id: generateId(),
      severity,
      title,
      description: `Manually created incident: ${title}`,
      affectedFiles: [...new Set(findings.map((f) => f.file || "unknown"))],
      findings: findings.map((f) => ({ ruleId: f.ruleId, severity: f.severity, title: f.title })),
      playbook: generatePlaybook(severity, findings),
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    incidents.push(incident);
    writeFileSync(incidentsPath, JSON.stringify(incidents, null, 2));
    console.log(`  Created incident ${incident.id} with ${incident.playbook.length}-step playbook`);
    return;
  }

  console.log("  Use --create, --generate-from-findings, --list, --show, or --update. Run --help for details.");
}

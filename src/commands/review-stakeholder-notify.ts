import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-stakeholder-notify ──────────────────────────────────────
   Format review notifications for different stakeholder roles.
   Generates role-specific summaries: exec, manager, developer, or
   security. All processing runs locally on the user's machine.
   ─────────────────────────────────────────────────────────────────── */

type StakeholderRole = "exec" | "manager" | "developer" | "security";

interface NotificationBlock {
  role: StakeholderRole;
  subject: string;
  body: string;
}

function formatExec(verdict: TribunalVerdict): NotificationBlock {
  const score = verdict.overallScore ?? 0;
  const status = verdict.overallVerdict === "pass" ? "PASSED" : "NEEDS ATTENTION";
  const critical = verdict.criticalCount ?? 0;
  const high = verdict.highCount ?? 0;

  return {
    role: "exec",
    subject: `Code Review ${status} — Score ${score}/100`,
    body: [
      `Review Status: ${status}`,
      `Quality Score: ${score}/100`,
      `Critical Issues: ${critical}`,
      `High Issues: ${high}`,
      `Total Findings: ${(verdict.findings ?? []).length}`,
      critical > 0 ? "\nAction Required: Critical security issues detected." : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function formatManager(verdict: TribunalVerdict): NotificationBlock {
  const findings = verdict.findings ?? [];
  const severityCounts = new Map<string, number>();
  for (const f of findings) {
    severityCounts.set(f.severity, (severityCounts.get(f.severity) ?? 0) + 1);
  }

  const breakdown = [...severityCounts.entries()].map(([sev, count]) => `  ${sev}: ${count}`).join("\n");

  return {
    role: "manager",
    subject: `Review Summary: ${findings.length} findings (${verdict.overallVerdict})`,
    body: [
      `Verdict: ${verdict.overallVerdict}`,
      `Score: ${verdict.overallScore ?? 0}/100`,
      `\nSeverity Breakdown:`,
      breakdown || "  No findings",
      `\nJudges Evaluated: ${(verdict.evaluations ?? []).length}`,
    ].join("\n"),
  };
}

function formatDeveloper(verdict: TribunalVerdict): NotificationBlock {
  const findings = verdict.findings ?? [];
  const topFindings = findings
    .slice(0, 10)
    .map((f) => `  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`)
    .join("\n");

  return {
    role: "developer",
    subject: `${findings.length} findings to address`,
    body: [
      `Total Findings: ${findings.length}`,
      `Score: ${verdict.overallScore ?? 0}/100`,
      `\nTop Findings:`,
      topFindings || "  None",
      findings.length > 10 ? `\n  ... and ${findings.length - 10} more` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function formatSecurity(verdict: TribunalVerdict): NotificationBlock {
  const findings = verdict.findings ?? [];
  const securityFindings = findings.filter(
    (f) =>
      f.severity === "critical" ||
      f.severity === "high" ||
      f.ruleId.toLowerCase().includes("security") ||
      f.ruleId.toLowerCase().includes("vuln"),
  );

  const details = securityFindings
    .map((f) => `  [${f.severity.toUpperCase()}] ${f.ruleId}\n    ${f.title}\n    ${f.recommendation}`)
    .join("\n\n");

  return {
    role: "security",
    subject: `Security Review: ${securityFindings.length} security-relevant findings`,
    body: [
      `Security Findings: ${securityFindings.length}`,
      `Critical: ${verdict.criticalCount ?? 0}`,
      `High: ${verdict.highCount ?? 0}`,
      `\nDetails:`,
      details || "  No security-relevant findings",
    ].join("\n"),
  };
}

export function runReviewStakeholderNotify(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-stakeholder-notify [options]

Format review notifications for different stakeholder roles.

Options:
  --report <path>      Path to verdict JSON
  --role <role>        Stakeholder role: exec, manager, developer, security (default: all)
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

  const roleIdx = argv.indexOf("--role");
  const roleFilter = roleIdx !== -1 && argv[roleIdx + 1] ? argv[roleIdx + 1] : undefined;

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;

  const formatters: Record<StakeholderRole, (v: TribunalVerdict) => NotificationBlock> = {
    exec: formatExec,
    manager: formatManager,
    developer: formatDeveloper,
    security: formatSecurity,
  };

  const roles: StakeholderRole[] = roleFilter
    ? [roleFilter as StakeholderRole]
    : (["exec", "manager", "developer", "security"] as const).slice();

  const notifications: NotificationBlock[] = [];
  for (const role of roles) {
    const fn = formatters[role];
    if (fn) notifications.push(fn(data));
  }

  if (format === "json") {
    console.log(JSON.stringify(notifications, null, 2));
    return;
  }

  for (const n of notifications) {
    console.log(`\n=== Notification for ${n.role.toUpperCase()} ===`);
    console.log(`Subject: ${n.subject}\n`);
    console.log(n.body);
    console.log();
  }
}

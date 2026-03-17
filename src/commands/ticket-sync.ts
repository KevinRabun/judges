/**
 * Ticket sync — create tickets in external issue trackers (Jira, Linear,
 * GitHub Issues) from Judges findings.
 *
 * Uses standard REST APIs. No data is stored by Judges — tickets are
 * created directly in the user's chosen tracker.
 */

import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TicketConfig {
  provider: "github" | "jira" | "linear";
  /** GitHub: owner/repo. Jira: project key. Linear: team key */
  project: string;
  /** API token */
  token: string;
  /** Base URL for Jira (e.g., https://mycompany.atlassian.net) */
  baseUrl?: string;
  /** Label(s) to add to created tickets */
  labels?: string[];
}

export interface TicketResult {
  findingRuleId: string;
  ticketId: string;
  url: string;
  provider: string;
}

// ─── Ticket Creation ────────────────────────────────────────────────────────

async function createGitHubIssue(finding: Finding, config: TicketConfig): Promise<TicketResult> {
  const [owner, repo] = config.project.split("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;

  const body = [
    `## ${finding.title}`,
    "",
    `**Severity:** ${finding.severity}`,
    `**Rule:** ${finding.ruleId}`,
    "",
    finding.description,
    "",
    "### Recommendation",
    finding.recommendation,
    finding.reference ? `\n### Reference\n${finding.reference}` : "",
    "",
    "---",
    "_Created by [Judges](https://github.com/KevinRabun/judges)_",
  ].join("\n");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `[${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.title}`,
      body,
      labels: config.labels || ["judges", "security"],
    }),
  });

  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { number: number; html_url: string };
  return { findingRuleId: finding.ruleId, ticketId: `#${data.number}`, url: data.html_url, provider: "github" };
}

async function createJiraTicket(finding: Finding, config: TicketConfig): Promise<TicketResult> {
  const baseUrl = config.baseUrl || "https://jira.atlassian.net";
  const url = `${baseUrl}/rest/api/3/issue`;

  const severityMap: Record<string, string> = {
    critical: "Highest",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Lowest",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`user:${config.token}`).toString("base64")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: config.project },
        summary: `[${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.title}`,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: finding.description }],
            },
          ],
        },
        issuetype: { name: "Bug" },
        priority: { name: severityMap[finding.severity] || "Medium" },
        labels: config.labels || ["judges", "security"],
      },
    }),
  });

  if (!res.ok) throw new Error(`Jira API error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { key: string };
  return {
    findingRuleId: finding.ruleId,
    ticketId: data.key,
    url: `${baseUrl}/browse/${data.key}`,
    provider: "jira",
  };
}

async function createLinearIssue(finding: Finding, config: TicketConfig): Promise<TicketResult> {
  const priorityMap: Record<string, number> = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4,
    info: 0,
  };

  const query = `mutation {
    issueCreate(input: {
      teamId: "${config.project}"
      title: "[${finding.severity.toUpperCase()}] ${finding.ruleId}: ${finding.title}"
      description: "${finding.description.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"
      priority: ${priorityMap[finding.severity] ?? 3}
    }) {
      success
      issue {
        id
        identifier
        url
      }
    }
  }`;

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: config.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { data: { issueCreate: { issue: { identifier: string; url: string } } } };
  const issue = data.data.issueCreate.issue;
  return { findingRuleId: finding.ruleId, ticketId: issue.identifier, url: issue.url, provider: "linear" };
}

async function createTicket(finding: Finding, config: TicketConfig): Promise<TicketResult> {
  switch (config.provider) {
    case "github":
      return createGitHubIssue(finding, config);
    case "jira":
      return createJiraTicket(finding, config);
    case "linear":
      return createLinearIssue(finding, config);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export async function runTicketSync(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges ticket-sync — Create tickets from findings in Jira, Linear, or GitHub

Usage:
  judges ticket-sync --input results.json --provider github --project owner/repo
  judges ticket-sync --input results.json --provider jira --project PROJ --base-url https://myco.atlassian.net
  judges ticket-sync --input results.json --provider linear --project team-id

Options:
  --input <path>         JSON results file (required)
  --provider <name>      Ticket provider: github, jira, linear (required)
  --project <key>        Project identifier (required)
  --token <token>        API token (default: JUDGES_TICKET_TOKEN or GITHUB_TOKEN env)
  --base-url <url>       Jira base URL
  --severity <level>     Only create tickets for this severity+
  --labels <list>        Comma-separated labels
  --dry-run              Show what would be created without creating
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const { readFileSync, existsSync } = await import("fs");

  const inputPath = argv.find((_a: string, i: number) => argv[i - 1] === "--input");
  const provider = argv.find((_a: string, i: number) => argv[i - 1] === "--provider") as TicketConfig["provider"];
  const project = argv.find((_a: string, i: number) => argv[i - 1] === "--project");
  const token =
    argv.find((_a: string, i: number) => argv[i - 1] === "--token") ||
    process.env.JUDGES_TICKET_TOKEN ||
    process.env.GITHUB_TOKEN ||
    "";
  const baseUrl = argv.find((_a: string, i: number) => argv[i - 1] === "--base-url");
  const labelsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--labels");
  const severityFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");
  const dryRun = argv.includes("--dry-run");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (!inputPath || !provider || !project) {
    console.error("Error: --input, --provider, and --project required");
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!token) {
    console.error("Error: --token or JUDGES_TICKET_TOKEN/GITHUB_TOKEN env required");
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(inputPath, "utf-8"));
  let findings: Finding[] = data.evaluations
    ? data.evaluations.flatMap((e: { findings?: Finding[] }) => e.findings || [])
    : data.findings || data;

  if (severityFilter) {
    const order = ["critical", "high", "medium", "low", "info"];
    const idx = order.indexOf(severityFilter);
    if (idx >= 0) {
      const allowed = new Set(order.slice(0, idx + 1));
      findings = findings.filter((f) => allowed.has(f.severity));
    }
  }

  const config: TicketConfig = {
    provider,
    project,
    token,
    baseUrl,
    labels: labelsStr ? labelsStr.split(",").map((s: string) => s.trim()) : undefined,
  };

  if (dryRun) {
    console.log(`\n  Dry Run — Would create ${findings.length} tickets in ${provider}/${project}\n`);
    for (const f of findings) {
      console.log(`    ${f.severity.padEnd(8)} ${f.ruleId}: ${f.title}`);
    }
    console.log("");
    return;
  }

  const results: TicketResult[] = [];
  for (const f of findings) {
    try {
      const result = await createTicket(f, config);
      results.push(result);
      if (format !== "json") {
        console.log(`  ✅ ${result.ticketId}: ${f.ruleId} — ${result.url}`);
      }
    } catch (e) {
      console.error(`  ❌ Failed for ${f.ruleId}: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (format === "json") {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`\n  Created ${results.length}/${findings.length} tickets\n`);
  }
}

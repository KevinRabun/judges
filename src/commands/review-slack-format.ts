/**
 * Review-slack-format — Format review summaries for Slack-compatible output.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import type { TribunalVerdict } from "../types.js";

// ─── Analysis ───────────────────────────────────────────────────────────────

function toSlackBlocks(verdict: TribunalVerdict): object {
  const emoji =
    verdict.overallVerdict === "pass"
      ? ":white_check_mark:"
      : verdict.overallVerdict === "warning"
        ? ":warning:"
        : ":x:";

  const blocks: object[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${emoji} Code Review: ${verdict.overallVerdict.toUpperCase()}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Score:* ${verdict.overallScore}/100` },
        { type: "mrkdwn", text: `*Findings:* ${verdict.findings.length}` },
        { type: "mrkdwn", text: `*Critical:* ${verdict.criticalCount}` },
        { type: "mrkdwn", text: `*High:* ${verdict.highCount}` },
      ],
    },
  ];

  if (verdict.findings.length > 0) {
    const topFindings = verdict.findings.slice(0, 5);
    const findingText = topFindings
      .map((f) => {
        const sev = (f.severity || "medium").toUpperCase();
        return `• *[${sev}]* ${f.ruleId}: ${f.title}`;
      })
      .join("\n");

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Top Findings:*\n${findingText}` },
    });

    if (verdict.findings.length > 5) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `_+${verdict.findings.length - 5} more findings_` }],
      });
    }
  }

  return { blocks };
}

function toSlackText(verdict: TribunalVerdict): string {
  const lines: string[] = [];
  const emoji = verdict.overallVerdict === "pass" ? "✅" : verdict.overallVerdict === "warning" ? "⚠️" : "❌";

  lines.push(`${emoji} *Code Review: ${verdict.overallVerdict.toUpperCase()}*`);
  lines.push(
    `Score: ${verdict.overallScore}/100 | Findings: ${verdict.findings.length} | Critical: ${verdict.criticalCount} | High: ${verdict.highCount}`,
  );
  lines.push("");

  for (const f of verdict.findings.slice(0, 5)) {
    const sev = (f.severity || "medium").toUpperCase();
    lines.push(`• [${sev}] ${f.ruleId}: ${f.title}`);
  }

  if (verdict.findings.length > 5) {
    lines.push(`_+${verdict.findings.length - 5} more_`);
  }

  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewSlackFormat(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const outputIdx = argv.indexOf("--output");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "blocks";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-slack-format — Format review for Slack

Usage:
  judges review-slack-format --file <verdict.json> [--format blocks|text]
                             [--output <file>]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Format: blocks (default), text
  --output <path>    Write output to file
  --help, -h         Show this help
`);
    return;
  }

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

  let verdict: TribunalVerdict;
  try {
    verdict = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    console.error("Error: invalid JSON");
    process.exitCode = 1;
    return;
  }

  const output = format === "text" ? toSlackText(verdict) : JSON.stringify(toSlackBlocks(verdict), null, 2);

  if (outputPath) {
    writeFileSync(outputPath, output);
    console.log(`Slack format written to ${outputPath}`);
    return;
  }

  console.log(output);
}

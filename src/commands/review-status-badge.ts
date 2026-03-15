/**
 * Review-status-badge — Generate status badges for review results.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import type { TribunalVerdict, Verdict } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BadgeConfig {
  label: string;
  status: string;
  color: string;
  format: "markdown" | "html" | "svg-url";
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function verdictColor(verdict: Verdict): string {
  if (verdict === "pass") return "brightgreen";
  if (verdict === "warning") return "yellow";
  return "red";
}

function generateBadge(verdict: TribunalVerdict): BadgeConfig {
  const v = verdict.overallVerdict;
  const score = verdict.overallScore;
  const label = "Judges Review";
  const status = `${v} (${score}/100)`;
  const color = verdictColor(v);

  return { label, status, color, format: "markdown" };
}

function formatBadge(badge: BadgeConfig, badgeFormat: string): string {
  // Use shields.io URL format (user provides their own badge service)
  const encodedLabel = encodeURIComponent(badge.label);
  const encodedStatus = encodeURIComponent(badge.status);
  const url = `https://img.shields.io/badge/${encodedLabel}-${encodedStatus}-${badge.color}`;

  if (badgeFormat === "html") {
    return `<img src="${url}" alt="${badge.label}: ${badge.status}" />`;
  }
  if (badgeFormat === "svg-url") {
    return url;
  }
  // markdown default
  return `![${badge.label}](${url})`;
}

function generateDetailBadges(verdict: TribunalVerdict): BadgeConfig[] {
  const badges: BadgeConfig[] = [];

  // overall badge
  badges.push(generateBadge(verdict));

  // findings count
  const findingCount = verdict.findings.length;
  badges.push({
    label: "Findings",
    status: String(findingCount),
    color: findingCount === 0 ? "brightgreen" : findingCount <= 5 ? "yellow" : "red",
    format: "markdown",
  });

  // critical count
  if (verdict.criticalCount > 0) {
    badges.push({
      label: "Critical",
      status: String(verdict.criticalCount),
      color: "red",
      format: "markdown",
    });
  }

  // score
  badges.push({
    label: "Score",
    status: `${verdict.overallScore}/100`,
    color: verdict.overallScore >= 80 ? "brightgreen" : verdict.overallScore >= 50 ? "yellow" : "red",
    format: "markdown",
  });

  return badges;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewStatusBadge(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const outputIdx = argv.indexOf("--output");
  const detailIdx = argv.indexOf("--detailed");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const badgeFormat = formatIdx >= 0 ? argv[formatIdx + 1] : "markdown";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const detailed = detailIdx >= 0 || argv.includes("--detailed");

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-status-badge — Generate status badges

Usage:
  judges review-status-badge --file <verdict.json> [--format markdown|html|svg-url]
                             [--output <file>] [--detailed]

Options:
  --file <path>      Path to verdict JSON file (required)
  --format <fmt>     Badge format: markdown (default), html, svg-url
  --output <path>    Write badge markup to file
  --detailed         Generate additional detail badges
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

  const badges = detailed ? generateDetailBadges(verdict) : [generateBadge(verdict)];
  const lines = badges.map((b) => formatBadge(b, badgeFormat));
  const output = lines.join("\n");

  if (outputPath) {
    writeFileSync(outputPath, output + "\n");
    console.log(`Badge markup written to ${outputPath}`);
    return;
  }

  console.log(output);
}

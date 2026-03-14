/**
 * Review-badge — Generate status badges for project READMEs.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { TribunalVerdict } from "../types.js";

// ─── Badge Generation ───────────────────────────────────────────────────────

function scoreToGrade(score: number): string {
  if (score >= 9) return "A+";
  if (score >= 8) return "A";
  if (score >= 7) return "B";
  if (score >= 6) return "C";
  if (score >= 5) return "D";
  return "F";
}

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "brightgreen";
  if (grade === "B") return "green";
  if (grade === "C") return "yellow";
  if (grade === "D") return "orange";
  return "red";
}

function generateMarkdownBadge(label: string, value: string, color: string): string {
  const encodedLabel = encodeURIComponent(label);
  const encodedValue = encodeURIComponent(value);
  return `![${label}](https://img.shields.io/badge/${encodedLabel}-${encodedValue}-${color})`;
}

function generateSvgBadge(label: string, value: string, color: string): string {
  const hexColors: Record<string, string> = {
    brightgreen: "#4c1",
    green: "#97CA00",
    yellow: "#dfb317",
    orange: "#fe7d37",
    red: "#e05d44",
    blue: "#007ec6",
    lightgrey: "#9f9f9f",
  };
  const hex = hexColors[color] || hexColors.lightgrey;
  const labelWidth = label.length * 7 + 10;
  const valueWidth = value.length * 7 + 10;
  const totalWidth = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20">
  <rect width="${labelWidth}" height="20" fill="#555"/>
  <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${hex}"/>
  <text x="${labelWidth / 2}" y="14" fill="#fff" text-anchor="middle" font-family="sans-serif" font-size="11">${label}</text>
  <text x="${labelWidth + valueWidth / 2}" y="14" fill="#fff" text-anchor="middle" font-family="sans-serif" font-size="11">${value}</text>
</svg>`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewBadge(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-badge — Generate status badges for project READMEs

Usage:
  judges review-badge --file verdict.json          Generate badge from verdict
  judges review-badge --score 8.5                  Generate badge from score
  judges review-badge --file v.json --output badge.svg   Save SVG badge
  judges review-badge --file v.json --markdown     Output markdown badge syntax

Options:
  --file <path>         Verdict JSON file
  --score <n>           Direct score (0-10)
  --output <path>       Save badge to file (SVG format)
  --markdown            Output markdown badge syntax
  --label <text>        Custom badge label (default: "Judges Score")
  --format json         JSON output
  --help, -h            Show this help

Generate badges showing review score/grade for project visibility.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const label = argv.find((_a: string, i: number) => argv[i - 1] === "--label") || "Judges Score";
  const output = argv.find((_a: string, i: number) => argv[i - 1] === "--output");

  const scoreArg = argv.find((_a: string, i: number) => argv[i - 1] === "--score");
  let score: number;
  let criticals = 0;
  let findings = 0;

  if (scoreArg) {
    score = parseFloat(scoreArg);
  } else {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!file || !existsSync(file)) {
      console.error("Error: --file or --score is required.");
      process.exitCode = 1;
      return;
    }
    try {
      const verdict = JSON.parse(readFileSync(file, "utf-8")) as TribunalVerdict;
      score = verdict.overallScore || 0;
      criticals = verdict.criticalCount || 0;
      findings = (verdict.findings || []).length;
    } catch {
      console.error("Error: Failed to parse verdict file.");
      process.exitCode = 1;
      return;
    }
  }

  const grade = scoreToGrade(score);
  const color = gradeColor(grade);
  const value = `${grade} (${score.toFixed(1)})`;

  if (output) {
    const svg = generateSvgBadge(label, value, color);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, svg, "utf-8");
    console.log(`Badge saved to ${output}`);
    return;
  }

  if (argv.includes("--markdown")) {
    const md = generateMarkdownBadge(label, value, color);
    console.log(md);
    if (criticals > 0) {
      console.log(generateMarkdownBadge("Critical Findings", String(criticals), "red"));
    }
    if (findings > 0) {
      console.log(generateMarkdownBadge("Total Findings", String(findings), findings > 10 ? "orange" : "blue"));
    }
    return;
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          label,
          value,
          grade,
          score,
          color,
          markdown: generateMarkdownBadge(label, value, color),
          criticals,
          findings,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`\nBadge: ${label} — ${value}`);
  console.log(`Grade: ${grade}  Color: ${color}`);
  console.log(`\nMarkdown:`);
  console.log(`  ${generateMarkdownBadge(label, value, color)}`);
  if (criticals > 0) console.log(`  ${generateMarkdownBadge("Critical Findings", String(criticals), "red")}`);
  console.log();
}

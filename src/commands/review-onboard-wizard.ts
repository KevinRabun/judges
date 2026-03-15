/**
 * Review-onboard-wizard — Interactive onboarding wizard for new users.
 */

import { writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OnboardProfile {
  version: number;
  team: string;
  language: string;
  focus: string[];
  preset: string;
  suggestedJudges: string[];
  configPath: string;
}

// ─── Wizard Logic ───────────────────────────────────────────────────────────

function generateProfile(team: string, language: string, focus: string[]): OnboardProfile {
  const judges = defaultRegistry.getJudges();

  // suggest judges based on focus areas
  const suggested = judges.filter((j) => {
    const jName = `${j.id} ${j.domain}`.toLowerCase();
    return focus.some((f) => jName.includes(f.toLowerCase()));
  });

  // pick preset based on focus
  let preset = "default";
  if (focus.includes("security")) preset = "security-focused";
  else if (focus.includes("performance")) preset = "performance";
  else if (focus.includes("quality")) preset = "strict";

  return {
    version: 1,
    team,
    language,
    focus,
    preset,
    suggestedJudges: suggested.map((j) => j.id).slice(0, 10),
    configPath: ".judgesrc.json",
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewOnboardWizard(argv: string[]): void {
  const teamIdx = argv.indexOf("--team");
  const langIdx = argv.indexOf("--language");
  const focusIdx = argv.indexOf("--focus");
  const outputIdx = argv.indexOf("--output");
  const formatIdx = argv.indexOf("--format");

  const team = teamIdx >= 0 ? argv[teamIdx + 1] : "default";
  const language = langIdx >= 0 ? argv[langIdx + 1] : "typescript";
  const focusArg = focusIdx >= 0 ? argv[focusIdx + 1] : "security,quality";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-onboard-wizard — Onboarding wizard

Usage:
  judges review-onboard-wizard [--team <name>] [--language <lang>]
                               [--focus <areas>] [--output <file>]
                               [--format table|json]

Options:
  --team <name>      Team name (default: default)
  --language <lang>  Primary language (default: typescript)
  --focus <areas>    Comma-separated focus areas (e.g., security,quality)
  --output <path>    Write config to file
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const focus = focusArg.split(",").map((f) => f.trim());
  const profile = generateProfile(team, language, focus);

  if (outputPath) {
    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, JSON.stringify(profile, null, 2));
    console.log(`Onboard profile written to ${outputPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  console.log(`\nOnboarding Wizard`);
  console.log("═".repeat(55));
  console.log(`  Team:      ${profile.team}`);
  console.log(`  Language:  ${profile.language}`);
  console.log(`  Focus:     ${profile.focus.join(", ")}`);
  console.log(`  Preset:    ${profile.preset}`);
  console.log(`  Config:    ${profile.configPath}`);
  console.log(`\n  Suggested Judges (${profile.suggestedJudges.length}):`);
  for (const j of profile.suggestedJudges) {
    console.log(`    - ${j}`);
  }
  console.log("═".repeat(55));
  console.log("\nTo get started, run: judges eval --file <your-file>");
}

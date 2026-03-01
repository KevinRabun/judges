// ─── Rule Documentation Generator ────────────────────────────────────────────
// Generate per-judge/per-rule documentation in Markdown format.
//
// Usage:
//   judges docs                          # output all judge docs to stdout
//   judges docs --output docs/rules/     # write individual files
//   judges docs --judge cybersecurity    # single judge
// ──────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { JUDGES, getJudge } from "../judges/index.js";
import type { JudgeDefinition } from "../types.js";

// ─── Extract Rules from System Prompt ───────────────────────────────────────

interface RuleDocEntry {
  ruleId: string;
  title: string;
  description: string;
}

function extractRulesFromPrompt(judge: JudgeDefinition): RuleDocEntry[] {
  const rules: RuleDocEntry[] = [];
  const prompt = judge.systemPrompt;

  // Typically rules are documented in the system prompt with patterns like:
  // SEC-001: Title — Description
  // or SEC-001 | Title | Description
  const rulePattern = new RegExp(`(${judge.rulePrefix}-\\d{3})[:\\s|]+([^\\n|]+?)(?:\\s*[—|]\\s*([^\\n]+))?$`, "gm");

  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(prompt)) !== null) {
    rules.push({
      ruleId: match[1],
      title: match[2].trim(),
      description: match[3]?.trim() || match[2].trim(),
    });
  }

  return rules;
}

// ─── Generate Documentation ─────────────────────────────────────────────────

function generateJudgeDoc(judge: JudgeDefinition): string {
  const rules = extractRulesFromPrompt(judge);
  const lines: string[] = [];

  lines.push(`# ${judge.name}`);
  lines.push("");
  lines.push(`**Domain:** ${judge.domain}`);
  lines.push(`**Rule Prefix:** \`${judge.rulePrefix}\``);
  lines.push(`**Judge ID:** \`${judge.id}\``);
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push(judge.description);
  lines.push("");

  if (rules.length > 0) {
    lines.push("## Rules");
    lines.push("");
    lines.push("| Rule ID | Title | Description |");
    lines.push("|---------|-------|-------------|");
    for (const rule of rules) {
      lines.push(`| \`${rule.ruleId}\` | ${rule.title} | ${rule.description} |`);
    }
    lines.push("");
  }

  lines.push("## Usage");
  lines.push("");
  lines.push("```bash");
  lines.push(`# Evaluate with this judge only`);
  lines.push(`judges eval --judge ${judge.id} --file <path>`);
  lines.push("");
  lines.push("# As part of the full tribunal");
  lines.push("judges eval --file <path>");
  lines.push("```");
  lines.push("");

  return lines.join("\n");
}

function generateIndexDoc(): string {
  const lines: string[] = [];
  lines.push("# Judges Panel — Rule Reference");
  lines.push("");
  lines.push(`The Judges Panel includes **${JUDGES.length}** specialized judges that evaluate AI-generated code.`);
  lines.push("");
  lines.push("## Judges");
  lines.push("");
  lines.push("| Judge | Domain | Rule Prefix | Description |");
  lines.push("|-------|--------|-------------|-------------|");
  for (const judge of JUDGES) {
    lines.push(
      `| [${judge.name}](${judge.id}.md) | ${judge.domain} | \`${judge.rulePrefix}\` | ${judge.description} |`,
    );
  }
  lines.push("");
  lines.push("## Quick Start");
  lines.push("");
  lines.push("```bash");
  lines.push("# Evaluate a file with all judges");
  lines.push("judges eval --file src/app.ts");
  lines.push("");
  lines.push("# Evaluate with a specific judge");
  lines.push("judges eval --judge cybersecurity --file src/app.ts");
  lines.push("");
  lines.push("# List all available judges");
  lines.push("judges list");
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function runDocs(argv: string[]): void {
  let output: string | undefined;
  let judgeId: string | undefined;

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--output":
      case "-o":
        output = argv[++i];
        break;
      case "--judge":
      case "-j":
        judgeId = argv[++i];
        break;
      case "--help":
      case "-h":
        console.log(`
Judges Panel — Rule Documentation Generator

USAGE:
  judges docs                          Print all docs to stdout
  judges docs --output docs/rules/     Write per-judge .md files
  judges docs --judge cybersecurity    Show single judge documentation

OPTIONS:
  --output, -o <dir>   Output directory for .md files
  --judge, -j <id>     Generate docs for a single judge
`);
        process.exit(0);
    }
  }

  if (judgeId) {
    const judge = getJudge(judgeId);
    if (!judge) {
      console.error(`Unknown judge: ${judgeId}`);
      console.error('Run "judges list" to see available judges.');
      process.exit(1);
    }
    console.log(generateJudgeDoc(judge));
    process.exit(0);
  }

  if (output) {
    const dir = resolve(output);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Write index
    writeFileSync(join(dir, "README.md"), generateIndexDoc(), "utf-8");

    // Write per-judge docs
    for (const judge of JUDGES) {
      writeFileSync(join(dir, `${judge.id}.md`), generateJudgeDoc(judge), "utf-8");
    }

    console.log(`✅ Generated documentation for ${JUDGES.length} judges in ${dir}`);
  } else {
    // Print everything to stdout
    console.log(generateIndexDoc());
    for (const judge of JUDGES) {
      console.log(generateJudgeDoc(judge));
    }
  }

  process.exit(0);
}

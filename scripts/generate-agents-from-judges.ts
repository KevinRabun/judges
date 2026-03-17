#!/usr/bin/env tsx
/**
 * Generate `.judge.md` files for all existing judges registered in the default registry.
 * (Legacy `.agent.md` is still supported for reading.)
 *
 * Usage:
 *   npx tsx scripts/generate-agents-from-judges.ts [--force]
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { defaultRegistry } from "../src/judge-registry.js";
import { loadJudges } from "../src/judges/index.js";
import type { JudgeDefinition } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FORCE = process.argv.includes("--force") || process.argv.includes("-f");
const AGENTS_DIR = join(__dirname, "..", "agents");

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// naive heuristic to map judge id -> evaluator file path
const evaluatorPathFor = (judge: JudgeDefinition): string | undefined => {
  // some judge IDs use dashes; evaluator files are the same id with .ts
  // special cases can be added here if any diverge
  const candidate = join(__dirname, "..", "src", "evaluators", `${judge.id}.ts`);
  if (existsSync(candidate)) return relative(AGENTS_DIR, candidate).replace(/\\/g, "/");

  // fallback: try rulePrefix lowercased? or analyze fn name
  const analyzeFnName = judge.analyze?.name;
  if (analyzeFnName?.startsWith("analyze")) {
    const inferred = analyzeFnName
      .replace(/^analyze/, "")
      .replace(/([a-z])([A-Z])/g, "$1-$2")
      .toLowerCase();
    const fallback = join(__dirname, "..", "src", "evaluators", `${inferred}.ts`);
    if (existsSync(fallback)) return relative(AGENTS_DIR, fallback).replace(/\\/g, "/");
  }

  return undefined;
};

function toYamlFrontmatter(judge: JudgeDefinition): string {
  const lines: string[] = ["---"];
  const fields: Record<string, string | number | undefined> = {
    id: judge.id,
    name: judge.name,
    domain: judge.domain,
    rulePrefix: judge.rulePrefix,
    description: judge.description,
    tableDescription: judge.tableDescription,
    promptDescription: judge.promptDescription,
    script: evaluatorPathFor(judge),
    priority: judge.id === "false-positive-review" ? 999 : judge.id === "tribunal" ? 1000 : 10,
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    // quote values that contain ':' or '#'
    const needsQuotes = typeof value === "string" && /[:#]/.test(value);
    lines.push(`${key}: ${needsQuotes ? JSON.stringify(value) : value}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

function normalizePrompt(prompt: string): string {
  // Existing prompts are plain strings; some use backticks. Preserve formatting.
  // Trim leading/trailing whitespace but retain internal newlines.
  return prompt.replace(/^\s+|\s+$/g, "");
}

async function main() {
  await loadJudges(); // ensure all TS judges registered
  const judges = defaultRegistry.getJudges();
  ensureDir(AGENTS_DIR);

  const results: { id: string; path: string; skipped: boolean; reason?: string }[] = [];

  for (const judge of judges) {
    const targetPath = join(AGENTS_DIR, `${judge.id}.judge.md`);

    if (!FORCE && existsSync(targetPath)) {
      results.push({ id: judge.id, path: targetPath, skipped: true, reason: "exists" });
      continue;
    }

    const fm = toYamlFrontmatter(judge);
    const body = normalizePrompt(judge.systemPrompt ?? "");
    const content = `${fm}${body}\n`;

    ensureDir(dirname(targetPath));
    writeFileSync(targetPath, content, "utf-8");
    results.push({ id: judge.id, path: targetPath, skipped: false });
  }

  console.log("Generated agent files:");
  for (const r of results) {
    console.log(`- ${r.id}: ${r.path}${r.skipped ? ` (skipped: ${r.reason})` : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

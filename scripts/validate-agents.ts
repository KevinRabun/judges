#!/usr/bin/env tsx
/**
 * Validate that generated `.judge.md` files round-trip with the current registry.
 * (Legacy `.agent.md` is still accepted for backward compatibility.)
 * Fails with exit code 1 if mismatches are found.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseAgentFile, agentToJudgeDefinition } from "../src/agent-loader.js";
import { loadJudges } from "../src/judges/index.js";
import { existsSync, readdirSync } from "node:fs";

function stripWhitespace(s?: string) {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

/**
 * List agent files in a directory. Prefers `.judge.md`, but accepts legacy
 * `.agent.md` for backward compatibility.
 */
export function listAgentFiles(agentsDir: string): string[] {
  if (!existsSync(agentsDir)) {
    throw new Error(`agents directory not found: ${agentsDir}`);
  }
  const files = readdirSync(agentsDir).filter((f) => f.endsWith(".judge.md") || f.endsWith(".agent.md"));
  if (files.length === 0) {
    throw new Error(`No agent files found in ${agentsDir}. Expected .judge.md files (legacy .agent.md tolerated).`);
  }

  // Sort with .judge.md first (canonical)
  files.sort((a, b) => {
    const aLegacy = a.endsWith(".agent.md");
    const bLegacy = b.endsWith(".agent.md");
    if (aLegacy === bLegacy) return a.localeCompare(b);
    return aLegacy ? 1 : -1; // prefer .judge.md
  });

  return files;
}

/**
 * Validate agent files against the current registry. Useful in CI.
 * @param agentsDir Directory containing `.judge.md` agent files
 */
export async function validateAgents(
  agentsDir: string = join(process.cwd(), "agents"),
): Promise<{ filesChecked: number }> {
  const judges = await loadJudges();
  const map = new Map(judges.map((j) => [j.id, j]));
  const missing: string[] = [];
  const mismatches: string[] = [];

  const files = listAgentFiles(agentsDir);

  for (const file of files) {
    const agent = parseAgentFile(join(agentsDir, file));
    const judge = map.get(agent.frontmatter.id);
    if (!judge) {
      missing.push(agent.frontmatter.id);
      continue;
    }
    const converted = agentToJudgeDefinition(agent);
    const fields: (keyof typeof judge)[] = [
      "id",
      "name",
      "domain",
      "rulePrefix",
      "description",
      "tableDescription",
      "promptDescription",
    ];
    const convertedRecord = converted as unknown as Record<string, unknown>;
    const judgeRecord = judge as unknown as Record<string, unknown>;
    for (const field of fields) {
      if (convertedRecord[field as string] !== judgeRecord[field as string]) {
        mismatches.push(`${agent.frontmatter.id}: field ${String(field)} mismatch`);
      }
    }
    if (stripWhitespace(converted.systemPrompt) !== stripWhitespace(judge.systemPrompt)) {
      mismatches.push(`${agent.frontmatter.id}: systemPrompt mismatch`);
    }
  }

  if (missing.length || mismatches.length) {
    const errors: string[] = [];
    if (missing.length) errors.push(`Missing judges in agent files: ${missing.join(", ")}`);
    if (mismatches.length) errors.push(`Mismatches: \n- ${mismatches.join("\n- ")}`);
    throw new Error(errors.join("\n"));
  }

  return { filesChecked: files.length };
}

async function main() {
  const { filesChecked } = await validateAgents();
  console.log(`Agent files validated against registry (${filesChecked} agents).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

#!/usr/bin/env tsx
/**
 * CI guard to ensure agent files and skills docs are in sync.
 * - Regenerates agents (force)
 * - Validates agents
 * - Regenerates skills docs
 * - Ensures no diffs in agents/, skills/, docs/skills.md
 */
import { execSync } from "node:child_process";

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit" });
}

function failIf(condition: boolean, message: string) {
  if (condition) {
    console.error(message);
    process.exit(1);
  }
}

function main() {
  run("npm run generate:agents:force");
  run("npm run validate:agents");
  run("npm run docs:skills");

  // Enforce canonical naming: no new .agent.md files should exist in tree
  try {
    const legacyAgents = execSync("git ls-files -- '*.agent.md'", { encoding: "utf-8" }).split(/\r?\n/).filter(Boolean);
    failIf(
      legacyAgents.length > 0,
      `Found legacy .agent.md files in repo:\n- ${legacyAgents.join("\n- ")}\nUse .judge.md instead.`,
    );
  } catch (err) {
    // git not available? Fail loudly to avoid silent drift
    console.error("Failed to scan for legacy .agent.md files", err);
    process.exit(1);
  }

  // Ensure clean tree for the touched directories
  const diffCmd = process.platform === "win32" ? "git diff --quiet --" : "git diff --quiet --";
  try {
    execSync(`${diffCmd} agents skills docs/skills.md`, { stdio: "inherit" });
  } catch (err) {
    console.error(
      "Agent/skill docs out of sync. Run 'npm run generate:agents:force && npm run docs:skills' and commit the results.",
    );
    process.exit(1);
  }
}

main();

#!/usr/bin/env tsx
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { listSkills } from "../src/skill-loader.js";

async function main() {
  const skillsDir = join(process.cwd(), "skills");
  const skills = listSkills(skillsDir);
  const lines: string[] = [];
  lines.push(`# Skills Catalog`);
  lines.push("");
  lines.push("| ID | Name | Description | Tags | Agents |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const s of skills) {
    lines.push(`| ${s.id} | ${s.name} | ${s.description} | ${(s.tags || []).join(", ")} | ${s.agents.join(", ")} |`);
  }
  lines.push("");
  const outPath = join(process.cwd(), "docs", "skills.md");
  writeFileSync(outPath, lines.join("\n"), "utf-8");
  console.log(`Wrote skills catalog to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

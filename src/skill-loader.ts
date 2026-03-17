/**
 * Skill Loader — reads `.skill.md` files and converts them into skill
 * definitions that orchestrate sets of judges/agents. A skill represents a
 * reusable review workflow (e.g., AI code review, security gate, release gate).
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { JudgeDefinition, TribunalVerdict } from "./types.js";
import { evaluateWithTribunal } from "./evaluators/index.js";
import { defaultRegistry } from "./judge-registry.js";
import { loadAgentJudges } from "./judges/index.js";

export interface SkillFrontmatter {
  id: string;
  name: string;
  description: string;
  agents: string[];
  tags?: string[];
  priority?: number;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string; // orchestrator instructions
  sourcePath: string;
}

type SkillMeta = Record<string, unknown>;

export function parseSkillFrontmatter(raw: string): { meta: SkillMeta; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw };
  }
  const yamlBlock = match[1];
  const body = match[2].trim();
  const meta: SkillMeta = {};
  const lines = yamlBlock.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
    if (!kv) {
      i++;
      continue;
    }
    const key = kv[1];
    let value: unknown = kv[2].trim();

    // Multi-line array (YAML list)
    if (!value || value === "|") {
      // Peek ahead for indented or dash-prefixed lines
      const items: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (!next.trim()) {
          i++;
          continue;
        }
        if (/^\s*-\s+/.test(next)) {
          items.push(next.replace(/^\s*-\s+/, "").trim());
          i++;
          continue;
        }
        if (/^\s{2,}\S/.test(next)) {
          items.push(next.trim());
          i++;
          continue;
        }
        break; // end of list
      }
      if (items.length > 0) {
        meta[key] = items;
        continue;
      }
      // fall through if no items captured
    }

    if (typeof value === "string" && ((value.startsWith("[") && value.endsWith("]")) || value.includes(","))) {
      // simple array parsing: split on comma
      const normalized = (value as string)
        .replace(/^\s*\[/, "")
        .replace(/\]\s*$/, "")
        .split(/\s*,\s*/)
        .filter(Boolean);
      value = normalized;
    } else if (
      typeof value === "string" &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = (value as string).slice(1, -1);
    }
    meta[key] = value;
    i++;
  }
  return { meta, body };
}

const REQUIRED_FIELDS: (keyof SkillFrontmatter)[] = ["id", "name", "description", "agents"];

export function validateSkillFrontmatter(meta: SkillMeta, sourcePath: string): SkillFrontmatter {
  for (const field of REQUIRED_FIELDS) {
    if (!meta[field] || (Array.isArray(meta[field]) && meta[field].length === 0)) {
      throw new Error(`Skill file ${sourcePath} is missing required field: "${field}"`);
    }
  }
  return {
    id: String(meta.id),
    name: String(meta.name),
    description: String(meta.description),
    agents: Array.isArray(meta.agents)
      ? (meta.agents as string[])
      : String(meta.agents ?? "")
          .split(/\s*,\s*/)
          .filter(Boolean),
    tags: Array.isArray(meta.tags)
      ? (meta.tags as string[])
      : meta.tags
        ? String(meta.tags)
            .split(/\s*,\s*/)
            .filter(Boolean)
        : undefined,
    priority: meta.priority ? Number(meta.priority) : 10,
  };
}

export function parseSkillFile(filePath: string): ParsedSkill {
  const absPath = resolve(filePath);
  const raw = readFileSync(absPath, "utf-8");
  const { meta, body } = parseSkillFrontmatter(raw);
  const frontmatter = validateSkillFrontmatter(meta, absPath);
  return { frontmatter, body, sourcePath: absPath };
}

export function loadSkillDirectory(dirPath: string): ParsedSkill[] {
  const absDir = resolve(dirPath);
  if (!existsSync(absDir)) return [];
  return readdirSync(absDir)
    .filter((f) => f.endsWith(".skill.md"))
    .map((f) => parseSkillFile(join(absDir, f)))
    .sort((a, b) => (a.frontmatter.priority ?? 10) - (b.frontmatter.priority ?? 10));
}

/** List skills with metadata for display (id, name, description). */
export function listSkills(
  dirPath: string,
): Array<Pick<SkillFrontmatter, "id" | "name" | "description" | "tags" | "agents">> {
  return loadSkillDirectory(dirPath).map((s) => ({
    id: s.frontmatter.id,
    name: s.frontmatter.name,
    description: s.frontmatter.description,
    tags: s.frontmatter.tags,
    agents: s.frontmatter.agents,
  }));
}

/**
 * Run a skill by ID. Loads any missing agent judges, then evaluates code using
 * only the judges referenced by the skill. Returns a tribunal verdict.
 */
export async function runSkill(
  skillId: string,
  code: string,
  language: string,
  opts?: { skillsDir?: string; context?: unknown },
): Promise<TribunalVerdict> {
  const skillsDir = opts?.skillsDir ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills");
  const skills = loadSkillDirectory(skillsDir);
  const skill = skills.find((s) => s.frontmatter.id === skillId);
  if (!skill) throw new Error(`Skill not found: ${skillId}`);

  // Load agent judges referenced by the skill
  loadAgentJudges();

  const judges: JudgeDefinition[] = [];
  for (const id of skill.frontmatter.agents) {
    const judge = defaultRegistry.getJudge(id);
    if (!judge) {
      throw new Error(`Judge referenced by skill not found in registry: ${id}`);
    }
    judges.push(judge);
  }

  const allJudgeIds = defaultRegistry.getJudges().map((j) => j.id);
  const enabled = new Set(skill.frontmatter.agents);
  const disabled = allJudgeIds.filter((id) => !enabled.has(id));

  return evaluateWithTribunal(code, language, `skill:${skill.frontmatter.id}`, {
    config: {
      disabledJudges: disabled,
    },
  });
}

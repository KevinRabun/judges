/**
 * Agent Markdown Loader — reads `.judge.md` files (legacy `.agent.md` also
 * accepted) and converts them into JudgeDefinition objects that register with
 * the unified JudgeRegistry.
 *
 * This is the bridge between the file-based agent paradigm and the existing
 * TypeScript judge system. Agent files use YAML frontmatter for metadata
 * and markdown body for the system prompt (persona + evaluation criteria).
 *
 * ## File Format
 *
 * ```markdown
 * ---
 * id: cybersecurity
 * name: Judge Cybersecurity
 * domain: Cybersecurity & Threat Defense
 * rulePrefix: CYBER
 * description: Evaluates code for vulnerability...
 * tableDescription: "Injection attacks, XSS, CSRF, auth flaws"
 * promptDescription: Deep cybersecurity review
 * script: ../src/evaluators/cybersecurity.ts   # optional
 * priority: 10                                  # optional, default 10
 * ---
 *
 * You are Judge Cybersecurity — a principal application security engineer...
 *
 * ## Evaluation Criteria
 * ...
 * ```
 *
 * - `script` is a relative path to the evaluator module (must export a
 *   function matching `(code: string, language: string, context?) => Finding[]`).
 *   If omitted, the judge is LLM-only (no deterministic layer).
 * - `priority` controls ordering. Higher = later. 999 is reserved for
 *   false-positive-review (always last). Default is 10.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import type { JudgeDefinition, Finding, AnalyzeContext } from "./types.js";

// ─── Frontmatter Types ──────────────────────────────────────────────────────

/** Parsed YAML frontmatter from a `.judge.md` file (legacy `.agent.md`). */
export interface AgentFrontmatter {
  id: string;
  name: string;
  domain: string;
  rulePrefix: string;
  description: string;
  tableDescription: string;
  promptDescription: string;
  script?: string;
  priority?: number;
}

/** A parsed agent file — metadata + the markdown body (system prompt). */
export interface ParsedAgent {
  frontmatter: AgentFrontmatter;
  /** The markdown body below the frontmatter — becomes the systemPrompt. */
  body: string;
  /** Absolute path of the source `.judge.md` file (legacy `.agent.md`). */
  sourcePath: string;
}

// ─── Frontmatter Parser ─────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a string. Handles the subset of YAML used
 * by agent files: simple key-value pairs, quoted strings, and multi-line
 * `>` folded scalars. No arrays, nested objects, or anchors.
 */
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: raw };
  }

  const yamlBlock = match[1];
  const body = match[2].trim();
  const meta: Record<string, string> = {};

  const lines = yamlBlock.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    let value = kvMatch[2].trim();

    // Handle folded scalar (>)
    if (value === ">") {
      const parts: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith("  ") || lines[i].trim() === "")) {
        if (lines[i].trim() === "") {
          parts.push("");
        } else {
          parts.push(lines[i].trimStart());
        }
        i++;
      }
      // Folded scalar: join non-empty lines with spaces, blank lines become newlines
      value = parts
        .reduce<string[]>((acc, part) => {
          if (part === "") {
            acc.push("\n");
          } else if (acc.length > 0 && acc[acc.length - 1] !== "\n") {
            acc[acc.length - 1] += " " + part;
          } else {
            acc.push(part);
          }
          return acc;
        }, [])
        .join("")
        .trim();
    } else {
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      i++;
    }

    meta[key] = value;
  }

  return { meta, body };
}

// ─── Validation ──────────────────────────────────────────────────────────────

const REQUIRED_FIELDS: (keyof AgentFrontmatter)[] = [
  "id",
  "name",
  "domain",
  "rulePrefix",
  "description",
  "tableDescription",
  "promptDescription",
];

/**
 * Validate and coerce parsed frontmatter into a typed AgentFrontmatter.
 * Throws on missing required fields.
 */
export function validateFrontmatter(meta: Record<string, string>, sourcePath: string): AgentFrontmatter {
  for (const field of REQUIRED_FIELDS) {
    if (!meta[field]) {
      throw new Error(`Agent file ${sourcePath} is missing required field: "${field}"`);
    }
  }

  return {
    id: meta.id,
    name: meta.name,
    domain: meta.domain,
    rulePrefix: meta.rulePrefix,
    description: meta.description,
    tableDescription: meta.tableDescription,
    promptDescription: meta.promptDescription,
    script: meta.script || undefined,
    priority: meta.priority ? parseInt(meta.priority, 10) : 10,
  };
}

// ─── Agent File Parsing ──────────────────────────────────────────────────────

/**
 * Parse a single `.judge.md` file into its frontmatter and body (legacy `.agent.md`).
 */
export function parseAgentFile(filePath: string): ParsedAgent {
  const absPath = resolve(filePath);
  const raw = readFileSync(absPath, "utf-8");
  const { meta, body } = parseFrontmatter(raw);
  const frontmatter = validateFrontmatter(meta, absPath);

  return {
    frontmatter,
    body,
    sourcePath: absPath,
  };
}

// ─── Evaluator Resolution ────────────────────────────────────────────────────

/**
 * Resolve the `script` path to an analyze function.
 *
 * Requirements:
 * - Synchronous (to support existing synchronous evaluation paths)
 * - Works both from source (`tsx`/ts-node) and compiled `dist`
 */
type AnalyzeFn = (code: string, language: string, context?: AnalyzeContext) => Finding[];

export function resolveEvaluator(agent: ParsedAgent): AnalyzeFn | undefined {
  if (!agent.frontmatter.script) return undefined;

  const scriptPath = resolve(dirname(agent.sourcePath), agent.frontmatter.script);
  const candidatePaths: string[] = [
    scriptPath,
    scriptPath.replace(/\.ts$/, ".js"),
    scriptPath
      .replace(/\\src\\/g, "\\dist\\")
      .replace(/\/src\//g, "/dist/")
      .replace(/\.ts$/, ".js"),
    resolve(process.cwd(), "dist", "evaluators", `${agent.frontmatter.id}.js`),
  ];

  const req = createRequire(import.meta.url);
  for (const candidate of candidatePaths) {
    try {
      const mod = req(candidate) as Record<string, unknown>;
      const pascalId = agent.frontmatter.id
        .split("-")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join("");
      const fnName = `analyze${pascalId}`;
      const maybeFn = mod?.[fnName];
      if (typeof maybeFn === "function") return maybeFn as AnalyzeFn;
      for (const key of Object.keys(mod || {})) {
        const candidateFn = mod[key];
        if (typeof candidateFn === "function" && key.startsWith("analyze")) return candidateFn as AnalyzeFn;
      }
    } catch {
      // swallow and try next
    }
  }
  return undefined;
}

// ─── Conversion to JudgeDefinition ───────────────────────────────────────────

/**
 * Convert a parsed agent file to a JudgeDefinition, reconstructing the
 * systemPrompt from the markdown body with the standard adversarial
 * mandate appended.
 */
export function agentToJudgeDefinition(
  agent: ParsedAgent,
  analyze?: (code: string, language: string, context?: AnalyzeContext) => Finding[],
): JudgeDefinition {
  const fm = agent.frontmatter;

  // The markdown body IS the system prompt content. We prepend the persona
  // line (which is typically the first line of the body) and leave the
  // rest as structured evaluation criteria.
  const systemPrompt = agent.body;

  return {
    id: fm.id,
    name: fm.name,
    domain: fm.domain,
    description: fm.description,
    rulePrefix: fm.rulePrefix,
    tableDescription: fm.tableDescription,
    promptDescription: fm.promptDescription,
    systemPrompt,
    ...(analyze ? { analyze } : {}),
  };
}

// ─── Directory Loading ───────────────────────────────────────────────────────

/**
 * Load all `.judge.md` files from a directory (legacy `.agent.md` supported)
 * and return parsed agents sorted by priority (ascending — lower number =
 * earlier in pipeline).
 */
export function loadAgentDirectory(dirPath: string): ParsedAgent[] {
  const absDir = resolve(dirPath);
  if (!existsSync(absDir)) return [];

  const files = readdirSync(absDir).filter((f) => /\.(agent|judge)\.md$/i.test(f));

  return files
    .map((f) => parseAgentFile(join(absDir, f)))
    .sort((a, b) => (a.frontmatter.priority ?? 10) - (b.frontmatter.priority ?? 10));
}

/**
 * Load all agent files from a directory and register them with the
 * JudgeRegistry. This is the main entry point for the hybrid phase.
 *
 * Returns the number of agents loaded.
 */
export function loadAndRegisterAgents(
  dirPath: string,
  registry: {
    register: (judge: JudgeDefinition) => void;
    getJudge: (id: string) => JudgeDefinition | undefined;
  },
): number {
  const agents = loadAgentDirectory(dirPath);
  let count = 0;

  for (const agent of agents) {
    // Skip if a judge with this ID already exists (built-ins or previously loaded agents)
    if (registry.getJudge(agent.frontmatter.id)) {
      continue;
    }

    const analyze = resolveEvaluator(agent);
    const judge = agentToJudgeDefinition(agent, analyze);
    registry.register(judge);
    count++;
  }

  return count;
}

// ─── MCP Workspace & Streaming Tools ─────────────────────────────────────────
// Provides file-browsing MCP tools (list_files, read_file) so that AI agents
// can explore the workspace being evaluated, plus a streaming progress helper
// for long-running evaluations.
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum directory depth for recursive listing to prevent runaway traversal. */
const MAX_LIST_DEPTH = 6;

/** Maximum number of entries returned by list_files to cap response size. */
const MAX_LIST_ENTRIES = 500;

/** Maximum file size (bytes) that read_file will serve (1 MB). */
const MAX_READ_SIZE = 1_048_576;

/** Directories to always skip when listing. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".angular",
  "bin",
  "obj",
  "target",
  ".gradle",
  ".idea",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface FileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

/**
 * Recursively list files under `root` up to `maxDepth`, respecting SKIP_DIRS.
 */
function listDirectory(root: string, basePath: string, maxDepth: number, entries: FileEntry[]): void {
  if (maxDepth < 0 || entries.length >= MAX_LIST_ENTRIES) return;

  let items: string[];
  try {
    items = readdirSync(root);
  } catch {
    return; // permission denied or symlink loop
  }

  for (const name of items) {
    if (entries.length >= MAX_LIST_ENTRIES) break;
    if (name.startsWith(".") && name !== ".github") continue;

    const fullPath = join(root, name);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    const relPath = basePath ? `${basePath}/${name}` : name;

    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      entries.push({ path: relPath, type: "directory" });
      listDirectory(fullPath, relPath, maxDepth - 1, entries);
    } else {
      entries.push({ path: relPath, type: "file", size: stat.size });
    }
  }
}

// ─── Tool Registration ──────────────────────────────────────────────────────

export function registerWorkspaceTools(server: McpServer): void {
  // ── list_files ─────────────────────────────────────────────────────────────
  server.tool(
    "list_files",
    "List files and directories in the workspace. Useful for exploring project structure before evaluating code.",
    {
      path: z.string().optional().describe("Relative directory path to list (default: workspace root)"),
      depth: z
        .number()
        .int()
        .min(0)
        .max(MAX_LIST_DEPTH)
        .optional()
        .describe(`Max recursion depth (default: 2, max: ${MAX_LIST_DEPTH})`),
    },
    async ({ path: dirPath = ".", depth = 2 }) => {
      // Resolve relative to CWD (which MCP server sets to workspace root)
      const resolved = resolve(process.cwd(), dirPath);

      if (!existsSync(resolved)) {
        return {
          content: [{ type: "text" as const, text: `Error: path "${dirPath}" does not exist.` }],
          isError: true,
        };
      }

      const entries: FileEntry[] = [];
      listDirectory(resolved, "", depth, entries);

      const summary =
        `Listed ${entries.length} entries (max depth ${depth})` +
        (entries.length >= MAX_LIST_ENTRIES ? ` — truncated at ${MAX_LIST_ENTRIES}` : "");

      return {
        content: [{ type: "text" as const, text: JSON.stringify({ summary, entries }, null, 2) }],
      };
    },
  );

  // ── read_file ──────────────────────────────────────────────────────────────
  server.tool(
    "read_file",
    "Read the contents of a file in the workspace. Returns the file text, or an error if the file is too large or missing.",
    {
      path: z.string().describe("Relative file path to read"),
      startLine: z.number().int().min(1).optional().describe("First line to read (1-based, default: 1)"),
      endLine: z.number().int().min(1).optional().describe("Last line to read (1-based, default: end of file)"),
    },
    async ({ path: filePath, startLine, endLine }) => {
      const resolved = resolve(process.cwd(), filePath);

      if (!existsSync(resolved)) {
        return {
          content: [{ type: "text" as const, text: `Error: file "${filePath}" does not exist.` }],
          isError: true,
        };
      }

      let stat;
      try {
        stat = statSync(resolved);
      } catch {
        return {
          content: [{ type: "text" as const, text: `Error: cannot stat "${filePath}".` }],
          isError: true,
        };
      }

      if (stat.isDirectory()) {
        return {
          content: [{ type: "text" as const, text: `Error: "${filePath}" is a directory. Use list_files instead.` }],
          isError: true,
        };
      }

      if (stat.size > MAX_READ_SIZE) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: file is ${stat.size} bytes — exceeds ${MAX_READ_SIZE} byte limit. Use startLine/endLine to read a portion.`,
            },
          ],
          isError: true,
        };
      }

      let content: string;
      try {
        content = readFileSync(resolved, "utf-8");
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `Error reading file: ${String(err)}` }],
          isError: true,
        };
      }

      // Apply line range if specified
      if (startLine || endLine) {
        const lines = content.split("\n");
        const start = (startLine ?? 1) - 1;
        const end = endLine ?? lines.length;
        content = lines.slice(start, end).join("\n");
        const totalLines = lines.length;
        return {
          content: [
            {
              type: "text" as const,
              text: `File: ${filePath} (lines ${start + 1}–${Math.min(end, totalLines)} of ${totalLines})\n\n${content}`,
            },
          ],
        };
      }

      return {
        content: [{ type: "text" as const, text: content }],
      };
    },
  );

  // ── evaluate_with_progress ─────────────────────────────────────────────────
  // This tool provides a streaming-style progress experience by evaluating
  // judges sequentially and reporting counts as findings are discovered.
  server.tool(
    "evaluate_with_progress",
    "Evaluate code with progressive judge-by-judge reporting. Returns intermediate counts as each judge completes, useful for large files where full tribunal takes time.",
    {
      code: z.string().describe("Source code to evaluate"),
      language: z.string().describe("Programming language (e.g. typescript, python, go)"),
    },
    async ({ code, language }) => {
      // Lazy import to avoid circular dependencies
      const { evaluateWithJudge } = await import("../evaluators/index.js");
      const { JUDGES } = await import("../judges/index.js");
      const { crossEvaluatorDedup } = await import("../dedup.js");

      const allFindings: Array<{ judgeId: string; findings: ReturnType<typeof evaluateWithJudge>["findings"] }> = [];
      const progressLines: string[] = [];

      for (const judge of JUDGES) {
        const evaluation = evaluateWithJudge(judge, code, language);
        allFindings.push({ judgeId: judge.id, findings: evaluation.findings });

        if (evaluation.findings.length > 0) {
          progressLines.push(
            `[${allFindings.length}/${JUDGES.length}] ${judge.name}: ${evaluation.findings.length} findings (${evaluation.verdict})`,
          );
        }
      }

      // Dedup across all evaluations
      const combined = allFindings.flatMap((e) => e.findings);
      const deduped = crossEvaluatorDedup(combined);

      const summary = [
        `## Progressive Evaluation Complete`,
        ``,
        `**Judges run:** ${JUDGES.length}`,
        `**Raw findings:** ${combined.length}`,
        `**After dedup:** ${deduped.length}`,
        `**Critical:** ${deduped.filter((f) => f.severity === "critical").length}`,
        `**High:** ${deduped.filter((f) => f.severity === "high").length}`,
        ``,
        `### Judge Progress:`,
        ...progressLines,
      ].join("\n");

      return {
        content: [{ type: "text" as const, text: summary }],
      };
    },
  );
}

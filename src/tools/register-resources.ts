// ─── MCP Resource Registration ───────────────────────────────────────────────
// Expose judges metadata, presets, and session state as MCP resources.
// Includes both static resources and parameterized resource templates for
// efficient single-item lookups (judges://judge/{id}, judges://preset/{key}).
// ──────────────────────────────────────────────────────────────────────────────

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getJudge, getJudgeSummaries, JUDGES } from "../judges/index.js";
import { getPreset, PRESETS } from "../presets.js";
import { getGlobalSession } from "../evaluation-session.js";

/**
 * Register MCP resources: judges catalog, presets, session state,
 * and parameterized templates for single-judge / single-preset lookups.
 */
export function registerResources(server: McpServer): void {
  registerJudgesCatalog(server);
  registerPresetsResource(server);
  registerSessionResource(server);
  registerJudgeTemplate(server);
  registerPresetTemplate(server);
}

// ─── judges://catalog ────────────────────────────────────────────────────────

function registerJudgesCatalog(server: McpServer): void {
  server.resource(
    "judges-catalog",
    "judges://catalog",
    { description: "Full catalog of all judges on the panel — IDs, names, domains, and descriptions." },
    async (uri) => {
      const judges = getJudgeSummaries();
      const data = judges.map((j) => ({
        id: j.id,
        name: j.name,
        domain: j.domain,
        description: j.description,
      }));

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}

// ─── judges://presets ────────────────────────────────────────────────────────

function registerPresetsResource(server: McpServer): void {
  server.resource(
    "presets",
    "judges://presets",
    { description: "Available evaluation presets with names, descriptions, and configuration overrides." },
    async (uri) => {
      const data = Object.entries(PRESETS).map(([key, preset]) => ({
        key,
        name: preset.name,
        description: preset.description,
        config: preset.config,
      }));

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}

// ─── judges://session ────────────────────────────────────────────────────────

function registerSessionResource(server: McpServer): void {
  server.resource(
    "session",
    "judges://session",
    {
      description:
        "Current evaluation session state — evaluation count, detected frameworks, verdict history, and stability indicators.",
    },
    async (uri) => {
      const session = getGlobalSession();
      const ctx = session.getContext();

      const filesEvaluated = [...ctx.verdictHistory.entries()].map(([file, history]) => ({
        file,
        evaluations: history.length,
        latestScore: history[history.length - 1]?.score ?? 0,
        stable: session.isVerdictStable(file),
      }));

      const data = {
        evaluationCount: ctx.evaluationCount,
        startedAt: ctx.startedAt,
        frameworks: ctx.frameworks,
        capabilities: [...ctx.capabilities],
        filesEvaluated,
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}

// ─── judges://judge/{id} (template) ─────────────────────────────────────────

function registerJudgeTemplate(server: McpServer): void {
  const judgeIds = JUDGES.map((j) => j.id);

  server.resource(
    "judge-detail",
    new ResourceTemplate("judges://judge/{id}", {
      list: async () => ({
        resources: judgeIds.map((id) => ({
          uri: `judges://judge/${id}`,
          name: id,
        })),
      }),
      complete: {
        id: (value) => judgeIds.filter((id) => id.startsWith(value)),
      },
    }),
    { description: "Detailed info for a single judge — rules, domain, system prompt summary." },
    async (uri, { id }) => {
      const judgeId = Array.isArray(id) ? id[0] : id;
      const judge = getJudge(judgeId);
      if (!judge) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: `Judge '${judgeId}' not found` }),
            },
          ],
        };
      }

      const data = {
        id: judge.id,
        name: judge.name,
        domain: judge.domain,
        description: judge.description,
        rulePrefix: judge.rulePrefix,
        tableDescription: judge.tableDescription,
        promptDescription: judge.promptDescription,
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}

// ─── judges://preset/{key} (template) ───────────────────────────────────────

function registerPresetTemplate(server: McpServer): void {
  const presetKeys = Object.keys(PRESETS);

  server.resource(
    "preset-detail",
    new ResourceTemplate("judges://preset/{key}", {
      list: async () => ({
        resources: presetKeys.map((key) => ({
          uri: `judges://preset/${key}`,
          name: key,
        })),
      }),
      complete: {
        key: (value) => presetKeys.filter((k) => k.startsWith(value)),
      },
    }),
    { description: "Detailed configuration for a single evaluation preset." },
    async (uri, { key }) => {
      const presetKey = Array.isArray(key) ? key[0] : key;
      const preset = getPreset(presetKey);
      if (!preset) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify({ error: `Preset '${presetKey}' not found` }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ key: presetKey, ...preset }, null, 2),
          },
        ],
      };
    },
  );
}

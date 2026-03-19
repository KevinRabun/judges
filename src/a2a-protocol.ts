/**
 * Agent-to-Agent (A2A) Protocol Support
 *
 * Implements the agent card and task exchange protocol enabling Judges
 * to participate in multi-agent orchestration ecosystems. Compatible
 * with Google's A2A protocol and similar agent discovery patterns.
 *
 * Capabilities:
 * - Agent Card: advertises Judges' capabilities to orchestrators
 * - Task Reception: accepts code review requests from other agents
 * - Task Delegation: forwards specialized work to sub-agents
 * - Result Reporting: returns structured findings to callers
 *
 * Wire format: JSON-RPC 2.0 over HTTP or stdio (MCP-compatible)
 */

import type { Finding, ReviewDecision } from "./types.js";

// ─── Agent Card (Discovery) ──────────────────────────────────────────────────

export interface AgentCard {
  /** Agent identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Version string */
  version: string;
  /** Description of agent capabilities */
  description: string;
  /** Supported input capabilities */
  capabilities: AgentCapability[];
  /** Supported output formats */
  outputFormats: string[];
  /** Communication protocols supported */
  protocols: string[];
  /** Authentication methods accepted */
  authMethods: string[];
  /** Agent metadata */
  metadata: Record<string, unknown>;
}

export interface AgentCapability {
  /** Capability name */
  name: string;
  /** Description */
  description: string;
  /** Input schema (JSON Schema subset) */
  inputSchema?: Record<string, unknown>;
  /** Output schema */
  outputSchema?: Record<string, unknown>;
}

/**
 * Generate the Judges agent card for discovery by orchestrators.
 */
export function getAgentCard(options?: { version?: string; baseUrl?: string }): AgentCard {
  return {
    id: "judges-code-reviewer",
    name: "Judges — AI Code Review Tribunal",
    version: options?.version || "3.116.0",
    description:
      "Automated code review system with 45 specialized judges covering security, " +
      "performance, reliability, AI-generated code safety, and 40+ rule categories. " +
      "Uses a tribunal of LLM judges with deterministic pre-screening for high-confidence " +
      "findings plus human escalation for uncertain cases.",
    capabilities: [
      {
        name: "evaluate-code",
        description: "Evaluate a code snippet or file for issues across all judge categories",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string", description: "Source code to evaluate" },
            language: { type: "string", description: "Programming language" },
            filePath: { type: "string", description: "File path for context" },
            preset: { type: "string", enum: ["default", "strict", "lenient", "security-only"] },
          },
          required: ["code", "language"],
        },
      },
      {
        name: "evaluate-diff",
        description: "Evaluate a code diff (PR or commit) for introduced issues",
        inputSchema: {
          type: "object",
          properties: {
            diff: { type: "string", description: "Unified diff content" },
            baseRef: { type: "string", description: "Base commit/branch reference" },
          },
          required: ["diff"],
        },
      },
      {
        name: "review-project",
        description: "Full project-level review with cross-file analysis",
        inputSchema: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  content: { type: "string" },
                  language: { type: "string" },
                },
              },
            },
          },
          required: ["files"],
        },
      },
      {
        name: "explain-finding",
        description: "Provide detailed explanation of a specific finding",
      },
      {
        name: "suggest-fix",
        description: "Generate fix suggestions for detected findings",
      },
    ],
    outputFormats: ["json", "sarif", "markdown", "csv", "github-actions"],
    protocols: ["mcp", "json-rpc-2.0", "http-rest"],
    authMethods: ["none", "api-key", "github-token"],
    metadata: {
      judgeCount: 45,
      tribunalJudges: 40,
      ruleCategories: 40,
      supportsDeterministicMode: true,
      supportsLlmTribunal: true,
      supportsStreaming: true,
      supportsEscalation: true,
      supportsAuditTrail: true,
    },
  };
}

// ─── A2A Task Types ──────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "in-progress" | "completed" | "failed" | "cancelled";

export interface A2ATask {
  /** Unique task identifier */
  taskId: string;
  /** The capability being invoked */
  capability: string;
  /** Task status */
  status: TaskStatus;
  /** Input parameters */
  input: Record<string, unknown>;
  /** Output result (when completed) */
  output?: A2ATaskResult;
  /** Error details (when failed) */
  error?: { code: string; message: string };
  /** Requesting agent ID */
  requesterId: string;
  /** Created timestamp */
  createdAt: string;
  /** Completed timestamp */
  completedAt?: string;
}

export interface A2ATaskResult {
  /** The findings from evaluation */
  findings: Finding[];
  /** Overall verdict */
  verdict?: string;
  /** Overall score (0-100) */
  score?: number;
  /** Review decision */
  reviewDecision?: ReviewDecision;
  /** Summary markdown */
  summary?: string;
  /** SARIF output (if requested) */
  sarif?: unknown;
}

// ─── Task Management ─────────────────────────────────────────────────────────

const taskQueue = new Map<string, A2ATask>();

function generateTaskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new A2A task from an incoming request.
 */
export function createTask(capability: string, input: Record<string, unknown>, requesterId: string): A2ATask {
  const task: A2ATask = {
    taskId: generateTaskId(),
    capability,
    status: "pending",
    input,
    requesterId,
    createdAt: new Date().toISOString(),
  };

  taskQueue.set(task.taskId, task);
  return task;
}

/**
 * Get a task by ID.
 */
export function getTask(taskId: string): A2ATask | undefined {
  return taskQueue.get(taskId);
}

/**
 * Update task status and optionally set the result.
 */
export function completeTask(taskId: string, result: A2ATaskResult): A2ATask | undefined {
  const task = taskQueue.get(taskId);
  if (!task) return undefined;

  task.status = "completed";
  task.output = result;
  task.completedAt = new Date().toISOString();
  return task;
}

/**
 * Mark a task as failed.
 */
export function failTask(taskId: string, code: string, message: string): A2ATask | undefined {
  const task = taskQueue.get(taskId);
  if (!task) return undefined;

  task.status = "failed";
  task.error = { code, message };
  task.completedAt = new Date().toISOString();
  return task;
}

/**
 * List all tasks, optionally filtered by status.
 */
export function listTasks(status?: TaskStatus): A2ATask[] {
  const tasks = Array.from(taskQueue.values());
  return status ? tasks.filter((t) => t.status === status) : tasks;
}

/**
 * Clean up completed/failed tasks older than the given age.
 */
export function pruneTasks(maxAgeMs: number = 3600000): number {
  const cutoff = Date.now() - maxAgeMs;
  let pruned = 0;

  for (const [id, task] of taskQueue) {
    if (
      (task.status === "completed" || task.status === "failed") &&
      task.completedAt &&
      new Date(task.completedAt).getTime() < cutoff
    ) {
      taskQueue.delete(id);
      pruned++;
    }
  }

  return pruned;
}

// ─── Protocol Handlers ───────────────────────────────────────────────────────

export interface A2ARequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

export interface A2AResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id?: string | number;
}

/**
 * Handle an incoming A2A JSON-RPC request.
 * Returns a JSON-RPC response.
 */
export function handleA2ARequest(request: A2ARequest): A2AResponse {
  const { method, params, id } = request;

  switch (method) {
    case "agent/discover":
      return { jsonrpc: "2.0", result: getAgentCard(), id };

    case "agent/capabilities":
      return { jsonrpc: "2.0", result: getAgentCard().capabilities, id };

    case "task/create": {
      if (!params?.capability || !params?.input) {
        return {
          jsonrpc: "2.0",
          error: { code: -32602, message: "Missing required params: capability, input" },
          id,
        };
      }
      const task = createTask(
        params.capability as string,
        params.input as Record<string, unknown>,
        (params.requesterId as string) || "unknown",
      );
      return { jsonrpc: "2.0", result: { taskId: task.taskId, status: task.status }, id };
    }

    case "task/status": {
      if (!params?.taskId) {
        return { jsonrpc: "2.0", error: { code: -32602, message: "Missing taskId" }, id };
      }
      const task = getTask(params.taskId as string);
      if (!task) {
        return { jsonrpc: "2.0", error: { code: -32001, message: "Task not found" }, id };
      }
      return { jsonrpc: "2.0", result: task, id };
    }

    case "task/list":
      return {
        jsonrpc: "2.0",
        result: listTasks(params?.status as TaskStatus | undefined),
        id,
      };

    default:
      return {
        jsonrpc: "2.0",
        error: { code: -32601, message: `Method not found: ${method}` },
        id,
      };
  }
}

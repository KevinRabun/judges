// ─────────────────────────────────────────────────────────────────────────────
// A2A Protocol — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getAgentCard,
  createTask,
  getTask,
  completeTask,
  failTask,
  listTasks,
  pruneTasks,
  handleA2ARequest,
  type A2ARequest,
} from "../src/a2a-protocol.js";

// ── Agent Card ───────────────────────────────────────────────────────────

describe("A2A: getAgentCard", () => {
  it("returns a valid agent card", () => {
    const card = getAgentCard();
    assert.equal(card.id, "judges-code-reviewer");
    assert.ok(card.name.includes("Judges"));
    assert.ok(card.capabilities.length >= 3);
    assert.ok(card.outputFormats.includes("sarif"));
    assert.ok(card.protocols.includes("mcp"));
  });

  it("accepts custom version", () => {
    const card = getAgentCard({ version: "9.9.9" });
    assert.equal(card.version, "9.9.9");
  });

  it("has evaluate-code capability", () => {
    const card = getAgentCard();
    const evalCap = card.capabilities.find((c) => c.name === "evaluate-code");
    assert.ok(evalCap);
    assert.ok(evalCap.inputSchema);
  });

  it("has evaluate-diff capability", () => {
    const card = getAgentCard();
    assert.ok(card.capabilities.some((c) => c.name === "evaluate-diff"));
  });

  it("has review-project capability", () => {
    const card = getAgentCard();
    assert.ok(card.capabilities.some((c) => c.name === "review-project"));
  });

  it("includes metadata about judges", () => {
    const card = getAgentCard();
    assert.equal(card.metadata.judgeCount, 45);
    assert.equal(card.metadata.supportsDeterministicMode, true);
  });
});

// ── Task lifecycle ───────────────────────────────────────────────────────

describe("A2A: task lifecycle", () => {
  it("creates a task with unique ID", () => {
    const task = createTask("evaluate-code", { code: "x=1", language: "python" }, "agent-1");
    assert.ok(task.taskId.startsWith("task_"));
    assert.equal(task.status, "pending");
    assert.equal(task.capability, "evaluate-code");
    assert.equal(task.requesterId, "agent-1");
    assert.ok(task.createdAt);
  });

  it("retrieves a task by ID", () => {
    const task = createTask("evaluate-code", { code: "y=2" }, "agent-2");
    const found = getTask(task.taskId);
    assert.ok(found);
    assert.equal(found.taskId, task.taskId);
  });

  it("returns undefined for unknown task ID", () => {
    assert.equal(getTask("nonexistent-id"), undefined);
  });

  it("completes a task with result", () => {
    const task = createTask("evaluate-code", {}, "agent-3");
    const result = { findings: [], verdict: "pass", score: 100, summary: "Clean" };
    const completed = completeTask(task.taskId, result);
    assert.ok(completed);
    assert.equal(completed.status, "completed");
    assert.ok(completed.completedAt);
    assert.equal(completed.output?.score, 100);
  });

  it("returns undefined when completing nonexistent task", () => {
    assert.equal(completeTask("nope", { findings: [] }), undefined);
  });

  it("fails a task with error", () => {
    const task = createTask("evaluate-code", {}, "agent-4");
    const failed = failTask(task.taskId, "EVAL_ERROR", "Code too large");
    assert.ok(failed);
    assert.equal(failed.status, "failed");
    assert.equal(failed.error?.code, "EVAL_ERROR");
    assert.equal(failed.error?.message, "Code too large");
    assert.ok(failed.completedAt);
  });

  it("returns undefined when failing nonexistent task", () => {
    assert.equal(failTask("nope", "E", "msg"), undefined);
  });
});

// ── Task listing & pruning ───────────────────────────────────────────────

describe("A2A: listTasks", () => {
  it("lists all tasks without filter", () => {
    createTask("test-list", {}, "agent");
    const tasks = listTasks();
    assert.ok(tasks.length > 0);
  });

  it("filters by status", () => {
    const t = createTask("test-filter", {}, "agent");
    completeTask(t.taskId, { findings: [] });
    const pending = listTasks("pending");
    const completed = listTasks("completed");
    assert.ok(pending.every((p) => p.status === "pending"));
    assert.ok(completed.every((c) => c.status === "completed"));
  });
});

describe("A2A: pruneTasks", () => {
  it("prunes old completed tasks", () => {
    const t = createTask("prune-test", {}, "agent");
    completeTask(t.taskId, { findings: [] });
    // Fake old completedAt
    const task = getTask(t.taskId)!;
    task.completedAt = new Date(Date.now() - 7200000).toISOString(); // 2h ago
    const pruned = pruneTasks(3600000); // 1h max age
    assert.ok(pruned >= 1);
    assert.equal(getTask(t.taskId), undefined);
  });

  it("does not prune recent tasks", () => {
    const t = createTask("recent-test", {}, "agent");
    completeTask(t.taskId, { findings: [] });
    const pruned = pruneTasks(3600000); // 1h max age — task is recent
    assert.equal(getTask(t.taskId)?.status, "completed");
  });

  it("does not prune pending tasks", () => {
    const t = createTask("pending-prune", {}, "agent");
    pruneTasks(0); // Prune everything old
    assert.ok(getTask(t.taskId)); // Still exists since pending
  });
});

// ── JSON-RPC handler ─────────────────────────────────────────────────────

describe("A2A: handleA2ARequest", () => {
  it("handles agent/discover", () => {
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "agent/discover", id: 1 });
    assert.equal(resp.jsonrpc, "2.0");
    assert.ok((resp.result as Record<string, unknown>).id);
    assert.equal(resp.id, 1);
  });

  it("handles agent/capabilities", () => {
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "agent/capabilities", id: 2 });
    assert.ok(Array.isArray(resp.result));
  });

  it("handles task/create", () => {
    const resp = handleA2ARequest({
      jsonrpc: "2.0",
      method: "task/create",
      params: { capability: "evaluate-code", input: { code: "x=1" }, requesterId: "test" },
      id: 3,
    });
    assert.ok((resp.result as Record<string, unknown>).taskId);
    assert.equal((resp.result as Record<string, unknown>).status, "pending");
  });

  it("rejects task/create without params", () => {
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "task/create", id: 4 });
    assert.ok(resp.error);
    assert.equal(resp.error.code, -32602);
  });

  it("handles task/status for existing task", () => {
    const create = handleA2ARequest({
      jsonrpc: "2.0",
      method: "task/create",
      params: { capability: "test", input: {} },
      id: 5,
    });
    const taskId = (create.result as Record<string, unknown>).taskId;
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "task/status", params: { taskId }, id: 6 });
    assert.ok(resp.result);
    assert.equal((resp.result as Record<string, unknown>).taskId, taskId);
  });

  it("returns error for task/status with missing taskId", () => {
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "task/status", id: 7 });
    assert.ok(resp.error);
    assert.equal(resp.error.code, -32602);
  });

  it("returns error for task/status with unknown taskId", () => {
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "task/status", params: { taskId: "fake" }, id: 8 });
    assert.ok(resp.error);
    assert.equal(resp.error.code, -32001);
  });

  it("handles task/list", () => {
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "task/list", id: 9 });
    assert.ok(Array.isArray(resp.result));
  });

  it("handles task/list with status filter", () => {
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "task/list", params: { status: "pending" }, id: 10 });
    assert.ok(Array.isArray(resp.result));
  });

  it("returns method not found for unknown methods", () => {
    const resp = handleA2ARequest({ jsonrpc: "2.0", method: "unknown/method", id: 11 });
    assert.ok(resp.error);
    assert.equal(resp.error.code, -32601);
    assert.ok(resp.error.message.includes("unknown/method"));
  });
});

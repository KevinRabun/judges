import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runReview, __setApiRequestImplForTest, __test } from "../src/commands/review.js";
import type { Finding } from "../src/types.js";

// Simple patch that should trigger a credential finding (DATA rule)
const SAMPLE_PATCH = `@@ -1,1 +1,2 @@\n+const secretValue = "example";`;

// Minimal fake finding to force inline comment creation
const fakeFinding: Finding & { _file?: string; _changedLines?: number[] } = {
  ruleId: "DATA-001",
  severity: "high",
  title: "Sensitive string literal",
  description: "Found inline secret-like literal",
  recommendation: "Use env vars",
  confidence: 0.9,
  lineNumbers: [1],
};

describe("review autopilot", () => {
  it("posts inline review comments via apiRequest", async () => {
    const apiCalls: Array<{ method: string; endpoint: string; body?: unknown }> = [];
    const { __setApiRequestImplForTest, __setEvaluateDiffImplForTest } = await import("../src/commands/review.js");

    // Stub GitHub API
    const fakeApi = (method: string, endpoint: string, _token?: string, body?: unknown) => {
      apiCalls.push({ method, endpoint, body });
      if (endpoint.includes("/files")) {
        return { status: 200, data: [{ filename: "src/app.ts", status: "modified", patch: SAMPLE_PATCH }] };
      }
      if (endpoint.includes("/pulls") && endpoint.endsWith("/comments")) {
        return { status: 200, data: [] };
      }
      if (endpoint.includes("/pulls") && endpoint.endsWith("/reviews")) {
        return { status: 200, data: {} };
      }
      if (endpoint.includes("/issues")) {
        return { status: 200, data: {} };
      }
      return { status: 200, data: {} };
    };

    __setApiRequestImplForTest(fakeApi);

    // Force deterministic finding injection by patching evaluateDiff via test hook
    __setEvaluateDiffImplForTest(() => ({
      linesAnalyzed: 1,
      findings: [fakeFinding],
      score: 100,
      verdict: "pass",
      summary: "Injection for test",
    }));

    const argv = [
      "node",
      "judges",
      "review",
      "--pr",
      "1",
      "--repo",
      "owner/repo",
      "--autopilot",
      "--token",
      "test-token",
    ];
    // Stub process.exit to avoid quitting test runner
    const originalExit = process.exit;
    const proc = process as NodeJS.Process & { exit: (code?: number) => never };
    proc.exit = (() => undefined) as unknown as (code?: number) => never;

    await runReview(argv);

    // Restore hooks
    __setEvaluateDiffImplForTest(undefined);
    __setApiRequestImplForTest(undefined);
    process.exit = originalExit;

    const reviewCall = apiCalls.find((c) => c.endpoint.includes("/pulls/1/reviews"));
    assert.ok(reviewCall, "review API should be called");
    const body = reviewCall?.body as { comments?: Array<{ body?: string }> } | undefined;
    assert.ok(Array.isArray(body?.comments), "inline comments should be present");
    assert.ok(
      body?.comments?.some((c) => typeof c.body === "string" && c.body.includes("DATA-001")),
      "comment should include rule ID",
    );
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
// NOTE: use .ts import so tsx/node:test shares the same module instance for test hooks
import { __test, __setGhApiImplForTest } from "../src/github-app.ts";
import type { GitHubAppConfig } from "../src/github-app.ts";

const SAMPLE_PATCH = `@@ -1,1 +1,2 @@\n+const password = "secret";`;

describe("GitHub App autopilot", () => {
  it("posts review with inline comments", async () => {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];
    __setGhApiImplForTest((method: string, path: string, _token?: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (path.endsWith("/files?per_page=100")) {
        return Promise.resolve({
          status: 200,
          data: [{ filename: "src/app.ts", status: "modified", patch: SAMPLE_PATCH }],
        });
      }
      if (path.endsWith("/reviews")) {
        return Promise.resolve({ status: 200, data: {} });
      }
      if (path.endsWith("/reviews") || path.includes("/issues/")) {
        return Promise.resolve({ status: 200, data: {} });
      }
      // default
      return Promise.resolve({ status: 200, data: [] });
    });

    // Force deterministic finding injection (tsc + tsx + node:test override-safe)
    let evalCalls = 0;
    const evalStub = () => {
      evalCalls++;
      return {
        findings: [
          {
            ruleId: "DATA-001",
            severity: "high",
            title: "Sensitive string literal",
            description: "Found inline secret-like literal",
            recommendation: "Use env vars",
            confidence: 0.9,
            lineNumbers: [1],
          },
        ],
        evaluations: [],
        overallVerdict: "fail",
        overallScore: 0,
        timestamp: new Date().toISOString(),
        summary: "Injected for test",
      } as never;
    };
    __test.__setEvaluateWithTribunalForTest(evalStub as any);
    // Verify override is applied even under esbuild/tsx bundling (prevents inlining regressions)
    if ("__getEvaluateWithTribunalImplForTest" in __test) {
      assert.equal(__test.__getEvaluateWithTribunalImplForTest(), evalStub);
    }

    const payload = {
      action: "opened",
      pull_request: {
        number: 1,
        head: { sha: "abc", ref: "feature" },
        base: { sha: "def", ref: "main" },
        title: "Add feature",
      },
      repository: { full_name: "owner/repo", name: "repo" },
      installation: { id: 123 },
    } as unknown as Parameters<typeof __test.reviewPullRequest>[0];

    const config: GitHubAppConfig = {
      appId: "app-id",
      privateKey: "fake",
      webhookSecret: "secret",
      minSeverity: "low",
      maxComments: 10,
      diffOnly: true,
      llmDeepReview: false,
    };

    const result = await __test.reviewPullRequest(payload, "dummy", config);
    assert.equal(result.status, 200);
    assert.ok(evalCalls > 0, "evaluation stub should be invoked");
    const reviewCall = calls.find((c) => c.method === "POST" && c.path.endsWith("/pulls/1/reviews"));
    assert.ok(reviewCall, "should post a review");
    const body = reviewCall?.body as { comments?: Array<{ body?: string }> } | undefined;
    assert.ok(Array.isArray(body?.comments));
    assert.ok(
      body?.comments?.some((c) => typeof c.body === "string"),
      "inline comments should be present",
    );

    // Reset hook
    __test.__setEvaluateWithTribunalForTest(undefined);
    __test.__setEvaluateProjectForTest?.(undefined as never);
  });
});

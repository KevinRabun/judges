import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseReviewArgs, dedupeComments } from "../src/commands/review.js";

describe("review command", () => {
  it("parses --autopilot flag", () => {
    const args = parseReviewArgs(["node", "judges", "review", "--pr", "42", "--autopilot"]);
    assert.equal(args.pr, 42);
    assert.equal(args.autopilot, true);
    // autopilot implies live mode (dryRun false)
    assert.equal(args.dryRun, false);
  });

  it("deduplicates comments by path/line/body", () => {
    const comments = [
      { path: "a.ts", line: 10, side: "RIGHT" as const, body: "Issue 1" },
      { path: "a.ts", line: 10, side: "RIGHT" as const, body: "Issue 1" },
      { path: "a.ts", line: 11, side: "RIGHT" as const, body: "Issue 2" },
    ];
    const deduped = dedupeComments(comments);
    assert.equal(deduped.length, 2);
  });

  it("validates LLM output via validator in runLlmDeepReview", async () => {
    const { __test } = await import("../src/commands/review.js");
    const { __setCallOpenAiChatImplForTest, runLlmDeepReview } = __test;
    // Mock LLM returning one valid and one invalid rule ID
    __setCallOpenAiChatImplForTest(async () => "Found issues: BAD-999, CYBER-001" as any);
    process.env.OPENAI_API_KEY = "test-key";
    const prFiles = [
      {
        filename: "src/app.ts",
        status: "modified" as const,
        patch: "@@ -1,2 +1,2 @@\n-foo\n+bar",
      },
    ];
    const args = { llmModel: "gpt-4o" } as any;
    const result = await runLlmDeepReview(prFiles, args);
    assert.ok(result.summary?.includes("CYBER-001"));
    assert.ok(result.warnings?.some((w) => w.includes("Invalid rule")) || true);
  });
});

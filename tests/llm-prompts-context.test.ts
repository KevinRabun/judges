import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { constructPerJudgePrompt, constructTribunalPrompt } from "../src/commands/llm-benchmark.js";
import { JUDGES } from "../src/judges/index.js";

describe("LLM prompts context integration", () => {
  const judge = JUDGES[0];
  const contextSnippets = ["ADR: Use TLS everywhere", "Style guide: prefer async/await"];

  it("includes context snippets in per-judge prompt", () => {
    const prompt = constructPerJudgePrompt(judge, "const x=1;", "typescript", contextSnippets);
    assert(prompt.includes("Repository Context"));
    assert(prompt.includes(contextSnippets[0]));
  });

  it("includes context snippets in tribunal prompt", () => {
    const prompt = constructTribunalPrompt("const x=1;", "typescript", contextSnippets);
    assert(prompt.includes("Repository Context"));
    assert(prompt.includes(contextSnippets[1]));
  });
});

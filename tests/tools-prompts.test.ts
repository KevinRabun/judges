import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getCondensedCriteria,
  registerPrompts,
  SHARED_ADVERSARIAL_MANDATE,
  PRECISION_MANDATE,
} from "../src/tools/prompts.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { JUDGES } from "../src/judges/index.js";

// Minimal mock server that records prompt registrations
class MockServer implements Pick<McpServer, "prompt"> {
  registrations: Array<{ name: string; description: string; params: any; handler: Function }> = [];
  prompt(name: string, description: string, params: any, handler: Function) {
    this.registrations.push({ name, description, params, handler });
  }
}

describe("tools/prompts", () => {
  it("getCondensedCriteria strips persona intro, adversarial block, and boilerplate", () => {
    const prompt = `I am Judge Foo — persona intro\n\nYOUR EVALUATION CRITERIA:\n- Check X\n- Check Y\n\nADVERSARIAL MANDATE: something here\n- Assign rule IDs with prefix FOO-\n- Score from 0-100 where 100 means perfect`;
    const condensed = getCondensedCriteria(prompt);
    assert.match(condensed, /YOUR EVALUATION CRITERIA/);
    assert.match(condensed, /Check X/);
    assert.match(condensed, /Check Y/);
    assert.doesNotMatch(condensed, /persona intro/);
    assert.doesNotMatch(condensed, /ADVERSARIAL MANDATE/);
    assert.doesNotMatch(condensed, /Assign rule IDs/);
    assert.doesNotMatch(condensed, /Score from 0-100/);
  });

  it("registerPrompts registers per-judge and tribunal prompts with correct content", async () => {
    const server = new MockServer();
    registerPrompts(server as unknown as McpServer);

    // Should register every judge as judge-{id}
    const perJudge = server.registrations.filter((r) => r.name.startsWith("judge-"));
    assert.equal(perJudge.length, JUDGES.length);
    // Sample one judge to verify payload contains precision mandate and system prompt
    const sample = perJudge[0];
    const handlerResult = await sample.handler({ code: "console.log('hi')", language: "javascript", context: "ctx" });
    const messageText = handlerResult.messages[0].content.text as string;
    assert.match(messageText, new RegExp(JUDGES[0].name));
    assert.match(messageText, /PRECISION MANDATE/);
    assert.match(messageText, /console\.log/);

    // Tribunal prompt should include adversarial + precision mandates once and all judge criteria
    const tribunal = server.registrations.find((r) => r.name === "full-tribunal");
    assert.ok(tribunal, "full-tribunal prompt registered");
    const tribunalResult = await tribunal!.handler({ code: "print('ok')", language: "python" });
    const tribunalText = tribunalResult.messages[0].content.text as string;
    assert.match(tribunalText, /Judges Panel/);
    assert.match(tribunalText, /ADVERSARIAL MANDATE/);
    assert.match(tribunalText, /PRECISION MANDATE/);
    // Ensure judge criteria are included (condensed)
    const firstJudge = JUDGES[0];
    const condensed = getCondensedCriteria(firstJudge.systemPrompt);
    assert.match(tribunalText, new RegExp(firstJudge.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(tribunalText, new RegExp(condensed.split("\n")[0].slice(0, 10))); // a snippet from condensed criteria
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enrichWithPatches } from "../src/patches/index.js";
import type { FindingWithPatch } from "../src/patches/index.js";
import type { Finding } from "../src/types.js";

describe("patches extended", () => {
  const mkFinding = (ruleId: string, severity: Finding["severity"] = "medium"): Finding => ({
    ruleId,
    severity,
    title: "",
    description: "",
    recommendation: "",
  });

  it("applies command injection patch (exec -> execFile)", () => {
    const code = `
      const userInput = req.params.id;
      exec("ls " + userInput);
    `;
    const findings: Finding[] = [
      {
        ...mkFinding("CYBER-COMMAND-INJECTION"),
        title: "potential command injection",
        lineNumbers: [3],
      },
    ];
    const patched: FindingWithPatch[] = enrichWithPatches(findings, code);
    const patch = patched.find((p) => p.patch?.newText?.includes("execFile"));
    assert.ok(patch, "expected a patch suggestion for command injection");
  });

  it("applies eval hardening patch", () => {
    const code = `
      const result = eval(userCode);
    `;
    const findings: Finding[] = [
      {
        ...mkFinding("CYBER-EVAL"),
        title: "dangerous eval usage",
        lineNumbers: [2],
      },
    ];
    const patched = enrichWithPatches(findings, code);
    const patch = patched.find((p) => p.patch?.newText?.includes("new Function"));
    assert.ok(patch);
  });

  it("applies insecure random patch", () => {
    const code = `const token = Math.random();`;
    const patched = enrichWithPatches(
      [{ ...mkFinding("CRYPTO-001"), title: "insecure random", lineNumbers: [1] }],
      code,
    );
    const newText = patched.map((p) => p.patch?.newText || "").join("\n");
    assert.ok(newText.includes("crypto.randomUUID"));
  });

  it("applies innerHTML patch", () => {
    const code = `element.innerHTML = userInput;`;
    const patched = enrichWithPatches(
      [{ ...mkFinding("XSS-001"), title: "innerHTML assignment", lineNumbers: [1] }],
      code,
    );
    const newText = patched.map((p) => p.patch?.newText || "").join("\n");
    assert.ok(newText.includes("textContent"));
  });

  it("applies loose equality patch", () => {
    const code = `if (a == b) { console.log('loose'); }`;
    const patched = enrichWithPatches([{ ...mkFinding("LOOSE-001"), title: "loose equality", lineNumbers: [1] }], code);
    const newText = patched.map((p) => p.patch?.newText || "").join("\n");
    assert.ok(newText.includes("==="));
  });

  it("applies var to let patch", () => {
    const code = `var x = 1;`;
    const patched = enrichWithPatches([{ ...mkFinding("VAR-001"), title: "var keyword", lineNumbers: [1] }], code);
    const newText = patched.map((p) => p.patch?.newText || "").join("\n");
    assert.ok(newText.includes("let "));
  });

  it("applies deprecated Buffer patch", () => {
    const code = `const b = new Buffer('abc');`;
    const patched = enrichWithPatches(
      [{ ...mkFinding("NODE-DEP-001"), title: "deprecated API", lineNumbers: [1] }],
      code,
    );
    const newText = patched.map((p) => p.patch?.newText || "").join("\n");
    assert.ok(newText.includes("Buffer.from"));
  });

  it("applies console.log to logger patch", () => {
    const code = `console.log('hello');`;
    const patched = enrichWithPatches(
      [{ ...mkFinding("LOG-001"), title: "console.log instead of structured logger", lineNumbers: [1] }],
      code,
    );
    const text = patched.map((p) => p.patch?.newText || "").join("\n");
    assert.ok(text.includes("logger.info"));
  });
});

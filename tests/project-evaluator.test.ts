// Project Evaluator Test Suite
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearProjectCache, scanProjectWideSecurityPatterns, buildImportGraph } from "../src/evaluators/project.js";

describe("Project: clearProjectCache", () => {
  it("does not throw", () => {
    assert.doesNotThrow(() => clearProjectCache());
  });
});

describe("Project: scanProjectWideSecurityPatterns", () => {
  it("returns a Set", () => {
    const found = scanProjectWideSecurityPatterns([
      { path: "a.ts", content: 'import helmet from "helmet";', language: "typescript" },
    ]);
    assert.ok(found instanceof Set);
  });

  it("empty input", () => {
    assert.equal(scanProjectWideSecurityPatterns([]).size, 0);
  });
});

describe("Project: buildImportGraph", () => {
  it("builds maps", () => {
    const g = buildImportGraph([
      { path: "src/a.ts", content: 'import { x } from "./b";', language: "typescript" },
      { path: "src/b.ts", content: "export const x = 1;", language: "typescript" },
    ]);
    assert.ok(g.imports instanceof Map);
    const imp = g.imports.get("src/a.ts") ?? [];
    assert.ok(imp.includes("src/b.ts"));
  });

  it("empty input", () => {
    const g = buildImportGraph([]);
    assert.equal(g.imports.size, 0);
  });

  it("no relative imports", () => {
    const g = buildImportGraph([{ path: "src/a.ts", content: 'import x from "express";', language: "typescript" }]);
    assert.deepEqual(g.imports.get("src/a.ts"), []);
  });
});

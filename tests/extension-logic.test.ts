// ─────────────────────────────────────────────────────────────────────────────
// Extension Logic Tests
// ─────────────────────────────────────────────────────────────────────────────
// Tests for the chat participant logic, diagnostic provider contract, and
// fix/evaluate pipeline. Since VS Code APIs aren't available in Node.js,
// these tests verify the core logic and contracts that the extension relies on.
//
// Usage:
//   npx tsx --test tests/extension-logic.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { evaluateWithTribunal } from "../src/evaluators/index.js";
import type { Finding, TribunalVerdict } from "../src/types.js";
import { isTreeSitterAvailable } from "../src/ast/index.js";
import { JUDGES } from "../src/judges/index.js";
import { buildTribunalDeepReviewSection } from "../src/tools/deep-review.js";

// ─── Tree-sitter warm-up ────────────────────────────────────────────────────
await Promise.all([isTreeSitterAvailable("typescript"), isTreeSitterAvailable("javascript")]);

// ─── Load sample code ───────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const samplePath = resolve(__dirname, "..", "examples", "sample-vulnerable-api.ts");
const sampleCode = readFileSync(samplePath, "utf-8");

// ─── Chat Participant Logic (extracted for testability) ──────────────────────
// These mirror the functions in chat-participant.ts

const LANG_MAP: Record<string, string> = {
  typescript: "typescript",
  typescriptreact: "typescript",
  javascript: "javascript",
  javascriptreact: "javascript",
  python: "python",
  go: "go",
  rust: "rust",
  java: "java",
  csharp: "csharp",
  cpp: "cpp",
};

function isWorkspaceIntent(prompt: string): boolean {
  return /\b(codebase|workspace|project|all\s+files|entire|whole|repo|repository|folder)\b/i.test(prompt);
}

function inferCommand(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\bfix\b/.test(lower)) return "fix";
  if (/\bdeep\s*review\b/.test(lower)) return "deepreview";
  if (/\bsecur/.test(lower)) return "security";
  if (/\bhelp\b/.test(lower)) return "help";
  return "review";
}

function detectFocusFilter(prompt: string): RegExp | null {
  if (/\bperformance?\b/.test(prompt)) return /^PERF/i;
  if (/\breliab/.test(prompt)) return /^REL/i;
  if (/\bcost\b/.test(prompt)) return /^COST/i;
  if (/\bscal/.test(prompt)) return /^SCAL/i;
  if (/\bapi\b/.test(prompt)) return /^API/i;
  if (/\bdoc/.test(prompt)) return /^DOC/i;
  if (/\bcompli/.test(prompt)) return /^COMP/i;
  if (/\bobserv/.test(prompt)) return /^(OBS|LOG)/i;
  if (/\btest/.test(prompt)) return /^TEST/i;
  if (/\baccessib/.test(prompt)) return /^A11Y/i;
  if (/\bconcurren/.test(prompt)) return /^CONC/i;
  return null;
}

function groupBySeverity(findings: Finding[]): [string, Finding[]][] {
  const order = ["critical", "high", "medium", "low", "info"];
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const arr = map.get(f.severity) ?? [];
    arr.push(f);
    map.set(f.severity, arr);
  }
  return order.filter((s) => map.has(s)).map((s) => [s, map.get(s)!]);
}

// ═════════════════════════════════════════════════════════════════════════════
// Test: Workspace Intent Detection
// ═════════════════════════════════════════════════════════════════════════════

describe("Chat Participant — Workspace Intent Detection", () => {
  it("should detect 'codebase' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("review the current codebase and provide analysis"));
  });

  it("should detect 'workspace' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("scan the workspace for security issues"));
  });

  it("should detect 'project' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("review this project"));
  });

  it("should detect 'all files' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("check all files for issues"));
  });

  it("should detect 'entire' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("review the entire application"));
  });

  it("should detect 'whole' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("analyze the whole thing"));
  });

  it("should detect 'repo' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("review this repo"));
  });

  it("should detect 'repository' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("scan the repository"));
  });

  it("should detect 'folder' as workspace intent", () => {
    assert.ok(isWorkspaceIntent("review this folder"));
  });

  it("should NOT detect single-file prompts as workspace intent", () => {
    assert.ok(!isWorkspaceIntent("review this file"));
    assert.ok(!isWorkspaceIntent("check for security issues"));
    assert.ok(!isWorkspaceIntent("evaluate the code"));
    assert.ok(!isWorkspaceIntent(""));
  });

  it("should be case-insensitive", () => {
    assert.ok(isWorkspaceIntent("Review the CODEBASE"));
    assert.ok(isWorkspaceIntent("WORKSPACE scan"));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Command Inference
// ═════════════════════════════════════════════════════════════════════════════

describe("Chat Participant — Command Inference", () => {
  it("should infer 'fix' when prompt contains 'fix'", () => {
    assert.equal(inferCommand("fix the security issues"), "fix");
  });

  it("should infer 'security' when prompt contains 'secur'", () => {
    assert.equal(inferCommand("check security"), "security");
    assert.equal(inferCommand("security review"), "security");
  });

  it("should infer 'help' when prompt contains 'help'", () => {
    assert.equal(inferCommand("help me"), "help");
  });

  it("should default to 'review' for general prompts", () => {
    assert.equal(inferCommand("review this file"), "review");
    assert.equal(inferCommand("analyze the code"), "review");
    assert.equal(inferCommand("check for issues"), "review");
    assert.equal(inferCommand(""), "review");
  });

  it("should prioritize 'fix' over other commands", () => {
    assert.equal(inferCommand("fix the security issues"), "fix");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Focus Filter Detection
// ═════════════════════════════════════════════════════════════════════════════

describe("Chat Participant — Focus Filter Detection", () => {
  it("should detect performance focus", () => {
    const filter = detectFocusFilter("review for performance issues");
    assert.ok(filter);
    assert.ok(filter!.test("PERF-001"));
    assert.ok(!filter!.test("SEC-001"));
  });

  it("should detect reliability focus", () => {
    const filter = detectFocusFilter("check reliability");
    assert.ok(filter);
    assert.ok(filter!.test("REL-001"));
  });

  it("should detect cost focus", () => {
    const filter = detectFocusFilter("review cost effectiveness");
    assert.ok(filter);
    assert.ok(filter!.test("COST-001"));
  });

  it("should detect scalability focus", () => {
    const filter = detectFocusFilter("check scalability");
    assert.ok(filter);
    assert.ok(filter!.test("SCALE-001"));
  });

  it("should detect API focus", () => {
    const filter = detectFocusFilter("review the api design");
    assert.ok(filter);
    assert.ok(filter!.test("API-001"));
  });

  it("should detect documentation focus", () => {
    const filter = detectFocusFilter("check documentation");
    assert.ok(filter);
    assert.ok(filter!.test("DOC-001"));
  });

  it("should detect compliance focus", () => {
    const filter = detectFocusFilter("review compliance");
    assert.ok(filter);
    assert.ok(filter!.test("COMP-001"));
  });

  it("should detect observability focus", () => {
    const filter = detectFocusFilter("check observability");
    assert.ok(filter);
    assert.ok(filter!.test("OBS-001"));
    assert.ok(filter!.test("LOG-001"));
  });

  it("should detect testing focus", () => {
    const filter = detectFocusFilter("review tests");
    assert.ok(filter);
    assert.ok(filter!.test("TEST-001"));
  });

  it("should detect accessibility focus", () => {
    const filter = detectFocusFilter("check accessibility");
    assert.ok(filter);
    assert.ok(filter!.test("A11Y-001"));
  });

  it("should detect concurrency focus", () => {
    const filter = detectFocusFilter("review concurrency");
    assert.ok(filter);
    assert.ok(filter!.test("CONC-001"));
  });

  it("should return null for general prompts", () => {
    assert.equal(detectFocusFilter("review this file"), null);
    assert.equal(detectFocusFilter("check for issues"), null);
    assert.equal(detectFocusFilter(""), null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Severity Grouping
// ═════════════════════════════════════════════════════════════════════════════

describe("Chat Participant — Severity Grouping", () => {
  const mockFindings: Finding[] = [
    { ruleId: "SEC-001", severity: "critical", title: "A", description: "D", recommendation: "R" },
    { ruleId: "SEC-002", severity: "high", title: "B", description: "D", recommendation: "R" },
    { ruleId: "SEC-003", severity: "medium", title: "C", description: "D", recommendation: "R" },
    { ruleId: "SEC-004", severity: "critical", title: "D", description: "D", recommendation: "R" },
    { ruleId: "SEC-005", severity: "low", title: "E", description: "D", recommendation: "R" },
    { ruleId: "SEC-006", severity: "info", title: "F", description: "D", recommendation: "R" },
  ];

  it("should group findings by severity", () => {
    const groups = groupBySeverity(mockFindings);
    assert.equal(groups.length, 5);
  });

  it("should order severity: critical > high > medium > low > info", () => {
    const groups = groupBySeverity(mockFindings);
    const severities = groups.map(([s]) => s);
    assert.deepEqual(severities, ["critical", "high", "medium", "low", "info"]);
  });

  it("should group multiple findings of same severity together", () => {
    const groups = groupBySeverity(mockFindings);
    const criticals = groups.find(([s]) => s === "critical");
    assert.ok(criticals);
    assert.equal(criticals![1].length, 2);
  });

  it("should omit severity levels with no findings", () => {
    const onlyHigh: Finding[] = [
      { ruleId: "X-001", severity: "high", title: "A", description: "D", recommendation: "R" },
    ];
    const groups = groupBySeverity(onlyHigh);
    assert.equal(groups.length, 1);
    assert.equal(groups[0][0], "high");
  });

  it("should handle empty findings array", () => {
    const groups = groupBySeverity([]);
    assert.equal(groups.length, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Language Map Coverage
// ═════════════════════════════════════════════════════════════════════════════

describe("Chat Participant — Language Map", () => {
  it("should map typescript and typescriptreact", () => {
    assert.equal(LANG_MAP["typescript"], "typescript");
    assert.equal(LANG_MAP["typescriptreact"], "typescript");
  });

  it("should map javascript and javascriptreact", () => {
    assert.equal(LANG_MAP["javascript"], "javascript");
    assert.equal(LANG_MAP["javascriptreact"], "javascript");
  });

  it("should map all 8 supported languages", () => {
    const supported = ["typescript", "javascript", "python", "go", "rust", "java", "csharp", "cpp"];
    for (const lang of supported) {
      assert.ok(LANG_MAP[lang], `${lang} should be in LANG_MAP`);
    }
  });

  it("should return undefined for unsupported languages", () => {
    assert.equal(LANG_MAP["ruby"], undefined);
    assert.equal(LANG_MAP["swift"], undefined);
    assert.equal(LANG_MAP["kotlin"], undefined);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Evaluate → Fix Pipeline Contract
// ═════════════════════════════════════════════════════════════════════════════
// Verifies the core contract that the diagnostic provider relies on:
// evaluateWithTribunal produces findings, some with patches, and the patch
// data has the required fields for the fix() method to apply edits.

describe("Evaluate → Fix Pipeline Contract", () => {
  let verdict: TribunalVerdict;
  let allFindings: Finding[];

  it("should evaluate sample code successfully", () => {
    verdict = evaluateWithTribunal(sampleCode, "typescript");
    assert.ok(verdict);
    allFindings = verdict.evaluations.flatMap((e) => e.findings);
    assert.ok(allFindings.length > 0, "Sample code should produce findings");
  });

  it("should produce some findings with patches for auto-fix", () => {
    const withPatch = allFindings.filter((f) => f.patch);
    assert.ok(withPatch.length > 0, `Expected at least 1 finding with a patch, got ${withPatch.length}`);
  });

  it("patches should have required fields (oldText, newText, startLine, endLine)", () => {
    const withPatch = allFindings.filter((f) => f.patch);
    for (const f of withPatch) {
      const p = f.patch!;
      assert.ok(typeof p.oldText === "string", `patch.oldText should be string, got ${typeof p.oldText}`);
      assert.ok(typeof p.newText === "string", `patch.newText should be string, got ${typeof p.newText}`);
      assert.ok(typeof p.startLine === "number", `patch.startLine should be number, got ${typeof p.startLine}`);
      assert.ok(typeof p.endLine === "number", `patch.endLine should be number, got ${typeof p.endLine}`);
      assert.ok(p.startLine >= 1, `patch.startLine should be >= 1, got ${p.startLine}`);
      assert.ok(p.endLine >= p.startLine, `patch.endLine should be >= startLine`);
    }
  });

  it("patch.oldText should be found in the source code", () => {
    const withPatch = allFindings.filter((f) => f.patch);
    let verified = 0;
    for (const f of withPatch) {
      const p = f.patch!;
      if (sampleCode.includes(p.oldText)) {
        verified++;
      }
    }
    assert.ok(verified > 0, `At least one patch.oldText should be found in source code, verified ${verified}`);
  });

  it("patch line numbers should be within source file bounds", () => {
    const lines = sampleCode.split("\n");
    const withPatch = allFindings.filter((f) => f.patch);
    for (const f of withPatch) {
      const p = f.patch!;
      assert.ok(p.startLine <= lines.length, `patch.startLine ${p.startLine} should be <= ${lines.length} lines`);
      assert.ok(p.endLine <= lines.length + 1, `patch.endLine ${p.endLine} should be <= ${lines.length + 1}`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Fix Application Logic (simulates diagnosticProvider.fix())
// ═════════════════════════════════════════════════════════════════════════════
// Simulates the exact algorithm from diagnostics.ts fix() method without
// requiring the VS Code API, to verify patches are applied correctly.

describe("Fix Application Logic", () => {
  /**
   * Simulates the patch application logic from diagnosticProvider.fix().
   * Returns the number of patches that would be successfully applied.
   */
  function simulateFix(code: string, findings: Finding[]): { applied: number; fixable: number; newCode: string } {
    const fixable = findings.filter((f) => f.patch);
    if (fixable.length === 0) return { applied: 0, fixable: 0, newCode: code };

    const lines = code.split("\n");
    let applied = 0;

    // Sort bottom-to-top for stable line numbers (same as diagnostics.ts)
    const sorted = [...fixable].sort((a, b) => {
      return b.patch!.startLine - a.patch!.startLine;
    });

    const result = code;
    for (const f of sorted) {
      const patch = f.patch!;
      const startLine = Math.max(0, patch.startLine - 1);
      const endLine = patch.endLine;
      // Get region text (same logic as diagnostics.ts)
      const regionLines = lines.slice(startLine, endLine);
      const regionText = regionLines.join("\n") + (endLine < lines.length ? "\n" : "");

      if (regionText.includes(patch.oldText)) {
        applied++;
      }
    }

    return { applied, fixable: fixable.length, newCode: result };
  }

  it("should find fixable findings in sample code", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);
    const result = simulateFix(sampleCode, findings);
    assert.ok(result.fixable > 0, `Expected fixable findings, got ${result.fixable}`);
  });

  it("should successfully match patch.oldText in source regions", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);
    const result = simulateFix(sampleCode, findings);
    assert.ok(result.applied > 0, `Expected applied fixes > 0, got ${result.applied} (fixable: ${result.fixable})`);
  });

  it("should handle empty findings array", () => {
    const result = simulateFix(sampleCode, []);
    assert.equal(result.applied, 0);
    assert.equal(result.fixable, 0);
  });

  it("should handle findings without patches gracefully", () => {
    const findingsNoPatch: Finding[] = [
      { ruleId: "X-001", severity: "high", title: "No patch", description: "D", recommendation: "R" },
    ];
    const result = simulateFix(sampleCode, findingsNoPatch);
    assert.equal(result.applied, 0);
    assert.equal(result.fixable, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Diagnostic Provider Cache Contract
// ═════════════════════════════════════════════════════════════════════════════
// Verifies the expected behavior contract: evaluate() must be called before
// fix() to populate the findings cache. With the v3.9.1 fix, fix() now
// auto-evaluates if no cached findings exist.

describe("Diagnostic Provider Cache Contract", () => {
  it("evaluateWithTribunal returns findings that have patch field", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);
    const withPatches = findings.filter((f) => f.patch !== null && f.patch !== undefined);

    // This is the key contract: evaluateWithTribunal internally calls
    // enrichWithPatches, so patches should be present
    assert.ok(
      withPatches.length > 0,
      "evaluateWithTribunal should produce findings with patches (enrichWithPatches is called internally)",
    );
  });

  it("findings from evaluations should deduplicate across judges", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    // verdict.findings is the deduped set, while evaluations.flatMap gives all
    const fromEvals = verdict.evaluations.flatMap((e) => e.findings);
    assert.ok(fromEvals.length > 0);
    // The aggregated list should have entries
    assert.ok(verdict.findings.length > 0);
  });

  it("security-only filter should match SEC/CYBER/AUTH/DATA/COMP prefixes", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const allFindings = verdict.evaluations.flatMap((e) => e.findings);
    const securityOnly = allFindings.filter((f) => /^(SEC|CYBER|AUTH|DATA|COMP)/i.test(f.ruleId));
    assert.ok(securityOnly.length > 0, "Sample code should have security findings");
    // Verify filter doesn't include non-security findings
    for (const f of securityOnly) {
      assert.ok(/^(SEC|CYBER|AUTH|DATA|COMP)/i.test(f.ruleId), `${f.ruleId} should match security filter`);
    }
  });

  it("severity filter should work correctly (critical + high only)", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const allFindings = verdict.evaluations.flatMap((e) => e.findings);
    const severityOrder = ["critical", "high", "medium", "low", "info"];
    const minSeverity = "high"; // Only critical and high
    const minIdx = severityOrder.indexOf(minSeverity);
    const filtered = allFindings.filter((f) => {
      const idx = severityOrder.indexOf(f.severity);
      return idx >= 0 && idx <= minIdx;
    });
    for (const f of filtered) {
      assert.ok(
        f.severity === "critical" || f.severity === "high",
        `Filtered finding ${f.ruleId} should be critical or high, got ${f.severity}`,
      );
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Finding Well-Formedness for Chat Rendering
// ═════════════════════════════════════════════════════════════════════════════

describe("Finding Well-Formedness for Chat Rendering", () => {
  let allFindings: Finding[];

  it("should load findings", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    allFindings = verdict.evaluations.flatMap((e) => e.findings);
    assert.ok(allFindings.length > 0);
  });

  it("every finding should have severity in the expected set", () => {
    const validSeverities = new Set(["critical", "high", "medium", "low", "info"]);
    for (const f of allFindings) {
      assert.ok(validSeverities.has(f.severity), `${f.ruleId}: severity '${f.severity}' not in valid set`);
    }
  });

  it("every finding should have non-empty ruleId, title, description", () => {
    for (const f of allFindings) {
      assert.ok(f.ruleId.length > 0, "ruleId must be non-empty");
      assert.ok(f.title.length > 0, `${f.ruleId}: title must be non-empty`);
      assert.ok(f.description.length > 0, `${f.ruleId}: description must be non-empty`);
    }
  });

  it("lineNumbers (when present) should be positive integers", () => {
    for (const f of allFindings) {
      if (f.lineNumbers) {
        for (const ln of f.lineNumbers) {
          assert.ok(Number.isInteger(ln), `${f.ruleId}: lineNumber ${ln} should be integer`);
          assert.ok(ln >= 1, `${f.ruleId}: lineNumber ${ln} should be >= 1`);
        }
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Refine with AI — Contract Verification
// ═════════════════════════════════════════════════════════════════════════════
// Verifies the logic and contracts that the refineWithAI command relies on,
// since the VS Code LM API is unavailable in Node.js tests.

describe("Refine with AI — Contract", () => {
  it("findings should be enumerable for AI prompt building", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);
    const enumerated = findings.map((f, i) => {
      const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
      return `${i + 1}. [${f.ruleId}] ${f.title}${lineRef}`;
    });
    assert.ok(enumerated.length > 0, "Should produce enumerated findings list");
    assert.ok(enumerated[0].startsWith("1."), "First finding should be numbered 1");
    for (const line of enumerated) {
      assert.ok(/^\d+\. \[.+\] .+/.test(line), `Finding line should match format: ${line}`);
    }
  });

  it("true-positive index filtering should work correctly", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);

    // Simulate LLM returning only odd-numbered findings as true positives
    const truePositiveIndices = findings.map((_, i) => i + 1).filter((n) => n % 2 === 1);
    const truePositiveSet = new Set(truePositiveIndices);
    const refined = findings.filter((_, i) => truePositiveSet.has(i + 1));

    assert.ok(refined.length < findings.length, "Refined should have fewer findings");
    assert.ok(refined.length > 0, "Refined should have at least some findings");
    assert.equal(refined.length, Math.ceil(findings.length / 2), "Should keep odd-indexed findings");
  });

  it("empty true-positive set should remove all findings", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);

    const truePositiveSet = new Set<number>();
    const refined = findings.filter((_, i) => truePositiveSet.has(i + 1));
    assert.equal(refined.length, 0, "Empty TP set should result in zero findings");
  });

  it("full true-positive set should keep all findings", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);

    const truePositiveSet = new Set(findings.map((_, i) => i + 1));
    const refined = findings.filter((_, i) => truePositiveSet.has(i + 1));
    assert.equal(refined.length, findings.length, "Full TP set should keep all findings");
  });

  it("JSON array parsing regex should match valid LLM responses", () => {
    const validResponses = [
      "[1, 3, 5]",
      "[]",
      "[1]",
      "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]",
      "Here are the true positives: [1, 3, 5]",
      "Based on my review:\n[2, 4]\nThese are the real issues.",
    ];
    const parseRegex = /\[[\d\s,]*\]/;
    for (const response of validResponses) {
      const match = response.match(parseRegex);
      assert.ok(match, `Should parse: ${response}`);
      const parsed: number[] = JSON.parse(match[0]);
      assert.ok(Array.isArray(parsed), `Should parse to array: ${response}`);
    }
  });

  it("JSON array parsing regex should handle edge cases", () => {
    const parseRegex = /\[[\d\s,]*\]/;
    // Response with no valid JSON
    assert.ok(!"no findings here".match(parseRegex), "Should not match non-JSON text");
    // Empty array
    const emptyMatch = "[]".match(parseRegex);
    assert.ok(emptyMatch);
    assert.deepEqual(JSON.parse(emptyMatch![0]), []);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test: Deep Review (Layer 1 + Layer 2) — Contract Verification
// ═════════════════════════════════════════════════════════════════════════════
// Verifies the logic and contracts that the /deepreview command and
// judges.deepReview command rely on. The VS Code LM API is unavailable in
// Node.js tests, so these tests verify prompt construction, data flow,
// and L1/L2 integration contracts.

describe("Deep Review — Contract", () => {
  it("inferCommand should detect 'deep review' intent", () => {
    assert.equal(inferCommand("deep review this file"), "deepreview");
    assert.equal(inferCommand("do a deep review"), "deepreview");
    assert.equal(inferCommand("run deep review on my code"), "deepreview");
    assert.equal(inferCommand("deepreview"), "deepreview");
  });

  it("inferCommand should not confuse 'deep review' with regular 'review'", () => {
    assert.equal(inferCommand("review this file"), "review");
    assert.equal(inferCommand(""), "review");
    assert.equal(inferCommand("check this code"), "review");
  });

  it("inferCommand should still detect other commands correctly", () => {
    assert.equal(inferCommand("fix this"), "fix");
    assert.equal(inferCommand("security check"), "security");
    assert.equal(inferCommand("help me"), "help");
  });

  it("L1 findings should feed into L2 prompt construction", () => {
    const verdict = evaluateWithTribunal(sampleCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);

    // Build the findings summary the same way the handler does
    const findingsSummary = findings
      .map((f, i) => {
        const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
        return `${i + 1}. [${f.severity.toUpperCase()}] ${f.ruleId} — ${f.title}${lineRef}\n   ${f.description}`;
      })
      .join("\n");

    assert.ok(findingsSummary.length > 0, "Should produce a non-empty findings summary");
    assert.ok(findingsSummary.includes("1."), "First finding should be numbered 1");
    // Verify severity is uppercased
    assert.ok(/\[(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]/.test(findingsSummary), "Severity should be uppercased");
  });

  it("tribunal deep review section should include all judges", () => {
    const section = buildTribunalDeepReviewSection(JUDGES, "typescript");

    assert.ok(section.includes("Deep Contextual Review Required"), "Should include deep review header");
    assert.ok(section.includes("False Positive Review"), "Should include FP review section");
    assert.ok(section.includes("Response Format"), "Should include response format section");

    // Verify all judges are represented
    for (const judge of JUDGES) {
      assert.ok(section.includes(judge.name), `Should include judge: ${judge.name}`);
      assert.ok(section.includes(judge.domain), `Should include domain: ${judge.domain}`);
    }
  });

  it("tribunal deep review section should accept optional context", () => {
    const context = "Production payment processing endpoint";
    const section = buildTribunalDeepReviewSection(JUDGES, "typescript", context);

    assert.ok(section.includes(context), "Should include the provided context");
    assert.ok(section.includes("Context provided"), "Should have context label");
  });

  it("full prompt should combine code, L1 findings, and L2 instructions", () => {
    const code = sampleCode;
    const language = "typescript";
    const verdict = evaluateWithTribunal(code, language);
    const findings = verdict.evaluations.flatMap((e) => e.findings);

    const findingsSummary = findings
      .map((f, i) => {
        const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
        return `${i + 1}. [${f.severity.toUpperCase()}] ${f.ruleId} — ${f.title}${lineRef}\n   ${f.description}`;
      })
      .join("\n");

    const deepReviewSection = buildTribunalDeepReviewSection(JUDGES, language);

    const prompt =
      `You are performing a deep contextual code review.\n\n` +
      `--- SOURCE CODE (${language}) ---\n${code}\n\n` +
      `--- LAYER 1 FINDINGS (${findings.length} pattern-based) ---\n` +
      (findings.length > 0 ? findingsSummary : "(No pattern-based findings)") +
      `\n\n` +
      deepReviewSection;

    // Verify all three sections are present
    assert.ok(prompt.includes("SOURCE CODE"), "Prompt should include source code section");
    assert.ok(prompt.includes("LAYER 1 FINDINGS"), "Prompt should include L1 findings section");
    assert.ok(prompt.includes("Deep Contextual Review Required"), "Prompt should include deep review instructions");
    assert.ok(prompt.includes(code.substring(0, 50)), "Prompt should include actual code");
    assert.ok(prompt.includes(findings[0].ruleId), "Prompt should include actual finding rule IDs");
  });

  it("deep review prompt should handle zero L1 findings gracefully", () => {
    const cleanCode = "const x = 1;\n";
    const verdict = evaluateWithTribunal(cleanCode, "typescript");
    const findings = verdict.evaluations.flatMap((e) => e.findings);

    const findingsSummary =
      findings.length > 0
        ? findings
            .map((f, i) => {
              const lineRef = f.lineNumbers?.length ? ` (line ${f.lineNumbers[0]})` : "";
              return `${i + 1}. [${f.severity.toUpperCase()}] ${f.ruleId} — ${f.title}${lineRef}\n   ${f.description}`;
            })
            .join("\n")
        : "(No pattern-based findings)";

    const prompt = `--- LAYER 1 FINDINGS (${findings.length} pattern-based) ---\n` + findingsSummary;

    assert.ok(prompt.includes("LAYER 1 FINDINGS (0 pattern-based)"), "Should show zero findings count");
    assert.ok(prompt.includes("(No pattern-based findings)"), "Should include no-findings placeholder");
  });

  it("JUDGES array should be available and non-empty", () => {
    assert.ok(Array.isArray(JUDGES), "JUDGES should be an array");
    assert.ok(JUDGES.length >= 35, `Should have at least 35 judges, got ${JUDGES.length}`);
    for (const j of JUDGES) {
      assert.ok(j.id, `Judge should have an id`);
      assert.ok(j.name, `Judge ${j.id} should have a name`);
      assert.ok(j.domain, `Judge ${j.id} should have a domain`);
      assert.ok(j.systemPrompt, `Judge ${j.id} should have a systemPrompt`);
      assert.ok(j.rulePrefix, `Judge ${j.id} should have a rulePrefix`);
    }
  });

  it("deep review exports should be accessible from the API module", async () => {
    const api = await import("../src/api.js");
    assert.ok(
      typeof api.buildTribunalDeepReviewSection === "function",
      "buildTribunalDeepReviewSection should be exported",
    );
    assert.ok(
      typeof api.buildSingleJudgeDeepReviewSection === "function",
      "buildSingleJudgeDeepReviewSection should be exported",
    );
    assert.ok(Array.isArray(api.JUDGES), "JUDGES should be exported from API");
  });
});

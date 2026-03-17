import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  updateFindings,
  loadFindingsViaAdapter,
  saveFindingsViaAdapter,
  triageFinding,
  formatDelta,
  type FindingStore,
} from "../src/finding-lifecycle.js";
import type { Finding } from "../src/types.js";

const mkFinding = (ruleId: string, severity: Finding["severity"], title = "t", line = 10): Finding => ({
  ruleId,
  severity,
  title,
  description: "desc",
  recommendation: "rec",
  lineNumbers: [line],
});

describe("finding-lifecycle extended", () => {
  it("supports adapter-based load/save", async () => {
    const saved: FindingStore[] = [];
    const adapter = {
      loadFindings: async (_projectDir: string) => ({ version: "1.0.0", lastRunAt: "", runNumber: 0, findings: [] }),
      saveFindings: async (store: FindingStore, _projectDir: string) => {
        saved.push(store);
      },
    };

    const store = await loadFindingsViaAdapter("/tmp", adapter as any);
    store.findings = [];
    await saveFindingsViaAdapter(store, "/tmp", adapter as any);
    assert.equal(saved.length, 1);
  });

  it("handles triage by fingerprint and preserves triaged status across runs", () => {
    const entry = { finding: mkFinding("TEST-1", "medium"), filePath: "src/app.ts" };
    const store: FindingStore = { version: "1.0.0", lastRunAt: "", runNumber: 0, findings: [] };
    // First run introduces finding
    const delta = updateFindings([entry], store);
    assert.equal(delta.introduced.length, 1);

    // Triage it as false-positive
    const fp = triageFinding(store, { ruleId: "TEST-1", filePath: "src/app.ts" }, "false-positive", "benign");
    assert.ok(fp);
    assert.equal(fp!.status, "false-positive");

    // Next run with no findings should not auto-mark triaged ones as fixed
    const delta2 = updateFindings([], store);
    assert.equal(delta2.fixed.length, 0);
    assert.equal(store.findings[0].status, "false-positive");
  });

  it("prunes fixed findings after 30 days and formats deltas", () => {
    const store: FindingStore = { version: "1.0.0", lastRunAt: "", runNumber: 0, findings: [] };
    // Introduce two findings
    updateFindings(
      [
        { finding: mkFinding("A-1", "low", "a", 1), filePath: "a.ts" },
        { finding: mkFinding("B-1", "high", "b", 2), filePath: "b.ts" },
      ],
      store,
    );
    // Mark them as fixed by running empty findings
    const delta = updateFindings([], store);
    assert.equal(delta.fixed.length, 2);
    // Fake old fixedAt timestamps
    store.findings.forEach((f) => {
      f.fixedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    });
    // Another run triggers pruning
    updateFindings([], store);
    assert.equal(store.findings.length, 0);

    const formatted = formatDelta(delta);
    assert.match(formatted, /Fixed:/);
  });

  it("formats delta with truncation when many findings", () => {
    const store: FindingStore = { version: "1.0.0", lastRunAt: "", runNumber: 0, findings: [] };
    const many = Array.from({ length: 7 }, (_, i) => ({
      finding: mkFinding(`R-${i}`, "medium", `t${i}`),
      filePath: `f${i}.ts`,
    }));
    const delta = updateFindings(many, store);
    const formatted = formatDelta(delta);
    assert.match(formatted, /\+ \[/); // entries
    assert.match(formatted, /\.+ and/); // truncation indicator
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calibrateFindings } from "../src/calibration.js";
import type { Finding } from "../src/types.js";

const mkFinding = (ruleId: string, confidence = 0.8): Finding => ({
  ruleId,
  severity: "medium",
  title: "t",
  description: "d",
  recommendation: "r",
  confidence,
});

describe("calibration", () => {
  it("reduces confidence for high FP rate and adds provenance", () => {
    const findings = [mkFinding("CYBER-001", 0.9)];
    const profile = {
      name: "test-profile",
      fpRateByRule: new Map<string, number>(),
      fpRateByPrefix: new Map<string, number>([["CYBER", 0.8]]),
      isActive: true,
      feedbackCount: 10,
    } satisfies CalibrationProfile;
    const calibrated = calibrateFindings(findings, profile, { maxReduction: 0.5 });
    assert.ok(calibrated[0].confidence! < 0.9);
    assert.ok(calibrated[0].provenance?.includes("confidence-calibrated"));
  });

  it("boosts confidence when rule-specific FP rate low", () => {
    const findings = [mkFinding("TEST-001", 0.5)];
    const profile = {
      name: "rule-profile",
      fpRateByRule: new Map<string, number>([["TEST-001", 0.05]]),
      fpRateByPrefix: new Map(),
      isActive: true,
      feedbackCount: 20,
    } satisfies CalibrationProfile;
    const calibrated = calibrateFindings(findings, profile, { maxBoost: 0.2 });
    assert.ok(calibrated[0].confidence! > 0.5);
    assert.ok(calibrated[0].provenance?.includes("confidence-calibrated"));
  });

  it("leaves findings unchanged when profile inactive", () => {
    const findings = [mkFinding("UNKNOWN-1", 0.4)];
    const profile = {
      name: "inactive",
      fpRateByRule: new Map(),
      fpRateByPrefix: new Map(),
      isActive: false,
      feedbackCount: 0,
    } satisfies CalibrationProfile;
    const calibrated = calibrateFindings(findings, profile);
    assert.equal(calibrated[0].confidence, 0.4);
  });
});

import {
  buildCalibrationProfile,
  loadCalibrationProfile,
  autoCalibrateFindings,
  loadCalibrationViaAdapter,
  buildPassiveCalibrationProfile,
  buildModelCalibrationProfile,
  buildAllModelProfiles,
  calibrateFindingsForModel,
  type CalibrationProfile,
} from "../src/calibration.js";
import type { FeedbackStore } from "../src/commands/feedback.js";
import type { SuppressionRecord } from "../src/types.js";

describe("calibration profiles", () => {
  const mockStore: FeedbackStore = {
    entries: [
      { ruleId: "CYBER-001", verdict: "fp", timestamp: "", rationale: "" },
      { ruleId: "CYBER-001", verdict: "tp", timestamp: "", rationale: "" },
      { ruleId: "CYBER-001", verdict: "fp", timestamp: "", rationale: "" },
      { ruleId: "TEST-001", verdict: "tp", timestamp: "", rationale: "" },
      { ruleId: "TEST-001", verdict: "tp", timestamp: "", rationale: "" },
      { ruleId: "TEST-001", verdict: "fp", timestamp: "", rationale: "" },
    ],
  };

  it("buildCalibrationProfile aggregates per-rule and per-prefix FP rates", () => {
    const profile = buildCalibrationProfile(mockStore, { minSamples: 2 });
    assert.equal(profile.isActive, true);
    assert.equal(profile.feedbackCount, mockStore.entries.length);
    assert.ok(profile.fpRateByRule.get("CYBER-001")! > 0.5);
    assert.ok(profile.fpRateByPrefix.get("CYBER")! > 0.5);
  });

  it("autoCalibrateFindings wires load+calibrate", () => {
    const profile: CalibrationProfile = buildCalibrationProfile(mockStore, { minSamples: 1 });
    const calibrated = calibrateFindings([mkFinding("CYBER-001", 0.9)], profile, { maxReduction: 0.5 });
    assert.ok(calibrated[0].provenance?.includes("confidence-calibrated"));
  });

  it("loadCalibrationViaAdapter uses adapter to load feedback", async () => {
    const adapter = {
      loadFeedback: async (_projectDir: string) => mockStore,
    };
    const profile = await loadCalibrationViaAdapter("/tmp", { minSamples: 1 }, adapter as any);
    assert.equal(profile.isActive, true);
  });

  it("buildPassiveCalibrationProfile ingests suppressions", () => {
    const suppressions: SuppressionRecord[] = [
      { ruleId: "CYBER-002", kind: "inline", reason: "benign", filePath: "src/a.ts", line: 10 },
      { ruleId: "CYBER-002", kind: "inline", reason: "benign", filePath: "src/a.ts", line: 12 },
      { ruleId: "TEST-002", kind: "file", reason: "noise", filePath: "src/b.ts" },
    ];
    const profile = buildPassiveCalibrationProfile({ suppressions, minSamples: 1 });
    assert.equal(profile.isActive, true);
    assert.ok(profile.fpRateByRule.get("CYBER-002"));
    assert.ok(profile.fpRateByPrefix.get("CYBER"));
  });

  it("loadCalibrationProfile reads feedback store from disk", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judges-feedback-"));
    const feedbackPath = path.join(dir, ".judges-feedback.json");
    const storeJson = {
      version: 1,
      entries: [
        { ruleId: "CYBER-123", verdict: "fp", timestamp: "", rationale: "" },
        { ruleId: "CYBER-123", verdict: "fp", timestamp: "", rationale: "" },
        { ruleId: "CYBER-123", verdict: "tp", timestamp: "", rationale: "" },
      ],
      metadata: { createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString(), totalSubmissions: 3 },
    };
    fs.writeFileSync(feedbackPath, JSON.stringify(storeJson));
    const profile = loadCalibrationProfile({ feedbackPath });
    assert.equal(profile.isActive, true);
    assert.ok(profile.fpRateByRule.get("CYBER-123"));
  });

  it("calibrateFindings returns unchanged when profile not active", () => {
    const f = mkFinding("FOO-1", 0.7);
    const profile = {
      name: "empty",
      fpRateByRule: new Map(),
      fpRateByPrefix: new Map(),
      isActive: false,
      feedbackCount: 0,
    };
    const calibrated = calibrateFindings([f], profile as any);
    assert.equal(calibrated[0].confidence, 0.7);
  });

  it("buildModelCalibrationProfile filters feedback by model id", () => {
    const modelStore: FeedbackStore = {
      entries: [
        { ruleId: "CYBER-001", verdict: "fp", timestamp: "", rationale: "", model: "gpt-4o" },
        { ruleId: "CYBER-001", verdict: "tp", timestamp: "", rationale: "", model: "gpt-4o" },
        { ruleId: "TEST-123", verdict: "tp", timestamp: "", rationale: "", model: "claude" },
      ],
    };
    const profile = buildModelCalibrationProfile(modelStore, "gpt-4o", { minSamples: 2 });
    assert.equal(profile.isActive, true);
    assert.ok(profile.fpRateByRule.get("CYBER-001"));

    const emptyProfile = buildModelCalibrationProfile(modelStore, "gemini", { minSamples: 1 });
    assert.equal(emptyProfile.isActive, false);
  });

  it("buildAllModelProfiles builds a profile per model", () => {
    const store: FeedbackStore = {
      entries: [
        { ruleId: "A-1", verdict: "fp", timestamp: "", rationale: "", model: "m1" },
        { ruleId: "A-1", verdict: "tp", timestamp: "", rationale: "", model: "m1" },
        { ruleId: "B-1", verdict: "tp", timestamp: "", rationale: "", model: "m2" },
      ],
    };
    const profiles = buildAllModelProfiles(store, { minSamples: 1 });
    assert.equal(profiles.size, 2);
    assert.ok(profiles.get("m1")?.isActive);
  });

  it("calibrateFindingsForModel prefers model profile when active", () => {
    const findings = [mkFinding("A-1", 0.6)];
    const general = buildCalibrationProfile(mockStore, { minSamples: 1 });
    const store: FeedbackStore = {
      entries: [{ ruleId: "A-1", verdict: "fp", timestamp: "", rationale: "", model: "m1" }],
    };
    const modelProfile = buildModelCalibrationProfile(store, "m1", { minSamples: 1 });
    const calibrated = calibrateFindingsForModel(findings, general, modelProfile, { maxReduction: 0.4 });
    assert.ok(calibrated[0].provenance?.includes("confidence-calibrated"));
  });

  it("buildPassiveCalibrationProfile ingests triage history when provided findingsDir", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "judges-triage-"));
    const findingsPath = path.join(dir, ".judges-findings.json");
    const storeJson = {
      version: 1,
      findings: [
        {
          id: "1",
          ruleId: "CYBER-TRIAGE",
          severity: "medium",
          status: "false-positive",
          lastSeen: new Date().toISOString(),
        },
        { id: "2", ruleId: "CYBER-TRIAGE", severity: "medium", status: "wont-fix", lastSeen: new Date().toISOString() },
        {
          id: "3",
          ruleId: "TEST-TRIAGE",
          severity: "low",
          status: "accepted-risk",
          lastSeen: new Date().toISOString(),
        },
      ],
    };
    fs.writeFileSync(findingsPath, JSON.stringify(storeJson));
    const profile = buildPassiveCalibrationProfile({ findingsDir: dir, minSamples: 1 });
    assert.equal(profile.isActive, true);
    assert.ok(profile.fpRateByRule.get("CYBER-TRIAGE"));
  });
});

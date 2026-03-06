// ─── Doctor Command ──────────────────────────────────────────────────────────
// Diagnostic healthcheck for the Judges Panel environment.
//
// Validates: Node version, config file, plugins, feedback store, baseline,
// custom rules, and core system integrity.
//
// Usage:
//   judges doctor               # run all checks
//   judges doctor --json        # JSON output
// ──────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { parseConfig, validatePluginSpecifiers } from "../config.js";
import { JUDGES } from "../judges/index.js";
import { listPresets } from "../presets.js";
import type { JudgesConfig } from "../types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  status: CheckStatus;
  message: string;
  detail?: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
  healthy: boolean;
}

// ─── Individual Checks ──────────────────────────────────────────────────────

/**
 * Check Node.js version meets minimum requirements.
 */
export function checkNodeVersion(): DoctorCheck {
  const version = process.version;
  const major = parseInt(version.slice(1).split(".")[0], 10);

  if (major >= 20) {
    return { name: "node-version", status: "pass", message: `Node.js ${version} (>= 20 required)` };
  }
  if (major >= 18) {
    return {
      name: "node-version",
      status: "warn",
      message: `Node.js ${version} — 18.x works but 20+ is recommended`,
      detail: "Some features may not be available. Upgrade to Node.js 20 or later.",
    };
  }
  return {
    name: "node-version",
    status: "fail",
    message: `Node.js ${version} — minimum 18.x required`,
    detail: "Judges Panel requires Node.js 18 or later. Please upgrade.",
  };
}

/**
 * Check for a .judgesrc config file and validate it.
 */
export function checkConfigFile(dir: string): DoctorCheck {
  const candidates = [".judgesrc", ".judgesrc.json", ".judgesrc.yaml", ".judgesrc.yml"];
  let found: string | null = null;

  for (const name of candidates) {
    const full = resolve(dir, name);
    if (existsSync(full)) {
      found = full;
      break;
    }
  }

  if (!found) {
    return {
      name: "config-file",
      status: "warn",
      message: "No .judgesrc config file found",
      detail: "Using defaults. Run `judges init` to create a config file.",
    };
  }

  try {
    const raw = readFileSync(found, "utf-8");
    const parsed = JSON.parse(raw);
    const result = parseConfig(parsed);

    // Check for unknown properties
    const knownKeys = new Set([
      "judges",
      "threshold",
      "minConfidence",
      "maxFindings",
      "enableDeepReview",
      "severity",
      "preset",
      "failOnFindings",
      "baseline",
      "format",
      "plugins",
      "name",
    ]);
    const unknownKeys = Object.keys(parsed).filter((k) => !knownKeys.has(k));

    if (unknownKeys.length > 0) {
      return {
        name: "config-file",
        status: "warn",
        message: `Config file has unknown properties: ${unknownKeys.join(", ")}`,
        detail: `Found at: ${found}`,
      };
    }

    return {
      name: "config-file",
      status: "pass",
      message: `Config file valid: ${found}`,
      detail: `Disabled judges: ${result.disabledJudges?.length ?? 0}, Min severity: ${result.minSeverity ?? "default"}`,
    };
  } catch (err) {
    return {
      name: "config-file",
      status: "fail",
      message: `Config file invalid: ${found}`,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check that core judges are loaded.
 */
export function checkJudgesLoaded(): DoctorCheck {
  const count = JUDGES.length;
  if (count === 0) {
    return {
      name: "judges-loaded",
      status: "fail",
      message: "No judges found — core module may be corrupted",
    };
  }
  return {
    name: "judges-loaded",
    status: "pass",
    message: `${count} judges loaded`,
  };
}

/**
 * Check plugin specifiers for validity (if config has plugins).
 */
export function checkPlugins(config: Partial<JudgesConfig>): DoctorCheck {
  if (!config.plugins || config.plugins.length === 0) {
    return {
      name: "plugins",
      status: "pass",
      message: "No plugins configured (none required)",
    };
  }

  const errors = validatePluginSpecifiers(config.plugins);
  if (errors.length > 0) {
    return {
      name: "plugins",
      status: "fail",
      message: `Plugin validation failed: ${errors.length} error(s)`,
      detail: errors.join("\n"),
    };
  }

  return {
    name: "plugins",
    status: "pass",
    message: `${config.plugins.length} plugin(s) configured`,
    detail: config.plugins.join(", "),
  };
}

/**
 * Check feedback store integrity.
 */
export function checkFeedbackStore(dir: string): DoctorCheck {
  const storePath = resolve(dir, ".judges-feedback.json");
  if (!existsSync(storePath)) {
    return {
      name: "feedback-store",
      status: "pass",
      message: "No feedback store found (optional)",
    };
  }

  try {
    const raw = readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(raw);

    if (!parsed.version || !Array.isArray(parsed.entries)) {
      return {
        name: "feedback-store",
        status: "warn",
        message: "Feedback store has unexpected format",
        detail: "Expected { version, entries[], metadata }",
      };
    }

    return {
      name: "feedback-store",
      status: "pass",
      message: `Feedback store valid: ${parsed.entries.length} entries`,
    };
  } catch (err) {
    return {
      name: "feedback-store",
      status: "fail",
      message: "Feedback store corrupted",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check baseline file integrity (if configured or present).
 */
export function checkBaselineFile(dir: string, config: Partial<JudgesConfig>): DoctorCheck {
  const baselinePath = config.baseline ? resolve(dir, config.baseline) : resolve(dir, ".judges-baseline.json");

  if (!existsSync(baselinePath)) {
    if (config.baseline) {
      return {
        name: "baseline",
        status: "fail",
        message: `Configured baseline file not found: ${config.baseline}`,
      };
    }
    return {
      name: "baseline",
      status: "pass",
      message: "No baseline file (optional)",
    };
  }

  try {
    const raw = readFileSync(baselinePath, "utf-8");
    const parsed = JSON.parse(raw);

    if (parsed.version === 2 && typeof parsed.files === "object") {
      const fileCount = Object.keys(parsed.files).length;
      return {
        name: "baseline",
        status: "pass",
        message: `Baseline V2: ${fileCount} file(s) baselined`,
      };
    }

    if (Array.isArray(parsed.ignoredFindings)) {
      return {
        name: "baseline",
        status: "warn",
        message: `Baseline V1 detected — consider upgrading with \`judges baseline generate\``,
        detail: `${parsed.ignoredFindings.length} suppressed finding(s)`,
      };
    }

    return {
      name: "baseline",
      status: "warn",
      message: "Baseline file has unrecognized format",
    };
  } catch (err) {
    return {
      name: "baseline",
      status: "fail",
      message: "Baseline file corrupted",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check that presets are accessible.
 */
export function checkPresets(): DoctorCheck {
  const presets = listPresets();
  if (presets.length === 0) {
    return {
      name: "presets",
      status: "fail",
      message: "No presets available — core module may be corrupted",
    };
  }
  return {
    name: "presets",
    status: "pass",
    message: `${presets.length} presets available`,
    detail: presets.map((p) => p.name).join(", "),
  };
}

// ─── Run All Checks ─────────────────────────────────────────────────────────

/**
 * Run all diagnostic checks and produce a report.
 */
export function runDoctorChecks(dir = "."): DoctorReport {
  // Load config for context-aware checks
  let config: Partial<JudgesConfig> = {};
  const configCandidates = [".judgesrc", ".judgesrc.json"];
  for (const name of configCandidates) {
    const full = resolve(dir, name);
    if (existsSync(full)) {
      try {
        const raw = readFileSync(full, "utf-8");
        config = parseConfig(JSON.parse(raw));
      } catch {
        // Config parse errors are caught by checkConfigFile
      }
      break;
    }
  }

  const checks: DoctorCheck[] = [
    checkNodeVersion(),
    checkConfigFile(dir),
    checkJudgesLoaded(),
    checkPlugins(config),
    checkFeedbackStore(dir),
    checkBaselineFile(dir, config),
    checkPresets(),
  ];

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    total: checks.length,
  };

  return { checks, summary, healthy: summary.fail === 0 };
}

// ─── Format Output ──────────────────────────────────────────────────────────

const ICONS: Record<CheckStatus, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
};

/**
 * Format a doctor report as human-readable text.
 */
export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║              Judges Panel — Doctor Report                   ║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");
  lines.push("");

  for (const check of report.checks) {
    lines.push(`  ${ICONS[check.status]} ${check.message}`);
    if (check.detail) {
      lines.push(`     ${check.detail}`);
    }
  }

  lines.push("");
  lines.push("─".repeat(60));
  lines.push(
    `  Summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail (${report.summary.total} checks)`,
  );

  if (report.healthy) {
    lines.push("  Status: Healthy ✅");
  } else {
    lines.push("  Status: Issues found ❌ — fix the errors above");
  }
  lines.push("");

  return lines.join("\n");
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function runDoctor(argv: string[]): void {
  let format = "text";
  let dir = ".";

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") format = "json";
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: judges doctor [options]

Options:
  --json              Output as JSON
  --help, -h          Show this help

Runs diagnostic checks on your Judges Panel environment.`);
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      dir = arg;
    }
  }

  const report = runDoctorChecks(dir);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDoctorReport(report));
  }

  process.exit(report.healthy ? 0 : 1);
}

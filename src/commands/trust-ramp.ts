/**
 * `judges trust-ramp` — Generate a graduated trust configuration.
 *
 * Produces a phased .judgesrc progression that starts with advisory-only
 * (no CI gating) and ramps up to full enforcement over 30/60/90 days.
 * All data stays local — phases are encoded as config files you commit.
 *
 * Phases:
 *   1. Advisory    (days 0-30)  — high+critical only, no fail, baseline created
 *   2. Selective   (days 30-60) — medium+, fail on critical, auto-fix enabled
 *   3. Enforcing   (days 60-90) — all severities, fail on findings, score gate
 *   4. Full trust  (day 90+)    — strict preset, full gating, baseline removed
 */

import { writeFileSync } from "fs";
import { join, resolve } from "path";
import type { JudgesConfig, Severity } from "../types.js";

// ─── Phase Definitions ──────────────────────────────────────────────────────

export interface TrustPhase {
  /** Phase number (1-4) */
  phase: number;
  /** Human-readable name */
  name: string;
  /** Day range description */
  days: string;
  /** What this phase enables */
  description: string;
  /** The generated .judgesrc config */
  config: JudgesConfig;
  /** CI workflow snippet (optional) */
  ciTip: string;
}

function buildPhases(basePreset?: string): TrustPhase[] {
  return [
    {
      phase: 1,
      name: "Advisory",
      days: "Days 0–30",
      description:
        "Report only critical and high severity findings. No CI gating. " +
        "Creates a baseline of existing issues so new introductions are visible.",
      config: {
        ...(basePreset ? { preset: basePreset } : {}),
        minSeverity: "high" as Severity,
        failOnFindings: false,
      },
      ciTip: "# Phase 1: advisory only — do NOT add --fail-on-findings to CI",
    },
    {
      phase: 2,
      name: "Selective Enforcement",
      days: "Days 30–60",
      description:
        "Lower threshold to medium severity. Gate CI on critical findings only " +
        "via failOnScoreBelow. Auto-fix suggestions become available.",
      config: {
        ...(basePreset ? { preset: basePreset } : {}),
        minSeverity: "medium" as Severity,
        failOnFindings: false,
        failOnScoreBelow: 3,
      },
      ciTip: "# Phase 2: gate on score — blocks PRs scoring below 3/10",
    },
    {
      phase: 3,
      name: "Enforcing",
      days: "Days 60–90",
      description:
        "Report all severities. Fail on any findings. Score gate raised to 6. " +
        "Team should be comfortable with judges output by now.",
      config: {
        ...(basePreset ? { preset: basePreset } : {}),
        minSeverity: "low" as Severity,
        failOnFindings: true,
        failOnScoreBelow: 6,
      },
      ciTip: "# Phase 3: enforcing — PR merges blocked on findings or low score",
    },
    {
      phase: 4,
      name: "Full Trust",
      days: "Day 90+",
      description:
        "Strict mode with all judges and all severities. Full gating enabled. " +
        "Remove the baseline file — all findings are real.",
      config: {
        preset: "strict",
        failOnFindings: true,
        failOnScoreBelow: 7,
      },
      ciTip: "# Phase 4: full trust — judges is your primary reviewer",
    },
  ];
}

// ─── Output Formats ─────────────────────────────────────────────────────────

function formatPhasesText(phases: TrustPhase[]): string {
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════════════╗",
    "║            Judges — Graduated Trust Ramp Plan               ║",
    "╚══════════════════════════════════════════════════════════════╝",
    "",
  ];

  for (const p of phases) {
    lines.push(
      `── Phase ${p.phase}: ${p.name} (${p.days}) ${"─".repeat(Math.max(0, 40 - p.name.length - p.days.length))}`,
    );
    lines.push(`   ${p.description}`);
    lines.push("");
    lines.push("   .judgesrc:");
    lines.push(`   ${JSON.stringify(p.config, null, 2).replace(/\n/g, "\n   ")}`);
    lines.push("");
    lines.push(`   ${p.ciTip}`);
    lines.push("");
  }

  lines.push("── Getting Started ──────────────────────────────────────────");
  lines.push("   1. Run: judges trust-ramp --emit phase-1");
  lines.push("   2. Commit the generated .judgesrc to your repo");
  lines.push("   3. When ready to advance, run: judges trust-ramp --emit phase-2");
  lines.push("   4. Repeat until full trust is achieved");
  lines.push("");

  return lines.join("\n");
}

function formatPhasesJson(phases: TrustPhase[]): string {
  return JSON.stringify(
    phases.map((p) => ({
      phase: p.phase,
      name: p.name,
      days: p.days,
      description: p.description,
      config: p.config,
    })),
    null,
    2,
  );
}

// ─── Emit a Phase Config ─────────────────────────────────────────────────

function emitPhaseConfig(phase: TrustPhase, targetDir: string): string {
  const configPath = join(targetDir, ".judgesrc");
  const content = JSON.stringify(phase.config, null, 2);
  writeFileSync(configPath, content + "\n", "utf-8");
  return configPath;
}

// ─── CLI Entry ──────────────────────────────────────────────────────────────

export function runTrustRamp(argv: string[]): void {
  const args = parseArgs(argv);

  const phases = buildPhases(args.preset);

  if (args.emit) {
    const match = /^phase-?(\d)$/i.exec(args.emit);
    if (!match) {
      console.error(`Error: --emit expects "phase-1" through "phase-4", got "${args.emit}"`);
      process.exit(1);
    }
    const num = parseInt(match[1], 10);
    const phase = phases.find((p) => p.phase === num);
    if (!phase) {
      console.error(`Error: no phase ${num}. Valid: 1-4`);
      process.exit(1);
    }

    const dir = resolve(args.dir || ".");
    const path = emitPhaseConfig(phase, dir);
    console.log(`✔ Phase ${num} (${phase.name}) config written to ${path}`);
    console.log(`  ${phase.ciTip}`);
    return;
  }

  // Default: show the plan
  if (args.format === "json") {
    console.log(formatPhasesJson(phases));
  } else {
    console.log(formatPhasesText(phases));
  }
}

// ─── Arg Parsing ────────────────────────────────────────────────────────────

interface TrustRampArgs {
  emit?: string;
  preset?: string;
  format: "text" | "json";
  dir?: string;
}

function parseArgs(argv: string[]): TrustRampArgs {
  const result: TrustRampArgs = { format: "text" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--emit" && argv[i + 1]) {
      result.emit = argv[++i];
    } else if (arg === "--preset" && argv[i + 1]) {
      result.preset = argv[++i];
    } else if (arg === "--format" && argv[i + 1]) {
      const fmt = argv[++i];
      if (fmt === "json" || fmt === "text") result.format = fmt;
    } else if (arg === "--dir" && argv[i + 1]) {
      result.dir = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
judges trust-ramp — Generate a graduated trust configuration

Usage:
  judges trust-ramp                        Show the 4-phase ramp plan
  judges trust-ramp --format json          Output plan as JSON
  judges trust-ramp --emit phase-1         Write Phase 1 .judgesrc to cwd
  judges trust-ramp --emit phase-2 --dir . Write Phase 2 .judgesrc to dir
  judges trust-ramp --preset security-only Base phases on a preset

Options:
  --emit <phase>     Emit a phase config: phase-1, phase-2, phase-3, phase-4
  --preset <name>    Base the ramp on a named preset (e.g. security-only)
  --format <fmt>     Output format: text (default), json
  --dir <path>       Target directory for --emit (default: cwd)
  -h, --help         Show this help
`);
}

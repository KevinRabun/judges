/**
 * `judges calibration share` — Git-based calibration profile sharing.
 *
 * Export and import calibration profiles as JSON files that teams can
 * share via git repositories, submodules, or file copies — no server
 * or external data storage required.
 *
 * Usage:
 *   judges calibration-share export                 Export local profile
 *   judges calibration-share export -o team.json    Export to specific file
 *   judges calibration-share import team.json       Import a shared profile
 *   judges calibration-share merge a.json b.json    Merge multiple profiles
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, basename } from "path";
import { loadCalibrationProfile } from "../calibration.js";
import type { CalibrationProfile } from "../calibration.js";
// feedback store reserved for future weighted merge enhancements

// ─── Portable Calibration Profile ───────────────────────────────────────────

export interface PortableCalibrationProfile {
  /** Format version */
  version: "1.0";
  /** Profile name */
  name: string;
  /** When this profile was exported */
  exportedAt: string;
  /** Source description (e.g. team name, project) */
  source?: string;
  /** Number of feedback entries that produced this profile */
  feedbackCount: number;
  /** FP rates by rule ID */
  fpRateByRule: Record<string, number>;
  /** FP rates by rule prefix (judge-level) */
  fpRateByPrefix: Record<string, number>;
}

// ─── Export ─────────────────────────────────────────────────────────────────

function exportProfile(outputPath: string, source?: string): void {
  const profile = loadCalibrationProfile();

  if (!profile.isActive) {
    console.error("Error: No calibration data available. Run `judges feedback` to provide feedback first.");
    process.exit(1);
  }

  const portable: PortableCalibrationProfile = {
    version: "1.0",
    name: profile.name,
    exportedAt: new Date().toISOString(),
    source: source ?? "local",
    feedbackCount: profile.feedbackCount,
    fpRateByRule: Object.fromEntries(profile.fpRateByRule),
    fpRateByPrefix: Object.fromEntries(profile.fpRateByPrefix),
  };

  writeFileSync(outputPath, JSON.stringify(portable, null, 2) + "\n", "utf-8");
  console.log(`✔ Calibration profile exported to ${outputPath}`);
  console.log(`  ${profile.fpRateByRule.size} rule-level rates, ${profile.fpRateByPrefix.size} judge-level rates`);
  console.log(`  Based on ${profile.feedbackCount} feedback entries`);
  console.log("");
  console.log("Share this file via git (commit it to your repo) or copy it to teammates.");
  console.log("Import with: judges calibration-share import " + basename(outputPath));
}

// ─── Import ─────────────────────────────────────────────────────────────────

function loadPortable(filePath: string): PortableCalibrationProfile {
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    if (!raw.version || !raw.fpRateByRule) {
      console.error("Error: Invalid calibration profile format");
      process.exit(1);
    }
    return raw as PortableCalibrationProfile;
  } catch {
    console.error(`Error: Failed to parse ${filePath}`);
    process.exit(1);
  }
}

function portableToProfile(p: PortableCalibrationProfile): CalibrationProfile {
  return {
    name: p.name,
    fpRateByRule: new Map(Object.entries(p.fpRateByRule)),
    fpRateByPrefix: new Map(Object.entries(p.fpRateByPrefix)),
    isActive: Object.keys(p.fpRateByRule).length > 0 || Object.keys(p.fpRateByPrefix).length > 0,
    feedbackCount: p.feedbackCount,
  };
}

function importProfile(filePath: string): void {
  const portable = loadPortable(filePath);
  const profile = portableToProfile(portable);

  // Write as the local calibration overlay file
  const outputPath = resolve(".judges-calibration.json");
  writeFileSync(outputPath, JSON.stringify(portable, null, 2) + "\n", "utf-8");

  console.log(`✔ Imported calibration profile from ${basename(filePath)}`);
  console.log(`  Source: ${portable.source ?? "unknown"}`);
  console.log(`  Rules: ${profile.fpRateByRule.size}, Judges: ${profile.fpRateByPrefix.size}`);
  console.log(`  Based on ${portable.feedbackCount} feedback entries`);
  console.log(`  Saved to ${outputPath}`);
}

// ─── Merge ──────────────────────────────────────────────────────────────────

function mergeProfiles(files: string[], outputPath: string): void {
  if (files.length < 2) {
    console.error("Error: merge requires at least 2 profile files");
    process.exit(1);
  }

  const profiles = files.map(loadPortable);
  const mergedRules = new Map<string, { sum: number; count: number }>();
  const mergedPrefixes = new Map<string, { sum: number; count: number }>();
  let totalFeedback = 0;

  for (const p of profiles) {
    totalFeedback += p.feedbackCount;
    for (const [rule, rate] of Object.entries(p.fpRateByRule)) {
      const existing = mergedRules.get(rule) ?? { sum: 0, count: 0 };
      // Weight by feedback count for weighted average
      existing.sum += rate * p.feedbackCount;
      existing.count += p.feedbackCount;
      mergedRules.set(rule, existing);
    }
    for (const [prefix, rate] of Object.entries(p.fpRateByPrefix)) {
      const existing = mergedPrefixes.get(prefix) ?? { sum: 0, count: 0 };
      existing.sum += rate * p.feedbackCount;
      existing.count += p.feedbackCount;
      mergedPrefixes.set(prefix, existing);
    }
  }

  const merged: PortableCalibrationProfile = {
    version: "1.0",
    name: "merged-team-calibration",
    exportedAt: new Date().toISOString(),
    source: `merged from ${profiles.length} profiles`,
    feedbackCount: totalFeedback,
    fpRateByRule: Object.fromEntries(
      [...mergedRules.entries()].map(([k, v]) => [k, v.count > 0 ? v.sum / v.count : 0]),
    ),
    fpRateByPrefix: Object.fromEntries(
      [...mergedPrefixes.entries()].map(([k, v]) => [k, v.count > 0 ? v.sum / v.count : 0]),
    ),
  };

  writeFileSync(outputPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  console.log(`✔ Merged ${profiles.length} calibration profiles`);
  console.log(`  Total feedback entries: ${totalFeedback}`);
  console.log(`  Rules: ${mergedRules.size}, Judges: ${mergedPrefixes.size}`);
  console.log(`  Output: ${outputPath}`);
}

// ─── CLI Entry ──────────────────────────────────────────────────────────────

export function runCalibrationShare(argv: string[]): void {
  const subcommand = argv.find((a) => !a.startsWith("-") && a !== "calibration-share");
  let outputPath = "judges-calibration-profile.json";

  // Parse flags
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "-o" || argv[i] === "--output") && argv[i + 1]) {
      outputPath = argv[++i];
    }
    if (argv[i] === "--help" || argv[i] === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (subcommand === "export") {
    const source = argv.find((a, i) => argv[i - 1] === "--source");
    exportProfile(resolve(outputPath), source);
  } else if (subcommand === "import") {
    const file = argv.find((a) => !a.startsWith("-") && a !== "calibration-share" && a !== "import");
    if (!file) {
      console.error("Error: import requires a file path. Usage: judges calibration-share import <file>");
      process.exit(1);
    }
    importProfile(resolve(file));
  } else if (subcommand === "merge") {
    const files = argv.filter((a) => !a.startsWith("-") && a !== "calibration-share" && a !== "merge");
    mergeProfiles(
      files.map((f) => resolve(f)),
      resolve(outputPath),
    );
  } else {
    printHelp();
  }
}

function printHelp(): void {
  console.log(`
judges calibration-share — Git-based calibration profile sharing

Usage:
  judges calibration-share export                     Export local calibration profile
  judges calibration-share export -o team.json        Export to specific file
  judges calibration-share export --source "my-team"  Tag with source name
  judges calibration-share import team-profile.json   Import a shared profile
  judges calibration-share merge a.json b.json        Merge multiple profiles
  judges calibration-share merge a.json b.json -o m.json

Workflow for teams:
  1. Each developer runs: judges calibration-share export -o my-profile.json
  2. Commit profiles to a shared git repo or directory
  3. Merge all: judges calibration-share merge profiles/*.json -o team-calibration.json
  4. Each developer imports: judges calibration-share import team-calibration.json
  5. The imported profile adjusts confidence scores during evaluation

All data stays local — profiles are plain JSON files shared via git.

Options:
  -o, --output <file>     Output file path (default: judges-calibration-profile.json)
  --source <name>         Tag the exported profile with a source name
  -h, --help              Show this help
`);
}

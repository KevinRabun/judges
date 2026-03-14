/**
 * Review-profile — Per-developer review preferences stored locally.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReviewProfile {
  version: string;
  name: string;
  preferences: {
    minSeverity: string;
    focusAreas: string[];
    ignoredRules: string[];
    outputFormat: string;
    verbosity: string;
    autoFix: boolean;
    showRecommendations: boolean;
  };
  history: {
    totalReviews: number;
    lastReview: string | null;
    favoriteJudges: string[];
  };
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const PROFILE_DIR = join(".judges", "profiles");

function defaultProfile(name: string): ReviewProfile {
  return {
    version: "1.0.0",
    name,
    preferences: {
      minSeverity: "low",
      focusAreas: ["security", "reliability", "performance"],
      ignoredRules: [],
      outputFormat: "text",
      verbosity: "normal",
      autoFix: false,
      showRecommendations: true,
    },
    history: {
      totalReviews: 0,
      lastReview: null,
      favoriteJudges: [],
    },
  };
}

function profilePath(name: string): string {
  return join(PROFILE_DIR, `${name}.json`);
}

function loadProfile(name: string): ReviewProfile | null {
  const p = profilePath(name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as ReviewProfile;
  } catch {
    return null;
  }
}

function saveProfile(profile: ReviewProfile): void {
  const p = profilePath(profile.name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(profile, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewProfile(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-profile — Per-developer review preferences

Usage:
  judges review-profile init --name alice          Create profile
  judges review-profile show --name alice          Show profile
  judges review-profile set --name alice --key minSeverity --value medium
  judges review-profile list                       List all profiles
  judges review-profile --format json              JSON output

Subcommands:
  init                Create a new developer profile
  show                Display a profile
  set                 Update a profile preference
  list                List all profiles

Options:
  --name <name>       Profile name (required for init/show/set)
  --key <key>         Preference key to set
  --value <value>     Preference value
  --format json       JSON output
  --help, -h          Show this help

Profiles store per-developer preferences locally in .judges/profiles/.
Each developer can customize severity thresholds, focus areas, output
format, and more without affecting team defaults.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");
  const key = argv.find((_a: string, i: number) => argv[i - 1] === "--key");
  const value = argv.find((_a: string, i: number) => argv[i - 1] === "--value");
  const subcommand = argv.find((a) => ["init", "show", "set", "list"].includes(a)) || "show";

  if (subcommand === "list") {
    if (!existsSync(PROFILE_DIR)) {
      console.log("No profiles found. Create one with: judges review-profile init --name <name>");
      return;
    }
    const files = readdirSync(PROFILE_DIR) as unknown as string[];
    const profiles = files.filter((f: string) => f.endsWith(".json")).map((f: string) => f.replace(".json", ""));

    if (format === "json") {
      console.log(JSON.stringify({ profiles }, null, 2));
      return;
    }

    console.log(`\n  Developer Profiles (${profiles.length})\n  ─────────────────────────────`);
    for (const p of profiles) {
      const prof = loadProfile(p);
      console.log(`    👤 ${p} — focus: ${prof?.preferences.focusAreas.join(", ") || "default"}`);
    }
    console.log();
    return;
  }

  if (!name) {
    console.error("Error: --name is required.");
    process.exitCode = 1;
    return;
  }

  if (subcommand === "init") {
    if (loadProfile(name)) {
      console.error(`Error: Profile '${name}' already exists.`);
      process.exitCode = 1;
      return;
    }
    const profile = defaultProfile(name);
    saveProfile(profile);
    console.log(`Created profile '${name}' in ${profilePath(name)}.`);
    return;
  }

  const profile = loadProfile(name);
  if (!profile) {
    console.error(`Error: Profile '${name}' not found. Run: judges review-profile init --name ${name}`);
    process.exitCode = 1;
    return;
  }

  if (subcommand === "set") {
    if (!key || !value) {
      console.error("Error: --key and --value are required for set.");
      process.exitCode = 1;
      return;
    }

    const prefs = profile.preferences as Record<string, unknown>;
    if (!(key in prefs)) {
      console.error(`Error: Unknown preference key '${key}'. Valid keys: ${Object.keys(prefs).join(", ")}`);
      process.exitCode = 1;
      return;
    }

    if (key === "focusAreas" || key === "ignoredRules") {
      prefs[key] = value.split(",").map((v) => v.trim());
    } else if (key === "autoFix" || key === "showRecommendations") {
      prefs[key] = value === "true";
    } else {
      prefs[key] = value;
    }

    saveProfile(profile);
    console.log(`Updated ${name}.${key} = ${JSON.stringify(prefs[key])}`);
    return;
  }

  // Show
  if (format === "json") {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  console.log(`\n  Profile: ${profile.name}\n  ─────────────────────────────`);
  console.log(`    Min severity: ${profile.preferences.minSeverity}`);
  console.log(`    Focus areas: ${profile.preferences.focusAreas.join(", ")}`);
  console.log(`    Output format: ${profile.preferences.outputFormat}`);
  console.log(`    Verbosity: ${profile.preferences.verbosity}`);
  console.log(`    Auto-fix: ${profile.preferences.autoFix}`);
  console.log(`    Show recommendations: ${profile.preferences.showRecommendations}`);
  if (profile.preferences.ignoredRules.length > 0) {
    console.log(`    Ignored rules: ${profile.preferences.ignoredRules.join(", ")}`);
  }
  console.log(`\n    Reviews: ${profile.history.totalReviews}`);
  console.log(`    Last review: ${profile.history.lastReview || "never"}`);
  console.log();
}

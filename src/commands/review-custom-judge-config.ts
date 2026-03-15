/**
 * Review-custom-judge-config — Configure custom judge settings per project.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustomJudgeEntry {
  judgeId: string;
  enabled: boolean;
  weight: number;
  customRules: Record<string, string>;
}

interface CustomJudgeStore {
  judges: CustomJudgeEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCustomJudgeConfig(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-custom-config.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const initMode = argv.includes("--init");
  const enableIdx = argv.indexOf("--enable");
  const enableId = enableIdx >= 0 ? argv[enableIdx + 1] : "";
  const disableIdx = argv.indexOf("--disable");
  const disableId = disableIdx >= 0 ? argv[disableIdx + 1] : "";
  const weightIdx = argv.indexOf("--weight");
  const weightVal = weightIdx >= 0 ? parseFloat(argv[weightIdx + 1]) : NaN;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-custom-judge-config — Configure custom judge settings

Usage:
  judges review-custom-judge-config [--store <path>] [--format table|json]
  judges review-custom-judge-config --init [--store <path>]
  judges review-custom-judge-config --enable <judgeId> [--weight <n>] [--store <path>]
  judges review-custom-judge-config --disable <judgeId> [--store <path>]

Options:
  --store <path>     Config store (default: .judges-custom-config.json)
  --init             Create default config from registered judges
  --enable <id>      Enable a judge
  --disable <id>     Disable a judge
  --weight <n>       Set judge weight (0.0-2.0)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (initMode) {
    const judges = defaultRegistry.getJudges();
    const entries: CustomJudgeEntry[] = judges.map((j) => ({
      judgeId: j.id,
      enabled: true,
      weight: 1.0,
      customRules: {},
    }));
    const store: CustomJudgeStore = { judges: entries, lastUpdated: new Date().toISOString() };
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Created custom judge config with ${entries.length} judges: ${storePath}`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No custom judge config found at: ${storePath}`);
    console.log("Run with --init to create one.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as CustomJudgeStore;

  if (enableId) {
    const entry = store.judges.find((j) => j.judgeId === enableId);
    if (!entry) {
      console.error(`Judge not found in config: ${enableId}`);
      process.exitCode = 1;
      return;
    }
    entry.enabled = true;
    if (!isNaN(weightVal)) entry.weight = weightVal;
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Enabled judge: ${enableId}`);
    return;
  }

  if (disableId) {
    const entry = store.judges.find((j) => j.judgeId === disableId);
    if (!entry) {
      console.error(`Judge not found in config: ${disableId}`);
      process.exitCode = 1;
      return;
    }
    entry.enabled = false;
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Disabled judge: ${disableId}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nCustom Judge Configuration");
  console.log("═".repeat(60));
  console.log(`  ${"Judge ID".padEnd(25)} ${"Enabled".padEnd(10)} ${"Weight".padEnd(10)} Custom Rules`);
  console.log("  " + "─".repeat(55));

  for (const j of store.judges) {
    const enabled = j.enabled ? "Yes" : "No";
    const rules = Object.keys(j.customRules).length;
    console.log(`  ${j.judgeId.padEnd(25)} ${enabled.padEnd(10)} ${j.weight.toFixed(1).padEnd(10)} ${rules}`);
  }

  const enabledCount = store.judges.filter((j) => j.enabled).length;
  console.log(`\n  Enabled: ${enabledCount}/${store.judges.length}`);
  console.log("═".repeat(60));
}

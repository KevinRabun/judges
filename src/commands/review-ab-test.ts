/**
 * Review-ab-test — A/B test review configurations to find optimal settings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TestResult {
  configName: string;
  runAt: string;
  score: number;
  findingCount: number;
  criticalCount: number;
  duration: number;
}

interface ABTest {
  name: string;
  createdAt: string;
  description: string;
  configA: Record<string, unknown>;
  configB: Record<string, unknown>;
  resultsA: TestResult[];
  resultsB: TestResult[];
  status: "active" | "concluded";
  winner: string;
}

interface ABStore {
  version: string;
  tests: ABTest[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const AB_FILE = join(".judges", "ab-tests.json");

function loadStore(): ABStore {
  if (!existsSync(AB_FILE)) return { version: "1.0.0", tests: [] };
  try {
    return JSON.parse(readFileSync(AB_FILE, "utf-8")) as ABStore;
  } catch {
    return { version: "1.0.0", tests: [] };
  }
}

function saveStore(store: ABStore): void {
  mkdirSync(dirname(AB_FILE), { recursive: true });
  writeFileSync(AB_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function avgScore(results: TestResult[]): number {
  if (results.length === 0) return 0;
  return results.reduce((s, r) => s + r.score, 0) / results.length;
}

function avgFindings(results: TestResult[]): number {
  if (results.length === 0) return 0;
  return results.reduce((s, r) => s + r.findingCount, 0) / results.length;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAbTest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-ab-test — A/B test review configurations

Usage:
  judges review-ab-test create --name test1 --desc "Compare presets"
  judges review-ab-test record --name test1 --config A --score 8.5 --findings 3
  judges review-ab-test record --name test1 --config B --score 7.2 --findings 8
  judges review-ab-test compare --name test1      Compare results
  judges review-ab-test conclude --name test1     Mark test as concluded
  judges review-ab-test list                      List all tests

Options:
  --name <name>         Test name
  --desc <text>         Test description
  --config <A|B>        Which configuration (A or B)
  --score <n>           Review score
  --findings <n>        Finding count
  --criticals <n>       Critical finding count
  --duration <ms>       Review duration in ms
  --format json         JSON output
  --help, -h            Show this help

Run the same code through different configs and compare results.
Data stored locally in .judges/ab-tests.json.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const subcommand =
    argv.find((a) => ["create", "record", "compare", "conclude", "list", "delete"].includes(a)) || "list";
  const store = loadStore();
  const name = argv.find((_a: string, i: number) => argv[i - 1] === "--name");

  if (subcommand === "create") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    if (store.tests.find((t) => t.name === name)) {
      console.error(`Error: Test "${name}" already exists.`);
      process.exitCode = 1;
      return;
    }
    const desc = argv.find((_a: string, i: number) => argv[i - 1] === "--desc") || "";
    store.tests.push({
      name,
      createdAt: new Date().toISOString(),
      description: desc,
      configA: {},
      configB: {},
      resultsA: [],
      resultsB: [],
      status: "active",
      winner: "",
    });
    saveStore(store);
    console.log(`A/B test "${name}" created. Record results with 'record --config A|B'.`);
    return;
  }

  if (subcommand === "record") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    const test = store.tests.find((t) => t.name === name);
    if (!test) {
      console.error(`Error: Test "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    const config = argv.find((_a: string, i: number) => argv[i - 1] === "--config");
    if (!config || !["A", "B"].includes(config.toUpperCase())) {
      console.error("Error: --config A or --config B is required.");
      process.exitCode = 1;
      return;
    }
    const score = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
    const findingCount = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "0", 10);
    const criticalCount = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--criticals") || "0", 10);
    const duration = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--duration") || "0", 10);

    const result: TestResult = {
      configName: config.toUpperCase(),
      runAt: new Date().toISOString(),
      score,
      findingCount,
      criticalCount,
      duration,
    };

    if (config.toUpperCase() === "A") test.resultsA.push(result);
    else test.resultsB.push(result);

    saveStore(store);
    console.log(`Recorded result for config ${config.toUpperCase()} in test "${name}".`);
    return;
  }

  if (subcommand === "compare") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    const test = store.tests.find((t) => t.name === name);
    if (!test) {
      console.error(`Error: Test "${name}" not found.`);
      process.exitCode = 1;
      return;
    }

    const scoreA = avgScore(test.resultsA);
    const scoreB = avgScore(test.resultsB);
    const findingsA = avgFindings(test.resultsA);
    const findingsB = avgFindings(test.resultsB);

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            name: test.name,
            configA: { runs: test.resultsA.length, avgScore: scoreA, avgFindings: findingsA },
            configB: { runs: test.resultsB.length, avgScore: scoreB, avgFindings: findingsB },
            recommendation: scoreA >= scoreB ? "A" : "B",
          },
          null,
          2,
        ),
      );
      return;
    }

    console.log(`\nA/B Test: ${test.name}`);
    console.log(test.description ? `  ${test.description}` : "");
    console.log("─".repeat(50));
    console.log("                Config A      Config B");
    console.log("─".repeat(50));
    console.log(`  Runs:         ${String(test.resultsA.length).padEnd(14)}${test.resultsB.length}`);
    console.log(`  Avg Score:    ${scoreA.toFixed(2).padEnd(14)}${scoreB.toFixed(2)}`);
    console.log(`  Avg Findings: ${findingsA.toFixed(1).padEnd(14)}${findingsB.toFixed(1)}`);
    console.log("─".repeat(50));
    const rec = scoreA >= scoreB ? "A" : "B";
    console.log(`  Recommendation: Config ${rec} (higher avg score)`);
    console.log();
    return;
  }

  if (subcommand === "conclude") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    const test = store.tests.find((t) => t.name === name);
    if (!test) {
      console.error(`Error: Test "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    const scoreA = avgScore(test.resultsA);
    const scoreB = avgScore(test.resultsB);
    test.status = "concluded";
    test.winner = scoreA >= scoreB ? "A" : "B";
    saveStore(store);
    console.log(`Test "${name}" concluded. Winner: Config ${test.winner}.`);
    return;
  }

  if (subcommand === "delete") {
    if (!name) {
      console.error("Error: --name is required.");
      process.exitCode = 1;
      return;
    }
    store.tests = store.tests.filter((t) => t.name !== name);
    saveStore(store);
    console.log(`Test "${name}" deleted.`);
    return;
  }

  // list
  if (format === "json") {
    console.log(
      JSON.stringify(
        store.tests.map((t) => ({
          name: t.name,
          status: t.status,
          runsA: t.resultsA.length,
          runsB: t.resultsB.length,
          winner: t.winner,
        })),
        null,
        2,
      ),
    );
    return;
  }

  if (store.tests.length === 0) {
    console.log("No A/B tests configured. Use 'judges review-ab-test create --name <n>' to start.");
    return;
  }

  console.log("\nA/B Tests:");
  console.log("─".repeat(60));
  for (const t of store.tests) {
    const status = t.status === "concluded" ? `concluded (winner: ${t.winner})` : "active";
    console.log(`  ${t.name.padEnd(20)} ${status.padEnd(25)} A:${t.resultsA.length} B:${t.resultsB.length}`);
  }
  console.log("─".repeat(60));
}

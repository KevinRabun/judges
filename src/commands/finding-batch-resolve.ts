/**
 * Finding-batch-resolve — Resolve multiple findings at once in bulk.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Resolution {
  findingId: string;
  status: "resolved" | "wontfix" | "false-positive";
  reason: string;
  timestamp: string;
}

interface ResolutionStore {
  version: string;
  resolutions: Resolution[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORE_FILE = ".judges/batch-resolutions.json";

function loadStore(): ResolutionStore {
  if (!existsSync(STORE_FILE)) return { version: "1.0.0", resolutions: [] };
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as ResolutionStore;
  } catch {
    return { version: "1.0.0", resolutions: [] };
  }
}

function saveStore(store: ResolutionStore): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingBatchResolve(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-batch-resolve — Resolve multiple findings in bulk

Usage:
  judges finding-batch-resolve resolve --ids <id1,id2,...> --status <status> --reason <text>
  judges finding-batch-resolve resolve-by-rule --rule <ruleId> --file <results> --status <status>
  judges finding-batch-resolve resolve-by-severity --severity <sev> --file <results> --status <status>
  judges finding-batch-resolve list
  judges finding-batch-resolve undo --ids <id1,id2,...>
  judges finding-batch-resolve clear

Statuses: resolved, wontfix, false-positive

Options:
  --ids <list>          Comma-separated finding IDs
  --rule <ruleId>       Resolve all findings with this rule
  --severity <sev>      Resolve all findings at this severity
  --file <path>         Results file to match against
  --status <status>     Resolution status
  --reason <text>       Reason for resolution
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const subcommand = argv.find((a) =>
    ["resolve", "resolve-by-rule", "resolve-by-severity", "list", "undo", "clear"].includes(a),
  );
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "resolve") {
    const idsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--ids");
    const status = argv.find((_a: string, i: number) => argv[i - 1] === "--status") as Resolution["status"] | undefined;
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";
    if (!idsStr || !status) {
      console.error("Error: --ids and --status required");
      process.exitCode = 1;
      return;
    }
    const ids = idsStr
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ts = new Date().toISOString();
    for (const id of ids) {
      store.resolutions = store.resolutions.filter((r) => r.findingId !== id);
      store.resolutions.push({ findingId: id, status, reason, timestamp: ts });
    }
    saveStore(store);
    console.log(`Resolved ${ids.length} finding(s) as '${status}'.`);
    return;
  }

  if (subcommand === "resolve-by-rule" || subcommand === "resolve-by-severity") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    const status = argv.find((_a: string, i: number) => argv[i - 1] === "--status") as Resolution["status"] | undefined;
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";
    if (!file || !status) {
      console.error("Error: --file and --status required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(file)) {
      console.error(`Error: file not found: ${file}`);
      process.exitCode = 1;
      return;
    }

    let findings: Array<{ ruleId?: string; severity?: string; title?: string }>;
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      findings = Array.isArray(data) ? data : data.findings || [];
    } catch {
      console.error("Error: could not parse results file");
      process.exitCode = 1;
      return;
    }

    let matched: string[];
    if (subcommand === "resolve-by-rule") {
      const rule = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
      if (!rule) {
        console.error("Error: --rule required");
        process.exitCode = 1;
        return;
      }
      matched = findings.filter((f) => f.ruleId === rule).map((f, i) => f.ruleId + "-" + i);
    } else {
      const sev = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");
      if (!sev) {
        console.error("Error: --severity required");
        process.exitCode = 1;
        return;
      }
      matched = findings
        .filter((f) => (f.severity || "").toLowerCase() === sev.toLowerCase())
        .map((f, i) => (f.ruleId || "finding") + "-" + i);
    }

    const ts = new Date().toISOString();
    for (const id of matched) {
      store.resolutions = store.resolutions.filter((r) => r.findingId !== id);
      store.resolutions.push({ findingId: id, status, reason, timestamp: ts });
    }
    saveStore(store);
    console.log(`Resolved ${matched.length} finding(s) as '${status}'.`);
    return;
  }

  if (subcommand === "undo") {
    const idsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--ids");
    if (!idsStr) {
      console.error("Error: --ids required");
      process.exitCode = 1;
      return;
    }
    const ids = new Set(idsStr.split(",").map((s) => s.trim()));
    const before = store.resolutions.length;
    store.resolutions = store.resolutions.filter((r) => !ids.has(r.findingId));
    saveStore(store);
    console.log(`Undid ${before - store.resolutions.length} resolution(s).`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", resolutions: [] });
    console.log("All batch resolutions cleared.");
    return;
  }

  // Default: list
  if (store.resolutions.length === 0) {
    console.log("No batch resolutions recorded.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.resolutions, null, 2));
    return;
  }

  console.log(`\nBatch Resolutions (${store.resolutions.length}):`);
  console.log("═".repeat(70));
  for (const r of store.resolutions) {
    console.log(`  ${r.findingId.padEnd(30)} ${r.status.padEnd(16)} ${r.timestamp.slice(0, 19)}`);
    if (r.reason) console.log(`    Reason: ${r.reason}`);
  }
  console.log("═".repeat(70));
}

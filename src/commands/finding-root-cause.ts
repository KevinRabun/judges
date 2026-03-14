/**
 * Finding-root-cause — Identify root causes of recurring findings.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RootCauseEntry {
  ruleId: string;
  occurrences: number;
  rootCause: string;
  recommendation: string;
  lastUpdated: string;
}

interface RootCauseStore {
  version: string;
  entries: RootCauseEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORE_FILE = ".judges/root-causes.json";

function loadStore(): RootCauseStore {
  if (!existsSync(STORE_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as RootCauseStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: RootCauseStore): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function inferRootCause(ruleId: string, description: string): { cause: string; recommendation: string } {
  const text = `${ruleId} ${description}`.toLowerCase();

  if (text.includes("inject") || text.includes("sql") || text.includes("xss")) {
    return { cause: "Unsanitized user input", recommendation: "Implement input validation and parameterized queries" };
  }
  if (text.includes("auth") || text.includes("credential") || text.includes("password")) {
    return {
      cause: "Missing or weak authentication",
      recommendation: "Review authentication flow and enforce strong auth",
    };
  }
  if (text.includes("hardcod") || text.includes("secret") || text.includes("api.key")) {
    return { cause: "Hardcoded secrets", recommendation: "Use environment variables or secret managers" };
  }
  if (text.includes("error") || text.includes("exception") || text.includes("catch")) {
    return { cause: "Insufficient error handling", recommendation: "Add structured error handling and logging" };
  }
  if (text.includes("log") || text.includes("sensitive") || text.includes("pii")) {
    return { cause: "Sensitive data in logs", recommendation: "Sanitize log output and mask sensitive fields" };
  }
  if (text.includes("race") || text.includes("concurrent") || text.includes("async")) {
    return { cause: "Concurrency issues", recommendation: "Add proper synchronization or use atomic operations" };
  }
  if (text.includes("deprecat") || text.includes("version") || text.includes("outdated")) {
    return { cause: "Outdated dependencies", recommendation: "Update dependencies and review breaking changes" };
  }
  return { cause: "Code quality issue", recommendation: "Review coding standards and add linting rules" };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingRootCause(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-root-cause — Identify root causes of recurring findings

Usage:
  judges finding-root-cause analyze --file <results>    Analyze findings for root causes
  judges finding-root-cause list                        List known root causes
  judges finding-root-cause set --rule <id> --cause <text> --recommendation <text>
  judges finding-root-cause clear                       Clear root cause data

Options:
  --file <path>            Results file
  --rule <ruleId>          Rule ID
  --cause <text>           Root cause description
  --recommendation <text>  Recommended fix
  --min-occurrences <n>    Min occurrences to report (default: 2)
  --format json            JSON output
  --help, -h               Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["analyze", "list", "set", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "analyze") {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
    if (!file) {
      console.error("Error: --file required");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(file)) {
      console.error(`Error: file not found: ${file}`);
      process.exitCode = 1;
      return;
    }

    const minOccurrences = parseInt(
      argv.find((_a: string, i: number) => argv[i - 1] === "--min-occurrences") || "2",
      10,
    );

    let findings: Array<{ ruleId?: string; description?: string; title?: string; severity?: string }>;
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      findings = Array.isArray(data) ? data : data.findings || [];
    } catch {
      console.error("Error: could not parse results file");
      process.exitCode = 1;
      return;
    }

    // Group by rule
    const ruleCounts = new Map<string, { count: number; description: string }>();
    for (const f of findings) {
      const rid = f.ruleId || "unknown";
      const existing = ruleCounts.get(rid);
      if (existing) {
        existing.count++;
      } else {
        ruleCounts.set(rid, { count: 1, description: f.description || f.title || "" });
      }
    }

    // Analyze recurring rules
    const now = new Date().toISOString();
    let analyzed = 0;
    for (const [ruleId, info] of ruleCounts) {
      if (info.count < minOccurrences) continue;
      const existing = store.entries.find((e) => e.ruleId === ruleId);
      const { cause, recommendation } = inferRootCause(ruleId, info.description);
      if (existing) {
        existing.occurrences = info.count;
        existing.lastUpdated = now;
      } else {
        store.entries.push({ ruleId, occurrences: info.count, rootCause: cause, recommendation, lastUpdated: now });
      }
      analyzed++;
    }

    saveStore(store);
    console.log(`Analyzed ${findings.length} findings, identified ${analyzed} recurring patterns.`);
    return;
  }

  if (subcommand === "set") {
    const ruleId = argv.find((_a: string, i: number) => argv[i - 1] === "--rule");
    const cause = argv.find((_a: string, i: number) => argv[i - 1] === "--cause");
    const recommendation = argv.find((_a: string, i: number) => argv[i - 1] === "--recommendation");
    if (!ruleId || !cause) {
      console.error("Error: --rule and --cause required");
      process.exitCode = 1;
      return;
    }

    const existing = store.entries.find((e) => e.ruleId === ruleId);
    if (existing) {
      existing.rootCause = cause;
      existing.recommendation = recommendation || existing.recommendation;
      existing.lastUpdated = new Date().toISOString();
    } else {
      store.entries.push({
        ruleId,
        occurrences: 0,
        rootCause: cause,
        recommendation: recommendation || "",
        lastUpdated: new Date().toISOString(),
      });
    }
    saveStore(store);
    console.log(`Root cause set for '${ruleId}'.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", entries: [] });
    console.log("Root cause data cleared.");
    return;
  }

  // Default: list
  if (store.entries.length === 0) {
    console.log("No root causes tracked. Use 'judges finding-root-cause analyze --file <f>'.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.entries, null, 2));
    return;
  }

  const sorted = [...store.entries].sort((a, b) => b.occurrences - a.occurrences);
  console.log(`\nRoot Cause Analysis (${sorted.length} patterns):`);
  console.log("═".repeat(70));
  for (const e of sorted) {
    console.log(`\n  ${e.ruleId} (${e.occurrences} occurrences)`);
    console.log(`    Root cause:      ${e.rootCause}`);
    console.log(`    Recommendation:  ${e.recommendation}`);
  }
  console.log("\n" + "═".repeat(70));
}

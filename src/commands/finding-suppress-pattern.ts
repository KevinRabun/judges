/**
 * Finding-suppress-pattern — Suppress findings matching glob patterns.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuppressPattern {
  pattern: string;
  field: "ruleId" | "title" | "severity";
  reason: string;
  addedAt: string;
}

interface SuppressStore {
  version: string;
  patterns: SuppressPattern[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const STORE_FILE = ".judges/suppress-patterns.json";

function loadStore(): SuppressStore {
  if (!existsSync(STORE_FILE)) return { version: "1.0.0", patterns: [] };
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8")) as SuppressStore;
  } catch {
    return { version: "1.0.0", patterns: [] };
  }
}

function saveStore(store: SuppressStore): void {
  mkdirSync(dirname(STORE_FILE), { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSuppressPattern(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-suppress-pattern — Suppress findings by pattern

Usage:
  judges finding-suppress-pattern add --pattern <glob> --field <field> --reason <text>
  judges finding-suppress-pattern list
  judges finding-suppress-pattern test --file <results>
  judges finding-suppress-pattern remove --pattern <glob>
  judges finding-suppress-pattern clear

Options:
  --pattern <glob>     Glob pattern to match (e.g., "SEC-*", "*injection*")
  --field <field>      Field to match: ruleId, title, severity (default: ruleId)
  --reason <text>      Reason for suppression
  --file <path>        Results file to test patterns against
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const subcommand = argv.find((a) => ["add", "list", "test", "remove", "clear"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "add") {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern");
    const field = (argv.find((_a: string, i: number) => argv[i - 1] === "--field") ||
      "ruleId") as SuppressPattern["field"];
    const reason = argv.find((_a: string, i: number) => argv[i - 1] === "--reason") || "";
    if (!pattern) {
      console.error("Error: --pattern required");
      process.exitCode = 1;
      return;
    }
    store.patterns.push({ pattern, field, reason, addedAt: new Date().toISOString() });
    saveStore(store);
    console.log(`Added suppress pattern: ${field} ~ '${pattern}'`);
    return;
  }

  if (subcommand === "remove") {
    const pattern = argv.find((_a: string, i: number) => argv[i - 1] === "--pattern");
    if (!pattern) {
      console.error("Error: --pattern required");
      process.exitCode = 1;
      return;
    }
    const before = store.patterns.length;
    store.patterns = store.patterns.filter((p) => p.pattern !== pattern);
    saveStore(store);
    console.log(`Removed ${before - store.patterns.length} pattern(s).`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", patterns: [] });
    console.log("All suppress patterns cleared.");
    return;
  }

  if (subcommand === "test") {
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

    let findings: Array<{ ruleId?: string; severity?: string; title?: string }>;
    try {
      const data = JSON.parse(readFileSync(file, "utf-8"));
      findings = Array.isArray(data) ? data : data.findings || [];
    } catch {
      console.error("Error: could not parse results file");
      process.exitCode = 1;
      return;
    }

    let suppressed = 0;
    let kept = 0;
    for (const f of findings) {
      let isSuppressed = false;
      for (const p of store.patterns) {
        const value = f[p.field] || "";
        if (globToRegex(p.pattern).test(value)) {
          isSuppressed = true;
          break;
        }
      }
      if (isSuppressed) suppressed++;
      else kept++;
    }

    if (format === "json") {
      console.log(JSON.stringify({ total: findings.length, suppressed, kept }, null, 2));
      return;
    }

    console.log(`Test results: ${suppressed} suppressed, ${kept} kept (${findings.length} total)`);
    return;
  }

  // Default: list
  if (store.patterns.length === 0) {
    console.log("No suppress patterns defined.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.patterns, null, 2));
    return;
  }

  console.log(`\nSuppress Patterns (${store.patterns.length}):`);
  console.log("═".repeat(60));
  for (const p of store.patterns) {
    console.log(`  ${p.field.padEnd(10)} ~ '${p.pattern}'${p.reason ? ` — ${p.reason}` : ""}`);
  }
  console.log("═".repeat(60));
}

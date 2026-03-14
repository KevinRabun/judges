/**
 * Advanced finding search/filter — complex queries across evaluation results.
 *
 * Reads local .judges-results.json files for searching.
 */

import { readFileSync, existsSync, writeFileSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface FindingRecord extends Finding {
  source?: string;
  timestamp?: string;
}

interface QueryResult {
  matches: FindingRecord[];
  total: number;
  query: string;
}

interface SavedQuery {
  name: string;
  query: string;
  createdAt: string;
}

interface QueryDb {
  history: FindingRecord[];
  savedQueries: SavedQuery[];
}

const QUERY_FILE = ".judges-query.json";
const RESULTS_FILE = ".judges-results.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadResults(): FindingRecord[] {
  if (!existsSync(RESULTS_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(RESULTS_FILE, "utf-8"));
    if (Array.isArray(data)) return data;
    if (data.findings) return data.findings;
    return [];
  } catch {
    return [];
  }
}

function loadQueryDb(): QueryDb {
  if (!existsSync(QUERY_FILE)) return { history: [], savedQueries: [] };
  return JSON.parse(readFileSync(QUERY_FILE, "utf-8"));
}

function saveQueryDb(db: QueryDb): void {
  writeFileSync(QUERY_FILE, JSON.stringify(db, null, 2));
}

function matchesFilter(finding: FindingRecord, key: string, value: string): boolean {
  const lowerVal = value.toLowerCase();
  switch (key) {
    case "severity":
      return finding.severity.toLowerCase() === lowerVal;
    case "rule":
    case "ruleId":
      return finding.ruleId.toLowerCase().includes(lowerVal);
    case "title":
      return finding.title.toLowerCase().includes(lowerVal);
    case "description":
    case "desc":
      return finding.description.toLowerCase().includes(lowerVal);
    case "confidence":
      if (finding.confidence === undefined) return false;
      return finding.confidence >= parseFloat(value);
    case "has-patch":
      return !!finding.patch;
    case "has-fix":
      return !!finding.suggestedFix;
    default:
      // Generic text search across all string fields
      return [finding.ruleId, finding.title, finding.description, finding.recommendation].some((f) =>
        f.toLowerCase().includes(lowerVal),
      );
  }
}

export function queryFindings(queryStr: string, findings?: FindingRecord[]): QueryResult {
  const records = findings || loadResults();

  // Parse query: "severity:critical rule:SEC text-search"
  const parts = queryStr.split(/\s+/);
  let matches = [...records];

  const textParts: string[] = [];

  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx > 0) {
      const key = part.slice(0, colonIdx);
      const val = part.slice(colonIdx + 1);
      if (part.startsWith("-")) {
        // Negation: -severity:low
        const negKey = key.slice(1);
        matches = matches.filter((f) => !matchesFilter(f, negKey, val));
      } else {
        matches = matches.filter((f) => matchesFilter(f, key, val));
      }
    } else {
      textParts.push(part.toLowerCase());
    }
  }

  if (textParts.length > 0) {
    const textQuery = textParts.join(" ");
    matches = matches.filter((f) =>
      [f.ruleId, f.title, f.description, f.recommendation].some((s) => s.toLowerCase().includes(textQuery)),
    );
  }

  return { matches, total: matches.length, query: queryStr };
}

export function aggregateFindings(findings: FindingRecord[], groupBy: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const f of findings) {
    let key: string;
    switch (groupBy) {
      case "severity":
        key = f.severity;
        break;
      case "rule":
      case "ruleId":
        key = f.ruleId;
        break;
      case "confidence":
        key = f.confidence !== undefined ? `${Math.floor(f.confidence * 10) * 10}%` : "unknown";
        break;
      default:
        key = f.severity;
    }
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runQuery(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges query — Advanced finding search and filter

Usage:
  judges query "severity:critical"
  judges query "rule:SEC -severity:low"
  judges query "injection" --aggregate severity
  judges query --save "critical-sec" "severity:critical rule:SEC"
  judges query --saved "critical-sec"
  judges query --list-saved

Filter keys:
  severity:<level>     critical | high | medium | low
  rule:<pattern>       Match ruleId (substring)
  title:<text>         Match title
  desc:<text>          Match description
  confidence:<min>     Minimum confidence (e.g., 0.8)
  has-patch:true       Only findings with patches
  has-fix:true         Only findings with suggested fixes
  -<key>:<value>       Negate a filter

Options:
  --aggregate <key>    Group by severity|rule|confidence
  --limit <n>          Max results
  --save <name>        Save query for reuse
  --saved <name>       Run a saved query
  --list-saved         List saved queries
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // List saved queries
  if (argv.includes("--list-saved")) {
    const db = loadQueryDb();
    if (db.savedQueries.length === 0) {
      console.log("\n  No saved queries.\n");
    } else {
      console.log(`\n  Saved Queries (${db.savedQueries.length})\n  ───────────────`);
      for (const q of db.savedQueries) {
        console.log(`    ${q.name.padEnd(20)} ${q.query}`);
      }
      console.log("");
    }
    return;
  }

  // Save a query
  const saveName = argv.find((_a: string, i: number) => argv[i - 1] === "--save");
  if (saveName) {
    const queryStr = argv.filter((a) => !a.startsWith("--") && a !== saveName).join(" ");
    const db = loadQueryDb();
    db.savedQueries = db.savedQueries.filter((q) => q.name !== saveName);
    db.savedQueries.push({ name: saveName, query: queryStr, createdAt: new Date().toISOString() });
    saveQueryDb(db);
    console.log(`  ✅ Saved query "${saveName}": ${queryStr}`);
    return;
  }

  // Run saved query
  const savedName = argv.find((_a: string, i: number) => argv[i - 1] === "--saved");
  if (savedName) {
    const db = loadQueryDb();
    const saved = db.savedQueries.find((q) => q.name === savedName);
    if (!saved) {
      console.error(`  ❌ Saved query "${savedName}" not found`);
      return;
    }
    const result = queryFindings(saved.query);
    printResults(result, format, argv);
    return;
  }

  // Execute query
  const queryStr = argv.filter((a) => !a.startsWith("--")).join(" ");
  if (!queryStr) {
    console.error("  ❌ No query provided. Use --help for usage.");
    return;
  }

  const result = queryFindings(queryStr);
  printResults(result, format, argv);
}

function printResults(result: QueryResult, format: string, argv: string[]): void {
  const aggregateBy = argv.find((_a: string, i: number) => argv[i - 1] === "--aggregate");
  const limitStr = argv.find((_a: string, i: number) => argv[i - 1] === "--limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  let { matches } = result;
  if (limit) matches = matches.slice(0, limit);

  if (aggregateBy) {
    const agg = aggregateFindings(matches, aggregateBy);
    if (format === "json") {
      console.log(JSON.stringify(agg, null, 2));
    } else {
      console.log(`\n  Aggregate by ${aggregateBy} (${result.total} matches)\n  ──────────────────────`);
      for (const [key, count] of Object.entries(agg).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${key.padEnd(20)} ${count}`);
      }
      console.log("");
    }
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify({ ...result, matches }, null, 2));
    return;
  }

  console.log(`\n  Query: "${result.query}" → ${result.total} match(es)\n  ─────────────────────────`);
  if (matches.length === 0) {
    console.log("    No findings matched.\n");
    return;
  }
  for (const f of matches) {
    console.log(`    [${f.severity.toUpperCase()}] ${f.ruleId.padEnd(12)} ${f.title.slice(0, 50)}`);
  }
  console.log("");
}

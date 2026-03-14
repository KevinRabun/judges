/**
 * Habit tracker — track recurring finding patterns per developer or
 * AI model and surface personalized improvement suggestions.
 *
 * Data stored locally in `.judges-habits/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HabitEntry {
  category: string;
  count: number;
  lastSeen: string;
  trend: "rising" | "stable" | "declining";
  resources: string[];
}

interface AuthorProfile {
  author: string;
  entries: HabitEntry[];
  totalFindings: number;
  topCategory: string;
  lastUpdated: string;
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-habits";

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadProfile(author: string): AuthorProfile | null {
  const file = join(DATA_DIR, `${author}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

function saveProfile(profile: AuthorProfile): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, `${profile.author}.json`), JSON.stringify(profile, null, 2));
}

// ─── Learning Resources ────────────────────────────────────────────────────

const CATEGORY_RESOURCES: Record<string, string[]> = {
  "sql-injection": [
    "Use parameterized queries",
    "Review OWASP SQL Injection Prevention Cheat Sheet",
    "Enable SQL linting in CI",
  ],
  xss: [
    "Sanitize all user input before rendering",
    "Use Content Security Policy headers",
    "Review OWASP XSS Prevention Cheat Sheet",
  ],
  "hardcoded-secret": [
    "Use environment variables for secrets",
    "Set up a secrets manager",
    "Add secret scanning to pre-commit hooks",
  ],
  "empty-catch": [
    "Always log or re-throw caught exceptions",
    "Use error monitoring (Sentry, etc.)",
    "Define error handling strategy per module",
  ],
  "missing-auth": [
    "Apply auth middleware to all routes",
    "Review OWASP Authentication Cheat Sheet",
    "Implement role-based access control",
  ],
  "insecure-crypto": [
    "Use crypto.randomUUID() for tokens",
    "Use bcrypt/scrypt for password hashing",
    "Never use MD5 or SHA1 for security",
  ],
  "error-handling": [
    "Define a consistent error hierarchy",
    "Use Result types or Either monads",
    "Log errors with correlation IDs",
  ],
  performance: ["Profile before optimizing", "Use pagination for list endpoints", "Cache frequently accessed data"],
  "code-quality": [
    "Follow single responsibility principle",
    "Reduce cyclomatic complexity",
    "Write meaningful test names",
  ],
  documentation: ["Keep JSDoc in sync with code", "Document public API contracts", "Add examples to complex functions"],
};

function getResources(category: string): string[] {
  const key = Object.keys(CATEGORY_RESOURCES).find((k) => category.toLowerCase().includes(k));
  return key
    ? CATEGORY_RESOURCES[key]
    : ["Review team coding standards", "Add targeted linting rules", "Consider pair programming for this area"];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runHabitTracker(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges habit-tracker — Track recurring finding patterns

Usage:
  judges habit-tracker --record --author "alice" --category "sql-injection"
  judges habit-tracker --record --author "copilot" --category "empty-catch" --count 3
  judges habit-tracker --show --author "alice"
  judges habit-tracker --digest --author "alice"

Options:
  --record              Record finding occurrence
  --author <name>       Developer or AI model name
  --category <name>     Finding category (e.g., sql-injection, xss, empty-catch)
  --count <n>           Number of occurrences (default: 1)
  --show                Show author's habit profile
  --digest              Show improvement digest with resources
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isRecord = argv.includes("--record");
  const isDigest = argv.includes("--digest");
  const authorName = argv.find((_a: string, i: number) => argv[i - 1] === "--author") || "";
  const category = argv.find((_a: string, i: number) => argv[i - 1] === "--category") || "";
  const count = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--count") || "1");

  if (!authorName) {
    console.error("  --author is required");
    return;
  }

  if (isRecord) {
    if (!category) {
      console.error("  --category is required for --record");
      return;
    }

    const profile = loadProfile(authorName) || {
      author: authorName,
      entries: [],
      totalFindings: 0,
      topCategory: "",
      lastUpdated: "",
    };
    let entry = profile.entries.find((e) => e.category === category);
    if (!entry) {
      entry = { category, count: 0, lastSeen: "", trend: "stable", resources: getResources(category) };
      profile.entries.push(entry);
    }

    const prevCount = entry.count;
    entry.count += count;
    entry.lastSeen = new Date().toISOString();
    entry.trend = entry.count > prevCount * 1.5 ? "rising" : entry.count < prevCount * 0.7 ? "declining" : "stable";

    profile.totalFindings += count;
    profile.topCategory = profile.entries.sort((a, b) => b.count - a.count)[0]?.category || "";
    profile.lastUpdated = new Date().toISOString();

    saveProfile(profile);
    console.log(`  ✅ Recorded ${count}x ${category} for ${authorName} (total: ${entry.count})`);
    return;
  }

  if (isDigest) {
    const profile = loadProfile(authorName);
    if (!profile || profile.entries.length === 0) {
      console.log(`  No data for ${authorName}. Use --record to add findings.`);
      return;
    }

    const sorted = [...profile.entries].sort((a, b) => b.count - a.count);
    const top3 = sorted.slice(0, 3);

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            author: authorName,
            digest: top3,
            totalFindings: profile.totalFindings,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  Weekly Improvement Digest for ${authorName}\n  ──────────────────────────`);
      console.log(`  Total findings: ${profile.totalFindings} across ${profile.entries.length} categories\n`);

      for (const entry of top3) {
        const trendIcon = entry.trend === "rising" ? "📈" : entry.trend === "declining" ? "📉" : "➡️";
        console.log(`    ${trendIcon} ${entry.category} — ${entry.count} occurrences (${entry.trend})`);
        console.log("        Suggested improvements:");
        for (const r of entry.resources) {
          console.log(`          • ${r}`);
        }
        console.log("");
      }
    }
    return;
  }

  // Default: show profile
  const profile = loadProfile(authorName);
  if (!profile || profile.entries.length === 0) {
    console.log(`  No data for ${authorName}. Use --record to add findings.`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(profile, null, 2));
  } else {
    console.log(`\n  Habit Profile: ${authorName}\n  ──────────────────────────`);
    console.log(
      `  Total: ${profile.totalFindings} | Categories: ${profile.entries.length} | Top: ${profile.topCategory}\n`,
    );

    const sorted = [...profile.entries].sort((a, b) => b.count - a.count);
    for (const entry of sorted) {
      const bar = "█".repeat(Math.min(20, Math.floor((entry.count / Math.max(1, profile.totalFindings)) * 40)));
      const trendIcon = entry.trend === "rising" ? "↑" : entry.trend === "declining" ? "↓" : "→";
      console.log(`    ${entry.category.padEnd(25)} ${String(entry.count).padStart(4)} ${bar} ${trendIcon}`);
    }
    console.log("");
  }
}

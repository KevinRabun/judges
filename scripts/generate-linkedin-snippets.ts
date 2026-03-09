#!/usr/bin/env npx tsx
/**
 * Generate "Spot the Findings" LinkedIn post series.
 *
 * Runs Judges Panel against every snippet in content/snippets/,
 * computes real criticalCount + highCount, and emits:
 *   content/linkedin/snippet-manifest.json
 *   content/linkedin/posts/{id}.txt
 *   content/linkedin/post-calendar.md
 *
 * Usage:
 *   npx tsx scripts/generate-linkedin-snippets.ts           # full run
 *   npx tsx scripts/generate-linkedin-snippets.ts --verify   # verify only (no writes)
 *   npx tsx scripts/generate-linkedin-snippets.ts --seed 42  # deterministic seed
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { resolve, join, basename, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { evaluateWithTribunal } from "../src/evaluators/index.js";
import type { TribunalVerdict } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ──────────────────────────────────────────────────────────────────

const MARKETPLACE_URL = "https://marketplace.visualstudio.com/items?itemName=kevinrabun.judges-panel";
const HASHTAGS = "#VSCode #GitHubCopilot #CodeReview #DevTools #Security";
const SERIES_NAME = "Spot the Findings";
const START_DATE = "2026-03-09"; // Monday start

const LANG_MAP: Record<string, { display: string; lang: string; fence: string }> = {
  typescript: { display: "TypeScript", lang: "typescript", fence: "typescript" },
  javascript: { display: "JavaScript", lang: "javascript", fence: "javascript" },
  python: { display: "Python", lang: "python", fence: "python" },
  go: { display: "Go", lang: "go", fence: "go" },
  rust: { display: "Rust", lang: "rust", fence: "rust" },
  java: { display: "Java", lang: "java", fence: "java" },
  csharp: { display: "C#", lang: "csharp", fence: "csharp" },
  cpp: { display: "C++", lang: "cpp", fence: "cpp" },
};

const CATEGORY_LABELS: Record<string, string> = {
  "auth-bypass": "Authentication Bypass",
  "eval-injection": "Code Injection (eval)",
  "hardcoded-secret": "Hardcoded Secret",
  "sql-injection": "SQL Injection",
  "path-traversal": "Path Traversal",
  "weak-crypto": "Weak Cryptography",
  "xss-reflect": "Reflected XSS",
  "unsafe-deserialize": "Unsafe Deserialization",
  "command-injection": "Command Injection",
  "weak-random": "Insecure Randomness",
  "prototype-pollution": "Prototype Pollution",
  ssrf: "Server-Side Request Forgery",
  "buffer-overflow": "Buffer Overflow",
  "format-string": "Format String Vulnerability",
  "unsafe-config": "Unsafe Configuration Merge",
};

// ─── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const verifyOnly = args.includes("--verify");
const seedIdx = args.indexOf("--seed");
const seed = seedIdx >= 0 ? parseInt(args[seedIdx + 1], 10) : 1;

// ─── Seeded PRNG (Mulberry32) for deterministic ordering ─────────────────────

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ─── Snippet Discovery ──────────────────────────────────────────────────────

interface SnippetEntry {
  id: string;
  language: string;
  category: string;
  filePath: string;
  code: string;
}

function discoverSnippets(): SnippetEntry[] {
  const snippetsDir = resolve(__dirname, "..", "content", "snippets");
  const entries: SnippetEntry[] = [];

  for (const langDir of Object.keys(LANG_MAP)) {
    const dir = join(snippetsDir, langDir);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir)
      .filter((f) => !f.startsWith("."))
      .sort();
    for (const file of files) {
      const name = basename(file, extname(file));
      // e.g. "ts-01-auth-bypass" → category = "auth-bypass"
      const parts = name.split("-");
      const category = parts.slice(2).join("-");

      entries.push({
        id: name,
        language: langDir,
        category,
        filePath: join(dir, file),
        code: readFileSync(join(dir, file), "utf-8"),
      });
    }
  }

  return entries;
}

// ─── Evaluate with Judges ────────────────────────────────────────────────────

interface EvalResult {
  snippet: SnippetEntry;
  verdict: TribunalVerdict;
  criticalCount: number;
  highCount: number;
  totalFindings: number;
}

function evaluateSnippet(snippet: SnippetEntry): EvalResult {
  const langInfo = LANG_MAP[snippet.language];
  const verdict = evaluateWithTribunal(snippet.code, langInfo.lang);

  return {
    snippet,
    verdict,
    criticalCount: verdict.criticalCount,
    highCount: verdict.highCount,
    totalFindings: verdict.findings.length,
  };
}

// ─── Post Generation ─────────────────────────────────────────────────────────

// Convert ASCII text to Unicode Mathematical Sans-Serif Bold
function unicodeBold(text: string): string {
  return [...text]
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      if (c >= 65 && c <= 90) return String.fromCodePoint(c - 65 + 0x1d5d4); // A-Z
      if (c >= 97 && c <= 122) return String.fromCodePoint(c - 97 + 0x1d5ee); // a-z
      if (c >= 48 && c <= 57) return String.fromCodePoint(c - 48 + 0x1d7ec); // 0-9
      return ch;
    })
    .join("");
}

function formatFindings(result: EvalResult): string {
  const sevEmoji: Record<string, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🔵",
    info: "⚪",
  };

  // Show CRITICAL and HIGH findings with details, then summarise lower ones
  const important = result.verdict.findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const other = result.verdict.findings.filter((f) => f.severity !== "critical" && f.severity !== "high");

  const lines: string[] = [];
  for (const f of important) {
    const emoji = sevEmoji[f.severity] ?? "⚪";
    const loc = f.lineNumbers?.length
      ? ` (line${f.lineNumbers.length > 1 ? "s" : ""} ${f.lineNumbers.join(", ")})`
      : "";
    lines.push(`${emoji} ${unicodeBold(f.severity.toUpperCase())} — ${f.title}${loc}`);
    lines.push(`  ${f.description}`);
    lines.push(`  💡 ${f.recommendation}`);
    lines.push("");
  }

  if (other.length > 0) {
    const counts = other.reduce<Record<string, number>>((acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    }, {});
    const parts = Object.entries(counts).map(([sev, n]) => `${n} ${sev.toUpperCase()}`);
    lines.push(`Plus ${parts.join(", ")} additional finding${other.length !== 1 ? "s" : ""}.`);
  }

  return lines.join("\n");
}

function generatePost(result: EvalResult, postNumber: number): string {
  const { snippet, criticalCount, highCount, totalFindings } = result;
  const langInfo = LANG_MAP[snippet.language];
  const categoryLabel = CATEGORY_LABELS[snippet.category] ?? snippet.category;

  const answerLine =
    criticalCount > 0
      ? `${unicodeBold("Answer:")} ${criticalCount} CRITICAL finding${criticalCount !== 1 ? "s" : ""}` +
        (highCount > 0 ? ` + ${highCount} HIGH` : "") +
        ` (${totalFindings} total)`
      : highCount > 0
        ? `${unicodeBold("Answer:")} ${highCount} HIGH finding${highCount !== 1 ? "s" : ""} (${totalFindings} total)`
        : `${unicodeBold("Answer:")} ${totalFindings} finding${totalFindings !== 1 ? "s" : ""}`;

  const findingsDetail = formatFindings(result);

  return `${unicodeBold(`${SERIES_NAME} #${postNumber}`)} — ${langInfo.display}: ${categoryLabel}

${unicodeBold("Can you spot the issues?")} 👇

${snippet.code.trim()}

🔍 What would you flag in a code review?

━━━

${answerLine}

${findingsDetail}

━━━

Judges Panel found this in < 1 second — right inside VS Code.

${unicodeBold("Try it yourself:")}
@judges /review in GitHub Copilot Chat

📦 Install from VS Code Marketplace:
${MARKETPLACE_URL}

${HASHTAGS}
`;
}

// ─── Calendar Generation ─────────────────────────────────────────────────────

function generateCalendar(orderedResults: EvalResult[], startDate: string): string {
  const start = new Date(startDate + "T00:00:00Z");
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  let md = `# ${SERIES_NAME} — Post Calendar\n\n`;
  md += `> Generated by \`scripts/generate-linkedin-snippets.ts\` with seed=${seed}\n\n`;
  md += `| # | Date | Day | Language | Category | Critical | High | Total |\n`;
  md += `|---|------|-----|----------|----------|----------|------|-------|\n`;

  let weekdayIndex = 0; // 0=Mon
  const current = new Date(start);

  for (let i = 0; i < orderedResults.length; i++) {
    const r = orderedResults[i];
    const langInfo = LANG_MAP[r.snippet.language];
    const categoryLabel = CATEGORY_LABELS[r.snippet.category] ?? r.snippet.category;
    const dateStr = current.toISOString().slice(0, 10);
    const dayName = weekdays[weekdayIndex];

    md += `| ${i + 1} | ${dateStr} | ${dayName} | ${langInfo.display} | ${categoryLabel} | ${r.criticalCount} | ${r.highCount} | ${r.totalFindings} |\n`;

    // Advance to next weekday
    weekdayIndex++;
    if (weekdayIndex >= 5) {
      // Skip weekend: add 3 days (Fri→Mon)
      weekdayIndex = 0;
      current.setUTCDate(current.getUTCDate() + 3);
    } else {
      current.setUTCDate(current.getUTCDate() + 1);
    }
  }

  md += `\n**Total posts:** ${orderedResults.length}\n`;
  md += `**Schedule:** Weekdays (Mon–Fri), 1 post per day\n`;
  md += `**Duration:** ~${Math.ceil(orderedResults.length / 5)} weeks\n`;

  return md;
}

// ─── Manifest ────────────────────────────────────────────────────────────────

interface ManifestEntry {
  postNumber: number;
  id: string;
  language: string;
  languageDisplay: string;
  category: string;
  categoryLabel: string;
  criticalCount: number;
  highCount: number;
  totalFindings: number;
  overallScore: number;
  overallVerdict: string;
  snippetFile: string;
  postFile: string;
}

function buildManifest(orderedResults: EvalResult[]): ManifestEntry[] {
  return orderedResults.map((r, i) => ({
    postNumber: i + 1,
    id: r.snippet.id,
    language: r.snippet.language,
    languageDisplay: LANG_MAP[r.snippet.language].display,
    category: r.snippet.category,
    categoryLabel: CATEGORY_LABELS[r.snippet.category] ?? r.snippet.category,
    criticalCount: r.criticalCount,
    highCount: r.highCount,
    totalFindings: r.totalFindings,
    overallScore: r.verdict.overallScore,
    overallVerdict: r.verdict.overallVerdict,
    snippetFile: `content/snippets/${r.snippet.language}/${basename(r.snippet.filePath)}`,
    postFile: `content/linkedin/posts/${r.snippet.id}.txt`,
  }));
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log(`\n🎯 ${SERIES_NAME} — LinkedIn Post Generator\n`);
  console.log(`  Seed:        ${seed}`);
  console.log(`  Verify only: ${verifyOnly}\n`);

  // 1. Discover snippets
  const snippets = discoverSnippets();
  console.log(`📁 Found ${snippets.length} snippets across ${Object.keys(LANG_MAP).length} languages\n`);

  if (snippets.length === 0) {
    console.error("❌ No snippets found. Run from repo root.");
    process.exit(1);
  }

  // 2. Evaluate each snippet
  console.log("⚖️  Running Judges against each snippet...\n");
  const results: EvalResult[] = [];
  let criticalTotal = 0;
  let errorCount = 0;

  for (const snippet of snippets) {
    try {
      const result = evaluateSnippet(snippet);
      results.push(result);
      criticalTotal += result.criticalCount;

      const status =
        result.criticalCount > 0
          ? `🔴 ${result.criticalCount}C/${result.highCount}H`
          : result.highCount > 0
            ? `🟠 ${result.highCount}H`
            : `🟢 clean`;

      console.log(`  ${snippet.id.padEnd(30)} ${status} (${result.totalFindings} total)`);
    } catch (err) {
      errorCount++;
      console.error(`  ❌ ${snippet.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(
    `\n📊 Summary: ${results.length} evaluated, ${criticalTotal} total CRITICAL findings, ${errorCount} errors\n`,
  );

  // 3. Order: primary languages first, then secondary, shuffle within each tier
  const rng = mulberry32(seed);
  const PRIMARY_LANGS = new Set(["typescript", "python", "javascript", "go"]);
  const SECONDARY_LANGS = new Set(["java", "csharp"]);
  // Tier 1: TS, Python, JS, Go — Tier 2: Java, C# — Tier 3: everything else
  const tier1 = results.filter((r) => PRIMARY_LANGS.has(r.snippet.language));
  const tier2 = results.filter((r) => SECONDARY_LANGS.has(r.snippet.language));
  const tier3 = results.filter(
    (r) => !PRIMARY_LANGS.has(r.snippet.language) && !SECONDARY_LANGS.has(r.snippet.language),
  );
  const ordered = [...shuffle(tier1, rng), ...shuffle(tier2, rng), ...shuffle(tier3, rng)];

  // 4. Verify mode — just print stats and exit
  if (verifyOnly) {
    console.log("✅ Verify mode — no files written.\n");
    for (const [i, r] of ordered.entries()) {
      console.log(
        `  #${(i + 1).toString().padStart(2)} ${r.snippet.id.padEnd(30)} ` +
          `C=${r.criticalCount} H=${r.highCount} T=${r.totalFindings}`,
      );
    }
    return;
  }

  // 5. Write posts
  const postsDir = resolve(__dirname, "..", "content", "linkedin", "posts");
  mkdirSync(postsDir, { recursive: true });

  for (const [i, r] of ordered.entries()) {
    const post = generatePost(r, i + 1);
    writeFileSync(join(postsDir, `${r.snippet.id}.txt`), post, "utf-8");
  }
  console.log(`✍️  Wrote ${ordered.length} post files to content/linkedin/posts/\n`);

  // 6. Write manifest
  const manifestPath = resolve(__dirname, "..", "content", "linkedin", "snippet-manifest.json");
  const manifest = buildManifest(ordered);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`📋 Wrote manifest to content/linkedin/snippet-manifest.json\n`);

  // 7. Write calendar
  const calendarPath = resolve(__dirname, "..", "content", "linkedin", "post-calendar.md");
  const calendar = generateCalendar(ordered, START_DATE);
  writeFileSync(calendarPath, calendar, "utf-8");
  console.log(`📅 Wrote calendar to content/linkedin/post-calendar.md\n`);

  console.log("✅ Done! All files generated.\n");
}

main();

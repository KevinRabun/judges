/**
 * Smart judge selection — auto-select relevant judges based on file content.
 *
 * Avoids running irrelevant judges (e.g., SQL judge on .tsx files,
 * IaC judge on .py files) to improve evaluation speed and reduce noise.
 *
 * Used internally by the evaluation pipeline when `smartSelect: true`.
 */

import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JudgeRelevance {
  judgeId: string;
  relevant: boolean;
  reason: string;
}

// ─── Language → Judge Relevance ─────────────────────────────────────────────

/** Judges that are always relevant regardless of language */
const UNIVERSAL_JUDGES = new Set([
  "code-structure",
  "error-handling",
  "documentation",
  "maintainability",
  "testing",
  "logic-review",
  "intent-alignment",
  "ai-code-safety",
  "software-practices",
  "over-engineering",
]);

/** Judges relevant only for specific language families */
const LANGUAGE_SPECIFIC: Record<string, Set<string>> = {
  // Security judges — relevant for all code languages
  cybersecurity: new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "c",
    "cpp",
    "dart",
    "scala",
  ]),
  "data-security": new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "c",
    "cpp",
    "dart",
    "scala",
  ]),
  authentication: new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "java",
    "csharp",
    "ruby",
    "php",
    "kotlin",
    "scala",
  ]),
  security: new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "c",
    "cpp",
    "dart",
    "scala",
  ]),

  // Infrastructure judges
  "iac-security": new Set(["terraform", "bicep", "arm", "yaml", "dockerfile"]),
  "ci-cd": new Set(["yaml", "dockerfile", "bash", "powershell"]),
  "cloud-readiness": new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "java",
    "csharp",
    "yaml",
    "terraform",
    "dockerfile",
  ]),

  // Database judge
  database: new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "php", "sql", "kotlin"]),

  // Performance judges
  performance: new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "ruby",
    "c",
    "cpp",
    "kotlin",
    "scala",
  ]),
  scalability: new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin", "scala"]),
  caching: new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin"]),
  "cost-effectiveness": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "yaml", "terraform"]),

  // Reliability
  reliability: new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "ruby",
    "kotlin",
    "scala",
  ]),
  observability: new Set(["typescript", "javascript", "python", "go", "java", "csharp", "kotlin"]),
  "rate-limiting": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin"]),

  // Compliance judges
  compliance: new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "php", "kotlin"]),
  "data-sovereignty": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin"]),

  // UX / Accessibility — only frontend
  accessibility: new Set(["typescript", "javascript", "html"]),
  ux: new Set(["typescript", "javascript", "html"]),
  internationalization: new Set(["typescript", "javascript", "python", "java", "csharp", "ruby", "kotlin"]),

  // Backwards compatibility
  "backwards-compatibility": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin"]),

  // API judges
  "api-contract": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin", "scala"]),
  "api-design": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin", "scala"]),

  // Concurrency
  concurrency: new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "c",
    "cpp",
    "kotlin",
    "scala",
  ]),

  // Framework safety
  "framework-safety": new Set(["typescript", "javascript", "python", "java", "csharp", "ruby", "kotlin"]),

  // AI-specific
  "hallucination-detection": new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "ruby",
    "kotlin",
  ]),
  "model-fingerprint": new Set([
    "typescript",
    "javascript",
    "python",
    "go",
    "rust",
    "java",
    "csharp",
    "ruby",
    "kotlin",
  ]),
  "agent-instructions": new Set(["typescript", "javascript", "python", "yaml"]),
  "multi-turn-coherence": new Set(["typescript", "javascript", "python"]),

  // Other
  "ethics-bias": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin"]),
  portability: new Set(["typescript", "javascript", "python", "go", "rust", "java", "csharp", "c", "cpp"]),
  "logging-privacy": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "ruby", "kotlin"]),
  "configuration-management": new Set(["typescript", "javascript", "python", "go", "java", "csharp", "yaml", "json"]),
  "dependency-health": new Set(["typescript", "javascript", "python", "go", "rust", "java", "csharp", "ruby"]),
};

/** Content-based signals that boost judge relevance */
const CONTENT_SIGNALS: Record<string, RegExp> = {
  database:
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|mongoose|prisma|typeorm|sequelize|knex|drizzle|sqlalchemy|django\.db|ActiveRecord)\b/i,
  authentication: /\b(jwt|oauth|passport|bcrypt|argon2|session|cookie|token|login|signup|auth|credential|password)\b/i,
  "rate-limiting": /\b(rate[_-]?limit|throttl|express[_-]?rate|ratelimit|bucket|leaky|sliding[_-]?window)\b/i,
  caching: /\b(redis|memcache|cache|lru|ttl|invalidat|memoiz)\b/i,
  "iac-security": /\b(resource|provider|module|azurerm|aws_|google_|terraform|apiVersion|kind:\s*Deployment)\b/i,
  accessibility: /\b(aria-|role=|alt=|tabindex|a11y|wcag|screen[_-]?reader)\b/i,
  internationalization: /\b(i18n|l10n|intl\.|gettext|ngettext|t\(|useTranslation|formatMessage)\b/i,
  concurrency:
    /\b(mutex|semaphor|lock|atomic|channel|goroutine|thread|async|await|Promise\.all|worker|race condition)\b/i,
};

// ─── Selection Logic ────────────────────────────────────────────────────────

/**
 * Select relevant judges for a given file based on its language and content.
 * Returns the list of judge IDs that should be run.
 */
export function selectJudgesForFile(language: string, code: string, availableJudges?: string[]): JudgeRelevance[] {
  const judges = availableJudges || defaultRegistry.getJudges().map((j) => j.id);
  const results: JudgeRelevance[] = [];

  for (const judgeId of judges) {
    // Universal judges are always relevant
    if (UNIVERSAL_JUDGES.has(judgeId)) {
      results.push({ judgeId, relevant: true, reason: "Universal judge" });
      continue;
    }

    // Check language relevance
    const langSet = LANGUAGE_SPECIFIC[judgeId];
    if (langSet) {
      if (langSet.has(language)) {
        results.push({ judgeId, relevant: true, reason: `Relevant for ${language}` });
      } else {
        // Check content-based override — maybe the code contains relevant patterns
        const signal = CONTENT_SIGNALS[judgeId];
        if (signal && signal.test(code)) {
          results.push({ judgeId, relevant: true, reason: `Content signal detected` });
        } else {
          results.push({ judgeId, relevant: false, reason: `Not relevant for ${language}` });
        }
      }
      continue;
    }

    // Unknown judge — include it to be safe
    results.push({ judgeId, relevant: true, reason: "Default include" });
  }

  return results;
}

/**
 * Get just the relevant judge IDs for a file.
 */
export function getRelevantJudges(language: string, code: string, availableJudges?: string[]): string[] {
  return selectJudgesForFile(language, code, availableJudges)
    .filter((r) => r.relevant)
    .map((r) => r.judgeId);
}

/**
 * CLI: Show judge selection for a file.
 */
export function runSmartSelect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges smart-select — Show which judges would run for a file

Usage:
  judges smart-select <file>              Show relevant judges
  judges smart-select --language <lang>   Specify language
  judges smart-select --all               Show all judges including skipped

Options:
  --language <lang>    Override detected language
  --all                Show all judges (relevant + skipped)
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const { readFileSync } = require("fs");
  const { extname } = require("path");

  const file = argv.find(
    (a, i) => i > 1 && !a.startsWith("-") && argv[i - 1] !== "--language" && argv[i - 1] !== "--format",
  );
  const langOverride = argv.find((_a: string, i: number) => argv[i - 1] === "--language");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const showAll = argv.includes("--all");

  const EXT_MAP: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".tf": "terraform",
    ".bicep": "bicep",
    ".sql": "sql",
    ".sh": "bash",
    ".ps1": "powershell",
    ".dockerfile": "dockerfile",
  };

  let language = langOverride || "typescript";
  let code = "";

  if (file) {
    try {
      code = readFileSync(file, "utf-8");
    } catch {
      /* use empty */
    }
    if (!langOverride) {
      const ext = extname(file).toLowerCase();
      language = EXT_MAP[ext] || "typescript";
      if (file.toLowerCase().includes("dockerfile")) language = "dockerfile";
    }
  }

  const results = selectJudgesForFile(language, code);

  if (format === "json") {
    console.log(JSON.stringify({ language, results: showAll ? results : results.filter((r) => r.relevant) }, null, 2));
    return;
  }

  const relevant = results.filter((r) => r.relevant);
  const skipped = results.filter((r) => !r.relevant);

  console.log(`\n  Smart Judge Selection — ${language}\n`);
  console.log(`  Relevant judges (${relevant.length}):`);
  for (const r of relevant) {
    console.log(`    ✅ ${r.judgeId.padEnd(30)} ${r.reason}`);
  }

  if (showAll && skipped.length > 0) {
    console.log(`\n  Skipped judges (${skipped.length}):`);
    for (const r of skipped) {
      console.log(`    ⏭️  ${r.judgeId.padEnd(30)} ${r.reason}`);
    }
  }

  console.log(`\n  ${relevant.length}/${results.length} judges selected (${skipped.length} skipped)\n`);
}

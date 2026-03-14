/**
 * Multi-lang-review — Cross-language consistency checking.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LangFile {
  path: string;
  language: string;
  lineCount: number;
}

interface CrossLangIssue {
  type: string;
  severity: string;
  description: string;
  files: string[];
  recommendation: string;
}

interface MultiLangReport {
  projectLanguages: { language: string; files: number; lines: number }[];
  totalFiles: number;
  totalLanguages: number;
  issues: CrossLangIssue[];
}

// ─── Language detection ─────────────────────────────────────────────────────

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
  ".cpp": "cpp",
  ".c": "c",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
};

// ─── File collection ────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "__pycache__",
  "vendor",
  "target",
  ".next",
  "coverage",
]);

function collectSourceFiles(dir: string, maxDepth: number = 5, depth: number = 0): LangFile[] {
  if (depth > maxDepth || !existsSync(dir)) return [];

  const results: LangFile[] = [];
  const entries = readdirSync(dir) as unknown as string[];

  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const fullPath = join(dir, entry);

    try {
      const st = statSync(fullPath);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) {
          results.push(...collectSourceFiles(fullPath, maxDepth, depth + 1));
        }
      } else {
        const ext = extname(entry).toLowerCase();
        const lang = EXT_MAP[ext];
        if (lang) {
          const content = readFileSync(fullPath, "utf-8");
          results.push({ path: fullPath, language: lang, lineCount: content.split("\n").length });
        }
      }
    } catch {
      // Skip inaccessible
    }
  }

  return results;
}

// ─── Cross-language analysis ────────────────────────────────────────────────

function analyzeConsistency(files: LangFile[]): CrossLangIssue[] {
  const issues: CrossLangIssue[] = [];
  const langGroups = new Map<string, LangFile[]>();

  for (const f of files) {
    const existing = langGroups.get(f.language) || [];
    existing.push(f);
    langGroups.set(f.language, existing);
  }

  const languages = [...langGroups.keys()];

  // Check for mixed JS/TS (common issue)
  if (langGroups.has("javascript") && langGroups.has("typescript")) {
    const jsFiles = langGroups.get("javascript") || [];
    const tsFiles = langGroups.get("typescript") || [];
    if (jsFiles.length > 0 && tsFiles.length > 0) {
      issues.push({
        type: "mixed-js-ts",
        severity: "medium",
        description: `Project mixes JavaScript (${jsFiles.length} files) and TypeScript (${tsFiles.length} files)`,
        files: [...jsFiles.slice(0, 3).map((f) => f.path), ...tsFiles.slice(0, 3).map((f) => f.path)],
        recommendation: "Consider migrating all JavaScript files to TypeScript for consistent type safety",
      });
    }
  }

  // Check for API contract consistency (frontend + backend languages)
  const frontendLangs = new Set(["javascript", "typescript"]);
  const backendLangs = new Set(["python", "go", "java", "csharp", "ruby", "php", "rust"]);
  const hasFrontend = languages.some((l) => frontendLangs.has(l));
  const hasBackend = languages.some((l) => backendLangs.has(l));

  if (hasFrontend && hasBackend) {
    issues.push({
      type: "api-contract-risk",
      severity: "high",
      description:
        "Multi-tier project detected. Frontend and backend languages present — API contract mismatches are common",
      files: [],
      recommendation: "Use OpenAPI/Swagger specs or shared schema definitions to maintain API consistency across tiers",
    });
  }

  // Check for multiple backend languages
  const backendFound = languages.filter((l) => backendLangs.has(l));
  if (backendFound.length > 1) {
    issues.push({
      type: "polyglot-backend",
      severity: "low",
      description: `Multiple backend languages detected: ${backendFound.join(", ")}. This increases operational complexity`,
      files: [],
      recommendation: "Ensure each language has consistent error handling, logging, and security patterns",
    });
  }

  // Pattern: look for common security patterns across languages
  for (const [lang, langFiles] of langGroups) {
    let hasEnvAccess = false;
    let hasHardcodedStrings = false;

    for (const lf of langFiles.slice(0, 50)) {
      try {
        const content = readFileSync(lf.path, "utf-8");
        if (/process\.env|os\.environ|os\.Getenv|System\.getenv|ENV\[/i.test(content)) {
          hasEnvAccess = true;
        }
        if (/["'](sk-|api[_-]?key|password|secret)[a-z0-9]{8,}/i.test(content)) {
          hasHardcodedStrings = true;
        }
      } catch {
        // skip
      }
    }

    if (hasHardcodedStrings) {
      issues.push({
        type: "hardcoded-secrets",
        severity: "critical",
        description: `Potential hardcoded secrets detected in ${lang} files`,
        files: langFiles.slice(0, 3).map((f) => f.path),
        recommendation: "Use environment variables or a secrets manager consistently across all languages",
      });
    }

    if (!hasEnvAccess && langFiles.length > 5) {
      issues.push({
        type: "no-env-config",
        severity: "low",
        description: `No environment variable usage detected in ${lang} files — configuration may be hardcoded`,
        files: [],
        recommendation: "Use environment variables for configuration to support different deployment environments",
      });
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runMultiLangReview(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges multi-lang-review — Cross-language consistency checking

Usage:
  judges multi-lang-review                        Analyze current directory
  judges multi-lang-review --dir ./my-project     Analyze specific directory
  judges multi-lang-review --format json          JSON output

Options:
  --dir <path>         Directory to analyze (default: current directory)
  --depth <n>          Max directory depth to scan (default: 5)
  --format json        JSON output
  --help, -h           Show this help

Detects cross-language issues: mixed JS/TS, API contract risks,
polyglot backend complexity, and inconsistent security patterns.
`);
    return;
  }

  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir") || ".";
  const depthStr = argv.find((_a: string, i: number) => argv[i - 1] === "--depth");
  const maxDepth = depthStr ? parseInt(depthStr, 10) : 5;
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const files = collectSourceFiles(dir, maxDepth);

  if (files.length === 0) {
    console.log("No source files found.");
    return;
  }

  // Build language stats
  const langStats = new Map<string, { files: number; lines: number }>();
  for (const f of files) {
    const existing = langStats.get(f.language) || { files: 0, lines: 0 };
    existing.files++;
    existing.lines += f.lineCount;
    langStats.set(f.language, existing);
  }

  const projectLanguages = [...langStats.entries()]
    .map(([language, stats]) => ({ language, ...stats }))
    .sort((a, b) => b.lines - a.lines);

  const issues = analyzeConsistency(files);

  const report: MultiLangReport = {
    projectLanguages,
    totalFiles: files.length,
    totalLanguages: projectLanguages.length,
    issues,
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n  Multi-Language Review\n  ─────────────────────────────`);
  console.log(`    Languages: ${report.totalLanguages}`);
  console.log(`    Files: ${report.totalFiles}\n`);

  for (const lang of projectLanguages) {
    const bar = "█".repeat(Math.min(30, Math.ceil((lang.files / files.length) * 30)));
    console.log(
      `    ${lang.language.padEnd(15)} ${String(lang.files).padStart(5)} files ${String(lang.lines).padStart(8)} lines  ${bar}`,
    );
  }

  if (issues.length > 0) {
    console.log(`\n    Cross-Language Issues (${issues.length}):`);
    for (const issue of issues) {
      const sevIcon: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" };
      const icon = sevIcon[issue.severity] || "⬜";
      console.log(`\n      ${icon} [${issue.severity}] ${issue.type}`);
      console.log(`         ${issue.description}`);
      console.log(`         Fix: ${issue.recommendation}`);
    }
  } else {
    console.log(`\n    ✅ No cross-language issues detected.`);
  }

  console.log();
}

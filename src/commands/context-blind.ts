/**
 * Context blind — flag when AI reinvents utilities already present in the codebase.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContextIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function collectFiles(dir: string, max = 300): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

interface ProjectAsset {
  name: string;
  type: "function" | "class" | "const" | "type" | "interface";
  file: string;
  line: number;
  category: string;
}

function buildProjectInventory(files: string[]): ProjectAsset[] {
  const assets: ProjectAsset[] = [];

  for (const filepath of files) {
    let content: string;
    try {
      content = readFileSync(filepath, "utf-8");
    } catch {
      continue;
    }
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Exported functions
      const funcMatch = line.match(/export\s+(?:async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        const name = funcMatch[1];
        let category = "general";
        if (/format|stringify|serialize|render|display/i.test(name)) category = "formatting";
        else if (/validate|check|verify|assert|is[A-Z]/i.test(name)) category = "validation";
        else if (/parse|deserialize|decode|extract/i.test(name)) category = "parsing";
        else if (/log|error|warn|debug|trace|info/i.test(name)) category = "logging";
        else if (/fetch|request|get|post|put|delete|api|http/i.test(name)) category = "http";
        else if (/config|setting|option|env/i.test(name)) category = "config";
        else if (/hash|encrypt|decrypt|sign|token|auth/i.test(name)) category = "security";
        else if (/sort|filter|map|reduce|transform|convert/i.test(name)) category = "data-transform";
        else if (/path|file|dir|folder|read|write/i.test(name)) category = "filesystem";
        else if (/date|time|duration|format.*date|parse.*date/i.test(name)) category = "datetime";
        assets.push({ name, type: "function", file: filepath, line: i + 1, category });
      }

      // Exported classes
      const classMatch = line.match(/export\s+class\s+(\w+)/);
      if (classMatch) {
        const name = classMatch[1];
        let category = "general";
        if (/Error|Exception/i.test(name)) category = "error";
        else if (/Logger|Log/i.test(name)) category = "logging";
        else if (/Client|Service|Api/i.test(name)) category = "http";
        else if (/Config|Settings/i.test(name)) category = "config";
        else if (/Cache/i.test(name)) category = "cache";
        else if (/Validator/i.test(name)) category = "validation";
        assets.push({ name, type: "class", file: filepath, line: i + 1, category });
      }

      // Exported consts (utility objects, instances)
      const constMatch = line.match(/export\s+const\s+(\w+)/);
      if (constMatch) {
        assets.push({ name: constMatch[1], type: "const", file: filepath, line: i + 1, category: "general" });
      }
    }
  }

  return assets;
}

function analyzeFile(filepath: string, inventory: ProjectAsset[]): ContextIssue[] {
  const issues: ContextIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");
  const _fname = basename(filepath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New function that duplicates an existing exported function's purpose
    const newFuncMatch = line.match(/(?:function|const)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|\()/);
    if (newFuncMatch && !line.includes("export")) {
      const name = newFuncMatch[1];
      // Check if a similarly-named exported function exists elsewhere
      for (const asset of inventory) {
        if (asset.file === filepath) continue;
        if (asset.name.toLowerCase() === name.toLowerCase() && asset.type === "function") {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Reinvents existing project function",
            severity: "high",
            detail: `\`${name}\` already exported from \`${basename(asset.file)}:${asset.line}\` — reuse instead of reimplementing`,
          });
          break;
        }
      }
    }

    // Hand-rolled validation when project has validators
    const hasValidators = inventory.some((a) => a.category === "validation");
    if (hasValidators && /(?:if\s*\(\s*typeof\s+\w+\s*!==?\s*['"]|if\s*\(\s*!\w+\s*\|\|\s*typeof)/.test(line)) {
      const block = lines.slice(i, Math.min(i + 5, lines.length)).join("\n");
      const typeChecks = (block.match(/typeof\s+\w+/g) || []).length;
      if (typeChecks >= 3) {
        const validator = inventory.find((a) => a.category === "validation");
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Hand-rolled validation (project has validators)",
          severity: "medium",
          detail: `${typeChecks} inline type checks — project has validation utilities (e.g., \`${validator?.name}\` in ${validator ? basename(validator.file) : "?"})`,
        });
      }
    }

    // Custom error class when project has error hierarchy
    if (/class\s+\w*Error\s+extends\s+Error/.test(line) && !line.includes("export")) {
      const existingErrors = inventory.filter((a) => a.category === "error");
      if (existingErrors.length > 0) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "New error class (project has error hierarchy)",
          severity: "medium",
          detail: `Project already has ${existingErrors.length} error class(es) — extend existing hierarchy instead`,
        });
      }
    }

    // New HTTP client setup when project has one
    if (/(?:axios\.create|new\s+(?:HttpClient|FetchClient)|createHttpClient)/i.test(line)) {
      const existingClients = inventory.filter((a) => a.category === "http" && a.type === "class");
      if (existingClients.length > 0) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "New HTTP client (project has one)",
          severity: "medium",
          detail: `Project already has HTTP client(s) (e.g., \`${existingClients[0].name}\`) — reuse the configured instance`,
        });
      }
    }

    // New logger setup when project has one
    if (/(?:new\s+Logger|createLogger|winston\.create|pino\()/i.test(line)) {
      const existingLoggers = inventory.filter((a) => a.category === "logging");
      if (existingLoggers.length > 0) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "New logger (project has logging utility)",
          severity: "medium",
          detail: `Project already has logging (e.g., \`${existingLoggers[0].name}\`) — reuse instead of creating another`,
        });
      }
    }

    // Config loading when project has config module
    if (/(?:dotenv\.config|process\.env\.\w+.*process\.env\.\w+.*process\.env)/i.test(line)) {
      const existingConfig = inventory.filter((a) => a.category === "config");
      if (existingConfig.length > 0) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Direct env access (project has config module)",
          severity: "low",
          detail: `Project has config utilities (e.g., \`${existingConfig[0].name}\`) — use centralized config instead of direct env access`,
        });
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runContextBlind(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges context-blind — Flag AI code that reinvents existing project utilities

Usage:
  judges context-blind [dir]
  judges context-blind src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: duplicate function names, hand-rolled validation, redundant error classes,
new HTTP clients, new loggers, direct env access when project has config module.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const inventory = buildProjectInventory(files);
  const allIssues: ContextIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f, inventory));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 5);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          inventory: {
            functions: inventory.filter((a) => a.type === "function").length,
            classes: inventory.filter((a) => a.type === "class").length,
          },
          summary: { high: highCount, medium: medCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ CONTEXT-AWARE" : score >= 50 ? "⚠️  BLIND SPOTS" : "❌ REINVENTING";
    console.log(`\n  Context Blind: ${badge} (${score}/100)\n  ─────────────────────────────`);
    console.log(
      `    Project inventory: ${inventory.filter((a) => a.type === "function").length} functions, ${inventory.filter((a) => a.type === "class").length} classes`,
    );
    if (allIssues.length === 0) {
      console.log("    No reinvention detected.\n");
      return;
    }
    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);
    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}

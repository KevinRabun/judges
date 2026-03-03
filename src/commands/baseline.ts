// ─── Baseline Command ────────────────────────────────────────────────────────
// Create a baseline file from current findings so future runs can suppress them.
//
// Usage:
//   judges baseline create --file src/app.ts          # baseline one file
//   judges baseline create --file src/app.ts -o .judges-baseline.json
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, extname } from "path";
import { evaluateWithTribunal } from "../evaluators/index.js";

// ─── Language Detection ─────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
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
  ".json": "json",
  ".tf": "terraform",
  ".hcl": "terraform",
  ".sh": "bash",
  ".bash": "bash",
  ".ps1": "powershell",
  ".psm1": "powershell",
};

function detectLanguage(filePath: string): string | undefined {
  if (filePath.toLowerCase().includes("dockerfile")) return "dockerfile";
  const ext = extname(filePath.toLowerCase());
  return EXT_TO_LANG[ext];
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function runBaseline(argv: string[]): void {
  // judges baseline create [--file <path>] [-o <output>] [--language <lang>]
  const subcommand = argv[3]; // "create"

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log(`
Judges Panel — Baseline Management

USAGE:
  judges baseline create --file <path>                 Create baseline from file
  judges baseline create --file <path> -o baseline.json  Custom output path

OPTIONS:
  --file, -f <path>       File to evaluate for baseline
  --output, -o <path>     Output baseline file (default: .judges-baseline.json)
  --language, -l <lang>   Language override
`);
    process.exit(0);
  }

  if (subcommand !== "create") {
    console.error(`Unknown baseline subcommand: ${subcommand}`);
    console.error('Use "judges baseline create --file <path>"');
    process.exit(1);
  }

  let file: string | undefined;
  let output = ".judges-baseline.json";
  let language: string | undefined;

  for (let i = 4; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
      case "-f":
        file = argv[++i];
        break;
      case "--output":
      case "-o":
        output = argv[++i];
        break;
      case "--language":
      case "-l":
        language = argv[++i];
        break;
      default:
        if (!arg.startsWith("-") && !file) file = arg;
        break;
    }
  }

  if (!file) {
    console.error("Error: --file is required for baseline create");
    process.exit(1);
  }

  const abs = resolve(file);
  if (!existsSync(abs)) {
    console.error(`Error: File not found: ${abs}`);
    process.exit(1);
  }

  const code = readFileSync(abs, "utf-8");
  const lang = language || detectLanguage(file) || "typescript";

  console.log(`Evaluating ${file} to create baseline...`);
  const verdict = evaluateWithTribunal(code, lang);

  const baselineData = {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceFile: file,
    findings: verdict.findings.map((f) => ({
      ruleId: f.ruleId,
      title: f.title,
      lineNumbers: f.lineNumbers,
      severity: f.severity,
    })),
    totalFindings: verdict.findings.length,
    score: verdict.overallScore,
  };

  const outPath = resolve(output);
  writeFileSync(outPath, JSON.stringify(baselineData, null, 2), "utf-8");
  console.log(`✅ Baseline created: ${outPath} (${baselineData.totalFindings} findings captured)`);
  process.exit(0);
}

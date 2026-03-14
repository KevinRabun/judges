/**
 * Hallucination detect — find fabricated API calls, non-existent methods, and invented config options.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, resolve } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HallucinationIssue {
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

// ─── Known API Databases ────────────────────────────────────────────────────

const DEPRECATED_NODE_APIS: Record<string, string> = {
  "url.parse": "new URL()",
  "new Buffer(": "Buffer.from() or Buffer.alloc()",
  "fs.exists(": "fs.existsSync() or fs.access()",
  "path.existsSync": "fs.existsSync()",
  "crypto.createCipher(": "crypto.createCipheriv()",
  "crypto.createDecipher(": "crypto.createDecipheriv()",
  "os.tmpDir()": "os.tmpdir()",
  "util.puts": "console.log",
  "util.print": "console.log",
  "sys.puts": "console.log",
};

const NONEXISTENT_METHODS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /Array\.flatten\b/, message: "Array.flatten doesn't exist — use Array.prototype.flat()" },
  { pattern: /Array\.contains\b/, message: "Array.contains doesn't exist — use Array.prototype.includes()" },
  { pattern: /String\.contains\b/, message: "String.contains doesn't exist — use String.prototype.includes()" },
  { pattern: /Object\.length\b/, message: "Object.length doesn't exist — use Object.keys().length" },
  {
    pattern: /\.size\(\)/,
    message: ".size() is not a method — use .size (property) for Map/Set or .length for arrays",
  },
  {
    pattern: /Promise\.delay\b/,
    message: "Promise.delay doesn't exist in native Promise — use setTimeout wrapper or Bluebird",
  },
  { pattern: /JSON\.tryParse\b/, message: "JSON.tryParse doesn't exist — wrap JSON.parse in try/catch" },
  {
    pattern: /Array\.from\(\s*\{length:\s*\d+\}\s*,\s*\(\s*_\s*,\s*i\s*\)\s*=>\s*i\s*\)/,
    message:
      "Consider Array.from({length: N}, (_, i) => i) — correct but verbose; for simple ranges consider other approaches",
  },
  { pattern: /console\.debug\b/, message: "" }, // console.debug exists, don't flag
  { pattern: /Math\.clamp\b/, message: "Math.clamp doesn't exist — use Math.min(Math.max(value, min), max)" },
  { pattern: /Object\.isEmpty\b/, message: "Object.isEmpty doesn't exist — use Object.keys(obj).length === 0" },
  { pattern: /String\.reverse\b/, message: "String.reverse doesn't exist — use .split('').reverse().join('')" },
  { pattern: /Array\.unique\b/, message: "Array.unique doesn't exist — use [...new Set(array)]" },
  { pattern: /\.replaceAll\b/, message: "" }, // replaceAll exists in ES2021+, don't flag
];

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string, projectDir: string): HallucinationIssue[] {
  const issues: HallucinationIssue[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return issues;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check deprecated Node.js APIs
    for (const [api, replacement] of Object.entries(DEPRECATED_NODE_APIS)) {
      if (line.includes(api)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: `Deprecated API: ${api}`,
          severity: "medium",
          detail: `\`${api}\` is deprecated — use \`${replacement}\` instead`,
        });
      }
    }

    // Check non-existent methods
    for (const { pattern, message } of NONEXISTENT_METHODS) {
      if (message && pattern.test(line)) {
        issues.push({ file: filepath, line: i + 1, issue: "Non-existent API call", severity: "high", detail: message });
      }
    }

    // Check for fabricated Node.js module methods
    if (/require\s*\(\s*['"]fs['"]\s*\)\.(\w+)/.test(line) || /from\s+['"]fs['"]/.test(line)) {
      const methodMatch = line.match(/fs\.(\w+)\s*\(/g);
      if (methodMatch) {
        const knownFs = new Set([
          "readFile",
          "readFileSync",
          "writeFile",
          "writeFileSync",
          "readdir",
          "readdirSync",
          "stat",
          "statSync",
          "lstat",
          "lstatSync",
          "mkdir",
          "mkdirSync",
          "rmdir",
          "rmdirSync",
          "unlink",
          "unlinkSync",
          "rename",
          "renameSync",
          "copyFile",
          "copyFileSync",
          "access",
          "accessSync",
          "existsSync",
          "createReadStream",
          "createWriteStream",
          "watch",
          "watchFile",
          "unwatchFile",
          "open",
          "openSync",
          "close",
          "closeSync",
          "read",
          "readSync",
          "write",
          "writeSync",
          "appendFile",
          "appendFileSync",
          "chmod",
          "chmodSync",
          "chown",
          "chownSync",
          "realpath",
          "realpathSync",
          "link",
          "linkSync",
          "symlink",
          "symlinkSync",
          "truncate",
          "truncateSync",
          "rm",
          "rmSync",
          "cp",
          "cpSync",
          "promises",
        ]);
        for (const call of methodMatch) {
          const method = call.match(/fs\.(\w+)/)?.[1];
          if (method && !knownFs.has(method)) {
            issues.push({
              file: filepath,
              line: i + 1,
              issue: "Non-existent fs method",
              severity: "high",
              detail: `\`fs.${method}\` does not exist in Node.js fs module — AI may have hallucinated this method`,
            });
          }
        }
      }
    }

    // Check for invented environment variables referenced without fallback
    const envMatch = line.match(/process\.env\.([A-Z_]+)/g);
    if (envMatch) {
      for (const envRef of envMatch) {
        const varName = envRef.replace("process.env.", "");
        // Check if it's defined in any .env file
        const envFiles = [".env", ".env.example", ".env.local", ".env.development"];
        let defined = false;
        for (const envFile of envFiles) {
          try {
            const envContent = readFileSync(join(projectDir, envFile), "utf-8");
            if (envContent.includes(varName)) {
              defined = true;
              break;
            }
          } catch {
            /* skip */
          }
        }
        if (!defined && !/\|\||[?][?]|:\s*['"]|default/i.test(line)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Undeclared env variable without fallback",
            severity: "medium",
            detail: `\`${varName}\` not found in .env files and has no fallback — AI may have invented this variable`,
          });
        }
      }
    }

    // Check for plausible but non-existent Express/Koa/Fastify methods
    if (/(?:app|router|server)\.(\w+)\s*\(/.test(line)) {
      const method = line.match(/(?:app|router|server)\.(\w+)\s*\(/)?.[1];
      const fabricated = new Set([
        "mount",
        "register",
        "addRoute",
        "define",
        "handle",
        "before",
        "after",
        "onRequest",
        "onResponse",
        "preHandler",
        "postHandler",
      ]);
      // Only flag if we see express-like imports
      if (method && fabricated.has(method) && /express|koa|hapi/.test(content)) {
        issues.push({
          file: filepath,
          line: i + 1,
          issue: "Possibly fabricated framework method",
          severity: "medium",
          detail: `\`.${method}()\` may not exist on this framework — verify against official docs`,
        });
      }
    }

    // Type assertions to non-imported types
    if (/\bas\s+([A-Z]\w+)/.test(line)) {
      const typeName = line.match(/\bas\s+([A-Z]\w+)/)?.[1];
      if (
        typeName &&
        ![
          "HTMLElement",
          "Element",
          "Event",
          "Error",
          "Date",
          "RegExp",
          "Promise",
          "Array",
          "Map",
          "Set",
          "Record",
          "Partial",
          "Required",
          "Pick",
          "Omit",
          "Readonly",
          "Response",
          "Request",
          "Buffer",
          "NodeJS",
          "Window",
          "Document",
          "Function",
          "Object",
          "String",
          "Number",
          "Boolean",
          "Symbol",
        ].includes(typeName)
      ) {
        // Check if it's imported or defined in this file
        if (
          !content.includes(`interface ${typeName}`) &&
          !content.includes(`type ${typeName}`) &&
          !content.includes(`class ${typeName}`) &&
          !content.includes(`enum ${typeName}`) &&
          !new RegExp(`import.*\\b${typeName}\\b`).test(content)
        ) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Type assertion to undefined type",
            severity: "medium",
            detail: `\`as ${typeName}\` — type is not imported or defined in this file`,
          });
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runHallucinationDetect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges hallucination-detect — Find fabricated API calls and non-existent methods

Usage:
  judges hallucination-detect [dir]
  judges hallucination-detect src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: deprecated Node APIs, non-existent JS methods, fabricated fs methods,
undeclared env variables, fabricated framework methods, undefined type assertions.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";
  const projectDir = resolve(dir);

  const files = collectFiles(dir);
  const allIssues: HallucinationIssue[] = [];
  for (const f of files) allIssues.push(...analyzeFile(f, projectDir));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 15 - medCount * 5);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { high: highCount, medium: medCount, total: allIssues.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ GROUNDED" : score >= 50 ? "⚠️  SUSPECT" : "❌ HALLUCINATING";
    console.log(`\n  Hallucination Detect: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (allIssues.length === 0) {
      console.log("    No hallucinated APIs detected.\n");
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

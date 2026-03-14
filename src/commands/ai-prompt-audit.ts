/**
 * AI prompt audit — scans AI-generated code for prompt injection
 * risks: user input echoed into SQL, shell, config, etc.
 *
 * Pattern-based analysis only — no data stored externally.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PromptRisk {
  line: number;
  pattern: string;
  severity: "critical" | "high" | "medium";
  description: string;
  recommendation: string;
}

interface AuditResult {
  file: string;
  risks: PromptRisk[];
  riskScore: number;
  timestamp: string;
}

interface AuditStore {
  results: AuditResult[];
  updatedAt: string;
}

const AUDIT_DIR = ".judges-prompt-audit";
const AUDIT_FILE = join(AUDIT_DIR, "audit-history.json");

// ─── Risk patterns ──────────────────────────────────────────────────────────

interface RiskPattern {
  id: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium";
  description: string;
  recommendation: string;
}

const RISK_PATTERNS: RiskPattern[] = [
  {
    id: "sql-template-literal",
    regex:
      /`[^`]*\$\{[^}]*(?:user|input|param|query|req\.|request|body|args)[^}]*\}[^`]*(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)/i,
    severity: "critical",
    description: "Template literal with user input in SQL context",
    recommendation: "Use parameterized queries ($1, $2) instead of string interpolation",
  },
  {
    id: "sql-concat",
    regex: /(?:query|sql|execute|prepare)\s*\([^)]*(?:\+|\bconcat)\s*[^)]*(?:user|input|param|req\.|request|body)/i,
    severity: "critical",
    description: "String concatenation with user input in SQL query",
    recommendation: "Use parameterized queries with placeholder values",
  },
  {
    id: "shell-injection",
    regex: /(?:exec|spawn|execSync|execFile|system|popen)\s*\([^)]*(?:\$\{|[\s+].*(?:user|input|param|req\.|args))/i,
    severity: "critical",
    description: "User input in shell command execution",
    recommendation: "Use execFile with argument array, or validate against an allowlist",
  },
  {
    id: "eval-user-input",
    regex: /(?:eval|Function|setTimeout|setInterval)\s*\([^)]*(?:user|input|param|req\.|request|body|query)/i,
    severity: "critical",
    description: "User input passed to eval or dynamic code execution",
    recommendation: "Never use eval with user input; use safe parsers instead",
  },
  {
    id: "innerHTML-assignment",
    regex: /\.innerHTML\s*=\s*(?!['"`](?:''|""|``)).*(?:user|input|param|data|response|result)/i,
    severity: "high",
    description: "Dynamic content assigned to innerHTML without sanitization",
    recommendation: "Use textContent for text or a sanitization library (DOMPurify) for HTML",
  },
  {
    id: "hardcoded-secret",
    regex: /(?:password|secret|api_key|apiKey|token|auth)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    severity: "high",
    description: "Hardcoded credential or secret in source code",
    recommendation: "Use environment variables or a secrets manager",
  },
  {
    id: "url-user-input",
    regex: /(?:fetch|axios|http\.get|request|got)\s*\([^)]*(?:\$\{|[\s+].*(?:user|input|param|req\.|url|host))/i,
    severity: "high",
    description: "User-controlled URL in HTTP request (SSRF risk)",
    recommendation: "Validate URLs against an allowlist and block private IP ranges",
  },
  {
    id: "path-traversal",
    regex:
      /(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|unlink|rmdir)\s*\([^)]*(?:\$\{|[\s+].*(?:user|input|param|req\.|path|file|name))/i,
    severity: "high",
    description: "User input in file system operation (path traversal risk)",
    recommendation: "Sanitize paths with path.resolve and validate within allowed directory",
  },
  {
    id: "prompt-echo",
    regex:
      /(?:\/\/|#)\s*(?:TODO|FIXME|HACK|generated|copilot|cursor|claude|gpt|ai)[:\s].*(?:user|implement|replace|change)/i,
    severity: "medium",
    description: "AI prompt remnant in code comment — may expose intent or instructions",
    recommendation: "Remove AI generation comments and prompt artifacts before committing",
  },
  {
    id: "cors-wildcard",
    regex: /(?:Access-Control-Allow-Origin|cors|origin)\s*[:=]\s*['"`]\*['"`]/i,
    severity: "medium",
    description: "Wildcard CORS allows any origin to access the API",
    recommendation: "Restrict CORS to specific trusted origins",
  },
];

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });
}

function loadStore(): AuditStore {
  if (!existsSync(AUDIT_FILE)) return { results: [], updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(readFileSync(AUDIT_FILE, "utf-8"));
  } catch {
    return { results: [], updatedAt: new Date().toISOString() };
  }
}

function saveStore(store: AuditStore): void {
  ensureDir();
  store.updatedAt = new Date().toISOString();
  writeFileSync(AUDIT_FILE, JSON.stringify(store, null, 2));
}

export function auditFile(filePath: string): AuditResult {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const risks: PromptRisk[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of RISK_PATTERNS) {
      if (pattern.regex.test(line)) {
        risks.push({
          line: i + 1,
          pattern: pattern.id,
          severity: pattern.severity,
          description: pattern.description,
          recommendation: pattern.recommendation,
        });
      }
    }
  }

  // Risk score: critical=30, high=15, medium=5
  const riskScore = risks.reduce((sum, r) => {
    if (r.severity === "critical") return sum + 30;
    if (r.severity === "high") return sum + 15;
    return sum + 5;
  }, 0);

  const result: AuditResult = {
    file: filePath,
    risks,
    riskScore: Math.min(100, riskScore),
    timestamp: new Date().toISOString(),
  };

  // Persist
  const store = loadStore();
  store.results.push(result);
  if (store.results.length > 200) store.results = store.results.slice(-200);
  saveStore(store);

  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAiPromptAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges ai-prompt-audit — Scan for prompt injection risks in AI-generated code

Usage:
  judges ai-prompt-audit --file src/app.ts
  judges ai-prompt-audit --patterns
  judges ai-prompt-audit --history
  judges ai-prompt-audit --summary

Options:
  --file <path>           Scan a file for prompt injection risks
  --patterns              Show all detection patterns
  --history               Show audit history
  --summary               Show risk summary across all audits
  --format json           JSON output
  --help, -h              Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Patterns
  if (argv.includes("--patterns")) {
    const patterns = RISK_PATTERNS.map(({ id, severity, description, recommendation }) => ({
      id,
      severity,
      description,
      recommendation,
    }));
    if (format === "json") {
      console.log(JSON.stringify(patterns, null, 2));
    } else {
      console.log(`\n  Prompt Audit Patterns (${patterns.length})\n  ──────────────────────────`);
      for (const p of patterns) {
        console.log(`    [${p.severity.padEnd(8)}] ${p.id.padEnd(25)} ${p.description}`);
      }
      console.log("");
    }
    return;
  }

  // History
  if (argv.includes("--history")) {
    const store = loadStore();
    if (format === "json") {
      console.log(JSON.stringify(store, null, 2));
    } else {
      console.log(`\n  Audit History (${store.results.length} scans)\n  ──────────────────────────`);
      for (const r of store.results.slice(-15)) {
        const icon = r.riskScore === 0 ? "✅" : r.riskScore >= 50 ? "🔴" : "⚠️";
        console.log(
          `    ${icon} ${r.timestamp.slice(0, 16)}  risk:${r.riskScore.toString().padEnd(4)} ${r.risks.length} issues  ${r.file}`,
        );
      }
      console.log("");
    }
    return;
  }

  // Summary
  if (argv.includes("--summary")) {
    const store = loadStore();
    const totalRisks = store.results.reduce((s, r) => s + r.risks.length, 0);
    const critCount = store.results.reduce((s, r) => s + r.risks.filter((x) => x.severity === "critical").length, 0);
    const highCount = store.results.reduce((s, r) => s + r.risks.filter((x) => x.severity === "high").length, 0);
    const avgScore =
      store.results.length > 0
        ? Math.round(store.results.reduce((s, r) => s + r.riskScore, 0) / store.results.length)
        : 0;
    if (format === "json") {
      console.log(
        JSON.stringify({ totalScans: store.results.length, totalRisks, critCount, highCount, avgScore }, null, 2),
      );
    } else {
      console.log(`\n  Prompt Audit Summary\n  ──────────────────────────`);
      console.log(`  Scans:    ${store.results.length}`);
      console.log(`  Risks:    ${totalRisks} (${critCount} critical, ${highCount} high)`);
      console.log(`  Avg risk: ${avgScore}/100`);
      console.log("");
    }
    return;
  }

  // Scan file
  const filePath = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!filePath) {
    console.error("  Use --file <path>, --patterns, --history, or --summary. --help for usage.");
    return;
  }

  if (!existsSync(filePath)) {
    console.error(`  File not found: ${filePath}`);
    return;
  }

  const result = auditFile(filePath);
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const icon = result.riskScore === 0 ? "✅" : result.riskScore >= 50 ? "🔴" : "⚠️";
    console.log(`\n  ${icon} Prompt Audit — ${filePath}`);
    console.log(`  Risk score: ${result.riskScore}/100 | Issues: ${result.risks.length}`);
    console.log(`  ──────────────────────────`);
    if (result.risks.length === 0) {
      console.log("    No prompt injection risks detected.");
    } else {
      for (const r of result.risks) {
        console.log(`    L${r.line.toString().padEnd(5)} [${r.severity.padEnd(8)}] ${r.pattern}`);
        console.log(`           ${r.description}`);
        console.log(`           Fix: ${r.recommendation}`);
      }
    }
    console.log("");
  }
}

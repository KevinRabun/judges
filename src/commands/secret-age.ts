/**
 * Secret age — detect credentials with no rotation policy, hardcoded expiry,
 * missing vault references, and shared service-account credentials.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SecretFinding {
  file: string;
  line: number;
  finding: string;
  severity: "critical" | "high" | "medium";
  recommendation: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".yaml",
  ".yml",
  ".json",
  ".env",
  ".toml",
  ".cfg",
  ".ini",
  ".xml",
]);

function collectFiles(dir: string, max = 400): string[] {
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
        else if (SCAN_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const SECRET_PATTERNS: {
  pattern: RegExp;
  finding: string;
  severity: "critical" | "high" | "medium";
  recommendation: string;
}[] = [
  {
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9]{16,}['"]/i,
    finding: "Hardcoded API key",
    severity: "critical",
    recommendation: "Move to vault or environment variable",
  },
  {
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i,
    finding: "Hardcoded password",
    severity: "critical",
    recommendation: "Use a secrets manager",
  },
  {
    pattern: /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{16,}['"]/i,
    finding: "Hardcoded secret/token",
    severity: "critical",
    recommendation: "Store in vault (AWS SSM, Azure Key Vault, HashiCorp Vault)",
  },
  {
    pattern: /(?:private[_-]?key|privateKey)\s*[:=]\s*['"`]-----BEGIN/i,
    finding: "Embedded private key",
    severity: "critical",
    recommendation: "Store private keys in a secure key store",
  },
  {
    pattern: /(?:connection[_-]?string|connStr)\s*[:=]\s*['"][^'"]{20,}['"]/i,
    finding: "Hardcoded connection string",
    severity: "high",
    recommendation: "Reference from vault; use managed identity where possible",
  },
  {
    pattern: /expires?\s*[:=]\s*['"]?\d{4}[-/]\d{2}[-/]\d{2}/i,
    finding: "Hardcoded expiry date",
    severity: "medium",
    recommendation: "Implement dynamic rotation; avoid static expiry",
  },
  {
    pattern: /rotation|rotate.*(?:never|disabled|false)/i,
    finding: "Rotation disabled",
    severity: "high",
    recommendation: "Enable automatic credential rotation",
  },
  {
    pattern: /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['"][A-Z0-9]{16,}['"]/i,
    finding: "AWS credentials in source",
    severity: "critical",
    recommendation: "Use IAM roles or environment credentials",
  },
  {
    pattern: /(?:GOOGLE_APPLICATION_CREDENTIALS|gcp_credentials)\s*[:=]\s*['"][^'"]+['"]/i,
    finding: "GCP credentials in source",
    severity: "high",
    recommendation: "Use workload identity or service account key file outside repo",
  },
  {
    pattern: /(?:shared|common)[_-]?(?:service)?[_-]?(?:account|credential|key)/i,
    finding: "Shared service credentials",
    severity: "high",
    recommendation: "Use per-environment, per-service credentials",
  },
];

function analyzeFile(filepath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return findings;
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (/^\s*(?:\/\/|#|\/\*|\*)/.test(line)) continue;

    for (const sp of SECRET_PATTERNS) {
      if (sp.pattern.test(line)) {
        findings.push({
          file: filepath,
          line: i + 1,
          finding: sp.finding,
          severity: sp.severity,
          recommendation: sp.recommendation,
        });
      }
    }
  }

  // Check for vault integration
  const hasVaultRef = /vault|keyVault|ssm|secretsmanager|VAULT_ADDR|SecretClient/i.test(content);
  const hasSecrets = findings.length > 0;
  if (hasSecrets && !hasVaultRef) {
    findings.push({
      file: filepath,
      line: 1,
      finding: "No vault integration detected",
      severity: "medium",
      recommendation: "Add a secrets manager reference for credential lifecycle management",
    });
  }

  return findings;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runSecretAge(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges secret-age — Credential lifecycle and rotation analysis

Usage:
  judges secret-age [dir]
  judges secret-age src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Detects: hardcoded API keys, passwords, tokens, private keys, connection strings,
disabled rotation, hardcoded expiry, shared credentials, missing vault integration.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allFindings: SecretFinding[] = [];
  for (const f of files) allFindings.push(...analyzeFile(f));

  const critCount = allFindings.filter((f) => f.severity === "critical").length;
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const score = allFindings.length === 0 ? 100 : Math.max(0, 100 - critCount * 20 - highCount * 10);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          findings: allFindings,
          score,
          summary: { critical: critCount, high: highCount, total: allFindings.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge =
      critCount > 0 ? "🚫 EXPOSED" : highCount > 0 ? "⚠️  AT RISK" : allFindings.length > 0 ? "🟡 REVIEW" : "✅ CLEAN";
    console.log(`\n  Secret Age Analysis: ${badge} (${score}/100)\n  ─────────────────────────────`);

    if (allFindings.length === 0) {
      console.log("    No credential lifecycle issues detected.\n");
      return;
    }

    for (const f of allFindings) {
      const icon = f.severity === "critical" ? "🚫" : f.severity === "high" ? "🔴" : "🟡";
      console.log(`    ${icon} [${f.severity.toUpperCase()}] ${f.finding}`);
      console.log(`        ${f.file}:${f.line}`);
      console.log(`        → ${f.recommendation}`);
    }

    console.log(
      `\n    Total: ${allFindings.length} | Critical: ${critCount} | High: ${highCount} | Score: ${score}/100\n`,
    );
  }
}

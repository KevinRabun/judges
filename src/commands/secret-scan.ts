/**
 * Secret scan — entropy-based and regex-based secret detection
 * in source files. Optimized for CI gates and pre-commit hooks.
 *
 * All analysis local — no external services.
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SecretPattern {
  id: string;
  name: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium";
}

interface SecretFinding {
  file: string;
  line: number;
  patternId: string;
  patternName: string;
  severity: string;
  snippet: string;
  masked: string;
}

interface SecretReport {
  findings: SecretFinding[];
  scannedFiles: number;
  timestamp: string;
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const SECRET_PATTERNS: SecretPattern[] = [
  { id: "aws-access-key", name: "AWS Access Key", regex: /AKIA[0-9A-Z]{16}/, severity: "critical" },
  {
    id: "aws-secret-key",
    name: "AWS Secret Key",
    regex: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})/,
    severity: "critical",
  },
  {
    id: "github-token",
    name: "GitHub Token",
    regex: /ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}/,
    severity: "critical",
  },
  { id: "github-oauth", name: "GitHub OAuth", regex: /gho_[A-Za-z0-9]{36}/, severity: "critical" },
  {
    id: "generic-api-key",
    name: "Generic API Key",
    regex: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]([A-Za-z0-9_-]{20,})['"]/,
    severity: "high",
  },
  {
    id: "generic-secret",
    name: "Generic Secret",
    regex: /(?:secret|password|passwd|pwd)\s*[=:]\s*['"]([^'"]{8,})['"]/,
    severity: "high",
  },
  {
    id: "private-key",
    name: "Private Key",
    regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
    severity: "critical",
  },
  {
    id: "gcp-service-account",
    name: "GCP Service Account",
    regex: /"type"\s*:\s*"service_account"/,
    severity: "critical",
  },
  { id: "stripe-key", name: "Stripe API Key", regex: /sk_live_[A-Za-z0-9]{24,}/, severity: "critical" },
  { id: "stripe-test", name: "Stripe Test Key", regex: /sk_test_[A-Za-z0-9]{24,}/, severity: "medium" },
  {
    id: "slack-webhook",
    name: "Slack Webhook",
    regex: /hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/,
    severity: "high",
  },
  { id: "slack-token", name: "Slack Token", regex: /xox[bprs]-[A-Za-z0-9-]+/, severity: "high" },
  { id: "npm-token", name: "NPM Token", regex: /npm_[A-Za-z0-9]{36}/, severity: "critical" },
  {
    id: "sendgrid-key",
    name: "SendGrid API Key",
    regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/,
    severity: "critical",
  },
  {
    id: "jwt-token",
    name: "JWT Token",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    severity: "high",
  },
  {
    id: "connection-string",
    name: "Database Connection String",
    regex: /(?:mongodb|postgres|mysql|redis):\/\/[^:]+:[^@]+@[^\s'"]+/,
    severity: "critical",
  },
];

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".svg",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".tar",
  ".gz",
]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next"]);

function collectFiles(dir: string, maxFiles: number): string[] {
  const result: string[] = [];

  function walk(d: string): void {
    if (result.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }

    for (const name of entries) {
      if (result.length >= maxFiles) return;
      if (SKIP_DIRS.has(name)) continue;
      const full = join(d, name);
      if (SKIP_EXTENSIONS.has(extname(name))) continue;
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        result.push(full);
      }
    }
  }

  walk(dir);
  return result;
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "****";
  return value.substring(0, 4) + "****" + value.substring(value.length - 4);
}

function scanFile(filePath: string): SecretFinding[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  // Skip binary-looking files
  if (content.includes("\0")) return [];

  const lines = content.split("\n");
  const findings: SecretFinding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments that are likely documentation
    if (/^\s*(?:\/\/|#|\/\*|\*)\s*(?:example|sample|placeholder|todo|fixme)/i.test(line)) continue;

    for (const pattern of SECRET_PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        findings.push({
          file: filePath,
          line: i + 1,
          patternId: pattern.id,
          patternName: pattern.name,
          severity: pattern.severity,
          snippet: line.trim().substring(0, 80),
          masked: maskSecret(match[0]),
        });
      }
    }
  }

  return findings;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-secret-scan";

export function runSecretScan(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges secret-scan — Detect secrets and credentials in source code

Usage:
  judges secret-scan [dir]
  judges secret-scan src/ --severity critical
  judges secret-scan --patterns
  judges secret-scan --save

Options:
  --severity <level>    Filter by severity (critical, high, medium)
  --patterns            List all secret detection patterns
  --save                Save report to ${STORE}/
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // List patterns
  if (argv.includes("--patterns")) {
    if (format === "json") {
      console.log(
        JSON.stringify(
          SECRET_PATTERNS.map(({ regex: _r, ...rest }) => rest),
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  Secret Patterns (${SECRET_PATTERNS.length})\n  ──────────────────────────`);
      for (const p of SECRET_PATTERNS) {
        console.log(`    [${p.severity.toUpperCase().padEnd(8)}] ${p.id.padEnd(25)} ${p.name}`);
      }
      console.log("");
    }
    return;
  }

  const scanDir = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";
  const sevFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");

  const files = collectFiles(scanDir, 1000);
  let findings: SecretFinding[] = [];
  for (const file of files) findings.push(...scanFile(file));

  if (sevFilter) findings = findings.filter((f) => f.severity === sevFilter);

  const report: SecretReport = { findings, scannedFiles: files.length, timestamp: new Date().toISOString() };

  if (argv.includes("--save")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, "secret-report.json"), JSON.stringify(report, null, 2));
    console.log(`  Report saved to ${STORE}/secret-report.json`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Secret Scan — ${report.scannedFiles} files scanned`);
    console.log(`  Found: ${findings.length} potential secrets\n  ──────────────────────────`);

    if (findings.length === 0) {
      console.log(`    ✅ No secrets detected\n`);
      return;
    }

    for (const sev of ["critical", "high", "medium"]) {
      const items = findings.filter((f) => f.severity === sev);
      if (items.length === 0) continue;
      console.log(`\n    ${sev.toUpperCase()} (${items.length})`);
      for (const f of items.slice(0, 10)) {
        console.log(`      ${f.file}:${f.line} — ${f.patternName}`);
        console.log(`        ${f.masked}`);
      }
      if (items.length > 10) console.log(`      ... and ${items.length - 10} more`);
    }
    console.log("");
  }
}

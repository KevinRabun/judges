/**
 * Finding-security-hotspot — Identify security-sensitive code zones.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SecurityHotspot {
  line: number;
  category: string;
  pattern: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  recommendation: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface HotspotRule {
  category: string;
  pattern: RegExp;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  recommendation: string;
}

const HOTSPOT_RULES: HotspotRule[] = [
  {
    category: "crypto",
    pattern: /\b(md5|sha1)\b/i,
    severity: "high",
    description: "Weak hash algorithm",
    recommendation: "Use SHA-256 or stronger",
  },
  {
    category: "crypto",
    pattern: /\b(DES|RC4|ECB)\b/,
    severity: "critical",
    description: "Weak cipher or mode",
    recommendation: "Use AES-GCM or ChaCha20",
  },
  {
    category: "auth",
    pattern: /password\s*=\s*["'][^"']+["']/i,
    severity: "critical",
    description: "Hardcoded password",
    recommendation: "Use environment variables or secrets manager",
  },
  {
    category: "auth",
    pattern: /api[_-]?key\s*=\s*["'][^"']+["']/i,
    severity: "critical",
    description: "Hardcoded API key",
    recommendation: "Use environment variables or secrets manager",
  },
  {
    category: "injection",
    pattern: /\beval\s*\(/,
    severity: "high",
    description: "Use of eval()",
    recommendation: "Avoid eval; use safe parsing alternatives",
  },
  {
    category: "injection",
    pattern: /\bexec\s*\(/,
    severity: "medium",
    description: "Use of exec()",
    recommendation: "Validate and sanitize inputs before exec",
  },
  {
    category: "injection",
    pattern: /innerHTML\s*=/,
    severity: "medium",
    description: "Direct innerHTML assignment",
    recommendation: "Use textContent or sanitize HTML",
  },
  {
    category: "data",
    pattern: /\b(console\.log|print|puts)\b.*password/i,
    severity: "high",
    description: "Logging sensitive data",
    recommendation: "Remove sensitive data from logs",
  },
  {
    category: "network",
    pattern: /http:\/\//,
    severity: "low",
    description: "Insecure HTTP URL",
    recommendation: "Use HTTPS",
  },
  {
    category: "network",
    pattern: /rejectUnauthorized\s*:\s*false/,
    severity: "high",
    description: "TLS validation disabled",
    recommendation: "Enable certificate validation",
  },
  {
    category: "file",
    pattern: /\.\.\//g,
    severity: "medium",
    description: "Path traversal pattern",
    recommendation: "Validate and sanitize file paths",
  },
  {
    category: "sql",
    pattern: /\bSELECT\b.*\+\s*\w+/i,
    severity: "high",
    description: "Potential SQL injection (string concat)",
    recommendation: "Use parameterized queries",
  },
];

function scanFile(filePath: string): SecurityHotspot[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const hotspots: SecurityHotspot[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("#")) continue;

    for (const rule of HOTSPOT_RULES) {
      if (rule.pattern.test(line)) {
        hotspots.push({
          line: i + 1,
          category: rule.category,
          pattern: rule.pattern.source,
          severity: rule.severity,
          description: rule.description,
          recommendation: rule.recommendation,
        });
      }
    }
  }

  return hotspots;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingSecurityHotspot(argv: string[]): void {
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-security-hotspot — Identify security-sensitive code

Usage:
  judges finding-security-hotspot <file1> [file2 ...] [--format table|json]

Options:
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const files = argv.filter(
    (a) => !a.startsWith("--") && (argv.indexOf(a) === 0 || argv[argv.indexOf(a) - 1] !== "--format"),
  );

  if (files.length === 0) {
    console.error("Error: provide one or more file paths");
    process.exitCode = 1;
    return;
  }

  const allHotspots: Array<SecurityHotspot & { file: string }> = [];
  for (const f of files) {
    if (!existsSync(f)) {
      console.error(`Warning: not found: ${f}`);
      continue;
    }
    try {
      const hs = scanFile(f);
      for (const h of hs) {
        allHotspots.push({ ...h, file: f });
      }
    } catch {
      console.error(`Warning: cannot read: ${f}`);
    }
  }

  if (allHotspots.length === 0) {
    console.log("No security hotspots found.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(allHotspots, null, 2));
    return;
  }

  console.log(`\nSecurity Hotspots (${allHotspots.length} found)`);
  console.log("═".repeat(80));
  console.log(`${"File".padEnd(25)} ${"Line".padEnd(7)} ${"Sev".padEnd(10)} ${"Cat".padEnd(12)} Description`);
  console.log("─".repeat(80));

  for (const h of allHotspots.sort((a, b) => {
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3);
  })) {
    const name = h.file.length > 23 ? "…" + h.file.slice(-22) : h.file;
    console.log(
      `${name.padEnd(25)} ${String(h.line).padEnd(7)} ${h.severity.padEnd(10)} ${h.category.padEnd(12)} ${h.description}`,
    );
    console.log(`${" ".repeat(25)} ${"".padEnd(7)} ${"".padEnd(10)} ${"".padEnd(12)} → ${h.recommendation}`);
  }
  console.log("═".repeat(80));
}

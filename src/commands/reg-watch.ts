/**
 * Regulatory change monitor — track security standards versions
 * and map coverage changes to the current rule set.
 *
 * Uses local versioned data files in .judges-reg-watch.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StandardVersion {
  standard: string;
  version: string;
  lastChecked: string;
  items: { id: string; title: string; covered: boolean; coveredBy?: string }[];
}

interface RegWatchDb {
  standards: StandardVersion[];
  lastUpdated: string;
}

const REG_FILE = ".judges-reg-watch.json";

// ─── Built-in standards ─────────────────────────────────────────────────────

const STANDARDS: Record<string, { version: string; items: { id: string; title: string; rulePrefix: string }[] }> = {
  "owasp-top10": {
    version: "2021",
    items: [
      { id: "A01", title: "Broken Access Control", rulePrefix: "AUTH" },
      { id: "A02", title: "Cryptographic Failures", rulePrefix: "CRYPTO" },
      { id: "A03", title: "Injection", rulePrefix: "INJECT" },
      { id: "A04", title: "Insecure Design", rulePrefix: "SEC" },
      { id: "A05", title: "Security Misconfiguration", rulePrefix: "SEC" },
      { id: "A06", title: "Vulnerable Components", rulePrefix: "DEP" },
      { id: "A07", title: "Authentication Failures", rulePrefix: "AUTH" },
      { id: "A08", title: "Software Integrity Failures", rulePrefix: "SEC" },
      { id: "A09", title: "Logging & Monitoring Failures", rulePrefix: "ERR" },
      { id: "A10", title: "Server-Side Request Forgery", rulePrefix: "SSRF" },
    ],
  },
  "cwe-top25": {
    version: "2024",
    items: [
      { id: "CWE-787", title: "Out-of-bounds Write", rulePrefix: "MEM" },
      { id: "CWE-79", title: "Cross-site Scripting (XSS)", rulePrefix: "INJECT" },
      { id: "CWE-89", title: "SQL Injection", rulePrefix: "INJECT" },
      { id: "CWE-416", title: "Use After Free", rulePrefix: "MEM" },
      { id: "CWE-78", title: "OS Command Injection", rulePrefix: "INJECT" },
      { id: "CWE-20", title: "Improper Input Validation", rulePrefix: "SEC" },
      { id: "CWE-125", title: "Out-of-bounds Read", rulePrefix: "MEM" },
      { id: "CWE-22", title: "Path Traversal", rulePrefix: "SEC" },
      { id: "CWE-352", title: "Cross-Site Request Forgery", rulePrefix: "SEC" },
      { id: "CWE-434", title: "Unrestricted Upload", rulePrefix: "SEC" },
      { id: "CWE-862", title: "Missing Authorization", rulePrefix: "AUTH" },
      { id: "CWE-476", title: "NULL Pointer Dereference", rulePrefix: "ERR" },
      { id: "CWE-287", title: "Improper Authentication", rulePrefix: "AUTH" },
      { id: "CWE-190", title: "Integer Overflow", rulePrefix: "SEC" },
      { id: "CWE-502", title: "Deserialization of Untrusted Data", rulePrefix: "SEC" },
      { id: "CWE-77", title: "Command Injection", rulePrefix: "INJECT" },
      { id: "CWE-119", title: "Buffer Overflow", rulePrefix: "MEM" },
      { id: "CWE-798", title: "Hardcoded Credentials", rulePrefix: "AUTH" },
      { id: "CWE-918", title: "Server-Side Request Forgery", rulePrefix: "SSRF" },
      { id: "CWE-306", title: "Missing Authentication", rulePrefix: "AUTH" },
      { id: "CWE-362", title: "Race Condition", rulePrefix: "CONCUR" },
      { id: "CWE-269", title: "Improper Privilege Management", rulePrefix: "AUTH" },
      { id: "CWE-94", title: "Code Injection", rulePrefix: "INJECT" },
      { id: "CWE-863", title: "Incorrect Authorization", rulePrefix: "AUTH" },
      { id: "CWE-276", title: "Incorrect Default Permissions", rulePrefix: "SEC" },
    ],
  },
  "nist-ssdf": {
    version: "1.1",
    items: [
      { id: "PO.1", title: "Define Security Requirements", rulePrefix: "SEC" },
      { id: "PS.1", title: "Protect Software", rulePrefix: "SEC" },
      { id: "PS.2", title: "Protect Development Environment", rulePrefix: "SEC" },
      { id: "PW.1", title: "Design for Security", rulePrefix: "SEC" },
      { id: "PW.5", title: "Create Source Code with Security Practices", rulePrefix: "SEC" },
      { id: "PW.6", title: "Configure the Build to Find Issues", rulePrefix: "SEC" },
      { id: "PW.7", title: "Review and Audit Software", rulePrefix: "SEC" },
      { id: "PW.8", title: "Test Executable Code", rulePrefix: "SEC" },
      { id: "RV.1", title: "Identify and Confirm Vulnerabilities", rulePrefix: "SEC" },
      { id: "RV.2", title: "Assess, Prioritize, and Remediate", rulePrefix: "SEC" },
    ],
  },
};

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(): RegWatchDb {
  if (!existsSync(REG_FILE)) return { standards: [], lastUpdated: "" };
  return JSON.parse(readFileSync(REG_FILE, "utf-8"));
}

function saveDb(db: RegWatchDb): void {
  writeFileSync(REG_FILE, JSON.stringify(db, null, 2));
}

function checkCoverage(standard: string): StandardVersion | null {
  const std = STANDARDS[standard];
  if (!std) return null;

  // Check which rules are covered via config
  let config: Record<string, unknown> = {};
  if (existsSync(".judgesrc")) {
    try {
      config = JSON.parse(readFileSync(".judgesrc", "utf-8"));
    } catch {
      /* empty */
    }
  }

  const disabledRules = new Set((config.disabledRules as string[]) || []);
  const _disabledJudges = new Set((config.disabledJudges as string[]) || []);

  const items = std.items.map((item) => {
    // Check if the rule prefix is disabled
    const isDisabled = [...disabledRules].some((r) => r.startsWith(item.rulePrefix));
    const judgeMapped = !["MEM", "CONCUR", "SSRF", "DEP"].includes(item.rulePrefix);
    const covered = judgeMapped && !isDisabled;

    return {
      id: item.id,
      title: item.title,
      covered,
      coveredBy: covered ? `${item.rulePrefix}*` : undefined,
    };
  });

  return {
    standard,
    version: std.version,
    lastChecked: new Date().toISOString(),
    items,
  };
}

export function updateWatch(standards: string[]): StandardVersion[] {
  const db = loadDb();
  const results: StandardVersion[] = [];

  for (const std of standards) {
    const result = checkCoverage(std);
    if (result) {
      db.standards = db.standards.filter((s) => s.standard !== std);
      db.standards.push(result);
      results.push(result);
    }
  }

  db.lastUpdated = new Date().toISOString();
  saveDb(db);
  return results;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRegWatch(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges reg-watch — Regulatory change monitoring

Usage:
  judges reg-watch --standards owasp-top10,cwe-top25
  judges reg-watch --check owasp-top10
  judges reg-watch --list
  judges reg-watch --status

Options:
  --standards <csv>    Check coverage for standards (comma-separated)
  --check <name>       Check single standard coverage
  --list               List available standards
  --status             Show last check status
  --format json        JSON output
  --help, -h           Show this help

Available standards:
  owasp-top10   OWASP Top 10 (2021)
  cwe-top25     CWE Top 25 (2024)
  nist-ssdf     NIST SSDF v1.1
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // List standards
  if (argv.includes("--list")) {
    if (format === "json") {
      console.log(
        JSON.stringify(
          Object.entries(STANDARDS).map(([k, v]) => ({ name: k, version: v.version, items: v.items.length })),
          null,
          2,
        ),
      );
    } else {
      console.log("\n  Available Standards\n  ───────────────────");
      for (const [name, std] of Object.entries(STANDARDS)) {
        console.log(`    ${name.padEnd(15)} v${std.version} (${std.items.length} items)`);
      }
      console.log("");
    }
    return;
  }

  // Check standards
  const standardsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--standards");
  const singleCheck = argv.find((_a: string, i: number) => argv[i - 1] === "--check");

  const toCheck = standardsStr ? standardsStr.split(",") : singleCheck ? [singleCheck] : [];

  if (toCheck.length > 0) {
    const results = updateWatch(toCheck);

    for (const result of results) {
      const covered = result.items.filter((i) => i.covered).length;
      const total = result.items.length;
      const pct = Math.round((covered / total) * 100);

      if (format === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          `\n  ${result.standard} v${result.version} — Coverage: ${pct}% (${covered}/${total})\n  ──────────────────────────────────────`,
        );
        for (const item of result.items) {
          const icon = item.covered ? "✅" : "❌";
          console.log(`    ${icon} ${item.id.padEnd(10)} ${item.title.padEnd(40)} ${item.coveredBy || "NOT COVERED"}`);
        }
        console.log("");
      }
    }
    return;
  }

  // Status
  if (argv.includes("--status")) {
    const db = loadDb();
    if (db.standards.length === 0) {
      console.log("\n  No standards monitored. Use --standards to start.\n");
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(db, null, 2));
    } else {
      console.log(`\n  Regulatory Watch Status\n  ───────────────────────`);
      console.log(`  Last updated: ${db.lastUpdated}`);
      for (const s of db.standards) {
        const covered = s.items.filter((i) => i.covered).length;
        console.log(
          `    ${s.standard.padEnd(15)} v${s.version} — ${covered}/${s.items.length} covered (${s.lastChecked.split("T")[0]})`,
        );
      }
      console.log("");
    }
    return;
  }

  console.log("  Use --standards or --check to monitor. --help for usage.");
}

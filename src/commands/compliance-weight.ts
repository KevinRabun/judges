/**
 * Compliance weight — dynamically adjust finding severity based on
 * active compliance frameworks (PCI-DSS, HIPAA, GDPR, SOC2, ISO27001).
 *
 * Takes a judges report (JSON) and re-weights findings according to
 * the specified framework(s). Stored config in `.judgesrc` or CLI flags.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

interface ComplianceFinding {
  ruleId: string;
  title: string;
  severity: string;
  originalSeverity: string;
  frameworks: string[];
  complianceNotes: string[];
  weight: number;
}

interface FrameworkRule {
  pattern: RegExp;
  weight: number;
  frameworks: string[];
  note: string;
}

// ─── Framework Definitions ──────────────────────────────────────────────────

const FRAMEWORK_RULES: FrameworkRule[] = [
  // PCI-DSS
  { pattern: /sql.?inject|injection/i, weight: 3.0, frameworks: ["PCI-DSS"], note: "PCI-DSS 6.5.1: Injection flaws" },
  {
    pattern: /xss|cross.?site.?script/i,
    weight: 2.5,
    frameworks: ["PCI-DSS"],
    note: "PCI-DSS 6.5.7: Cross-site scripting",
  },
  {
    pattern: /hardcoded.?(secret|password|key|credential|token)/i,
    weight: 3.0,
    frameworks: ["PCI-DSS"],
    note: "PCI-DSS 3.4: Render PAN unreadable",
  },
  {
    pattern: /crypto|encrypt|hash|cipher/i,
    weight: 2.0,
    frameworks: ["PCI-DSS"],
    note: "PCI-DSS 4.1: Strong cryptography",
  },
  {
    pattern: /auth|session|login|password/i,
    weight: 2.0,
    frameworks: ["PCI-DSS"],
    note: "PCI-DSS 8.x: Authentication controls",
  },

  // HIPAA
  {
    pattern: /pii|personal.?data|patient|health|phi|protected.?health/i,
    weight: 3.0,
    frameworks: ["HIPAA"],
    note: "HIPAA §164.312: ePHI protection",
  },
  {
    pattern: /encrypt|crypto|tls|ssl/i,
    weight: 2.5,
    frameworks: ["HIPAA"],
    note: "HIPAA §164.312(a)(2)(iv): Encryption",
  },
  { pattern: /log|audit|monitor/i, weight: 2.0, frameworks: ["HIPAA"], note: "HIPAA §164.312(b): Audit controls" },
  {
    pattern: /access.?control|rbac|authorization/i,
    weight: 2.5,
    frameworks: ["HIPAA"],
    note: "HIPAA §164.312(a)(1): Access control",
  },

  // GDPR
  {
    pattern: /pii|personal.?data|consent|data.?subject/i,
    weight: 3.0,
    frameworks: ["GDPR"],
    note: "GDPR Art. 5: Data processing principles",
  },
  {
    pattern: /data.?retention|delete|erase|forget/i,
    weight: 2.5,
    frameworks: ["GDPR"],
    note: "GDPR Art. 17: Right to erasure",
  },
  {
    pattern: /encrypt|pseudonym|anonymi/i,
    weight: 2.0,
    frameworks: ["GDPR"],
    note: "GDPR Art. 32: Security of processing",
  },
  {
    pattern: /third.?party|vendor|external.?api/i,
    weight: 2.0,
    frameworks: ["GDPR"],
    note: "GDPR Art. 28: Processor obligations",
  },

  // SOC2
  { pattern: /log|audit|monitor|alert/i, weight: 2.0, frameworks: ["SOC2"], note: "SOC2 CC7.x: System monitoring" },
  { pattern: /access.?control|auth|rbac/i, weight: 2.5, frameworks: ["SOC2"], note: "SOC2 CC6.x: Logical access" },
  {
    pattern: /encrypt|crypto|tls/i,
    weight: 2.0,
    frameworks: ["SOC2"],
    note: "SOC2 CC6.7: Encryption in transit/at rest",
  },
  {
    pattern: /error.?handling|exception|catch/i,
    weight: 1.5,
    frameworks: ["SOC2"],
    note: "SOC2 CC7.4: Error handling",
  },

  // ISO 27001
  {
    pattern: /access.?control|auth|rbac/i,
    weight: 2.5,
    frameworks: ["ISO27001"],
    note: "ISO27001 A.9: Access control",
  },
  {
    pattern: /crypto|encrypt|hash|key.?manage/i,
    weight: 2.5,
    frameworks: ["ISO27001"],
    note: "ISO27001 A.10: Cryptography",
  },
  { pattern: /backup|recovery|disaster/i, weight: 2.0, frameworks: ["ISO27001"], note: "ISO27001 A.12.3: Backup" },
  {
    pattern: /log|audit|monitor/i,
    weight: 2.0,
    frameworks: ["ISO27001"],
    note: "ISO27001 A.12.4: Logging and monitoring",
  },
];

const SEVERITY_LEVELS: Record<string, number> = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };
const SEVERITY_NAMES = ["info", "low", "medium", "high", "critical"];

function numericSeverity(sev: string): number {
  return SEVERITY_LEVELS[sev.toLowerCase()] || 2;
}

function severityFromScore(score: number): string {
  const clamped = Math.min(5, Math.max(1, Math.round(score)));
  return SEVERITY_NAMES[clamped - 1];
}

// ─── Re-weighting ───────────────────────────────────────────────────────────

function reweightFindings(
  findings: Array<{ ruleId?: string; title?: string; description?: string; severity?: string }>,
  activeFrameworks: string[],
): ComplianceFinding[] {
  const active = new Set(activeFrameworks.map((f) => f.toUpperCase()));

  return findings.map((f) => {
    const text = [f.ruleId || "", f.title || "", f.description || ""].join(" ");
    const originalSev = (f.severity || "medium").toLowerCase();
    const baseSeverity = numericSeverity(originalSev);

    let maxWeight = 1.0;
    const matchedFrameworks: string[] = [];
    const notes: string[] = [];

    for (const rule of FRAMEWORK_RULES) {
      // Only apply rules from active frameworks
      const ruleFrameworks = rule.frameworks.filter((fw) => active.has(fw.toUpperCase()));
      if (ruleFrameworks.length === 0) continue;

      if (rule.pattern.test(text)) {
        if (rule.weight > maxWeight) maxWeight = rule.weight;
        matchedFrameworks.push(...ruleFrameworks);
        notes.push(rule.note);
      }
    }

    const adjustedScore = baseSeverity * maxWeight;
    const newSeverity = severityFromScore(adjustedScore);

    return {
      ruleId: f.ruleId || "unknown",
      title: f.title || f.description || "Untitled finding",
      severity: newSeverity,
      originalSeverity: originalSev,
      frameworks: [...new Set(matchedFrameworks)],
      complianceNotes: [...new Set(notes)],
      weight: maxWeight,
    };
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runComplianceWeight(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges compliance-weight — Re-weight findings by compliance framework

Usage:
  judges compliance-weight --frameworks PCI-DSS,HIPAA < report.json
  judges compliance-weight --frameworks GDPR --demo
  judges compliance-weight --list-frameworks

Options:
  --frameworks <list>   Comma-separated frameworks: PCI-DSS, HIPAA, GDPR, SOC2, ISO27001
  --demo                Run with demo findings
  --list-frameworks     List available frameworks and rules
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const frameworksArg = argv.find((_a: string, i: number) => argv[i - 1] === "--frameworks") || "";
  const isDemo = argv.includes("--demo");
  const isList = argv.includes("--list-frameworks");

  if (isList) {
    const frameworks = new Map<string, string[]>();
    for (const rule of FRAMEWORK_RULES) {
      for (const fw of rule.frameworks) {
        const list = frameworks.get(fw) || [];
        list.push(`  ${rule.note} (weight: ${rule.weight}x)`);
        frameworks.set(fw, list);
      }
    }
    console.log("\n  Available Compliance Frameworks:\n  ──────────────────────────");
    for (const [fw, rules] of frameworks) {
      console.log(`\n    ${fw} (${rules.length} rules):`);
      for (const r of rules) console.log(`      ${r}`);
    }
    console.log("");
    return;
  }

  const activeFrameworks = frameworksArg
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean);
  if (activeFrameworks.length === 0) {
    console.error("  Specify --frameworks (e.g., --frameworks PCI-DSS,GDPR) or use --list-frameworks");
    return;
  }

  let findings: Array<{ ruleId?: string; title?: string; description?: string; severity?: string }>;

  if (isDemo) {
    findings = [
      { ruleId: "SEC-001", title: "SQL injection in user query", severity: "medium" },
      { ruleId: "SEC-002", title: "XSS vulnerability in template", severity: "medium" },
      { ruleId: "SEC-003", title: "Hardcoded password in config", severity: "high" },
      { ruleId: "SEC-004", title: "Missing encryption for PII data", severity: "medium" },
      { ruleId: "SEC-005", title: "No audit logging for access control", severity: "low" },
      { ruleId: "SEC-006", title: "Third-party API calls without auth", severity: "medium" },
      { ruleId: "SEC-007", title: "Missing data retention policy", severity: "low" },
      { ruleId: "PERF-001", title: "Inefficient loop nesting", severity: "low" },
    ];
  } else {
    // Read from stdin
    try {
      const input = require("fs").readFileSync(0, "utf-8");
      const parsed = JSON.parse(input);
      findings = parsed.findings || parsed.results || parsed;
      if (!Array.isArray(findings)) {
        console.error("  Input must contain a 'findings' or 'results' array");
        return;
      }
    } catch {
      console.error("  Could not read JSON from stdin. Use --demo for a demo or pipe a report.");
      return;
    }
  }

  const weighted = reweightFindings(findings, activeFrameworks);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          frameworks: activeFrameworks,
          findings: weighted,
          summary: {
            total: weighted.length,
            escalated: weighted.filter((f) => f.severity !== f.originalSeverity).length,
            complianceRelevant: weighted.filter((f) => f.frameworks.length > 0).length,
          },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const escalated = weighted.filter((f) => f.severity !== f.originalSeverity);
    const relevant = weighted.filter((f) => f.frameworks.length > 0);

    console.log(`\n  Compliance-Weighted Findings — ${activeFrameworks.join(", ")}\n  ──────────────────────────`);
    console.log(
      `  Total: ${weighted.length} | Escalated: ${escalated.length} | Compliance-relevant: ${relevant.length}\n`,
    );

    for (const f of weighted) {
      const changed = f.severity !== f.originalSeverity;
      const sevDisplay = changed ? `${f.originalSeverity} → ${f.severity} ⬆` : f.severity;
      const icon =
        f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : "⚪";

      console.log(`    ${icon} [${sevDisplay}] ${f.ruleId}: ${f.title}`);
      if (f.frameworks.length > 0) {
        console.log(`        Frameworks: ${f.frameworks.join(", ")}`);
        for (const note of f.complianceNotes.slice(0, 2)) {
          console.log(`        📋 ${note}`);
        }
      }
    }
    console.log("");
  }
}

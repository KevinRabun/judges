/**
 * Audit evidence bundle — assemble a complete, auditor-ready evidence
 * package from local scan history, suppressions, votes, SLA data, and config.
 *
 * Outputs a structured directory or JSON manifest.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditArtifact {
  type: string;
  source: string;
  description: string;
  controlMapping?: string[];
  present: boolean;
}

interface AuditBundle {
  standard: string;
  generatedAt: string;
  period: string;
  artifacts: AuditArtifact[];
  summary: {
    present: number;
    missing: number;
    coveragePercent: number;
  };
}

const EVIDENCE_SOURCES: { file: string; type: string; description: string; controls: string[] }[] = [
  {
    file: ".judgesrc",
    type: "config",
    description: "Security policy configuration",
    controls: ["SOC2-CC6.1", "ISO27001-A.8.28"],
  },
  {
    file: ".judges-results.json",
    type: "scan-results",
    description: "Latest evaluation findings",
    controls: ["SOC2-CC7.1", "ISO27001-A.8.8"],
  },
  { file: ".judges-baseline.json", type: "baseline", description: "Accepted risk baseline", controls: ["SOC2-CC3.2"] },
  {
    file: ".judges-suppressions.json",
    type: "suppressions",
    description: "Suppressed finding audit trail",
    controls: ["SOC2-CC3.3", "ISO27001-A.8.28"],
  },
  {
    file: ".judges-votes.json",
    type: "review-decisions",
    description: "Team consensus on findings",
    controls: ["SOC2-CC4.1"],
  },
  {
    file: ".judges-sla.json",
    type: "sla-policy",
    description: "SLA policies and violation tracking",
    controls: ["SOC2-CC7.2", "ISO27001-A.8.8"],
  },
  {
    file: ".judges-burndown.json",
    type: "resolution-tracking",
    description: "Finding resolution timeline",
    controls: ["SOC2-CC7.3"],
  },
  {
    file: ".judges-kb.json",
    type: "knowledge-base",
    description: "Team rule decisions and exceptions",
    controls: ["SOC2-CC3.2", "ISO27001-A.5.1"],
  },
  {
    file: ".judges-owners.json",
    type: "ownership",
    description: "Rule-to-owner accountability mapping",
    controls: ["SOC2-CC1.3"],
  },
  {
    file: ".judges-reputation.json",
    type: "tool-effectiveness",
    description: "Judge accuracy and FP tracking",
    controls: ["SOC2-CC4.2"],
  },
  {
    file: ".judges-audit.json",
    type: "policy-snapshots",
    description: "Policy audit trail with SHA-256 hashes",
    controls: ["SOC2-CC8.1", "ISO27001-A.8.25"],
  },
  {
    file: ".judges-review-queue.json",
    type: "manual-review",
    description: "Manual review queue decisions",
    controls: ["SOC2-CC4.1"],
  },
  {
    file: ".judges-correlations.json",
    type: "root-cause",
    description: "Root cause analysis records",
    controls: ["SOC2-CC7.4"],
  },
  {
    file: ".judges-digest.json",
    type: "trend-data",
    description: "Historical trend snapshots",
    controls: ["SOC2-CC4.2", "ISO27001-A.8.16"],
  },
  {
    file: ".judges-false-negatives.json",
    type: "fn-tracking",
    description: "False negative tracking",
    controls: ["SOC2-CC7.1"],
  },
];

// ─── Core ───────────────────────────────────────────────────────────────────

export function generateBundle(standard: string, periodDays: number): AuditBundle {
  const artifacts: AuditArtifact[] = [];

  for (const src of EVIDENCE_SOURCES) {
    const present = existsSync(src.file);
    artifacts.push({
      type: src.type,
      source: src.file,
      description: src.description,
      controlMapping: src.controls,
      present,
    });
  }

  // Check for run history
  const runsDir = ".judges-runs";
  if (existsSync(runsDir)) {
    const runs = readdirSync(runsDir).filter((f) => f.endsWith(".json"));
    artifacts.push({
      type: "scan-history",
      source: runsDir,
      description: `${runs.length} historical scan snapshot(s)`,
      controlMapping: ["SOC2-CC7.1", "ISO27001-A.8.8"],
      present: runs.length > 0,
    });
  }

  const present = artifacts.filter((a) => a.present).length;
  const total = artifacts.length;

  return {
    standard,
    generatedAt: new Date().toISOString(),
    period: `${periodDays} days`,
    artifacts,
    summary: {
      present,
      missing: total - present,
      coveragePercent: Math.round((present / total) * 100),
    },
  };
}

export function exportBundle(bundle: AuditBundle, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  // Copy present artifacts
  for (const artifact of bundle.artifacts) {
    if (artifact.present && existsSync(artifact.source)) {
      try {
        const content = readFileSync(artifact.source, "utf-8");
        const destName = artifact.source.replace(/^\./, "").replace(/\//g, "_");
        writeFileSync(join(outputDir, destName), content);
      } catch {
        // Skip files that can't be read (directories handled separately)
      }
    }
  }

  // Write manifest
  writeFileSync(join(outputDir, "audit-manifest.json"), JSON.stringify(bundle, null, 2));

  // Write human-readable summary
  const lines: string[] = [];
  lines.push(`# Audit Evidence Bundle — ${bundle.standard}`);
  lines.push(`Generated: ${bundle.generatedAt}`);
  lines.push(`Period: ${bundle.period}\n`);
  lines.push(
    `## Coverage: ${bundle.summary.coveragePercent}% (${bundle.summary.present}/${bundle.summary.present + bundle.summary.missing})\n`,
  );
  lines.push("| Status | Type | Source | Controls |");
  lines.push("|--------|------|--------|----------|");
  for (const a of bundle.artifacts) {
    const icon = a.present ? "✅" : "❌";
    const controls = (a.controlMapping || []).join(", ");
    lines.push(`| ${icon} | ${a.type} | ${a.source} | ${controls} |`);
  }
  lines.push("\n## Missing Evidence");
  const missing = bundle.artifacts.filter((a) => !a.present);
  if (missing.length === 0) {
    lines.push("All evidence artifacts present.");
  } else {
    for (const m of missing) {
      lines.push(`- **${m.type}**: ${m.description} (${m.source})`);
    }
  }
  writeFileSync(join(outputDir, "audit-summary.md"), lines.join("\n"));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runAuditBundle(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges audit-bundle — Assemble auditor-ready evidence package

Usage:
  judges audit-bundle --standard soc2
  judges audit-bundle --standard iso27001 --period 90
  judges audit-bundle --standard soc2 --output ./audit-evidence/
  judges audit-bundle --check

Options:
  --standard <name>    Standard: soc2 | iso27001 | hitrust | generic (default: generic)
  --period <days>      Evidence period in days (default: 90)
  --output <dir>       Export evidence to directory
  --check              Check evidence coverage without exporting
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const standard = argv.find((_a: string, i: number) => argv[i - 1] === "--standard") || "generic";
  const periodStr = argv.find((_a: string, i: number) => argv[i - 1] === "--period");
  const periodDays = periodStr ? parseInt(periodStr, 10) : 90;

  const bundle = generateBundle(standard, periodDays);

  // Export
  const outputDir = argv.find((_a: string, i: number) => argv[i - 1] === "--output");
  if (outputDir) {
    exportBundle(bundle, outputDir);
    console.log(`  ✅ Audit bundle exported to ${outputDir}/`);
    console.log(`     Standard: ${standard}, Coverage: ${bundle.summary.coveragePercent}%`);
    console.log(`     ${bundle.summary.present} present, ${bundle.summary.missing} missing`);
    return;
  }

  // Check or display
  if (format === "json") {
    console.log(JSON.stringify(bundle, null, 2));
  } else {
    console.log(
      `\n  Audit Evidence — ${standard.toUpperCase()} (${bundle.period})\n  ────────────────────────────────────`,
    );
    console.log(
      `  Coverage: ${bundle.summary.coveragePercent}% (${bundle.summary.present}/${bundle.summary.present + bundle.summary.missing})\n`,
    );
    for (const a of bundle.artifacts) {
      const icon = a.present ? "✅" : "❌";
      const controls = (a.controlMapping || []).slice(0, 2).join(", ");
      console.log(`    ${icon} ${a.type.padEnd(22)} ${controls}`);
    }
    const missing = bundle.artifacts.filter((a) => !a.present);
    if (missing.length > 0) {
      console.log(`\n  Missing (${missing.length}):`);
      for (const m of missing) {
        console.log(`    ⚠️  ${m.description} (${m.source})`);
      }
    }
    console.log("");
  }
}

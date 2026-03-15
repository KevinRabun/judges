import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── finding-noise-reduce ───────────────────────────────────────────
   Reduce noise by identifying low-value findings — low confidence,
   informational severity, or duplicate patterns — and suggesting
   suppressions to keep reviews focused.
   ─────────────────────────────────────────────────────────────────── */

interface NoiseCandidate {
  ruleId: string;
  title: string;
  severity: string;
  confidence: number;
  reason: string;
}

interface NoiseReport {
  totalFindings: number;
  noiseCount: number;
  noisePct: number;
  candidates: NoiseCandidate[];
}

function identifyNoise(findings: Finding[]): NoiseReport {
  const candidates: NoiseCandidate[] = [];

  // Count rule occurrences for duplicate detection
  const ruleCounts = new Map<string, number>();
  for (const f of findings) {
    ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
  }

  for (const f of findings) {
    const conf = f.confidence ?? 0.5;
    const reasons: string[] = [];

    if (conf < 0.3) {
      reasons.push("very low confidence");
    }
    if (f.severity === "info") {
      reasons.push("informational only");
    }
    if ((ruleCounts.get(f.ruleId) ?? 0) > 3) {
      reasons.push("repeated pattern");
    }

    if (reasons.length > 0) {
      candidates.push({
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity,
        confidence: Math.round(conf * 100),
        reason: reasons.join(", "),
      });
    }
  }

  const noisePct = findings.length > 0 ? Math.round((candidates.length / findings.length) * 100) : 0;

  return {
    totalFindings: findings.length,
    noiseCount: candidates.length,
    noisePct,
    candidates,
  };
}

export function runFindingNoiseReduce(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-noise-reduce [options]

Identify and reduce noisy findings.

Options:
  --report <path>      Path to verdict JSON file
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];
  const report = identifyNoise(findings);

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n=== Noise Analysis ===\n`);
  console.log(`Total findings: ${report.totalFindings}`);
  console.log(`Noise candidates: ${report.noiseCount} (${report.noisePct}%)\n`);

  if (report.candidates.length === 0) {
    console.log("No noisy findings detected — signal is clean.");
    return;
  }

  for (const c of report.candidates) {
    console.log(`  ${c.ruleId}: ${c.title}`);
    console.log(`    ${c.severity} | ${c.confidence}% conf | ${c.reason}`);
  }
  console.log("\nConsider suppressing these rules to reduce noise.");
}

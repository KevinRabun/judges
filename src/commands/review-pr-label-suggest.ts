import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── review-pr-label-suggest ────────────────────────────────────────
   Suggest PR labels based on finding categories, severity,
   and overall verdict. Helps standardize PR labeling in CI.
   ─────────────────────────────────────────────────────────────────── */

interface LabelSuggestion {
  label: string;
  reason: string;
}

function suggestLabels(data: TribunalVerdict): LabelSuggestion[] {
  const labels: LabelSuggestion[] = [];
  const findings = data.findings ?? [];

  // Verdict-based labels
  if (data.overallVerdict === "fail") {
    labels.push({ label: "needs-fixes", reason: "Verdict is fail" });
  } else if (data.overallVerdict === "warning") {
    labels.push({ label: "needs-review", reason: "Verdict is warning" });
  } else {
    labels.push({ label: "approved", reason: "Verdict is pass" });
  }

  // Severity-based labels
  if (data.criticalCount > 0) {
    labels.push({ label: "security-critical", reason: `${data.criticalCount} critical findings` });
  }
  if (data.highCount > 0) {
    labels.push({ label: "high-priority", reason: `${data.highCount} high findings` });
  }

  // Domain-based labels
  const domains = new Set<string>();
  for (const f of findings) {
    const prefix = f.ruleId.split("-")[0].toUpperCase();
    domains.add(prefix);
  }

  if (domains.has("SEC") || domains.has("AUTH") || domains.has("CRYPTO")) {
    labels.push({ label: "security", reason: "Security-related findings" });
  }
  if (domains.has("PERF") || domains.has("OPT")) {
    labels.push({ label: "performance", reason: "Performance-related findings" });
  }
  if (domains.has("COST")) {
    labels.push({ label: "cost-impact", reason: "Cost-related findings" });
  }

  // Size-based label
  if (findings.length > 10) {
    labels.push({ label: "large-review", reason: `${findings.length} findings` });
  }

  return labels;
}

export function runReviewPrLabelSuggest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-pr-label-suggest [options]

Suggest PR labels based on review findings.

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
  const labels = suggestLabels(data);

  if (format === "json") {
    console.log(JSON.stringify(labels, null, 2));
    return;
  }

  console.log("\n=== Suggested PR Labels ===\n");
  for (const l of labels) {
    console.log(`  ${l.label} — ${l.reason}`);
  }
  console.log();
}

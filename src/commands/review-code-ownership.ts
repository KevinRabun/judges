import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { Finding, TribunalVerdict } from "../types.js";

/* ── review-code-ownership ──────────────────────────────────────────
   Map findings to code owners using a local ownership config.
   Helps route findings to the right teams for remediation.
   ─────────────────────────────────────────────────────────────────── */

interface OwnerRule {
  pattern: string;
  owners: string[];
}

interface OwnershipMapping {
  owner: string;
  findingCount: number;
  criticalCount: number;
  findings: { ruleId: string; title: string; severity: string }[];
}

function matchOwner(ruleId: string, rules: OwnerRule[]): string[] {
  for (const rule of rules) {
    if (ruleId.toUpperCase().startsWith(rule.pattern.toUpperCase())) {
      return rule.owners;
    }
  }
  return ["unassigned"];
}

function mapOwnership(findings: Finding[], ownerRules: OwnerRule[]): OwnershipMapping[] {
  const ownerMap = new Map<string, { ruleId: string; title: string; severity: string }[]>();

  for (const f of findings) {
    const owners = matchOwner(f.ruleId, ownerRules);
    for (const owner of owners) {
      const list = ownerMap.get(owner) ?? [];
      list.push({ ruleId: f.ruleId, title: f.title, severity: f.severity });
      ownerMap.set(owner, list);
    }
  }

  const mappings: OwnershipMapping[] = [];
  for (const [owner, ownerFindings] of ownerMap) {
    const criticalCount = ownerFindings.filter((f) => f.severity === "critical").length;
    mappings.push({
      owner,
      findingCount: ownerFindings.length,
      criticalCount,
      findings: ownerFindings,
    });
  }

  mappings.sort((a, b) => b.findingCount - a.findingCount);
  return mappings;
}

export function runReviewCodeOwnership(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-code-ownership [options]

Map findings to code owners.

Options:
  --report <path>      Path to verdict JSON file
  --owners <path>      Path to ownership rules JSON
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

  const ownIdx = argv.indexOf("--owners");
  const ownPath =
    ownIdx !== -1 && argv[ownIdx + 1]
      ? join(process.cwd(), argv[ownIdx + 1])
      : join(process.cwd(), ".judges", "code-owners.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const findings = data.findings ?? [];

  let ownerRules: OwnerRule[];
  if (existsSync(ownPath)) {
    const ownData = JSON.parse(readFileSync(ownPath, "utf-8"));
    ownerRules = ownData.rules ?? [];
  } else {
    ownerRules = [
      { pattern: "SEC", owners: ["security-team"] },
      { pattern: "PERF", owners: ["performance-team"] },
    ];
    console.log(`No ownership config found. Using defaults.\nCreate ${ownPath} for custom mappings.\n`);
  }

  const mappings = mapOwnership(findings, ownerRules);

  if (format === "json") {
    console.log(JSON.stringify(mappings, null, 2));
    return;
  }

  console.log("\n=== Code Ownership ===\n");
  for (const m of mappings) {
    console.log(`${m.owner}: ${m.findingCount} findings (${m.criticalCount} critical)`);
    for (const f of m.findings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    }
    console.log();
  }
}

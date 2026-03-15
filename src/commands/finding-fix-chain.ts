import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-fix-chain ──────────────────────────────────────────────
   Chain related fixes together based on shared rule prefixes,
   severity, and recommendation patterns. Helps developers fix
   related issues in batches rather than one at a time.
   ─────────────────────────────────────────────────────────────────── */

interface FixChain {
  chainId: number;
  label: string;
  findings: { ruleId: string; title: string; severity: string }[];
  estimatedEffort: string;
}

function buildChains(verdict: TribunalVerdict): FixChain[] {
  const findings = verdict.findings ?? [];
  if (findings.length === 0) return [];

  // Group by rule prefix (first segment before '/')
  const prefixGroups = new Map<string, typeof findings>();
  for (const f of findings) {
    const prefix = f.ruleId.split("/")[0] || f.ruleId.split("-")[0] || "general";
    const group = prefixGroups.get(prefix) ?? [];
    group.push(f);
    prefixGroups.set(prefix, group);
  }

  const chains: FixChain[] = [];
  let chainId = 1;

  for (const [prefix, group] of prefixGroups) {
    if (group.length === 0) continue;

    let effort: string;
    if (group.length >= 5) effort = "High — batch fix recommended";
    else if (group.length >= 3) effort = "Medium — group fix feasible";
    else effort = "Low — quick fixes";

    chains.push({
      chainId: chainId++,
      label: prefix,
      findings: group.map((f) => ({ ruleId: f.ruleId, title: f.title, severity: f.severity })),
      estimatedEffort: effort,
    });
  }

  chains.sort((a, b) => b.findings.length - a.findings.length);
  return chains;
}

export function runFindingFixChain(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-fix-chain [options]

Chain related fixes together for batch remediation.

Options:
  --report <path>      Path to verdict JSON
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
  const chains = buildChains(data);

  if (format === "json") {
    console.log(JSON.stringify(chains, null, 2));
    return;
  }

  console.log(`\n=== Fix Chains (${chains.length} chains) ===\n`);

  if (chains.length === 0) {
    console.log("No findings to chain.");
    return;
  }

  for (const chain of chains) {
    console.log(`  Chain #${chain.chainId}: ${chain.label} (${chain.findings.length} findings)`);
    console.log(`  Effort: ${chain.estimatedEffort}`);
    for (const f of chain.findings) {
      console.log(`    [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    }
    console.log();
  }
}

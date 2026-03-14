/**
 * PR quality gate — automated pass/fail gate for PRs with
 * configurable thresholds for auto-approval.
 *
 * All decisions are local — integrates via output format.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GatePolicy {
  maxCritical: number;
  maxHigh: number;
  maxTotal: number;
  requireTestCoverage: boolean;
  autoApproveBelow: number; // score threshold
}

interface GateResult {
  passed: boolean;
  reason: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
  score: number;
  policy: GatePolicy;
  timestamp: string;
}

interface GateHistory {
  results: GateResult[];
  updatedAt: string;
}

const GATE_DIR = ".judges-quality-gate";
const GATE_FILE = join(GATE_DIR, "gate-history.json");
const POLICY_FILE = join(GATE_DIR, "policy.json");

const DEFAULT_POLICY: GatePolicy = {
  maxCritical: 0,
  maxHigh: 2,
  maxTotal: 20,
  requireTestCoverage: false,
  autoApproveBelow: 80,
};

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(GATE_DIR)) mkdirSync(GATE_DIR, { recursive: true });
}

function loadPolicy(): GatePolicy {
  if (!existsSync(POLICY_FILE)) return { ...DEFAULT_POLICY };
  try {
    return { ...DEFAULT_POLICY, ...JSON.parse(readFileSync(POLICY_FILE, "utf-8")) };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

function savePolicy(policy: GatePolicy): void {
  ensureDir();
  writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2));
}

function loadHistory(): GateHistory {
  if (!existsSync(GATE_FILE)) return { results: [], updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(readFileSync(GATE_FILE, "utf-8"));
  } catch {
    return { results: [], updatedAt: new Date().toISOString() };
  }
}

function saveHistory(history: GateHistory): void {
  ensureDir();
  history.updatedAt = new Date().toISOString();
  writeFileSync(GATE_FILE, JSON.stringify(history, null, 2));
}

export function evaluateGate(critical: number, high: number, medium: number, low: number, score: number): GateResult {
  const policy = loadPolicy();
  const total = critical + high + medium + low;

  let passed = true;
  let reason = "All checks passed";

  if (critical > policy.maxCritical) {
    passed = false;
    reason = `Critical findings (${critical}) exceed limit (${policy.maxCritical})`;
  } else if (high > policy.maxHigh) {
    passed = false;
    reason = `High findings (${high}) exceed limit (${policy.maxHigh})`;
  } else if (total > policy.maxTotal) {
    passed = false;
    reason = `Total findings (${total}) exceed limit (${policy.maxTotal})`;
  } else if (score < policy.autoApproveBelow) {
    passed = false;
    reason = `Score (${score}) below threshold (${policy.autoApproveBelow})`;
  }

  const result: GateResult = {
    passed,
    reason,
    critical,
    high,
    medium,
    low,
    total,
    score,
    policy,
    timestamp: new Date().toISOString(),
  };

  // Record
  const history = loadHistory();
  history.results.push(result);
  if (history.results.length > 200) history.results = history.results.slice(-200);
  saveHistory(history);

  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runPrQualityGate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges pr-quality-gate — Automated PR pass/fail quality gate

Usage:
  judges pr-quality-gate --check --critical 0 --high 1 --medium 5 --low 10 --score 85
  judges pr-quality-gate --policy
  judges pr-quality-gate --set-policy --max-critical 0 --max-high 3 --max-total 25
  judges pr-quality-gate --history

Options:
  --check                   Evaluate against policy (exit code 1 = fail)
  --critical <n>            Critical finding count
  --high <n>                High finding count
  --medium <n>              Medium finding count
  --low <n>                 Low finding count
  --score <n>               Overall score (0-100)
  --policy                  Show current policy
  --set-policy              Update policy thresholds
  --max-critical <n>        Set max critical threshold
  --max-high <n>            Set max high threshold
  --max-total <n>           Set max total threshold
  --auto-approve <n>        Set auto-approve score threshold
  --history                 Show gate decision history
  --format json             JSON output
  --help, -h                Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Show policy
  if (argv.includes("--policy") && !argv.includes("--set-policy")) {
    const policy = loadPolicy();
    if (format === "json") {
      console.log(JSON.stringify(policy, null, 2));
    } else {
      console.log(`\n  PR Quality Gate Policy\n  ──────────────────────────`);
      console.log(`    Max critical:     ${policy.maxCritical}`);
      console.log(`    Max high:         ${policy.maxHigh}`);
      console.log(`    Max total:        ${policy.maxTotal}`);
      console.log(`    Auto-approve >=   ${policy.autoApproveBelow} score`);
      console.log(`    Require tests:    ${policy.requireTestCoverage}`);
      console.log("");
    }
    return;
  }

  // Set policy
  if (argv.includes("--set-policy")) {
    const policy = loadPolicy();
    const mc = argv.find((_a: string, i: number) => argv[i - 1] === "--max-critical");
    const mh = argv.find((_a: string, i: number) => argv[i - 1] === "--max-high");
    const mt = argv.find((_a: string, i: number) => argv[i - 1] === "--max-total");
    const aa = argv.find((_a: string, i: number) => argv[i - 1] === "--auto-approve");

    if (mc) policy.maxCritical = parseInt(mc, 10);
    if (mh) policy.maxHigh = parseInt(mh, 10);
    if (mt) policy.maxTotal = parseInt(mt, 10);
    if (aa) policy.autoApproveBelow = parseInt(aa, 10);

    savePolicy(policy);
    console.log(`  ✅ Policy updated`);
    return;
  }

  // History
  if (argv.includes("--history")) {
    const history = loadHistory();
    if (format === "json") {
      console.log(JSON.stringify(history, null, 2));
    } else {
      const passRate =
        history.results.length > 0
          ? Math.round((history.results.filter((r) => r.passed).length / history.results.length) * 100)
          : 0;
      console.log(
        `\n  Gate History (${history.results.length} checks, ${passRate}% pass rate)\n  ──────────────────────────`,
      );
      for (const r of history.results.slice(-15)) {
        const icon = r.passed ? "✅" : "❌";
        console.log(
          `    ${icon} ${r.timestamp.slice(0, 16)}  score:${r.score}  C:${r.critical} H:${r.high} — ${r.reason}`,
        );
      }
      console.log("");
    }
    return;
  }

  // Check
  if (argv.includes("--check")) {
    const critical = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--critical") || "0", 10);
    const high = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--high") || "0", 10);
    const medium = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--medium") || "0", 10);
    const low = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--low") || "0", 10);
    const score = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "100", 10);

    const result = evaluateGate(critical, high, medium, low, score);
    if (format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const icon = result.passed ? "✅ PASSED" : "❌ FAILED";
      console.log(`\n  PR Quality Gate: ${icon}`);
      console.log(`  ──────────────────────────`);
      console.log(`  Score: ${result.score}/100`);
      console.log(
        `  Findings: C:${result.critical} H:${result.high} M:${result.medium} L:${result.low} (total: ${result.total})`,
      );
      console.log(`  Reason: ${result.reason}`);
      console.log("");
    }

    if (!result.passed) {
      process.exitCode = 1;
    }
    return;
  }

  console.error("  Use --check, --policy, --set-policy, or --history. --help for usage.");
}

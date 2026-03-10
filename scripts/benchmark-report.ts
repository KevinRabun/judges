import { runBenchmarkSuite } from "../src/commands/benchmark.ts";

const r = runBenchmarkSuite();
console.log("=== Overall ===");
console.log(
  `F1: ${(r.f1Score * 100).toFixed(1)}%  Precision: ${(r.precision * 100).toFixed(1)}%  Recall: ${(r.recall * 100).toFixed(1)}%`,
);
console.log(`TP: ${r.truePositives}  FN: ${r.falseNegatives}  FP: ${r.falsePositives}`);
console.log(`Detection Rate: ${(r.detectionRate * 100).toFixed(1)}% (${r.detected}/${r.totalCases})`);

console.log("\n=== Per-Category (sorted by FN desc) ===");
const cats = Object.entries(r.perCategory)
  .map(([k, v]) => ({ ...v, category: k }))
  .sort((a, b) => b.falseNegatives - a.falseNegatives);
for (const c of cats) {
  const fpRate =
    c.truePositives + c.falsePositives > 0 ? (c.falsePositives / (c.truePositives + c.falsePositives)) * 100 : 0;
  console.log(
    `${c.category.padEnd(28)} TP:${String(c.truePositives).padStart(4)} FN:${String(c.falseNegatives).padStart(4)} FP:${String(c.falsePositives).padStart(3)} F1:${(c.f1Score * 100).toFixed(0).padStart(4)}% FPR:${fpRate.toFixed(0).padStart(3)}%`,
  );
}

console.log("\n=== Per-Judge FP rates ===");
const judges = Object.entries(r.perJudge)
  .map(([k, v]) => ({ ...v, judge: k }))
  .sort((a, b) => (b as any).falsePositives - (a as any).falsePositives);
for (const j of judges) {
  const jAny = j as any;
  if (jAny.truePositives > 0 || jAny.falsePositives > 0) {
    const fpRate =
      jAny.truePositives + jAny.falsePositives > 0
        ? (jAny.falsePositives / (jAny.truePositives + jAny.falsePositives)) * 100
        : 0;
    console.log(
      `${j.judge.padEnd(28)} TP:${String(jAny.truePositives).padStart(4)} FN:${String(jAny.falseNegatives || 0).padStart(4)} FP:${String(jAny.falsePositives).padStart(3)} FPR:${fpRate.toFixed(1).padStart(5)}%`,
    );
  }
}

// Show missed cases
console.log("\n=== Missed Cases (FN) ===");
const missed = r.cases.filter((c: any) => !c.detected);
for (const m of missed.slice(0, 30)) {
  const mc = m as any;
  console.log(
    `  ${mc.caseId}: expected [${mc.expectedRuleIds?.join(", ")}] got [${mc.detectedRuleIds?.join(", ") || "none"}]`,
  );
}
if (missed.length > 30) console.log(`  ... and ${missed.length - 30} more`);

// Analyze clean cases for FP
console.log("\n=== Clean Case FP Analysis ===");
const cleanCases = r.cases.filter((c: any) => c.expectedRuleIds && c.expectedRuleIds.length === 0);
console.log(`Clean cases total: ${cleanCases.length}`);
const failingClean = cleanCases.filter((c: any) => !c.passed);
console.log(`Clean cases with FPs: ${failingClean.length}`);
for (const c of failingClean as any[]) {
  console.log(`  ${c.caseId}: FP rules: [${c.detectedRuleIds?.join(", ")}]`);
}

// Per-judge FP on clean cases - show by TITLE (rule IDs are dynamic)
console.log("\n=== Per-Judge FP on Clean Cases (by title) ===");
interface CleanFPDetail {
  judge: string;
  ruleId: string;
  title: string;
  caseId: string;
}
const cleanFPDetails: CleanFPDetail[] = [];
for (const c of cleanCases as any[]) {
  for (const f of c.findings || []) {
    const prefix = f.ruleId?.split("-")[0] || "?";
    cleanFPDetails.push({ judge: prefix, ruleId: f.ruleId, title: f.title || "?", caseId: c.caseId || c.id || "?" });
  }
}

// Group by judge → title
const judgeTitleCounts: Record<string, Record<string, { count: number; cases: string[] }>> = {};
for (const d of cleanFPDetails) {
  if (!judgeTitleCounts[d.judge]) judgeTitleCounts[d.judge] = {};
  const key = `${d.ruleId} [${d.title}]`;
  if (!judgeTitleCounts[d.judge][key]) judgeTitleCounts[d.judge][key] = { count: 0, cases: [] };
  judgeTitleCounts[d.judge][key].count++;
  judgeTitleCounts[d.judge][key].cases.push(d.caseId);
}
const overThresholdJudges = ["SWDEV", "UX", "DOC", "CFG", "COST", "SOV", "I18N"];
for (const judge of overThresholdJudges) {
  const rules = judgeTitleCounts[judge] || {};
  const total = Object.values(rules).reduce((a, b) => a + b.count, 0);
  console.log(`\n  ${judge} (${total} FP total):`);
  for (const [key, val] of Object.entries(rules).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`    ${key}: ${val.count} times → [${val.cases.join(", ")}]`);
  }
}

// Show which clean cases produce the most FPs
console.log("\n=== Clean Cases with Most FPs ===");
const caseFPCounts: Record<string, string[]> = {};
for (const c of cleanCases as any[]) {
  if (c.detectedRuleIds?.length > 0) {
    caseFPCounts[c.caseId || "?"] = c.detectedRuleIds;
  }
}
const sortedCaseFP = Object.entries(caseFPCounts).sort((a, b) => b[1].length - a[1].length);
for (const [caseId, rules] of sortedCaseFP.slice(0, 20)) {
  console.log(`  ${caseId}: ${rules.length} FPs → [${rules.join(", ")}]`);
}

// Show top missed detection patterns for recall improvement
console.log("\n=== Top Missed Detection Patterns ===");
const missedPrefixes: Record<string, number> = {};
const missedPrefixCases: Record<string, string[]> = {};
for (const c of r.cases as any[]) {
  for (const ruleId of c.missedRuleIds || []) {
    const prefix = ruleId.split("-")[0];
    missedPrefixes[prefix] = (missedPrefixes[prefix] || 0) + 1;
    if (!missedPrefixCases[prefix]) missedPrefixCases[prefix] = [];
    missedPrefixCases[prefix].push(`${c.caseId}(${ruleId})`);
  }
}
const sortedMissed = Object.entries(missedPrefixes).sort((a, b) => b[1] - a[1]);
for (const [prefix, count] of sortedMissed) {
  console.log(`  ${prefix}: ${count} missed detections`);
  const cases = missedPrefixCases[prefix] || [];
  for (const c of cases.slice(0, 10)) {
    console.log(`    ${c}`);
  }
  if (cases.length > 10) console.log(`    ... and ${cases.length - 10} more`);
}

import { evaluateWithTribunal, evaluateWithJudge } from "../src/evaluators/index.ts";
import { analyzeAuthentication } from "../src/evaluators/authentication.ts";
import { crossEvaluatorDedup } from "../src/dedup.ts";
import { filterFalsePositiveHeuristics } from "../src/evaluators/false-positive-review.ts";
import { isAbsenceBasedFinding } from "../src/scoring.ts";
import { classifyFile } from "../src/evaluators/shared.ts";
import { getSharedDiskCache } from "../src/disk-cache.ts";

// Ruby hardcoded secrets
const rubyCode = `Rails.application.configure do
  config.secret_key_base = "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
  config.api_key = "sk-live-abc123def456ghi789"
end

class PaymentService
  API_SECRET = "whsec_test_secret_key_12345"

  def charge(amount)
    Stripe::Charge.create(amount: amount, api_key: API_SECRET)
  end
end`;

// Step 1: Direct analyzeAuthentication
console.log("=== Step 1: Direct analyzeAuthentication ===");
const authFindings = analyzeAuthentication(rubyCode, "ruby");
console.log("AUTH findings:", authFindings.length);
for (const f of authFindings) {
  console.log(`  ${f.ruleId}: ${f.title} (lines: ${f.lineNumbers}) absence: ${isAbsenceBasedFinding(f)}`);
}

// Step 2: classifyFile
console.log("\n=== Step 2: classifyFile ===");
console.log("  no filePath:", classifyFile(rubyCode, "ruby"));
console.log("  with filePath:", classifyFile(rubyCode, "ruby", "app/services/payment.rb"));

// Step 3: Clear disk cache
console.log("\n=== Step 3: Clear disk cache ===");
const dc = getSharedDiskCache();
if (dc) {
  dc.clear();
  console.log("  Disk cache cleared");
} else {
  console.log("  No disk cache");
}

// Step 4: Full evaluateWithTribunal
console.log("\n=== Step 4: evaluateWithTribunal ===");
const result = evaluateWithTribunal(rubyCode, "ruby");
console.log("All findings:", result.findings.length);
const authResults = result.findings.filter((f: any) => f.ruleId.startsWith("AUTH-"));
console.log("AUTH findings:", authResults.length);
for (const f of result.findings) {
  console.log(`  ${f.ruleId}: ${f.title} (lines: ${f.lineNumbers})`);
}

// Step 5: Check individual judge evaluations
console.log("\n=== Step 5: Per-judge evaluations in tribunal ===");
for (const e of result.evaluations) {
  const authF = e.findings.filter((f: any) => f.ruleId.startsWith("AUTH-"));
  if (e.judgeId.includes("auth") || authF.length > 0) {
    console.log(`  Judge: ${e.judgeId} (${e.judgeName})`);
    console.log(`    All findings: ${e.findings.length}`);
    for (const f of e.findings) {
      console.log(`      ${f.ruleId}: ${f.title} (lines: ${f.lineNumbers})`);
    }
  }
}

// Check for hardcoded-secret topic in dedup
console.log("\n=== Step 6: All findings by judge ===");
for (const e of result.evaluations) {
  if (e.findings.length > 0) {
    console.log(`  Judge: ${e.judgeId}: ${e.findings.length} findings`);
    for (const f of e.findings) {
      console.log(`    ${f.ruleId}: "${f.title}" lines:${f.lineNumbers}`);
    }
  }
}

// Step 7: Manual dedup + FP filtering
console.log("\n=== Step 7: Manual dedup and FP filtering ===");
const allRaw = result.evaluations.flatMap((e: any) => e.findings);
console.log(`  Raw findings from all judges: ${allRaw.length}`);
for (const f of allRaw) {
  console.log(`    ${f.ruleId}: "${f.title}" lines:${f.lineNumbers}`);
}

const deduped = crossEvaluatorDedup(allRaw);
console.log(`  After crossEvaluatorDedup: ${deduped.length}`);
for (const f of deduped) {
  console.log(`    ${f.ruleId}: "${f.title}" lines:${f.lineNumbers}`);
}

const { filtered: fpFiltered } = filterFalsePositiveHeuristics(deduped, rubyCode, "ruby");
console.log(`  After FP heuristics: ${fpFiltered.length}`);
for (const f of fpFiltered) {
  console.log(`    ${f.ruleId}: "${f.title}" lines:${f.lineNumbers}`);
}

// Step 8: Check WHY FP filter removed the deduped finding
console.log("\n=== Step 8: FP filter details ===");
const { isStringLiteralLine, isCommentLine } = await import("../src/evaluators/shared.ts");

const secretTrigger = /\bsecret\b/i;
const secretIdentifierCtx =
  /secret[-_]?(?:name|arn|ref|version|id|key|path|manager|store|engine|backend|rotation|value|error|invalid|missing|config|schema|type|provider|holder|service|handler|helper|resolver|loader|fetcher|reader|creator|generator|deleter|updater|sync|cache)|(?:aws|azure|gcp|vault|k8s|kube|client|app|has|is|no|missing|invalid|create|generate|list|get|set|read|fetch|load|resolve|lookup|delete|remove|update|clear|store|save|manage|rotate|renew|refresh|put|find|retrieve)[-_]?secret/i;

for (const f of deduped) {
  console.log(`  Checking ${f.ruleId}: "${f.title}"`);
  const titleAndDesc = `${f.title} ${f.description}`;
  console.log(`    secretTrigger matches title+desc: ${secretTrigger.test(titleAndDesc)}`);
  if (f.lineNumbers) {
    for (const ln of f.lineNumbers) {
      const line = rubyCode.split("\n")[ln - 1];
      console.log(`    Line ${ln}: "${line?.trim()}"`);
      console.log(`      secretIdentifierCtx matches: ${secretIdentifierCtx.test(line || "")}`);
    }
  }
}
